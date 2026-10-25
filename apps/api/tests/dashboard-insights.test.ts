import { describe, expect, test } from "bun:test";
import express from "express";
import request from "supertest";
import {
  dashboardFunnelResponseSchema,
  dashboardFollowUpsResponseSchema,
  dashboardLeadsTrendResponseSchema,
} from "@kyzn/shared";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createDatabase } from "../src/db/client.ts";
import { dashboardInsightsRouter } from "../src/modules/dashboard/insights/router.ts";
import { withTestDatabase } from "./database-fixture.ts";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const now = "2026-10-24T17:00:00.000Z"; // Jakarta midnight, 2026-10-25.

function appFor(
  db: Parameters<typeof dashboardInsightsRouter>[0],
  timeZone = "Asia/Jakarta",
) {
  const app = express();
  app.use(
    "/api/v1/dashboard",
    dashboardInsightsRouter(db, () => new Date(now), timeZone),
  );
  return app;
}

function insertReferenceData(
  client: ReturnType<typeof createDatabase>["client"],
) {
  client.exec(
    "INSERT INTO venues (id,name) VALUES ('v','Central'); INSERT INTO consultants (id,name) VALUES ('c','Ari');",
  );
}

function insertLead(
  client: ReturnType<typeof createDatabase>["client"],
  {
    id,
    status = "new",
    createdAt = "2026-10-20T00:00:00.000Z",
    followUp = null,
    deletedAt = null,
    consultantId = "c",
  }: {
    id: string;
    status?: string;
    createdAt?: string;
    followUp?: string | null;
    deletedAt?: string | null;
    consultantId?: string;
  },
) {
  client
    .query(
      `INSERT INTO leads
      (id,full_name,phone,phone_normalized,email,email_normalized,source,venue_id,consultant_id,status,created_at,updated_at,next_follow_up_date,deleted_at)
      VALUES (?,?,?,?,?,?,'website','v',?,?,?,?,?,?)`,
    )
    .run(
      id,
      id,
      "08123456789",
      "+628123456789",
      `${id}@example.test`,
      `${id}@example.test`,
      consultantId,
      status,
      createdAt,
      createdAt,
      followUp,
      deletedAt,
    );
}

