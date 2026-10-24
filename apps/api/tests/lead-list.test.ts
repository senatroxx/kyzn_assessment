import { describe, expect, test } from "bun:test";
import express from "express";
import request from "supertest";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { errorHandler } from "../src/middleware/errors.ts";
import { leadListRouter } from "../src/modules/leads/list/router.ts";
import { createDatabase } from "../src/db/client.ts";
import { withTestDatabase } from "./database-fixture.ts";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const fixture = (
  id: string,
  fullName: string,
  phone: string,
  phoneNormalized: string,
  email: string,
  emailNormalized: string,
  createdAt: string,
  nextFollowUpDate: string | null,
  source = "website",
  consultantId = "consultant-1",
  status = "new",
) => ({
  id,
  full_name: fullName,
  phone,
  phone_normalized: phoneNormalized,
  email,
  email_normalized: emailNormalized,
  source,
  venue_id: "venue-1",
  consultant_id: consultantId,
  status,
  created_at: createdAt,
  updated_at: createdAt,
  last_contact_at: null,
  next_follow_up_date: nextFollowUpDate,
});

function insertLead(
  client: ReturnType<typeof createDatabase>["client"],
  row: ReturnType<typeof fixture>,
) {
  client
    .query(
      `INSERT INTO leads (id, full_name, phone, phone_normalized, email, email_normalized, source, venue_id, consultant_id, status, created_at, updated_at, last_contact_at, next_follow_up_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.full_name,
      row.phone,
      row.phone_normalized,
      row.email,
      row.email_normalized,
      row.source,
      row.venue_id,
      row.consultant_id,
      row.status,
      row.created_at,
      row.updated_at,
      row.last_contact_at,
      row.next_follow_up_date,
    );
}

async function setup(
  run: (
    app: express.Express,
    client: ReturnType<typeof createDatabase>["client"],
  ) => Promise<void>,
) {
  await withTestDatabase(async (path) => {
    const database = createDatabase(path);
    try {
      migrate(database.db, { migrationsFolder });
      database.client.exec(
        "INSERT INTO venues (id, name) VALUES ('venue-1','Central'); INSERT INTO consultants (id, name) VALUES ('consultant-1','Ari'),('consultant-2','Bea');",
      );
      const app = express();
      app.use(express.json());
      app.use("/api/v1/leads", leadListRouter(database.db));
      app.use(errorHandler);
      await run(app, database.client);
    } finally {
      database.client.close();
    }
  });
}

describe("lead list", () => {
  test("defaults to newest first and returns bounded page metadata", async () =>
    setup(async (app, client) => {
      insertLead(
        client,
        fixture(
          "l1",
          "Newest",
          "+14155550132",
          "+14155550132",
          "n@example.test",
          "n@example.test",
          "2026-10-24T10:00:00Z",
          null,
        ),
      );
      insertLead(
        client,
        fixture(
          "l2",
          "Older",
          "+6281234567890",
          "+6281234567890",
          "o@example.test",
          "o@example.test",
          "2026-10-23T10:00:00Z",
          null,
        ),
      );
      client
        .query(
          "UPDATE leads SET deleted_at = '2026-10-24T11:00:00Z' WHERE id = 'l2'",
        )
        .run();
      const response = await request(app).get("/api/v1/leads");
      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      });
      expect(response.body.data.map((row: { id: string }) => row.id)).toEqual([
        "l1",
      ]);
    }));

  test("searches name, email and normalized phone; malformed phone text stays narrow", async () =>
    setup(async (app, client) => {
      insertLead(
        client,
        fixture(
          "a",
          "Alice Tan",
          "0812-3456-7890",
          "+6281234567890",
          "alice@example.test",
          "alice@example.test",
          "2026-10-24T10:00:00Z",
          "2026-10-24",
        ),
      );
      insertLead(
        client,
        fixture(
          "b",
          "Bob Lee",
          "+14155550132",
          "+14155550132",
          "bob@example.test",
          "bob@example.test",
          "2026-10-24T10:00:00Z",
          null,
          "referral",
          "consultant-2",
          "contacted",
        ),
      );
      insertLead(
        client,
        fixture(
          "literal",
          "100%_ Real",
          "+14155550140",
          "+14155550140",
          "literal@example.test",
          "literal@example.test",
          "2026-10-24T10:00:00Z",
          null,
        ),
      );
      const search = async (value: string) =>
        (
          await request(app).get("/api/v1/leads").query({ search: value })
        ).body.data.map((row: { id: string }) => row.id);
      expect(await search("ALICE")).toEqual(["a"]);
      expect(await search("ALICE@EXAMPLE.TEST")).toEqual(["a"]);
      expect(await search("0812")).toEqual(["a"]);
      expect(await search("8123")).toEqual(["a"]);
      expect(await search("0812/3456")).toEqual([]);
      expect(await search("bob@example.test")).toEqual(["b"]);
      expect(await search("%_")).toEqual(["literal"]);

      const combined = await request(app).get("/api/v1/leads").query({
        source: "referral",
        consultantId: "consultant-2",
        status: "contacted",
      });
      expect(combined.body.data.map((row: { id: string }) => row.id)).toEqual([
        "b",
      ]);
      expect(
        (
          await request(app)
            .get("/api/v1/leads")
            .query({ source: "website", consultantId: "consultant-2" })
        ).body.data,
      ).toEqual([]);
    }));

  test("sorts follow-ups null last, breaks ties by ID and paginates the filtered count", async () =>
    setup(async (app, client) => {
      for (const record of [
        fixture(
          "c",
          "Cora Li",
          "+14155550003",
          "+14155550003",
          "c@example.test",
          "c@example.test",
          "2026-10-24T10:00:00Z",
          "2026-10-25",
        ),
        fixture(
          "a",
          "Ari Li",
          "+14155550001",
          "+14155550001",
          "a@example.test",
          "a@example.test",
          "2026-10-24T10:00:00Z",
          "2026-10-25",
        ),
        fixture(
          "b",
          "Bea Li",
          "+14155550002",
          "+14155550002",
          "b@example.test",
          "b@example.test",
          "2026-10-24T09:00:00Z",
          "2026-10-24",
        ),
        fixture(
          "d",
          "Dee Li",
          "+14155550004",
          "+14155550004",
          "d@example.test",
          "d@example.test",
          "2026-10-23T10:00:00Z",
          null,
        ),
      ])
        insertLead(client, record);
      const ids = async (query: Record<string, string>) =>
        (await request(app).get("/api/v1/leads").query(query)).body.data.map(
          (row: { id: string }) => row.id,
        );
      expect(
        await ids({ sortBy: "nextFollowUpDate", sortOrder: "asc" }),
      ).toEqual(["b", "a", "c", "d"]);
      expect(
        await ids({ sortBy: "nextFollowUpDate", sortOrder: "desc" }),
      ).toEqual(["a", "c", "b", "d"]);
      expect(await ids({ sortBy: "createdAt", sortOrder: "asc" })).toEqual([
        "d",
        "b",
        "a",
        "c",
      ]);
      expect(await ids({ sortBy: "createdAt", sortOrder: "desc" })).toEqual([
        "a",
        "c",
        "b",
        "d",
      ]);
      const page = await request(app)
        .get("/api/v1/leads")
        .query({ page: 2, pageSize: 2 });
      expect(page.body.data.map((row: { id: string }) => row.id)).toEqual([
        "b",
        "d",
      ]);
      expect(page.body.meta).toEqual({
        page: 2,
        pageSize: 2,
        total: 4,
        totalPages: 2,
      });
      const beyond = await request(app)
        .get("/api/v1/leads")
        .query({ page: 9, pageSize: 2 });
      expect(beyond.body.data).toEqual([]);
      expect(beyond.body.meta.totalPages).toBe(2);
      for (const query of [
        { page: 0 },
        { pageSize: 101 },
        { status: "bogus" },
        { unknown: "x" },
      ])
        expect(
          (await request(app).get("/api/v1/leads").query(query)).status,
        ).toBe(422);
    }));

  test("flags phone or email duplicates while excluding invalid and deleted leads", async () =>
    setup(async (app, client) => {
      insertLead(
        client,
        fixture(
          "p1",
          "Phone One",
          "+6281234567890",
          "+6281234567890",
          "one@example.test",
          "one@example.test",
          "2026-10-24T10:00:00Z",
          null,
        ),
      );
      insertLead(
        client,
        fixture(
          "p2",
          "Phone Two",
          "+6281234567890",
          "+6281234567890",
          "two@example.test",
          "two@example.test",
          "2026-10-24T10:00:00Z",
          null,
        ),
      );
      insertLead(
        client,
        fixture(
          "e1",
          "Email One",
          "+14155550131",
          "+14155550131",
          "same@example.test",
          "same@example.test",
          "2026-10-24T10:00:00Z",
          null,
        ),
      );
      insertLead(
        client,
        fixture(
          "e2",
          "Email Two",
          "+14155550132",
          "+14155550132",
          "same@example.test",
          "same@example.test",
          "2026-10-24T10:00:00Z",
          null,
        ),
      );
      insertLead(
        client,
        fixture(
          "invalid",
          "Invalid",
          "+14155550133",
          "+14155550133",
          "same@example.test",
          "same@example.test",
          "2026-10-24T10:00:00Z",
          null,
          "website",
          "consultant-1",
          "invalid",
        ),
      );
      insertLead(
        client,
        fixture(
          "deleted",
          "Deleted",
          "+14155550134",
          "+14155550134",
          "same@example.test",
          "same@example.test",
          "2026-10-24T10:00:00Z",
          null,
        ),
      );
      client
        .query(
          "UPDATE leads SET deleted_at = '2026-10-24T11:00:00Z' WHERE id = 'deleted'",
        )
        .run();
      const response = await request(app)
        .get("/api/v1/leads")
        .query({ sortBy: "createdAt", sortOrder: "asc" });
      const duplicates = Object.fromEntries(
        response.body.data.map((row: { id: string; isDuplicate: boolean }) => [
          row.id,
          row.isDuplicate,
        ]),
      );
      expect(duplicates).toEqual({
        e1: true,
        e2: true,
        invalid: false,
        p1: true,
        p2: true,
      });
    }));
});
