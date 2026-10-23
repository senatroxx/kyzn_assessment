import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

export function createDatabase(path: string) {
  const client = new Database(path, { create: true });
  client.exec("PRAGMA foreign_keys = ON;");
  return { client, db: drizzle({ client }) };
}
