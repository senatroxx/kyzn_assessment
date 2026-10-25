import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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

const populatedMetrics = {
  totalLeads: 23,
  newLeads: 5,
  followUpsDue: 4,
  trialsScheduled: 3,
  trialsCompleted: 2,
  convertedLeads: 7,
  conversionRate: 30.434,
};

const populatedFunnel = {
  eligibleLeadCount: 20,
  stages: [
    { key: "total_leads", leadCount: 20, percentOfEligibleLeads: 100 },
    { key: "contacted", leadCount: 10, percentOfEligibleLeads: 50 },
    { key: "completed_trials", leadCount: 5, percentOfEligibleLeads: 25 },
    { key: "converted", leadCount: 4, percentOfEligibleLeads: 20 },
  ],
};

const zeroFunnel = {
  eligibleLeadCount: 0,
  stages: [
    { key: "total_leads", leadCount: 0, percentOfEligibleLeads: 0 },
    { key: "contacted", leadCount: 0, percentOfEligibleLeads: 0 },
    { key: "completed_trials", leadCount: 0, percentOfEligibleLeads: 0 },
    { key: "converted", leadCount: 0, percentOfEligibleLeads: 0 },
  ],
};

const populatedFollowUps = [
  {
    id: "lead-overdue",
    fullName: "Ayu Pratama",
    consultantName: "Dewi",
    nextFollowUpDate: "2026-10-22",
    followUpStatus: "overdue",
  },
  {
    id: "lead-due-today",
    fullName: "Bima Santoso",
    consultantName: null,
    nextFollowUpDate: "2026-10-24",
    followUpStatus: "due_today",
  },
];

const zeroFollowUps: typeof populatedFollowUps = [];

function response(data: unknown, ok = true) {
  return { ok, json: async () => ({ data }) };
}

function trendBuckets(days: 7 | 30, empty = false) {
  const lastDay = Date.parse("2026-10-24T00:00:00.000Z");
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(lastDay - (days - 1 - index) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return {
      date,
      count: empty
        ? 0
        : date === "2026-10-22"
          ? 2
          : date === "2026-10-24"
            ? 3
            : 0,
    };
  });
}

