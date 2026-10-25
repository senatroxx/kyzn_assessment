import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { LeadDetail } from "./LeadDetail";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    params?: { leadId: string };
  }) => {
    const href =
      to === "/leads/$leadId" || to === "/leads/$leadId/edit"
        ? `/leads/${params?.leadId}${to.endsWith("edit") ? "/edit" : ""}`
        : to;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

const lead = {
  id: "lead/1",
  fullName: "Ayu Pratama",
  phone: "+628123456789",
  email: "ayu@example.com",
  source: "website",
  venueId: "venue-1",
  consultantId: "consultant-1",
  status: "trial_completed",
  createdAt: "2026-10-20T10:00:00Z",
  updatedAt: "2026-10-21T10:00:00Z",
  lastContactAt: "2026-10-21T09:00:00Z",
  nextFollowUpDate: "2026-10-25",
  activities: [
    {
      id: "activity-1",
      leadId: "lead/1",
      type: "call",
      occurredAt: "2026-10-21T09:00:00Z",
      note: "Discussed goals",
      nextFollowUpDate: "2026-10-25",
      createdAt: "2026-10-21T09:00:00Z",
    },
  ],
  trials: [
    {
      id: "trial-1",
      leadId: "lead/1",
      venueId: "venue-2",
      scheduledAt: "2026-10-22T08:00:00Z",
      status: "completed",
      completedAt: "2026-10-22T09:00:00Z",
      notes: "Attended",
      createdAt: "2026-10-20T10:00:00Z",
      updatedAt: "2026-10-22T09:00:00Z",
    },
  ],
  conversion: {
    id: "conversion-1",
    leadId: "lead/1",
    convertedAt: "2026-10-23T10:00:00Z",
    note: "Joined",
    membershipReference: "member-42",
  },
  duplicateMatches: [
    {
      id: "lead-2",
      fullName: "Ayu P.",
      phone: "+628123456789",
      email: "ayu.p@example.com",
      matchedFields: ["phone"],
    },
  ],
};
const envelope = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify(
      status === 200
        ? { data }
        : {
            error: {
              code: status === 404 ? "missing" : "failed",
              message: status === 404 ? "Lead not found" : "Request failed",
            },
          },
    ),
    { status },
  );
let client: QueryClient;

function renderDetail(
  fetcher: typeof fetch = vi.fn().mockResolvedValue(envelope(lead)),
) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetcher);
  render(
    <QueryClientProvider client={client}>
      <LeadDetail leadId="lead/1" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  client?.clear();
  vi.unstubAllGlobals();
});

