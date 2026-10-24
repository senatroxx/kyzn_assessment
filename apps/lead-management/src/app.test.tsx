import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "./router";
import { queryClient } from "./lib/query-client";

const leadDetail = {
  id: "lead-123",
  fullName: "Taylor Example",
  phone: "+1 (415) 555-0132",
  email: "taylor@example.test",
  source: "website",
  venueId: "venue-1",
  consultantId: "consultant-1",
  status: "contacted",
  createdAt: "2026-10-24T09:00:00.000Z",
  updatedAt: "2026-10-24T09:30:00.000Z",
  lastContactAt: null,
  nextFollowUpDate: null,
  activities: [],
  trials: [],
  conversion: null,
  duplicateMatches: [],
};

function stubApi() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/venues")) {
      return Response.json({
        data: [{ id: "venue-1", name: "Central", active: true }],
      });
    }
    if (url.pathname.endsWith("/consultants")) {
      return Response.json({
        data: [{ id: "consultant-1", name: "Ari", active: true }],
      });
    }
    if (url.pathname.endsWith("/leads/lead-123")) {
      return Response.json({ data: leadDetail });
    }
    if (url.pathname.endsWith("/leads")) {
      return Response.json({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      });
    }
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
}

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("lead management app routes", () => {
  test("loads the lead list and exposes app navigation", async () => {
    stubApi();
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Leads" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/No leads yet/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Skip to content" }),
    ).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "http://localhost:3000",
    );
    expect(screen.getByRole("link", { name: "New lead" })).toHaveAttribute(
      "href",
      "/leads/new",
    );
  });

  test("opens the new lead form from shell navigation", async () => {
    stubApi();
    render(<App />);
    await screen.findByRole("heading", { name: "Leads" });
    fireEvent.click(screen.getByRole("link", { name: "New lead" }));
    expect(
      await screen.findByRole("heading", { name: "New lead" }),
    ).toBeInTheDocument();
  });

  test("loads a direct edit URL and provides unknown-route recovery", async () => {
    stubApi();
    window.history.replaceState({}, "", "/leads/lead-123/edit");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Edit lead" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue(
      "Taylor Example",
    );

    cleanup();
    queryClient.clear();
    window.history.replaceState({}, "", "/missing-page");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Return to leads" }),
    ).toHaveAttribute("href", "/leads");
  });
});
