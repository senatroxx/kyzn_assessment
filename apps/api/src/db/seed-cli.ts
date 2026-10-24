import { env } from "../config/env.ts";
import { createDatabase } from "./client.ts";
import { seedDemoData } from "./seed.ts";

const { client, db } = createDatabase(env.DATABASE_PATH);
try {
  const tables = client
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    )
    .all()
    .map(({ name }) => name);
  const requiredTables = [
    "venues",
    "consultants",
    "leads",
    "activities",
    "trials",
    "conversions",
  ];
  if (requiredTables.some((name) => !tables.includes(name))) {
    console.error(
      "Database schema is missing. Run `bun run --cwd apps/api db:migrate` before `db:seed`.",
    );
    process.exitCode = 1;
  } else {
    seedDemoData(db);
    console.info(
      `Synthetic demo records seeded in ${env.DATABASE_PATH}. Re-running is safe; unrelated rows are preserved.`,
    );
  }
} finally {
  client.close();
}
