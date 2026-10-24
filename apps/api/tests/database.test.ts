import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createDatabase } from "../src/db/client.ts";
import { withTestDatabase } from "./database-fixture.ts";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;

describe("database migrations", () => {
  test("migrates an isolated file, enforces references, and persists safely", async () => {
    const configuredDirectory = await mkdtemp(
      join(tmpdir(), "kyzn-demo-sentinel-"),
    );
    const configuredPath = join(configuredDirectory, "demo.sqlite");
    const sentinel = new Database(configuredPath, { create: true });
    sentinel.exec(
      "CREATE TABLE sentinel (value TEXT NOT NULL); INSERT INTO sentinel VALUES ('untouched');",
    );
    sentinel.close();

    const previousDatabasePath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = configuredPath;
    try {
      await withTestDatabase(async (path) => {
        const first = createDatabase(path);
        try {
          migrate(first.db, { migrationsFolder });
          first.client.exec(
            "INSERT INTO venues (id, name) VALUES ('v1', 'Central'); INSERT INTO consultants (id, name) VALUES ('c1', 'Ari');",
          );
          first.client.exec(
            "INSERT INTO leads (id, full_name, phone, phone_normalized, email, email_normalized, source, venue_id, consultant_id) VALUES ('l1', 'Test Lead', '081234567', '+6281234567', 'Test@Example.test', 'test@example.test', 'website', 'v1', 'c1');",
          );
          first.client.exec(
            "INSERT INTO leads (id, full_name, phone, phone_normalized, email, email_normalized, source, venue_id, consultant_id) VALUES ('l2', 'Duplicate Lead', '081234567', '+6281234567', 'test@example.test', 'test@example.test', 'referral', 'v1', 'c1');",
          );
          first.client.exec(
            "INSERT INTO activities (id, lead_id, type, occurred_at) VALUES ('a1', 'l1', 'call', '2026-10-24T12:00:00Z'); INSERT INTO trials (id, lead_id, venue_id, scheduled_at) VALUES ('t1', 'l1', 'v1', '2026-10-25T12:00:00Z'); INSERT INTO conversions (id, lead_id, converted_at) VALUES ('x1', 'l1', '2026-10-24T12:00:00Z');",
          );
          expect(
            first.client
              .query(
                "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('venues','consultants','leads','activities','trials','conversions')",
              )
              .all(),
          ).toHaveLength(6);
          expect(() =>
            first.client.exec(
              "INSERT INTO activities (id, lead_id, type, occurred_at) VALUES ('bad', 'missing', 'call', '2026-10-24T12:00:00Z')",
            ),
          ).toThrow();
          expect(() =>
            first.client.exec(
              "INSERT INTO conversions (id, lead_id, converted_at) VALUES ('x2', 'l1', '2026-10-24T12:00:00Z')",
            ),
          ).toThrow();
          expect(
            first.client.query("SELECT count(*) AS count FROM leads").get(),
          ).toEqual({ count: 2 });
          migrate(first.db, { migrationsFolder });
          expect(
            first.client.query("SELECT count(*) AS count FROM leads").get(),
          ).toEqual({ count: 2 });
        } finally {
          first.client.close();
        }

        const reopened = createDatabase(path);
        try {
          expect(
            reopened.client
              .query("SELECT count(*) AS count FROM activities")
              .get(),
          ).toEqual({ count: 1 });
          expect(
            reopened.client.query("SELECT count(*) AS count FROM trials").get(),
          ).toEqual({ count: 1 });
          expect(
            reopened.client
              .query("SELECT count(*) AS count FROM conversions")
              .get(),
          ).toEqual({ count: 1 });
        } finally {
          reopened.client.close();
        }
      });
    } finally {
      if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
      else process.env.DATABASE_PATH = previousDatabasePath;
      const unchanged = new Database(configuredPath);
      try {
        expect(unchanged.query("SELECT value FROM sentinel").get()).toEqual({
          value: "untouched",
        });
      } finally {
        unchanged.close();
        await rm(configuredDirectory, { recursive: true, force: true });
      }
    }
  });
});
