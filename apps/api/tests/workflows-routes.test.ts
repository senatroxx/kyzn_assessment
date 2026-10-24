import { describe, expect, test } from "bun:test";
import request from "supertest";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createApp } from "../src/app.ts";
import { createDatabase } from "../src/db/client.ts";
import { withTestDatabase } from "./database-fixture.ts";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const fixedNow = new Date("2026-10-24T10:00:00.000Z");

describe("composed lead workflow routes", () => {
  test("routes activity, trial, conversion, and detail requests through one isolated app", async () => {
    await withTestDatabase(async (path) => {
      const database = createDatabase(path);
      try {
        migrate(database.db, { migrationsFolder });
        database.client.exec(
          "INSERT INTO venues (id, name, active) VALUES ('venue-1', 'Central', 1); INSERT INTO consultants (id, name, active) VALUES ('consultant-1', 'Ari', 1); INSERT INTO leads (id, full_name, phone, phone_normalized, email, email_normalized, source, venue_id, consultant_id, status, created_at, updated_at) VALUES ('lead-1', 'Test Lead', '+1 (415) 555-0132', '+14155550132', 'lead@example.test', 'lead@example.test', 'website', 'venue-1', 'consultant-1', 'new', '2026-10-24T09:00:00.000Z', '2026-10-24T09:00:00.000Z');",
        );
        const app = createApp(database.db, () => new Date(fixedNow));

        const activity = await request(app)
          .post("/api/v1/leads/lead-1/activities")
          .send({
            type: "call",
            occurredAt: "2026-10-24T09:30:00.000Z",
            nextFollowUpDate: "2026-10-24",
          });
        expect(activity.status).toBe(201);
        expect(activity.body.data.leadId).toBe("lead-1");
        expect(
          (await request(app).get("/api/v1/dashboard/metrics")).body.data,
        ).toEqual({
          totalLeads: 1,
          newLeads: 0,
          followUpsDue: 1,
          trialsScheduled: 0,
          trialsCompleted: 0,
          convertedLeads: 0,
          conversionRate: 0,
        });

        const trial = await request(app)
          .post("/api/v1/leads/lead-1/trials")
          .send({ venueId: "venue-1", scheduledAt: fixedNow.toISOString() });
        expect(trial.status).toBe(201);
        expect(
          (await request(app).get("/api/v1/dashboard/metrics")).body.data,
        ).toEqual({
          totalLeads: 1,
          newLeads: 0,
          followUpsDue: 1,
          trialsScheduled: 1,
          trialsCompleted: 0,
          convertedLeads: 0,
          conversionRate: 0,
        });

        const completedTrial = await request(app)
          .patch(`/api/v1/leads/lead-1/trials/${trial.body.data.id}`)
          .send({ status: "completed" });
        expect(completedTrial.status).toBe(200);
        expect(completedTrial.body.data.completedAt).toBe(
          fixedNow.toISOString(),
        );
        expect(
          (await request(app).get("/api/v1/dashboard/metrics")).body.data,
        ).toEqual({
          totalLeads: 1,
          newLeads: 0,
          followUpsDue: 1,
          trialsScheduled: 0,
          trialsCompleted: 1,
          convertedLeads: 0,
          conversionRate: 0,
        });

        const conversion = await request(app)
          .post("/api/v1/leads/lead-1/conversion")
          .send({ membershipReference: "DEMO-001" });
        expect(conversion.status).toBe(201);
        expect(conversion.body.data.convertedAt).toBe(fixedNow.toISOString());
        expect(
          (await request(app).get("/api/v1/dashboard/metrics")).body.data,
        ).toEqual({
          totalLeads: 1,
          newLeads: 0,
          followUpsDue: 0,
          trialsScheduled: 0,
          trialsCompleted: 1,
          convertedLeads: 1,
          conversionRate: 100,
        });

        const detail = await request(app).get("/api/v1/leads/lead-1");
        expect(detail.status).toBe(200);
        expect(detail.body.data).toMatchObject({
          status: "converted",
          lastContactAt: "2026-10-24T09:30:00.000Z",
          nextFollowUpDate: "2026-10-24",
          activities: [{ type: "call" }],
          trials: [{ status: "completed" }],
          conversion: { membershipReference: "DEMO-001" },
        });
      } finally {
        database.client.close();
      }
    });
  });
});
