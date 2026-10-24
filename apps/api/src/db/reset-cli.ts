import { resolve } from "node:path";
import { env } from "../config/env.ts";
import { createDatabase } from "./client.ts";
import { resetDemoData } from "./seed.ts";

const configuredPath = env.DATABASE_PATH.trim();
if (!configuredPath || /^(:memory:|file::?memory:)/i.test(configuredPath)) {
  console.error("Refusing to reset an empty or in-memory DATABASE_PATH.");
  process.exit(1);
}
const targetPath = resolve(configuredPath);
if (Bun.argv.includes("--help")) {
  console.info(
    "Deletes all CRM records from DATABASE_PATH while preserving Drizzle migration history. Requires --confirm-reset or CONFIRM_DB_RESET=1.",
  );
  process.exit(0);
}
if (!Bun.argv.includes("--confirm-reset") && Bun.env.CONFIRM_DB_RESET !== "1") {
  console.error(
    `Refusing to reset ${targetPath}. Pass --confirm-reset or set CONFIRM_DB_RESET=1 after checking DATABASE_PATH.`,
  );
  process.exit(1);
}
const { client, db } = createDatabase(targetPath);
try {
  resetDemoData(db);
  console.info(
    `CRM records cleared from ${targetPath}; migration history was preserved.`,
  );
} finally {
  client.close();
}
