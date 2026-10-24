import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./router";
import { queryClient } from "./lib/query-client";

const zeroMetrics = {
  totalLeads: 0,
  newLeads: 0,
  followUpsDue: 0,
  trialsScheduled: 0,
  trialsCompleted: 0,
  convertedLeads: 0,
  conversionRate: 0,
};

function metricsResponse(data: typeof zeroMetrics) {
  return { ok: true, json: async () => ({ data }) };
}

beforeEach(() => {
  queryClient.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dashboard", () => {
  test("loads and displays all seven API metrics and a configured Lead Management link", async () => {
    const data = {
      totalLeads: 23,
      newLeads: 5,
      followUpsDue: 4,
      trialsScheduled: 3,
      trialsCompleted: 2,
      convertedLeads: 7,
      conversionRate: 30.434,
    };
    const fetchMock = vi.fn().mockResolvedValue(metricsResponse(data));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("23")).toBeInTheDocument();
    for (const value of ["5", "4", "3", "2", "7"]) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
    for (const label of [
      "Total leads",
      "New leads",
      "Follow-ups due today",
      "Trials scheduled",
      "Trials completed",
      "Converted leads",
      "Conversion rate",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("30.4%")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Lead Management" }),
    ).toHaveAttribute("href", "http://localhost:3001");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/dashboard/metrics",
    );
  });

  test("shows a loading state, then zero metrics for an empty dataset", async () => {
    let resolveResponse:
      ((response: ReturnType<typeof metricsResponse>) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveResponse = resolve;
          }),
      ),
    );
    render(<App />);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Loading dashboard metrics",
    );
    resolveResponse?.(metricsResponse(zeroMetrics));

    expect(await screen.findByText("No leads yet.")).toBeInTheDocument();
    expect(screen.getAllByText("0")).toHaveLength(6);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  test.each(["an unavailable API", "a malformed response"])(
    "offers retry after %s",
    async (scenario) => {
      let shouldSucceed = false;
      const fetchMock = vi.fn(async () => {
        if (shouldSucceed) return metricsResponse(zeroMetrics);
        return scenario === "an unavailable API"
          ? { ok: false, json: async () => ({}) }
          : {
              ok: true,
              json: async () => ({
                data: { ...zeroMetrics, totalLeads: "bad" },
              }),
            };
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<App />);

      expect(
        await screen.findByRole("alert", {}, { timeout: 3000 }),
      ).toHaveTextContent("try again");
      shouldSucceed = true;
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByText("No leads yet.")).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    },
  );

  test("refreshes metrics on demand", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(metricsResponse(zeroMetrics))
      .mockResolvedValue(metricsResponse({ ...zeroMetrics, totalLeads: 8 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByText("No leads yet.");

    fireEvent.click(screen.getByRole("button", { name: "Refresh metrics" }));

    expect(await screen.findByText("8")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
