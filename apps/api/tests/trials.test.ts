import { describe, expect, test } from "bun:test";
import express from "express";
import request from "supertest";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createDatabase } from "../src/db/client.ts";
import { errorHandler } from "../src/middleware/errors.ts";
import { trialRouter } from "../src/modules/leads/trials/router.ts";
import { withTestDatabase } from "./database-fixture.ts";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const initial = "2026-10-24T10:00:00.000Z";

async function setup(
  run: (
    app: express.Express,
    client: ReturnType<typeof createDatabase>["client"],
    setNow: (value: string) => void,
  ) => Promise<void>,
) {
  await withTestDatabase(async (path) => {
    const database = createDatabase(path);
    let now = initial;
    const app = express();
    app.use(express.json());
    app.use(
      "/api/v1",
      trialRouter(database.db, () => now),
    );
    app.use(errorHandler);
    try {
      migrate(database.db, { migrationsFolder });
      database.client.exec(
        "INSERT INTO venues (id, name, active) VALUES ('venue-1','Central',1),('venue-off','Closed',0); INSERT INTO consultants (id, name, active) VALUES ('consultant-1','Ari',1);",
      );
      await run(app, database.client, (value) => {
        now = value;
      });
    } finally {
      database.client.close();
    }
  });
}

function addLead(
  client: ReturnType<typeof createDatabase>["client"],
  id: string,
  status = "new",
) {
  client
    .query(
      "INSERT INTO leads (id,full_name,phone,phone_normalized,email,email_normalized,source,venue_id,consultant_id,status,created_at,updated_at) VALUES (?, ?, '+14155550132', '+14155550132', ?, ?, 'website','venue-1','consultant-1', ?, ?, ?)",
    )
    .run(
      id,
      `Lead ${id}`,
      `${id}@example.test`,
      `${id}@example.test`,
      status,
      initial,
      initial,
    );
}

const schedule = (scheduledAt = initial, venueId = "venue-1") => ({
  venueId,
  scheduledAt,
  notes: "Booked",
});

