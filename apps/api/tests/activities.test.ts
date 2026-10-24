import { describe, expect, test } from "bun:test";
import express from "express";
import request from "supertest";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createDatabase } from "../src/db/client.ts";
import { errorHandler } from "../src/middleware/errors.ts";
import { activitiesRouter } from "../src/modules/leads/activities/router.ts";
import { withTestDatabase } from "./database-fixture.ts";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const now = "2026-10-24T11:00:00.000Z";

async function setup(
  run: (
    app: express.Express,
    client: ReturnType<typeof createDatabase>["client"],
  ) => Promise<void>,
  clock: () => Date = () => new Date(now),
) {
  await withTestDatabase(async (path) => {
    const database = createDatabase(path);
    try {
      migrate(database.db, { migrationsFolder });
      database.client.exec(
        "INSERT INTO venues (id,name) VALUES ('v','Venue'); INSERT INTO consultants (id,name) VALUES ('c','Consultant');",
      );
      const app = express();
      app.use(express.json());
      app.use(
        "/api/v1/leads/:id/activities",
        activitiesRouter(database.db, clock),
      );
      app.use(errorHandler);
      await run(app, database.client);
    } finally {
      database.client.close();
    }
  });
}

function addLead(
  client: ReturnType<typeof createDatabase>["client"],
  status = "new",
  createdAt = "2026-10-24T08:00:00.000Z",
  extra = "",
) {
  client.exec(
    `INSERT INTO leads (id,full_name,phone,phone_normalized,email,email_normalized,source,venue_id,consultant_id,status,created_at,updated_at,last_contact_at,next_follow_up_date,deleted_at) VALUES ('l','Test Lead','+14155550132','+14155550132','test@example.test','test@example.test','website','v','c','${status}','${createdAt}','${createdAt}',NULL,'2026-10-23',${extra || "NULL"})`,
  );
}

const post = (app: express.Express, body: Record<string, unknown>) =>
  request(app).post("/api/v1/leads/l/activities").send(body);

