import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { env } from "../config/env.ts";
import { createDatabase } from "./client.ts";

await mkdir(dirname(env.DATABASE_PATH), { recursive: true });
const { client, db } = createDatabase(env.DATABASE_PATH);

try {
  migrate(db, { migrationsFolder: "./drizzle" });
} finally {
  client.close();
}