describe("dashboard insight endpoints", () => {
  test("returns every requested business-local trend day, including zeroes and date boundaries", async () => {
    await withTestDatabase(async (path) => {
      const { client, db } = createDatabase(path);
      try {
        migrate(db, { migrationsFolder });
        insertReferenceData(client);
        insertLead(client, {
          id: "start-boundary",
          createdAt: "2026-10-18T17:00:00.000Z",
        });
        insertLead(client, {
          id: "start-boundary-no-fraction",
          createdAt: "2026-10-18T17:00:00Z",
        });
        insertLead(client, {
          id: "same-day",
          createdAt: "2026-10-19T11:59:59.999Z",
        });
        insertLead(client, {
          id: "today",
          createdAt: "2026-10-24T17:00:00.000Z",
        });
        insertLead(client, {
          id: "before-window",
          createdAt: "2026-10-18T16:59:59.999Z",
        });
        insertLead(client, {
          id: "end-boundary",
          createdAt: "2026-10-25T17:00:00.000Z",
        });
        insertLead(client, {
          id: "end-boundary-no-fraction",
          createdAt: "2026-10-25T17:00:00Z",
        });
        insertLead(client, {
          id: "invalid",
          status: "invalid",
          createdAt: "2026-10-20T01:00:00.000Z",
        });
        insertLead(client, {
          id: "deleted",
          deletedAt: now,
          createdAt: "2026-10-20T01:00:00.000Z",
        });

        const response = await request(appFor(db)).get(
          "/api/v1/dashboard/leads-trend?days=7",
        );
        expect(response.status).toBe(200);
        const trend = dashboardLeadsTrendResponseSchema.parse(
          response.body,
        ).data;
        expect(trend).toHaveLength(7);
        expect(trend.map(({ date }) => date)).toEqual([
          "2026-10-19",
          "2026-10-20",
          "2026-10-21",
          "2026-10-22",
          "2026-10-23",
          "2026-10-24",
          "2026-10-25",
        ]);
        expect(trend.map(({ count }) => count)).toEqual([3, 0, 0, 0, 0, 0, 1]);
        expect(
          (
            await request(appFor(db)).get(
              "/api/v1/dashboard/leads-trend?days=14",
            )
          ).status,
        ).toBe(422);

        const utcTrend = dashboardLeadsTrendResponseSchema.parse(
          (
            await request(appFor(db, "UTC")).get(
              "/api/v1/dashboard/leads-trend?days=7",
            )
          ).body,
        ).data;
        expect(utcTrend.map(({ date }) => date)).toEqual([
          "2026-10-18",
          "2026-10-19",
          "2026-10-20",
          "2026-10-21",
          "2026-10-22",
          "2026-10-23",
          "2026-10-24",
        ]);
        expect(utcTrend.map(({ count }) => count)).toEqual([
          3, 1, 0, 0, 0, 0, 1,
        ]);
      } finally {
        client.close();
      }
    });
  });

  test("defaults to a 30-day empty series and zero-valued funnel", async () => {
    await withTestDatabase(async (path) => {
      const { client, db } = createDatabase(path);
      try {
        migrate(db, { migrationsFolder });
        const app = appFor(db);
        const trend = dashboardLeadsTrendResponseSchema.parse(
          (await request(app).get("/api/v1/dashboard/leads-trend")).body,
        ).data;
        expect(trend).toHaveLength(30);
        expect(trend.every(({ count }) => count === 0)).toBe(true);

        const funnel = dashboardFunnelResponseSchema.parse(
          (await request(app).get("/api/v1/dashboard/funnel")).body,
        ).data;
        expect(funnel.eligibleLeadCount).toBe(0);
        expect(
          funnel.stages.map(
            ({ percentOfEligibleLeads }) => percentOfEligibleLeads,
          ),
        ).toEqual([0, 0, 0, 0]);
      } finally {
        client.close();
      }
    });
  });

  test("counts distinct historical funnel milestones from persisted records", async () => {
    await withTestDatabase(async (path) => {
      const { client, db } = createDatabase(path);
      try {
        migrate(db, { migrationsFolder });
        insertReferenceData(client);
        insertLead(client, { id: "contacted" });
        insertLead(client, { id: "note-only", status: "contacted" });
        insertLead(client, { id: "completed", status: "trial_completed" });
        insertLead(client, { id: "converted-no-trial", status: "converted" });
        insertLead(client, { id: "converted-with-trial", status: "converted" });
        insertLead(client, { id: "lost", status: "lost" });
        insertLead(client, { id: "invalid", status: "invalid" });
        insertLead(client, { id: "deleted", deletedAt: now });
        client.exec(`
          INSERT INTO activities (id,lead_id,type,occurred_at) VALUES
            ('a1','contacted','call','2026-10-20T00:00:00.000Z'),
            ('a2','contacted','email','2026-10-21T00:00:00.000Z'),
            ('a3','note-only','note','2026-10-21T00:00:00.000Z'),
            ('a4','completed','whatsapp','2026-10-21T00:00:00.000Z'),
            ('a5','converted-with-trial','call','2026-10-21T00:00:00.000Z'),
            ('a6','invalid','call','2026-10-21T00:00:00.000Z'),
            ('a7','deleted','call','2026-10-21T00:00:00.000Z');
          INSERT INTO trials (id,lead_id,venue_id,scheduled_at,status,completed_at) VALUES
            ('t1','completed','v','2026-10-21T00:00:00.000Z','completed','2026-10-21T01:00:00.000Z'),
            ('t2','completed','v','2026-10-22T00:00:00.000Z','completed','2026-10-22T01:00:00.000Z'),
            ('t3','converted-with-trial','v','2026-10-21T00:00:00.000Z','completed','2026-10-21T01:00:00.000Z'),
            ('t4','invalid','v','2026-10-21T00:00:00.000Z','completed','2026-10-21T01:00:00.000Z'),
            ('t5','deleted','v','2026-10-21T00:00:00.000Z','completed','2026-10-21T01:00:00.000Z');
          INSERT INTO conversions (id,lead_id,converted_at) VALUES
            ('c1','converted-no-trial','2026-10-22T00:00:00.000Z'),
            ('c2','converted-with-trial','2026-10-22T00:00:00.000Z'),
            ('c3','invalid','2026-10-22T00:00:00.000Z'),
            ('c4','deleted','2026-10-22T00:00:00.000Z');
        `);

        const response = await request(appFor(db)).get(
          "/api/v1/dashboard/funnel",
        );
        expect(response.status).toBe(200);
        expect(dashboardFunnelResponseSchema.parse(response.body).data).toEqual(
          {
            eligibleLeadCount: 6,
            stages: [
              { key: "total_leads", leadCount: 6, percentOfEligibleLeads: 100 },
              { key: "contacted", leadCount: 3, percentOfEligibleLeads: 50 },
              {
                key: "completed_trials",
                leadCount: 2,
                percentOfEligibleLeads: (2 / 6) * 100,
              },
              {
                key: "converted",
                leadCount: 2,
                percentOfEligibleLeads: (2 / 6) * 100,
              },
            ],
          },
        );
      } finally {
        client.close();
      }
    });
  });

  test("returns overdue before today, limits results, and handles missing consultants", async () => {
    await withTestDatabase(async (path) => {
      const { client, db } = createDatabase(path);
      try {
        migrate(db, { migrationsFolder });
        insertReferenceData(client);
        insertLead(client, { id: "old-overdue", followUp: "2026-10-22" });
        insertLead(client, { id: "new-overdue", followUp: "2026-10-24" });
        insertLead(client, { id: "today-a", followUp: "2026-10-25" });
        client.exec("PRAGMA foreign_keys = OFF;");
        insertLead(client, {
          id: "today-unassigned",
          followUp: "2026-10-25",
          consultantId: "missing",
        });
        client.exec("PRAGMA foreign_keys = ON;");
        insertLead(client, { id: "today-c", followUp: "2026-10-25" });
        insertLead(client, { id: "future", followUp: "2026-10-26" });
        insertLead(client, {
          id: "lost",
          status: "lost",
          followUp: "2026-10-25",
        });
        insertLead(client, {
          id: "converted",
          status: "converted",
          followUp: "2026-10-25",
        });
        insertLead(client, {
          id: "invalid",
          status: "invalid",
          followUp: "2026-10-25",
        });
        insertLead(client, {
          id: "deleted",
          followUp: "2026-10-25",
          deletedAt: now,
        });

        const app = appFor(db);
        const response = await request(app).get(
          "/api/v1/dashboard/follow-ups?limit=5",
        );
        expect(response.status).toBe(200);
        const rows = dashboardFollowUpsResponseSchema.parse(response.body).data;
        expect(rows.map(({ id }) => id)).toEqual([
          "old-overdue",
          "new-overdue",
          "today-a",
          "today-c",
          "today-unassigned",
        ]);
        expect(rows.map(({ followUpStatus }) => followUpStatus)).toEqual([
          "overdue",
          "overdue",
          "due_today",
          "due_today",
          "due_today",
        ]);
        expect(
          rows.find(({ id }) => id === "today-unassigned")?.consultantName,
        ).toBeNull();
        expect(
          dashboardFollowUpsResponseSchema
            .parse(
              (await request(app).get("/api/v1/dashboard/follow-ups?limit=2"))
                .body,
            )
            .data.map(({ id }) => id),
        ).toEqual(["old-overdue", "new-overdue"]);
        expect(
          (await request(app).get("/api/v1/dashboard/follow-ups?limit=6"))
            .status,
        ).toBe(422);
      } finally {
        client.close();
      }
    });
  });
});
