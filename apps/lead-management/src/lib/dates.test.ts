import { describe, expect, test } from "vitest";
import { formatBusinessDate, formatBusinessDateTime } from "./dates";

describe("business date formatting", () => {
  test("keeps date-only values on their calendar date", () => {
    expect(formatBusinessDate("2026-10-25")).toBe("25 Oct 2026");
  });

  test("renders instants in the configured business timezone", () => {
    expect(formatBusinessDateTime("2026-10-24T18:00:00.000Z")).toBe(
      "25 Oct 2026, 01.00 WIB",
    );
  });
});
