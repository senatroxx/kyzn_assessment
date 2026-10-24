import { describe, expect, spyOn, test } from "bun:test";
import request from "supertest";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createApp } from "../src/app.ts";
import { createDatabase } from "../src/db/client.ts";
import { withTestDatabase } from "./database-fixture.ts";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const statuses = ["contacted", "trial_scheduled", "trial_completed"];

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
        "INSERT INTO venues (id,name) VALUES ('v','Venue'); INSERT INTO consultants (id,name) VALUES ('c','Consultant');",
      );
      await run(createApp(database.db), database.client);
    } finally {
      database.client.close();
    }
  });
}

function addLead(
  client: ReturnType<typeof createDatabase>["client"],
  id: string,
  status: string,
  deleted = false,
) {
  client
    .query(
      "INSERT INTO leads (id,full_name,phone,phone_normalized,email,email_normalized,source,venue_id,consultant_id,status,created_at,updated_at,deleted_at) VALUES (?, 'Test Lead','+14155550132','+14155550132','test@example.test','test@example.test','website','v','c',?,'2026-10-24T00:00:00.000Z','2026-10-24T00:00:00.000Z',?)",
    )
    .run(id, status, deleted ? "2026-10-24T00:00:00.000Z" : null);
}

describe("lead conversions", () => {
  test("converts eligible statuses atomically, including a contacted lead without a trial", async () =>
    setup(async (app, client) => {
      for (const [index, status] of statuses.entries()) {
        const id = `lead-${index}`;
        addLead(client, id, status);
        const response = await request(app)
          .post(`/api/v1/leads/${id}/conversion`)
          .send({ note: "Joined", membershipReference: `member-${index}` });
        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
          leadId: id,
          note: "Joined",
          membershipReference: `member-${index}`,
        });
        expect(new Date(response.body.data.convertedAt).toISOString()).toBe(
          response.body.data.convertedAt,
        );
        expect(
          client.query("SELECT status FROM leads WHERE id = ?").get(id),
        ).toEqual({ status: "converted" });
      }
      expect(
        client.query("SELECT count(*) AS count FROM conversions").get(),
      ).toEqual({ count: 3 });
    }));

  test("rejects missing, deleted, ineligible, and invalid requests without writes", async () =>
    setup(async (app, client) => {
      for (const [id, status, deleted] of [
        ["new", "new", false],
        ["lost", "lost", false],
        ["invalid", "invalid", false],
        ["deleted", "contacted", true],
      ] as const)
        addLead(client, id, status, deleted);
      expect(
        (await request(app).post("/api/v1/leads/missing/conversion").send({}))
          .status,
      ).toBe(404);
      expect(
        (await request(app).post("/api/v1/leads/deleted/conversion").send({}))
          .status,
      ).toBe(404);
      for (const id of ["new", "lost", "invalid"])
        expect(
          (await request(app).post(`/api/v1/leads/${id}/conversion`).send({}))
            .status,
        ).toBe(409);
      for (const body of [
        { note: 2 },
        { id: "caller-id" },
        { convertedAt: "2020-01-01T00:00:00Z" },
        { leadId: "elsewhere" },
        { unknown: true },
      ])
        expect(
          (await request(app).post("/api/v1/leads/new/conversion").send(body))
            .status,
        ).toBe(422);
      expect(
        (
          await request(app)
            .post("/api/v1/leads/new/conversion")
            .set("content-type", "application/json")
            .send("{")
        ).status,
      ).toBe(400);
      expect(
        client.query("SELECT count(*) AS count FROM conversions").get(),
      ).toEqual({ count: 0 });
    }));

  test("repeat and concurrent requests keep one conversion and a converted lead", async () =>
    setup(async (app, client) => {
      addLead(client, "repeat", "contacted");
      const first = await request(app)
        .post("/api/v1/leads/repeat/conversion")
        .send({});
      expect(first.status).toBe(201);
      expect(
        (await request(app).post("/api/v1/leads/repeat/conversion").send({}))
          .status,
      ).toBe(409);
      addLead(client, "parallel", "trial_scheduled");
      const responses = await Promise.all(
        Array.from({ length: 8 }, () =>
          request(app).post("/api/v1/leads/parallel/conversion").send({}),
        ),
      );
      expect(
        responses.filter((response) => response.status === 201),
      ).toHaveLength(1);
      expect(
        responses.filter((response) => response.status === 409),
      ).toHaveLength(7);
      expect(
        client
          .query(
            "SELECT count(*) AS count FROM conversions WHERE lead_id = 'parallel'",
          )
          .get(),
      ).toEqual({ count: 1 });
      expect(
        client.query("SELECT status FROM leads WHERE id = 'parallel'").get(),
      ).toEqual({ status: "converted" });
    }));

  test("rolls back the conversion when updating the lead fails", async () =>
    setup(async (app, client) => {
      addLead(client, "rollback", "contacted");
      client.exec(
        "CREATE TRIGGER fail_conversion_update BEFORE UPDATE OF status ON leads WHEN NEW.status = 'converted' BEGIN SELECT RAISE(ABORT, 'forced update failure'); END;",
      );
      const errorLog = spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(
          (
            await request(app)
              .post("/api/v1/leads/rollback/conversion")
              .send({})
          ).status,
        ).toBe(500);
        expect(
          client.query("SELECT count(*) AS count FROM conversions").get(),
        ).toEqual({ count: 0 });
        expect(
          client.query("SELECT status FROM leads WHERE id = 'rollback'").get(),
        ).toEqual({ status: "contacted" });
      } finally {
        errorLog.mockRestore();
      }
    }));
});
