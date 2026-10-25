import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FollowUpCard } from "./FollowUpCard";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T18:00:00.000Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("follow-up presentation", () => {
  test.each([
    [null, "No follow-up scheduled"],
    ["2026-10-24", "Overdue"],
    ["2026-10-25", "Due today"],
    ["2026-10-26", "Scheduled"],
  ])("shows %s as %s using the business-local date", (date, label) => {
    render(
      <FollowUpCard
        date={date}
        leadStatus="contacted"
        onSchedule={vi.fn()}
        expanded={false}
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: date ? "Reschedule follow-up" : "Schedule follow-up",
      }),
    ).toBeEnabled();
  });

  test.each(["converted", "lost", "invalid"] as const)(
    "does not present %s as an active overdue lead",
    (leadStatus) => {
      render(
        <FollowUpCard
          date="2026-10-24"
          leadStatus={leadStatus}
          onSchedule={vi.fn()}
          expanded={false}
        />,
      );
      expect(screen.getByText("No active follow-up")).toBeInTheDocument();
      expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.getByText("24 Oct 2026")).toBeInTheDocument();
    },
  );
});
