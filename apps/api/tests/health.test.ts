import { describe, expect, test } from "bun:test";
import request from "supertest";
import { app } from "../src/app.ts";

describe("GET /api/health", () => {
  test("returns a successful health response", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: "ok" } });
  });
});
