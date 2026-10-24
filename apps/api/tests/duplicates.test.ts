import { describe, expect, test } from "bun:test";
import express from "express";
import request from "supertest";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { errorHandler } from "../src/middleware/errors.ts";
import { duplicatesRouter } from "../src/modules/leads/duplicates/router.ts";
import { leadsRouter } from "../src/modules/leads/router.ts";
import { createDatabase } from "../src/db/client.ts";
import { withTestDatabase } from "./database-fixture.ts";
import {
  normalizeEmail,
  normalizePhone,
  phoneSearchTerms,
} from "../src/modules/leads/contact-normalization.ts";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const input = (overrides: Record<string, unknown> = {}) => ({
  fullName: "Taylor Ng",
  phone: "0812-3456-7890",
  email: "Taylor@Example.test",
  source: "website",
  venueId: "venue-1",
  consultantId: "consultant-1",
  ...overrides,
});

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
        "INSERT INTO venues (id,name,active) VALUES ('venue-1','Central',1); INSERT INTO consultants (id,name,active) VALUES ('consultant-1','Ari',1);",
      );
      const app = express();
      app.use(express.json());
      app.use("/api/v1/leads/duplicates", duplicatesRouter(database.db));
      app.use("/api/v1", leadsRouter(database.db));
      app.use(errorHandler);
      await run(app, database.client);
    } finally {
      database.client.close();
    }
  });
}

describe("lead duplicate identification", () => {
  test("normalizes contact values and keeps search aliases explicit", () => {
    expect(normalizePhone("0812-3456-7890")).toBe("+6281234567890");
    expect(normalizePhone("+62 (812) 3456-7890")).toBe("+6281234567890");
    expect(normalizeEmail(" Taylor@Example.test ")).toBe("taylor@example.test");
    expect(phoneSearchTerms("0812")).toEqual(["0812", "62812"]);
    expect(phoneSearchTerms("62 812")).toEqual(["62812"]);
    expect(phoneSearchTerms("+62")).toEqual(["62"]);
    expect(phoneSearchTerms("0812/3456")).toEqual([]);
    expect(phoneSearchTerms("++62812")).toEqual([]);
    expect(phoneSearchTerms("0812(")).toEqual([]);
    expect(phoneSearchTerms("person@example.test")).toEqual([]);
  });

  test("matches phone OR email, reports exact fields, and excludes self/deleted/invalid", async () =>
    setup(async (app, client) => {
      const first = (await request(app).post("/api/v1/leads").send(input()))
        .body.data;
      const byPhone = (
        await request(app)
          .post("/api/v1/leads")
          .send(
            input({
              fullName: "Phone Match",
              phone: "+62 812 3456 7890",
              email: "phone@example.test",
            }),
          )
      ).body.data;
      const byEmail = (
        await request(app)
          .post("/api/v1/leads")
          .send(
            input({
              fullName: "Email Match",
              phone: "+1 (415) 555-0132",
              email: "taylor@example.test",
            }),
          )
      ).body.data;
      const both = (
        await request(app)
          .post("/api/v1/leads")
          .send(
            input({
              fullName: "Both Match",
            }),
          )
      ).body.data;
      const invalid = (
        await request(app)
          .post("/api/v1/leads")
          .send(
            input({
              fullName: "Invalid Match",
            }),
          )
      ).body.data;
      client
        .query("UPDATE leads SET status='invalid' WHERE id=?")
        .run(invalid.id);
      const deleted = (
        await request(app)
          .post("/api/v1/leads")
          .send(
            input({
              fullName: "Deleted Match",
            }),
          )
      ).body.data;
      client
        .query("UPDATE leads SET deleted_at=? WHERE id=?")
        .run(new Date().toISOString(), deleted.id);

      const response = await request(app)
        .get("/api/v1/leads/duplicates")
        .query({
          phone: "+62 812 3456 7890",
          email: "TAYLOR@example.test",
          excludeId: first.id,
        });
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([
        expect.objectContaining({ id: byPhone.id, matchedFields: ["phone"] }),
        expect.objectContaining({
          id: both.id,
          matchedFields: ["phone", "email"],
        }),
        expect.objectContaining({ id: byEmail.id, matchedFields: ["email"] }),
      ]);
      const detail = await request(app).get(`/api/v1/leads/${first.id}`);
      expect(detail.body.data.duplicateMatches).toHaveLength(3);
      expect(
        detail.body.data.duplicateMatches.map(
          (match: { id: string }) => match.id,
        ),
      ).toContain(byPhone.id);
      expect(
        detail.body.data.duplicateMatches.map(
          (match: { id: string }) => match.id,
        ),
      ).not.toContain(first.id);
      expect(
        (
          await request(app)
            .get("/api/v1/leads/duplicates")
            .query({ phone: "0812-3456-7890", excludeId: byPhone.id })
        ).body.data.map((match: { id: string }) => match.id),
      ).not.toContain(byPhone.id);
    }));

  test("rejects missing, empty, and malformed contact queries without blocking duplicate creates", async () =>
    setup(async (app) => {
      for (const query of [
        {},
        { phone: "" },
        { email: "" },
        { phone: "0812/3456" },
      ]) {
        expect(
          (await request(app).get("/api/v1/leads/duplicates").query(query))
            .status,
        ).toBe(422);
      }
      expect(
        (
          await request(app)
            .get("/api/v1/leads/duplicates")
            .query({ search: "Taylor" })
        ).status,
      ).toBe(422);
      const first = await request(app).post("/api/v1/leads").send(input());
      const second = await request(app)
        .post("/api/v1/leads")
        .send(input({ fullName: "Repeat Enquiry" }));
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.data.duplicateMatches).toHaveLength(1);
    }));
});