describe("lead activities", () => {
  test("records contact types with injected time and applies lifecycle/follow-up policy", async () =>
    setup(async (app, client) => {
      addLead(client);
      for (const type of ["call", "whatsapp", "email"]) {
        const response = await post(app, { type });
        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
          type,
          occurredAt: now,
          createdAt: now,
        });
      }
      expect(
        client
          .query(
            "SELECT status,last_contact_at,next_follow_up_date FROM leads WHERE id='l'",
          )
          .get(),
      ).toEqual({
        status: "contacted",
        last_contact_at: now,
        next_follow_up_date: "2026-10-23",
      });
      const clear = await post(app, { type: "call", nextFollowUpDate: null });
      expect(clear.body.data.nextFollowUpDate).toBeNull();
      expect(
        client
          .query("SELECT next_follow_up_date FROM leads WHERE id='l'")
          .get(),
      ).toEqual({ next_follow_up_date: null });
    }));

  test("note preserves status and contact time; omitted follow-up preserves overdue date", async () =>
    setup(async (app, client) => {
      addLead(client, "trial_scheduled");
      client.exec(
        `UPDATE leads SET last_contact_at='2026-10-24T10:00:00.000Z' WHERE id='l'`,
      );
      const response = await post(app, { type: "note", note: "Checked in" });
      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        occurredAt: now,
        nextFollowUpDate: null,
      });
      expect(
        client
          .query(
            "SELECT status,last_contact_at,next_follow_up_date FROM leads WHERE id='l'",
          )
          .get(),
      ).toEqual({
        status: "trial_scheduled",
        last_contact_at: "2026-10-24T10:00:00.000Z",
        next_follow_up_date: "2026-10-23",
      });
    }));

  test("accepts historic contacts within lead lifetime without moving last contact backwards", async () =>
    setup(async (app, client) => {
      addLead(client, "contacted");
      client.exec(
        `UPDATE leads SET last_contact_at='2026-10-24T10:00:00.000Z' WHERE id='l'`,
      );
      const response = await post(app, {
        type: "whatsapp",
        occurredAt: "2026-10-24T09:00:00.000Z",
      });
      expect(response.status).toBe(201);
      expect(
        client.query("SELECT last_contact_at FROM leads WHERE id='l'").get(),
      ).toEqual({ last_contact_at: "2026-10-24T10:00:00.000Z" });
    }));

  test("compares fractional UTC seconds exactly at lifetime, future, and last-contact boundaries", async () => {
    const exactClock = (iso: string) => {
      const date = new Date(iso);
      Object.defineProperty(date, "toISOString", { value: () => iso });
      return date;
    };
    await setup(
      async (app, client) => {
        addLead(client, "contacted", "2026-10-24T10:00:00.5Z");
        client.exec(
          "UPDATE leads SET last_contact_at='2026-10-24T10:00:00.500000002Z' WHERE id='l'",
        );
        expect(
          (
            await post(app, {
              type: "call",
              occurredAt: "2026-10-24T10:00:00.500Z",
            })
          ).status,
        ).toBe(201);
        expect(
          client.query("SELECT last_contact_at FROM leads WHERE id='l'").get(),
        ).toEqual({ last_contact_at: "2026-10-24T10:00:00.500000002Z" });

        expect(
          (
            await post(app, {
              type: "email",
              occurredAt: "2026-10-24T10:00:00.500000003Z",
            })
          ).status,
        ).toBe(201);
        expect(
          client.query("SELECT last_contact_at FROM leads WHERE id='l'").get(),
        ).toEqual({ last_contact_at: "2026-10-24T10:00:00.500000003Z" });

        expect(
          (
            await post(app, {
              type: "call",
              occurredAt: "2026-10-24T10:00:00.501000001Z",
            })
          ).status,
        ).toBe(422);
      },
      () => exactClock("2026-10-24T10:00:00.501Z"),
    );
  });

  test("validates payload, date and path, and returns not found for absent lead", async () =>
    setup(async (app) => {
      expect(
        (await post(app, { type: "call", occurredAt: "2026-02-30T00:00:00Z" }))
          .status,
      ).toBe(422);
      expect((await post(app, { type: "unknown" })).status).toBe(422);
      expect(
        (await post(app, { type: "call", nextFollowUpDate: "2026-02-30" }))
          .status,
      ).toBe(422);
      expect(
        (
          await request(app)
            .post("/api/v1/leads/%20/activities")
            .send({ type: "note" })
        ).status,
      ).toBe(422);
      expect((await post(app, { type: "note" })).status).toBe(404);
    }));

  test("rejects dates outside lead lifetime and invalid/deleted/converted states without inserting", async () =>
    setup(async (app, client) => {
      addLead(client);
      for (const occurredAt of [
        "2026-10-24T07:59:59.000Z",
        "2026-10-24T11:00:01.000Z",
      ]) {
        expect((await post(app, { type: "call", occurredAt })).status).toBe(
          422,
        );
      }
      for (const status of ["invalid", "converted"]) {
        client.exec(`UPDATE leads SET status='${status}' WHERE id='l'`);
        expect((await post(app, { type: "note" })).status).toBe(409);
      }
      client.exec(
        "UPDATE leads SET status='new', deleted_at='2026-10-24T10:00:00Z' WHERE id='l'",
      );
      expect((await post(app, { type: "note" })).status).toBe(404);
      expect(
        client.query("SELECT count(*) AS count FROM activities").get(),
      ).toEqual({ count: 0 });
    }));

  test("contact status transitions follow the agreed table", async () =>
    setup(async (app, client) => {
      addLead(client);
      for (const [from, to] of [
        ["new", "contacted"],
        ["lost", "contacted"],
        ["contacted", "contacted"],
        ["trial_scheduled", "trial_scheduled"],
        ["trial_completed", "contacted"],
      ]) {
        client.exec(
          "DELETE FROM activities; UPDATE leads SET deleted_at=NULL,last_contact_at=NULL,next_follow_up_date='2026-10-23' WHERE id='l'",
        );
        client.exec(`UPDATE leads SET status='${from}' WHERE id='l'`);
        expect((await post(app, { type: "call" })).status).toBe(201);
        expect(
          client.query("SELECT status FROM leads WHERE id='l'").get(),
        ).toEqual({ status: to });
      }
    }));

  test("activity and projection roll back together when projection update fails", async () =>
    setup(async (app, client) => {
      addLead(client);
      client.exec(
        "CREATE TRIGGER fail_lead_projection BEFORE UPDATE ON leads BEGIN SELECT RAISE(ABORT, 'forced'); END;",
      );
      expect(
        (await post(app, { type: "call", nextFollowUpDate: null })).status,
      ).toBe(500);
      expect(
        client.query("SELECT count(*) AS count FROM activities").get(),
      ).toEqual({ count: 0 });
      expect(
        client
          .query(
            "SELECT status,last_contact_at,next_follow_up_date FROM leads WHERE id='l'",
          )
          .get(),
      ).toEqual({
        status: "new",
        last_contact_at: null,
        next_follow_up_date: "2026-10-23",
      });
    }));
});
