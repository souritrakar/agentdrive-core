-- Read-only deterministic report for the Drive + Item expand migration.
-- Run against the target database before `prisma migrate deploy`. Any row in
-- the second result set is a blocker; resolve it explicitly before cutover.

BEGIN TRANSACTION READ ONLY;

SELECT
  pod_id,
  drive_id,
  kind,
  is_deleted,
  upload_status,
  count(*)::bigint AS row_count
FROM (
  SELECT pod_id, drive_id, 'FOLDER'::text AS kind,
         deleted_at IS NOT NULL AS is_deleted, NULL::text AS upload_status
  FROM folders
  UNION ALL
  SELECT pod_id, drive_id, 'FILE'::text AS kind,
         deleted_at IS NOT NULL AS is_deleted, status::text AS upload_status
  FROM files
) inventory
GROUP BY pod_id, drive_id, kind, is_deleted, upload_status
ORDER BY pod_id, drive_id, kind, is_deleted, upload_status;

WITH RECURSIVE folder_walk AS (
  SELECT
    folder.id AS origin_id,
    folder.pod_id,
    folder.drive_id,
    folder.parent_folder_id AS next_id,
    folder.deleted_at AS origin_deleted_at,
    ARRAY[folder.id]::uuid[] AS path,
    1 AS depth,
    false AS cycle,
    false AS deleted_ancestor
  FROM folders AS folder

  UNION ALL

  SELECT
    walk.origin_id,
    walk.pod_id,
    walk.drive_id,
    parent.parent_folder_id,
    walk.origin_deleted_at,
    walk.path || parent.id,
    walk.depth + 1,
    parent.id = ANY(walk.path),
    walk.deleted_ancestor OR parent.deleted_at IS NOT NULL
  FROM folder_walk AS walk
  JOIN folders AS parent
    ON parent.id = walk.next_id
   AND parent.pod_id = walk.pod_id
   AND parent.drive_id = walk.drive_id
  WHERE NOT walk.cycle
    AND walk.depth <= 64
), file_walk AS (
  SELECT
    file.id AS origin_id,
    file.pod_id,
    file.drive_id,
    file.folder_id AS next_id,
    0 AS depth,
    false AS deleted_ancestor
  FROM files AS file
  WHERE file.deleted_at IS NULL
    AND file.folder_id IS NOT NULL

  UNION ALL

  SELECT
    walk.origin_id,
    walk.pod_id,
    walk.drive_id,
    parent.parent_folder_id,
    walk.depth + 1,
    walk.deleted_ancestor OR parent.deleted_at IS NOT NULL
  FROM file_walk AS walk
  JOIN folders AS parent
    ON parent.id = walk.next_id
   AND parent.pod_id = walk.pod_id
   AND parent.drive_id = walk.drive_id
  WHERE walk.depth <= 64
), live_names AS (
  SELECT id, pod_id, drive_id, parent_folder_id AS parent_id, name,
         'FOLDER'::text AS kind
  FROM folders
  WHERE deleted_at IS NULL
  UNION ALL
  SELECT id, pod_id, drive_id, folder_id AS parent_id, name, 'FILE'::text
  FROM files
  WHERE deleted_at IS NULL
), blockers AS (
  SELECT 'folder_file_id_collision'::text AS issue,
         folder.id::text AS subject,
         jsonb_build_object('id', folder.id) AS detail
  FROM folders AS folder
  JOIN files AS file ON file.id = folder.id

  UNION ALL

  SELECT 'live_sibling_name_collision',
         format('%s/%s', drive_id, coalesce(parent_id::text, '<root>')),
         jsonb_build_object(
           'podId', pod_id,
           'driveId', drive_id,
           'parentId', parent_id,
           'foldedName', lower(name),
           'members', jsonb_agg(jsonb_build_object('kind', kind, 'id', id)
                                ORDER BY kind, id)
         )
  FROM live_names
  GROUP BY pod_id, drive_id, parent_id, lower(name)
  HAVING count(*) > 1

  UNION ALL

  SELECT 'keyed_legacy_file', id::text,
         jsonb_build_object('driveId', drive_id, 'clientId', client_id)
  FROM files
  WHERE client_id IS NOT NULL

  UNION ALL

  SELECT 'invalid_item_name', format('%s:%s', kind, id),
         jsonb_build_object('name', name)
  FROM (
    SELECT id, name, 'FOLDER'::text AS kind FROM folders
    UNION ALL
    SELECT id, name, 'FILE'::text FROM files
  ) named
  WHERE name <> btrim(name)
     OR char_length(name) NOT BETWEEN 1 AND 255
     OR position('/' IN name) > 0
     OR position(chr(92) IN name) > 0
     OR name ~ E'[\\001-\\037\\177]'
     OR name IN ('.', '..')

  UNION ALL

  SELECT 'invalid_file_metadata', id::text,
         jsonb_build_object(
           'sizeBytes', size_bytes,
           'checksumSha256', checksum_sha256,
           'storageKey', storage_key,
           'contentType', content_type
         )
  FROM files
  WHERE size_bytes < 0
     OR checksum_sha256 IS NOT NULL
        AND checksum_sha256 !~ '^[a-f0-9]{64}$'
     OR char_length(storage_key) NOT BETWEEN 1 AND 1024
     OR content_type IS NOT NULL AND char_length(content_type) > 255

  UNION ALL

  SELECT 'invalid_client_id', format('%s:%s', kind, id),
         jsonb_build_object('clientId', client_id)
  FROM (
    SELECT id, client_id, 'DRIVE'::text AS kind FROM drives
    UNION ALL
    SELECT id, client_id, 'FOLDER'::text FROM folders
  ) keyed
  WHERE client_id IS NOT NULL
    AND char_length(client_id) NOT BETWEEN 1 AND 128

  UNION ALL

  SELECT 'invalid_folder_hierarchy', origin_id::text,
         jsonb_build_object(
           'depth', max(depth),
           'cycle', bool_or(cycle),
           'activeUnderDeletedAncestor',
             bool_or(origin_deleted_at IS NULL AND deleted_ancestor)
         )
  FROM folder_walk
  GROUP BY origin_id
  HAVING max(depth) > 64
      OR bool_or(cycle)
      OR bool_or(origin_deleted_at IS NULL AND deleted_ancestor)

  UNION ALL

  SELECT 'active_file_under_deleted_folder', origin_id::text,
         jsonb_build_object('activeUnderDeletedAncestor', true)
  FROM file_walk
  GROUP BY origin_id
  HAVING bool_or(deleted_ancestor)

  UNION ALL

  SELECT 'ambiguous_deleted_folder_cohort', child.id::text,
         jsonb_build_object('deletedAncestorId', ancestor.id)
  FROM folders AS child
  JOIN folder_walk AS walk ON walk.origin_id = child.id
  JOIN folders AS ancestor
    ON ancestor.id = walk.next_id
   AND ancestor.pod_id = walk.pod_id
   AND ancestor.drive_id = walk.drive_id
  WHERE child.deleted_at IS NOT NULL
    AND ancestor.deleted_at IS NOT NULL
)
SELECT issue, subject, detail
FROM blockers
ORDER BY issue, subject, detail::text;

ROLLBACK;