describe("trial workflow", () => {
  test("schedules, reschedules, completes, cancels, and marks no-show with server timestamps", async () =>
    setup(async (app, client, setNow) => {
      addLead(client, "complete");
      addLead(client, "cancel", "contacted");
      addLead(client, "no-show", "contacted");
      for (const id of ["complete", "cancel", "no-show"]) {
        setNow(initial);
        const created = await request(app)
          .post(`/api/v1/leads/${id}/trials`)
          .send(schedule("2026-10-24T11:00:00Z"));
        expect(created.status).toBe(201);
        expect(created.body.data).toMatchObject({
          leadId: id,
          status: "scheduled",
          completedAt: null,
          createdAt: initial,
          updatedAt: initial,
        });
        if (id === "complete") {
          const trialId = created.body.data.id as string;
          setNow("2026-10-24T10:30:00Z");
          const rescheduled = await request(app)
            .patch(`/api/v1/leads/${id}/trials/${trialId}`)
            .send({ scheduledAt: "2026-10-24T10:30:00Z" });
          expect(rescheduled.status).toBe(200);
          expect(rescheduled.body.data.scheduledAt).toBe(
            "2026-10-24T10:30:00Z",
          );
          const completed = await request(app)
            .patch(`/api/v1/leads/${id}/trials/${trialId}`)
            .send({ status: "completed" });
          expect(completed.status).toBe(200);
          expect(completed.body.data).toMatchObject({
            status: "completed",
            completedAt: "2026-10-24T10:30:00Z",
          });
        } else {
          const trialId = created.body.data.id as string;
          const status = id === "cancel" ? "cancelled" : "no_show";
          setNow("2026-10-24T11:00:00Z");
          const outcome = await request(app)
            .patch(`/api/v1/leads/${id}/trials/${trialId}`)
            .send({ status });
          expect(outcome.status).toBe(200);
          expect(outcome.body.data).toMatchObject({
            status,
            completedAt: null,
          });
        }
      }
      expect(
        client.query("SELECT status FROM leads WHERE id='complete'").get(),
      ).toEqual({ status: "trial_completed" });
      expect(
        client.query("SELECT status FROM leads WHERE id='cancel'").get(),
      ).toEqual({ status: "contacted" });
      expect(
        client.query("SELECT status FROM leads WHERE id='no-show'").get(),
      ).toEqual({ status: "contacted" });
    }));

  test("reconciles multiple trial histories and keeps other lead states", async () =>
    setup(async (app, client, setNow) => {
      addLead(client, "one");
      addLead(client, "two");
      addLead(client, "parallel");
      addLead(client, "converted", "contacted");
      const create = async (leadId: string, at = "2026-10-24T11:00:00Z") =>
        (
          await request(app)
            .post(`/api/v1/leads/${leadId}/trials`)
            .send(schedule(at))
        ).body.data.id as string;
      const oneA = await create("one");
      const oneB = await create("one", "2026-10-24T12:00:00Z");
      setNow("2026-10-24T11:00:00Z");
      expect(
        (
          await request(app)
            .patch(`/api/v1/leads/one/trials/${oneA}`)
            .send({ status: "completed" })
        ).status,
      ).toBe(200);
      expect(
        client.query("SELECT status FROM leads WHERE id='one'").get(),
      ).toEqual({ status: "trial_scheduled" });
      setNow("2026-10-24T12:00:00Z");
      expect(
        (
          await request(app)
            .patch(`/api/v1/leads/one/trials/${oneB}`)
            .send({ status: "cancelled" })
        ).status,
      ).toBe(200);
      expect(
        client.query("SELECT status FROM leads WHERE id='one'").get(),
      ).toEqual({ status: "trial_completed" });

      const twoA = await create("two", "2026-10-24T12:00:00Z");
      const twoB = await create("two", "2026-10-24T13:00:00Z");
      setNow("2026-10-24T12:00:00Z");
      await request(app)
        .patch(`/api/v1/leads/two/trials/${twoA}`)
        .send({ status: "cancelled" });
      setNow("2026-10-24T13:00:00Z");
      await request(app)
        .patch(`/api/v1/leads/two/trials/${twoB}`)
        .send({ status: "completed" });
      expect(
        client.query("SELECT status FROM leads WHERE id='two'").get(),
      ).toEqual({ status: "trial_completed" });

      setNow("2026-10-24T10:00:00Z");
      const parallelDone = await create("parallel", "2026-10-24T10:00:00Z");
      const parallelScheduled = await create(
        "parallel",
        "2026-10-24T14:00:00Z",
      );
      await request(app)
        .patch(`/api/v1/leads/parallel/trials/${parallelDone}`)
        .send({ status: "completed" });
      setNow("2026-10-24T14:00:00Z");
      await request(app)
        .patch(`/api/v1/leads/parallel/trials/${parallelScheduled}`)
        .send({ status: "cancelled" });
      expect(
        client.query("SELECT status FROM leads WHERE id='parallel'").get(),
      ).toEqual({ status: "trial_completed" });

      const historical = await create("converted", "2026-10-24T15:00:00Z");
      client
        .query("UPDATE leads SET status='converted' WHERE id='converted'")
        .run();
      client
        .query(
          "INSERT INTO conversions (id,lead_id,converted_at,note,membership_reference) VALUES ('conversion-1','converted',?,'paid',NULL)",
        )
        .run(initial);
      setNow("2026-10-24T15:00:00Z");
      expect(
        (
          await request(app)
            .patch(`/api/v1/leads/converted/trials/${historical}`)
            .send({ status: "completed" })
        ).status,
      ).toBe(200);
      expect(
        client.query("SELECT status FROM leads WHERE id='converted'").get(),
      ).toEqual({ status: "converted" });
      expect(
        client
          .query(
            "SELECT COUNT(*) AS count FROM conversions WHERE lead_id='converted'",
          )
          .get(),
      ).toEqual({ count: 1 });
    }));

  test("rejects bad ownership, references, terminal states, transitions, and time boundaries without writes", async () =>
    setup(async (app, client, setNow) => {
      addLead(client, "eligible");
      addLead(client, "other");
      addLead(client, "lost", "lost");
      addLead(client, "invalid", "invalid");
      addLead(client, "converted", "converted");
      client
        .query("UPDATE leads SET deleted_at=? WHERE id='deleted'")
        .run(initial);
      const missingLead = await request(app)
        .post("/api/v1/leads/missing/trials")
        .send(schedule());
      expect(missingLead.status).toBe(404);
      expect(
        (
          await request(app)
            .post("/api/v1/leads/eligible/trials")
            .send(schedule(initial, "missing"))
        ).status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .post("/api/v1/leads/eligible/trials")
            .send(schedule(initial, "venue-off"))
        ).status,
      ).toBe(404);
      for (const id of ["lost", "invalid", "converted", "deleted"]) {
        if (id === "deleted")
          client
            .query(
              "INSERT INTO leads (id,full_name,phone,phone_normalized,email,email_normalized,source,venue_id,consultant_id,status,created_at,updated_at,deleted_at) VALUES ('deleted','Deleted','+14155550132','+14155550132','deleted@example.test','deleted@example.test','website','venue-1','consultant-1','contacted',?,?,?)",
            )
            .run(initial, initial, initial);
        expect(
          (
            await request(app)
              .post(`/api/v1/leads/${id}/trials`)
              .send(schedule())
          ).status,
        ).toBe(id === "deleted" ? 404 : 409);
      }
      expect(
        (
          await request(app)
            .post("/api/v1/leads/eligible/trials")
            .send(schedule("2026-10-24T09:59:59Z"))
        ).status,
      ).toBe(409);
      expect(
        (
          await request(app)
            .post("/api/v1/leads/eligible/trials")
            .send({ ...schedule(), status: "completed" })
        ).status,
      ).toBe(422);
      const first = (
        await request(app)
          .post("/api/v1/leads/eligible/trials")
          .send(schedule("2026-10-24T10:00:00Z"))
      ).body.data;
      const otherTrial = (
        await request(app).post("/api/v1/leads/other/trials").send(schedule())
      ).body.data;
      expect(
        (
          await request(app)
            .patch(`/api/v1/leads/eligible/trials/${otherTrial.id}`)
            .send({ status: "completed" })
        ).status,
      ).toBe(404);
      const early = (
        await request(app)
          .post("/api/v1/leads/eligible/trials")
          .send(schedule("2026-10-24T11:00:00Z"))
      ).body.data;
      expect(
        (
          await request(app)
            .patch(`/api/v1/leads/eligible/trials/${early.id}`)
            .send({ status: "no_show" })
        ).status,
      ).toBe(409);
      expect(
        (
          await request(app)
            .patch(`/api/v1/leads/eligible/trials/${first.id}`)
            .send({ status: "completed" })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(app)
            .patch(`/api/v1/leads/eligible/trials/${first.id}`)
            .send({ status: "cancelled" })
        ).status,
      ).toBe(409);
      expect(
        (
          await request(app)
            .patch("/api/v1/leads/eligible/trials/%20")
            .send({ status: "completed" })
        ).status,
      ).toBe(422);
      expect(
        (
          await request(app)
            .patch(`/api/v1/leads/eligible/trials/${first.id}`)
            .send({ scheduledAt: "2026-10-24T10:00:00Z" })
        ).status,
      ).toBe(409);
      setNow("2026-10-24T10:00:00Z");
      const boundary = (
        await request(app)
          .post("/api/v1/leads/other/trials")
          .send(schedule(initial))
      ).body.data;
      expect(
        (
          await request(app)
            .patch(`/api/v1/leads/other/trials/${boundary.id}`)
            .send({ status: "completed" })
        ).status,
      ).toBe(200);
      const beforeCount = client
        .query("SELECT COUNT(*) AS count FROM trials")
        .get() as { count: number };
      const beforeLead = client
        .query("SELECT status, updated_at FROM leads WHERE id='other'")
        .get();
      expect(
        (
          await request(app)
            .patch(`/api/v1/leads/other/trials/${boundary.id}`)
            .send({ status: "cancelled" })
        ).status,
      ).toBe(409);
      expect(
        client.query("SELECT COUNT(*) AS count FROM trials").get(),
      ).toEqual(beforeCount);
      expect(
        client
          .query("SELECT status, updated_at FROM leads WHERE id='other'")
          .get(),
      ).toEqual(beforeLead);
    }));

  test("compares sub-millisecond schedule and outcome boundaries exactly", async () =>
    setup(async (app, client, setNow) => {
      addLead(client, "fractional-create");
      addLead(client, "fractional-reschedule");
      setNow("2026-10-24T10:00:00.000Z");
      const afterNow = (
        await request(app)
          .post("/api/v1/leads/fractional-create/trials")
          .send(schedule("2026-10-24T10:00:00.0005Z"))
      ).body.data;
      expect(afterNow.status).toBe("scheduled");
      expect(
        (
          await request(app)
            .patch(`/api/v1/leads/fractional-create/trials/${afterNow.id}`)
            .send({ status: "completed" })
        ).status,
      ).toBe(409);

      setNow("2026-10-24T10:00:00.0005Z");
      expect(
        (
          await request(app)
            .patch(`/api/v1/leads/fractional-create/trials/${afterNow.id}`)
            .send({ status: "completed" })
        ).status,
      ).toBe(200);

      const scheduled = (
        await request(app)
          .post("/api/v1/leads/fractional-reschedule/trials")
          .send(schedule("2026-10-24T10:00:00.001Z"))
      ).body.data;
      const rescheduled = await request(app)
        .patch(`/api/v1/leads/fractional-reschedule/trials/${scheduled.id}`)
        .send({ scheduledAt: "2026-10-24T10:00:00.0005Z" });
      expect(rescheduled.status).toBe(200);
      expect(rescheduled.body.data.scheduledAt).toBe(
        "2026-10-24T10:00:00.0005Z",
      );
      expect(
        (
          await request(app)
            .patch(`/api/v1/leads/fractional-reschedule/trials/${scheduled.id}`)
            .send({ status: "no_show" })
        ).status,
      ).toBe(200);
    }));
});
