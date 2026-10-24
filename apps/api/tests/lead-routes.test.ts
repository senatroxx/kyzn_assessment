import { describe, expect, test } from "bun:test";
import request from "supertest";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { app as healthApp, createApp } from "../src/app.ts";
import { createDatabase } from "../src/db/client.ts";
import { withTestDatabase } from "./database-fixture.ts";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;

describe("composed lead routes", () => {
  test("routes list, duplicate, and detail paths to the right handlers", async () => {
    await withTestDatabase(async (path) => {
      const database = createDatabase(path);
      try {
        migrate(database.db, { migrationsFolder });
        database.client.exec(
          "INSERT INTO venues (id, name) VALUES ('venue-1', 'Central'); INSERT INTO consultants (id, name) VALUES ('consultant-1', 'Ari');",
        );
        database.client
          .query(
            "INSERT INTO leads (id, full_name, phone, phone_normalized, email, email_normalized, source, venue_id, consultant_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'website', 'venue-1', 'consultant-1', 'new', ?, ?)",
          )
          .run(
            "lead-a",
            "Ada Example",
            "0812-3456-7890",
            "+6281234567890",
            "ada@example.test",
            "ada@example.test",
            "2026-10-24T10:00:00Z",
            "2026-10-24T10:00:00Z",
          );
        database.client
          .query(
            "INSERT INTO leads (id, full_name, phone, phone_normalized, email, email_normalized, source, venue_id, consultant_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'referral', 'venue-1', 'consultant-1', 'new', ?, ?)",
          )
          .run(
            "lead-b",
            "Bea Example",
            "+62 812 3456 7890",
            "+6281234567890",
            "bea@example.test",
            "bea@example.test",
            "2026-10-24T11:00:00Z",
            "2026-10-24T11:00:00Z",
          );

        const app = createApp(database.db);
        const list = await request(app)
          .get("/api/v1/leads")
          .query({ search: "Ada" });
        expect(list.status).toBe(200);
        expect(list.body.data).toHaveLength(1);
        expect(list.body.data[0]).toMatchObject({
          id: "lead-a",
          isDuplicate: true,
        });

        const duplicates = await request(app)
          .get("/api/v1/leads/duplicates")
          .query({ phone: "0812-3456-7890", excludeId: "lead-a" });
        expect(duplicates.status).toBe(200);
        expect(
          duplicates.body.data.map((match: { id: string }) => match.id),
        ).toEqual(["lead-b"]);

        const detail = await request(app).get("/api/v1/leads/lead-a");
        expect(detail.status).toBe(200);
        expect(
          detail.body.data.duplicateMatches.map(
            (match: { id: string }) => match.id,
          ),
        ).toEqual(["lead-b"]);
      } finally {
        database.client.close();
      }
    });

    const health = await request(healthApp).get("/api/health");
    expect(health.status).toBe(200);
  });
});