describe("lead detail", () => {
  test("keeps forms contextual, provides contact links, and returns focus after cancel", async () => {
    renderDetail();
    const log = await screen.findByRole("button", { name: "Log activity" });
    expect(screen.queryByLabelText("Occurred at")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Scheduled time")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: lead.phone })).toHaveAttribute(
      "href",
      `tel:${lead.phone}`,
    );
    expect(screen.getByRole("link", { name: lead.email })).toHaveAttribute(
      "href",
      `mailto:${lead.email}`,
    );
    fireEvent.click(log);
    expect(
      screen.getByRole("combobox", { name: "Activity type" }),
    ).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Occurred at")).not.toBeInTheDocument();
    expect(log).toHaveFocus();
    fireEvent.click(
      screen.getByRole("button", { name: "Reschedule follow-up" }),
    );
    expect(screen.getByLabelText("Follow-up date")).toHaveFocus();
    expect(
      screen.getByRole("combobox", { name: "Activity type" }),
    ).toHaveTextContent("Note only");
  });

  test("presents activities newest first without discarding older events", async () => {
    const older = {
      ...lead.activities[0],
      id: "older",
      occurredAt: "2026-10-20T09:00:00Z",
      note: "First enquiry",
    };
    renderDetail(
      vi
        .fn()
        .mockResolvedValue(
          envelope({ ...lead, activities: [older, ...lead.activities] }),
        ),
    );
    const timeline = await screen.findByRole("region", {
      name: "Activity history",
    });
    const items = within(timeline).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Discussed goals");
    expect(items[1]).toHaveTextContent("First enquiry");
  });

  test("closes the activity panel after success and invalidates existing resources", async () => {
    let resolvePost: (response: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolvePost = resolve;
    });
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return pending;
      if (
        String(input).endsWith("/venues") ||
        String(input).endsWith("/consultants")
      )
        return Promise.resolve(envelope([]));
      return Promise.resolve(envelope(lead));
    });
    renderDetail(fetcher);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const log = await screen.findByRole("button", { name: "Log activity" });
    fireEvent.click(log);
    fireEvent.click(screen.getByRole("button", { name: "Record activity" }));
    await waitFor(() => expect(log).toBeDisabled());
    expect(
      screen.getByRole("button", { name: "Reschedule follow-up" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    resolvePost(envelope(lead.activities[0]));
    expect(
      await screen.findByText("Activity recorded successfully."),
    ).toHaveAttribute("role", "status");
    expect(screen.queryByLabelText("Occurred at")).not.toBeInTheDocument();
    await waitFor(() => expect(log).toHaveFocus());
    expect(log).toBeEnabled();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["leads", "detail", "lead/1"],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["leads", "list"] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["dashboard", "metrics"],
    });
  });

  test("retains a failed activity form and its entered values", async () => {
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(envelope(null, 500));
      if (
        String(input).endsWith("/venues") ||
        String(input).endsWith("/consultants")
      )
        return Promise.resolve(envelope([]));
      return Promise.resolve(envelope(lead));
    });
    renderDetail(fetcher);
    fireEvent.click(
      await screen.findByRole("button", { name: "Log activity" }),
    );
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Keep this draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record activity" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Request failed",
    );
    expect(screen.getByLabelText("Note (optional)")).toHaveValue(
      "Keep this draft",
    );
    expect(
      screen.getByRole("button", { name: "Record activity" }),
    ).toBeEnabled();
  });
  test("shows lookup names and business-local dates", async () => {
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/venues"))
        return Promise.resolve(
          envelope([
            { id: "venue-1", name: "Central", active: true },
            { id: "venue-2", name: "South", active: true },
          ]),
        );
      if (url.endsWith("/consultants"))
        return Promise.resolve(
          envelope([{ id: "consultant-1", name: "Dewi", active: true }]),
        );
      return Promise.resolve(envelope(lead));
    });
    renderDetail(fetcher);

    expect(await screen.findByText("Central")).toBeInTheDocument();
    expect(screen.getByText("Dewi")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Next follow-up" })).getByText(
        "25 Oct 2026",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("21 Oct 2026, 16.00 WIB")).toHaveLength(2);
  });

  test("shows persisted profile, all histories, duplicate detail link, edit and list navigation", async () => {
    const fetcher = vi.fn().mockResolvedValue(envelope(lead));
    renderDetail(fetcher);
    expect(
      await screen.findByRole("heading", { name: "Ayu Pratama" }),
    ).toBeInTheDocument();
    expect(screen.getByText("lead/1")).toBeInTheDocument();
    expect(screen.getByText("+628123456789")).toBeInTheDocument();
    expect(screen.getByText("venue-1")).toBeInTheDocument();
    expect(screen.getByText("consultant-1")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Next follow-up" })).getByText(
        "25 Oct 2026",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Discussed goals")).toBeInTheDocument();
    expect(screen.getByText("Attended")).toBeInTheDocument();
    expect(screen.getByText("member-42")).toBeInTheDocument();
    const matches = screen.getByRole("region", {
      name: "Potential duplicates",
    });
    expect(
      within(matches).getByRole("link", { name: "Ayu P." }),
    ).toHaveAttribute("href", "/leads/lead-2");
    expect(within(matches).queryByText("Ayu Pratama")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit lead" })).toHaveAttribute(
      "href",
      "/leads/lead/1/edit",
    );
    expect(screen.getByRole("link", { name: "Back to leads" })).toHaveAttribute(
      "href",
      "/leads",
    );
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/api/v1/leads/lead%2F1",
    );
  });

  test("shows explicit null and empty history states", async () => {
    renderDetail(
      vi.fn().mockResolvedValue(
        envelope({
          ...lead,
          lastContactAt: null,
          nextFollowUpDate: null,
          activities: [],
          trials: [],
          conversion: null,
          duplicateMatches: [],
        }),
      ),
    );
    expect(
      await screen.findByText(/No activities recorded\./),
    ).toBeInTheDocument();
    expect(screen.getByText("No trials recorded.")).toBeInTheDocument();
    expect(screen.getByText("No conversion recorded.")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Potential duplicates" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("No follow-up scheduled")).toBeInTheDocument();
    expect(screen.getAllByText("Not recorded")).toHaveLength(1);
  });

  test("shows pending state and retries a failed request", async () => {
    let resolveRequest!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith("/venues"))
        return Promise.resolve(envelope([]));
      return fetcher.mock.calls.filter(
        ([url]) => !String(url).endsWith("/venues"),
      ).length === 1
        ? pending
        : Promise.resolve(envelope(lead));
    });
    renderDetail(fetcher);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading lead details",
    );
    resolveRequest(envelope({ error: true }, 500));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Request failed",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("heading", { name: "Ayu Pratama" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetcher.mock.calls.filter(([url]) =>
          String(url).endsWith("/leads/lead%2F1"),
        ),
      ).toHaveLength(2),
    );
  });

  test("shows a not-found state for API 404", async () => {
    renderDetail(vi.fn().mockResolvedValue(envelope(null, 404)));
    expect(
      await screen.findByRole("heading", { name: "Lead not found" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to leads" }),
    ).toBeInTheDocument();
  });

  test("shows schema failures as retryable API errors", async () => {
    renderDetail(vi.fn().mockResolvedValue(envelope({ unexpected: true })));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "did not match the expected format",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
