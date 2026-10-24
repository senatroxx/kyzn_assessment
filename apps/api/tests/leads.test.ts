import { describe, expect, test } from "bun:test";
import request from "supertest";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createApp } from "../src/app.ts";
import { createDatabase } from "../src/db/client.ts";
import { withTestDatabase } from "./database-fixture.ts";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const lead = (overrides: Record<string, unknown> = {}) => ({
  fullName: "  Taylor Ng  ",
  phone: "+1 (415) 555-0132",
  email: " Taylor@Example.test ",
  source: "website",
  venueId: "venue-1",
  consultantId: "consultant-1",
  nextFollowUpDate: "2026-10-25",
  ...overrides,
});

async function setup(
  run: (
    app: ReturnType<typeof createApp>,
    client: ReturnType<typeof createDatabase>["client"],
  ) => Promise<void>,
) {
  await withTestDatabase(async (path) => {
    const database = createDatabase(path);
    try {
      migrate(database.db, { migrationsFolder });
      database.client.exec(
        "INSERT INTO venues (id, name, active) VALUES ('venue-1','Central',1),('venue-off','Closed',0); INSERT INTO consultants (id, name, active) VALUES ('consultant-1','Ari',1),('consultant-off','Inactive',0);",
      );
      await run(createApp(database.db), database.client);
    } finally {
      database.client.close();
    }
  });
}

describe("lead CRUD and lookups", () => {
  test("creates, reads, and partially updates all fields without changing identity", async () =>
    setup(async (app) => {
      const created = await request(app).post("/api/v1/leads").send(lead());
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({
        ...lead({
          fullName: "Taylor Ng",
          phone: "+1 (415) 555-0132",
          email: "Taylor@Example.test",
        }),
        status: "new",
        lastContactAt: null,
        activities: [],
        trials: [],
        conversion: null,
        duplicateMatches: [],
      });
      expect(created.body.data.id).toBeString();
      expect(created.body.data.createdAt).toBe(created.body.data.updatedAt);
      const id = created.body.data.id as string;
      const read = await request(app).get(`/api/v1/leads/${id}`);
      expect(read.status).toBe(200);
      const updated = await request(app)
        .patch(`/api/v1/leads/${id}`)
        .send({ fullName: "Jordan Lee", nextFollowUpDate: null });
      expect(updated.status).toBe(200);
      expect(updated.body.data).toMatchObject({
        id,
        fullName: "Jordan Lee",
        status: "new",
        nextFollowUpDate: null,
        createdAt: created.body.data.createdAt,
        phone: "+1 (415) 555-0132",
      });
      expect(
        new Date(updated.body.data.updatedAt).getTime(),
      ).toBeGreaterThanOrEqual(new Date(created.body.data.updatedAt).getTime());
    }));

  test("validates inputs, protects server fields, and handles absent records", async () =>
    setup(async (app) => {
      for (const body of [
        { ...lead(), status: "converted" },
        { ...lead(), id: "chosen" },
        { ...lead(), createdAt: "2020-01-01T00:00:00Z" },
        { ...lead(), phoneNormalized: "abc" },
      ]) {
        expect(
          (await request(app).post("/api/v1/leads").send(body)).status,
        ).toBe(422);
      }
      expect(
        (
          await request(app)
            .post("/api/v1/leads")
            .set("content-type", "application/json")
            .send("{")
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post("/api/v1/leads")
            .send({ ...lead(), venueId: "missing" })
        ).status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .post("/api/v1/leads")
            .send({ ...lead(), consultantId: "consultant-off" })
        ).status,
      ).toBe(404);
      expect(
        (await request(app).get("/api/v1/leads/missing")).body.error.code,
      ).toBe("NOT_FOUND");
      expect((await request(app).get("/api/v1/leads/missing")).status).toBe(
        404,
      );
      expect(
        (
          await request(app)
            .patch("/api/v1/leads/missing")
            .send({ status: "converted" })
        ).status,
      ).toBe(422);
      expect(
        (
          await request(app)
            .patch("/api/v1/leads/missing")
            .send({ fullName: "Ab" })
        ).status,
      ).toBe(404);
    }));

  test("keeps omitted follow-up values, permits contact duplicates, and computes canonical keys", async () =>
    setup(async (app, client) => {
      const first = (
        await request(app)
          .post("/api/v1/leads")
          .send(lead({ phone: "0812-3456-7890" }))
      ).body.data;
      const second = await request(app)
        .post("/api/v1/leads")
        .send(
          lead({
            fullName: "Another Lead",
            phone: "+62 812 3456 7890",
            email: "other@example.test",
          }),
        );
      expect(second.status).toBe(201);
      const raw = client
        .query(
          "SELECT phone_normalized, email_normalized FROM leads ORDER BY created_at ASC",
        )
        .all() as { phone_normalized: string; email_normalized: string }[];
      expect(raw[0]?.phone_normalized).toBe(raw[1]?.phone_normalized);
      expect(raw[0]?.phone_normalized).toBe("+6281234567890");
      expect(raw[0]?.email_normalized).toBe("taylor@example.test");
      const updated = await request(app)
        .patch(`/api/v1/leads/${first.id}`)
        .send({ source: "referral" });
      expect(updated.body.data.nextFollowUpDate).toBe("2026-10-25");
      expect(
        (
          await request(app)
            .patch(`/api/v1/leads/${first.id}`)
            .send({ status: "converted" })
        ).status,
      ).toBe(422);
      client
        .query("UPDATE leads SET status = 'converted' WHERE id = ?")
        .run(first.id);
      client
        .query(
          "INSERT INTO conversions (id, lead_id, converted_at) VALUES (?, ?, ?)",
        )
        .run("conversion-1", first.id, new Date().toISOString());
      const convertedEdit = await request(app)
        .patch(`/api/v1/leads/${first.id}`)
        .send({ fullName: "Allowed Edit" });
      expect(convertedEdit.status).toBe(200);
      expect(convertedEdit.body.data.status).toBe("converted");
    }));

  test("returns only active lookups and a valid minimal list envelope", async () =>
    setup(async (app) => {
      expect((await request(app).get("/api/v1/venues")).body.data).toEqual([
        { id: "venue-1", name: "Central", active: true },
      ]);
      expect((await request(app).get("/api/v1/consultants")).body.data).toEqual(
        [{ id: "consultant-1", name: "Ari", active: true }],
      );
      const list = await request(app).get("/api/v1/leads");
      expect(list.status).toBe(200);
      expect(list.body).toEqual({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      });
      expect((await request(app).get("/api/health")).body).toEqual({
        data: { status: "ok" },
      });
    }));
});