function mockDashboard({
  metrics = populatedMetrics,
  funnel = populatedFunnel,
  followUps = populatedFollowUps,
  emptyTrend = false,
}: {
  metrics?: typeof zeroMetrics;
  funnel?: typeof populatedFunnel;
  followUps?: typeof populatedFollowUps;
  emptyTrend?: boolean;
} = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const endpoint = url.pathname.split("/").at(-1) ?? "";
    if (endpoint === "metrics") return response(metrics);
    if (endpoint === "leads-trend") {
      return response(
        trendBuckets(url.searchParams.get("days") === "7" ? 7 : 30, emptyTrend),
      );
    }
    if (endpoint === "funnel") return response(funnel);
    if (endpoint === "follow-ups") return response(followUps);
    return response({}, false);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestUrls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

beforeEach(() => {
  queryClient.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dashboard", () => {
  test("keeps all seven KPIs and shows the persisted insights and follow-up links", async () => {
    const fetchMock = mockDashboard();
    render(<App />);

    expect(await screen.findByText("23")).toBeInTheDocument();
    const metrics = screen.getByRole("region", { name: "Key metrics" });
    for (const value of ["5", "4", "3", "2", "7"]) {
      expect(within(metrics).getByText(value)).toBeInTheDocument();
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
    expect(
      await screen.findByRole("group", {
        name: "Lead acquisitions over the last 30 days",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", {
        name: "Daily leads created in the selected period",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Oct 22, 2026")).toBeInTheDocument();
    expect(screen.getByText("Lead conversion funnel")).toBeInTheDocument();
    expect(screen.getByText("Completed a trial")).toBeInTheDocument();
    expect(screen.getByText(/10 · 50%/)).toBeInTheDocument();

    const followUps = screen.getByRole("region", {
      name: "Follow-ups requiring attention",
    });
    const rows = within(followUps).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Ayu Pratama");
    expect(rows[0]).toHaveTextContent("Overdue");
    expect(rows[1]).toHaveTextContent("Bima Santoso");
    expect(rows[1]).toHaveTextContent("Unassigned");
    expect(
      within(followUps).getByRole("link", { name: "Ayu Pratama" }),
    ).toHaveAttribute("href", "http://localhost:3001/leads/lead-overdue");
    expect(
      within(followUps).getByRole("link", {
        name: "View all leads by follow-up date",
      }),
    ).toHaveAttribute(
      "href",
      "http://localhost:3001/leads?sortBy=nextFollowUpDate&sortOrder=asc",
    );
    expect(
      requestUrls(fetchMock).some((url) =>
        url.endsWith("/v1/dashboard/metrics"),
      ),
    ).toBe(true);
    expect(
      requestUrls(fetchMock).some((url) =>
        url.endsWith("/v1/dashboard/leads-trend?days=30"),
      ),
    ).toBe(true);
    expect(
      requestUrls(fetchMock).some((url) =>
        url.endsWith("/v1/dashboard/funnel"),
      ),
    ).toBe(true);
    expect(
      requestUrls(fetchMock).some((url) =>
        url.endsWith("/v1/dashboard/follow-ups?limit=5"),
      ),
    ).toBe(true);
  });

  test("switches the acquisition trend between 30 and 7 days", async () => {
    const fetchMock = mockDashboard();
    render(<App />);
    await screen.findByRole("group", {
      name: "Lead acquisitions over the last 30 days",
    });

    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));

    expect(
      await screen.findByRole("group", {
        name: "Lead acquisitions over the last 7 days",
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        requestUrls(fetchMock).some((url) =>
          url.endsWith("/v1/dashboard/leads-trend?days=7"),
        ),
      ).toBe(true),
    );
    expect(screen.getByRole("button", { name: "Last 7 days" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("shows empty states when there are no eligible leads or follow-ups", async () => {
    mockDashboard({
      metrics: zeroMetrics,
      funnel: zeroFunnel,
      followUps: zeroFollowUps,
      emptyTrend: true,
    });
    render(<App />);

    expect(await screen.findByText("No leads yet.")).toBeInTheDocument();
    expect(
      screen.getByText("No leads were created in the last 30 days."),
    ).toBeInTheDocument();
    expect(screen.getByText("No eligible leads yet.")).toBeInTheDocument();
    expect(
      screen.getByText("No follow-ups are due today or overdue."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "View all leads by follow-up date" }),
    ).not.toBeInTheDocument();
  });

  test("keeps insight failures isolated and provides retries", async () => {
    let insightsAvailable = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const endpoint = url.pathname.split("/").at(-1) ?? "";
      if (endpoint === "metrics") return response(populatedMetrics);
      if (!insightsAvailable) {
        return response(
          { error: { code: "offline", message: "offline" } },
          false,
        );
      }
      if (endpoint === "leads-trend")
        return response(
          trendBuckets(url.searchParams.get("days") === "7" ? 7 : 30),
        );
      if (endpoint === "funnel") return response(populatedFunnel);
      return response(populatedFollowUps);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    const trendSection = await screen.findByRole("region", {
      name: "Lead acquisition trend",
    });
    await within(trendSection).findByRole("alert", {}, { timeout: 5000 });
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(
      3,
    );
    insightsAvailable = true;

    fireEvent.click(
      within(trendSection).getByRole("button", { name: "Try again" }),
    );
    expect(
      await within(trendSection).findByRole("group", {
        name: "Lead acquisitions over the last 30 days",
      }),
    ).toBeInTheDocument();

    const funnelSection = await screen.findByRole("region", {
      name: "Lead conversion funnel",
    });
    fireEvent.click(
      within(funnelSection).getByRole("button", { name: "Try again" }),
    );
    expect(
      await within(funnelSection).findByText("Contacted"),
    ).toBeInTheDocument();

    const followUpsSection = await screen.findByRole("region", {
      name: "Follow-ups requiring attention",
    });
    fireEvent.click(
      within(followUpsSection).getByRole("button", { name: "Try again" }),
    );

    await waitFor(() =>
      expect(within(followUpsSection).getAllByRole("listitem")).toHaveLength(2),
    );
    expect(
      requestUrls(fetchMock).filter((url) =>
        url.endsWith("/leads-trend?days=30"),
      ),
    ).toHaveLength(3);
    expect(
      requestUrls(fetchMock).filter((url) => url.endsWith("/funnel")),
    ).toHaveLength(3);
    expect(
      requestUrls(fetchMock).filter((url) =>
        url.endsWith("/follow-ups?limit=5"),
      ),
    ).toHaveLength(3);
  });

  test("refreshes metrics and all insight queries together", async () => {
    const fetchMock = mockDashboard();
    render(<App />);
    await screen.findByText("23");
    await screen.findByRole("group", {
      name: "Lead acquisitions over the last 30 days",
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8));
    const urls = requestUrls(fetchMock);
    for (const path of ["metrics", "leads-trend", "funnel", "follow-ups"]) {
      expect(
        urls.filter((url) => new URL(url).pathname.endsWith(path)).length,
      ).toBe(2);
    }
  });

  test("shows a loading state, then zero metrics for an empty dataset", async () => {
    let resolveMetrics:
      ((value: ReturnType<typeof response>) => void) | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/metrics")) {
        return new Promise((resolve) => {
          resolveMetrics = resolve;
        });
      }
      if (path.endsWith("/leads-trend")) {
        return Promise.resolve(response(trendBuckets(30, true)));
      }
      if (path.endsWith("/funnel"))
        return Promise.resolve(response(zeroFunnel));
      return Promise.resolve(response(zeroFollowUps));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    expect(
      await screen.findByRole("status", { name: "Loading dashboard metrics" }),
    ).toHaveTextContent("Loading dashboard metrics");
    resolveMetrics?.(response(zeroMetrics));

    expect(await screen.findByText("No leads yet.")).toBeInTheDocument();
    expect(screen.getAllByText("0")).toHaveLength(6);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  test.each(["an unavailable API", "a malformed response"])(
    "offers retry after %s",
    async (scenario) => {
      let shouldSucceed = false;
      const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname;
        if (!path.endsWith("/metrics"))
          return Promise.resolve(
            response(
              path.endsWith("/funnel")
                ? populatedFunnel
                : path.endsWith("/follow-ups")
                  ? populatedFollowUps
                  : trendBuckets(30),
            ),
          );
        if (shouldSucceed) return Promise.resolve(response(zeroMetrics));
        return Promise.resolve(
          scenario === "an unavailable API"
            ? response(
                { error: { code: "offline", message: "offline" } },
                false,
              )
            : {
                ok: true,
                json: async () => ({
                  data: { ...zeroMetrics, totalLeads: "bad" },
                }),
              },
        );
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<App />);

      expect(
        await screen.findByRole("alert", {}, { timeout: 3000 }),
      ).toHaveTextContent("Dashboard metrics could not be loaded.");
      shouldSucceed = true;
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByText("No leads yet.")).toBeInTheDocument();
      await waitFor(() =>
        expect(
          requestUrls(fetchMock).filter((url) =>
            url.endsWith("/v1/dashboard/metrics"),
          ),
        ).toHaveLength(3),
      );
    },
  );
});
