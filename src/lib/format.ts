/** Display formatting. Kept in one place so listings stay internally consistent. */

/**
 * Byte counts in the units people expect from a file manager.
 *
 * Decimal (KB = 1000), matching macOS, Google Drive, and every cloud console —
 * binary units would report a different number than the user's own OS does.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log10(Math.abs(bytes)) / 3),
    units.length - 1,
  );
  const value = bytes / 1000 ** exponent;

  // One decimal below 10 so "1.4 MB" doesn't collapse to "1 MB", none above.
  const decimals = exponent === 0 ? 0 : value < 10 ? 1 : 0;
  return `${value.toFixed(decimals)} ${units[exponent]}`;
}

/**
 * Relative time, coarse on purpose.
 *
 * A file listing wants "3 days ago", not "3 days, 4 hours ago" — precision the
 * user didn't ask for is noise, and it makes rows harder to scan.
 */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ];

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, secondsPer] of units) {
    if (seconds >= secondsPer) {
      return formatter.format(-Math.floor(seconds / secondsPer), unit);
    }
  }
  return "just now";
}

/** Absolute timestamp for tooltips, where precision is actually wanted. */
export function formatAbsoluteTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** "4 items" / "1 item" / "Empty" — reads better than a bare zero in a list. */
export function formatItemCount(count: number): string {
  if (count === 0) return "Empty";
  return `${count} ${count === 1 ? "item" : "items"}`;
}
