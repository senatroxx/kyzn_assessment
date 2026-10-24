import { describe, expect, test } from "bun:test";
import express from "express";
import request from "supertest";
import { dashboardMetricsResponseSchema } from "@kyzn/shared";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createDatabase } from "../src/db/client.ts";
import { dashboardMetricsRouter } from "../src/modules/dashboard/metrics/router.ts";
import { withTestDatabase } from "./database-fixture.ts";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const ref = "2026-10-23T17:00:00.000Z"; // Jakarta midnight, 2026-10-24.

describe("dashboard metrics", () => {
  test("counts persisted eligible rows with Jakarta business-date rules", async () => {
    await withTestDatabase(async (path) => {
      const { client, db } = createDatabase(path);
      try {
        migrate(db, { migrationsFolder });
        const app = express().use(
          "/api/v1/dashboard",
          dashboardMetricsRouter(db, () => new Date(ref)),
        );
        const empty = await request(app).get("/api/v1/dashboard/metrics");
        expect(empty.status).toBe(200);
        expect(dashboardMetricsResponseSchema.parse(empty.body)).toEqual({
          data: {
            totalLeads: 0,
            newLeads: 0,
            followUpsDue: 0,
            trialsScheduled: 0,
            trialsCompleted: 0,
            convertedLeads: 0,
            conversionRate: 0,
          },
        });

        client.exec(
          "INSERT INTO venues (id,name) VALUES ('v','Central'); INSERT INTO consultants (id,name) VALUES ('c','Ari');",
        );
        const insertLead = client.query(`INSERT INTO leads
          (id,full_name,phone,phone_normalized,email,email_normalized,source,venue_id,consultant_id,status,created_at,updated_at,next_follow_up_date,deleted_at)
          VALUES (?,?,?,?,?,?,'website','v','c',?, ?, ?, ?, ?)`);
        const addLead = (
          id: string,
          status: string,
          followup: string | null,
          deleted: string | null = null,
          created = "2026-10-20T00:00:00Z",
        ) =>
          insertLead.run(
            id,
            id,
            "08123456789",
            "+628123456789",
            `${id}@example.test`,
            `${id}@example.test`,
            status,
            created,
            created,
            followup,
            deleted,
          );
        addLead("new-due", "new", "2026-10-24");
        addLead("new-created-today", "new", "2026-10-25", null, ref);
        addLead("contacted-overdue", "contacted", "2026-10-23");
        addLead("scheduled-due", "trial_scheduled", "2026-10-24");
        addLead("completed-due", "trial_completed", "2026-10-24");
        addLead("lost-due", "lost", "2026-10-24");
        addLead("converted-no-date", "converted", null);
        addLead("duplicate", "contacted", "2026-10-24");
        addLead("invalid", "invalid", "2026-10-24");
        addLead("deleted", "new", "2026-10-24", ref);
        client.exec(`INSERT INTO trials (id,lead_id,venue_id,scheduled_at,status) VALUES
          ('t1','new-due','v','2026-10-25T00:00:00Z','scheduled'),
          ('t2','new-due','v','2026-10-26T00:00:00Z','scheduled'),
          ('t3','completed-due','v','2026-10-20T00:00:00Z','completed'),
          ('t4','completed-due','v','2026-10-20T00:00:00Z','completed'),
          ('t5','lost-due','v','2026-10-20T00:00:00Z','no_show'),
          ('t6','invalid','v','2026-10-20T00:00:00Z','scheduled'),
          ('t7','deleted','v','2026-10-20T00:00:00Z','completed');
          INSERT INTO conversions (id,lead_id,converted_at) VALUES ('x1','new-due','2026-10-24T00:00:00Z'),('x2','lost-due','2026-10-24T00:00:00Z'),('x3','invalid','2026-10-24T00:00:00Z'),('x4','deleted','2026-10-24T00:00:00Z');`);

        const response = await request(app).get("/api/v1/dashboard/metrics");
        expect(response.status).toBe(200);
        expect(dashboardMetricsResponseSchema.parse(response.body)).toEqual({
          data: {
            totalLeads: 8,
            newLeads: 2,
            followUpsDue: 5,
            trialsScheduled: 2,
            trialsCompleted: 2,
            convertedLeads: 2,
            conversionRate: 25,
          },
        });

        // A status-only change does not count as a conversion; records and lead edits do.
        client.exec(
          "UPDATE leads SET status='converted' WHERE id='new-created-today'; UPDATE leads SET next_follow_up_date='2026-10-24' WHERE id='new-created-today'; INSERT INTO activities (id,lead_id,type,occurred_at,next_follow_up_date) VALUES ('a1','new-created-today','call','2026-10-24T10:00:00Z','2026-10-24'); UPDATE leads SET next_follow_up_date='2026-10-24' WHERE id='new-created-today'; INSERT INTO trials (id,lead_id,venue_id,scheduled_at,status) VALUES ('t8','new-created-today','v','2026-10-25T00:00:00Z','scheduled'); INSERT INTO conversions (id,lead_id,converted_at) VALUES ('x5','new-created-today','2026-10-24T10:00:00Z');",
        );
        const changed = await request(app).get("/api/v1/dashboard/metrics");
        expect(dashboardMetricsResponseSchema.parse(changed.body)).toEqual({
          data: {
            totalLeads: 8,
            newLeads: 1,
            followUpsDue: 5,
            trialsScheduled: 3,
            trialsCompleted: 2,
            convertedLeads: 3,
            conversionRate: 37.5,
          },
        });
      } finally {
        client.close();
      }
    });
  });

  test("uses the supplied timezone to decide the business date", async () => {
    await withTestDatabase(async (path) => {
      const { client, db } = createDatabase(path);
      try {
        migrate(db, { migrationsFolder });
        client.exec(
          "INSERT INTO venues (id,name) VALUES ('v','Central'); INSERT INTO consultants (id,name) VALUES ('c','Ari'); INSERT INTO leads (id,full_name,phone,phone_normalized,email,email_normalized,source,venue_id,consultant_id,status,created_at,updated_at,next_follow_up_date) VALUES ('l','Lead','08123456789','+628123456789','l@example.test','l@example.test','website','v','c','new','2026-10-23T00:00:00Z','2026-10-23T00:00:00Z','2026-10-24');",
        );
        const app = express().use(
          "/api/v1/dashboard",
          dashboardMetricsRouter(db, () => new Date(ref), "UTC"),
        );
        const response = await request(app).get("/api/v1/dashboard/metrics");
        expect(response.body.data.followUpsDue).toBe(0);
      } finally {
        client.close();
      }
    });
  });
});
