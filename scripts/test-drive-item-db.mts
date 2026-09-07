import { spawnSync } from "node:child_process";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

function databaseIdentity(value: string): string {
  const url = new URL(value);
  const host = url.hostname.replace(/-pooler(?=\.)/, "");
  return `${url.protocol}//${url.username}@${host}:${url.port}/${url.pathname.replace(/^\//, "")}`;
}

const testUrl = process.env.TEST_DATABASE_URL?.trim();

if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required. Point it at a disposable Postgres database or Neon branch.",
  );
}

const testIdentity = databaseIdentity(testUrl);
for (const name of ["DATABASE_URL", "DIRECT_URL"] as const) {
  const sharedUrl = process.env[name]?.trim();
  if (sharedUrl && databaseIdentity(sharedUrl) === testIdentity) {
    throw new Error(
      `Refusing database tests: TEST_DATABASE_URL identifies the same database as ${name}.`,
    );
  }
}

const environment = {
  ...process.env,
  TEST_DATABASE_URL: testUrl,
  DIRECT_URL: testUrl,
};

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
run("pnpm", ["exec", "vitest", "run", "--project", "filesystem"]);
