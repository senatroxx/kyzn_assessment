import { describe, expect, test } from "vitest";
import { apiErrorSchema, apiVersion } from "./index";

describe("shared exports", () => {
  test("exposes the API version", () => {
    expect(apiVersion).toBe("v1");
  });

  test("exports the generic API error schema", () => {
    expect(
      apiErrorSchema.safeParse({
        error: { code: "NOT_FOUND", message: "Missing" },
      }).success,
    ).toBe(true);
  });
});
