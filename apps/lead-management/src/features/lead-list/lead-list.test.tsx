import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../../router";
import { queryClient } from "../../lib/query-client";

const lead = {
  id: "lead-1",
  fullName: "Ayu Pratama",
  phone: "+628123456789",
  email: "ayu@example.com",
  source: "website",
  venueId: "venue-1",
  consultantId: "consultant-1",
  status: "new",
  createdAt: "2026-10-20T10:00:00Z",
  updatedAt: "2026-10-20T10:00:00Z",
  lastContactAt: null,
  nextFollowUpDate: null,
  isDuplicate: true,
};

function respond(data: unknown, meta?: unknown) {
  return new Response(JSON.stringify(meta ? { data, meta } : { data }), {
    status: 200,
  });
}

function setup(path = "/leads") {
  window.history.replaceState({}, "", path);
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/consultants"))
      return Promise.resolve(
        respond([{ id: "consultant-1", name: "Dewi", active: true }]),
      );
    const page = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
    return Promise.resolve(
      respond([lead], {
        page,
        pageSize,
        total: 21,
        totalPages: Math.ceil(21 / pageSize),
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("server-backed lead discovery", () => {
  test("sends combined filters and page state to the API, shows rows and detail links", async () => {
    const fetchMock = setup(
      "/leads?source=website&consultantId=consultant-1&status=new&page=2&pageSize=10&sortBy=nextFollowUpDate&sortOrder=asc",
    );
    expect(await screen.findByText("Ayu Pratama")).toBeInTheDocument();
    const request = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/v1/leads"),
    );
    const params = new URL(String(request?.[0])).searchParams;
    expect(params.get("source")).toBe("website");
    expect(params.get("consultantId")).toBe("consultant-1");
    expect(params.get("status")).toBe("new");
    expect(params.get("page")).toBe("2");
    expect(params.get("pageSize")).toBe("10");
    expect(params.get("sortBy")).toBe("nextFollowUpDate");
    expect(params.get("sortOrder")).toBe("asc");
    expect(screen.getByRole("link", { name: /Ayu Pratama/ })).toHaveAttribute(
      "href",
      "/leads/lead-1",
    );
    expect(screen.getByText("Potential duplicate")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  test("updates URL for search, sorting and paging; clear removes filters", async () => {
    setup();
    await screen.findByText("Ayu Pratama");
    const search = screen.getByRole("searchbox", { name: /Search name/ });
    fireEvent.change(search, { target: { value: "Ayu Pratama" } });
    await waitFor(
      () =>
        expect(new URLSearchParams(window.location.search).get("search")).toBe(
          "Ayu Pratama",
        ),
      { timeout: 1500 },
    );
    fireEvent.change(search, { target: { value: "+628123456789" } });
    await waitFor(
      () =>
        expect(new URLSearchParams(window.location.search).get("search")).toBe(
          "+628123456789",
        ),
      { timeout: 1500 },
    );
    fireEvent.change(search, { target: { value: "ayu@example.com" } });
    await waitFor(
      () =>
        expect(new URLSearchParams(window.location.search).get("search")).toBe(
          "ayu@example.com",
        ),
      { timeout: 1500 },
    );
    fireEvent.click(screen.getByRole("button", { name: /Next follow-up/ }));
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("sortBy")).toBe(
        "nextFollowUpDate",
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Change sort order to ascending" }),
    );
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("sortOrder")).toBe(
        "asc",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Created date/ }));
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("sortBy")).toBe(
        "createdAt",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(window.location.search).toContain("page=2"));
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("search")).toBe(
        "",
      ),
    );
    window.history.back();
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("page")).toBe("2"),
    );
  });

  test("shows a pending state without rows", async () => {
    const delayed = new Promise<Response>((resolve) =>
      window.setTimeout(
        () =>
          resolve(
            respond([], { page: 1, pageSize: 20, total: 0, totalPages: 0 }),
          ),
        400,
      ),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes("consultants")
          ? Promise.resolve(respond([]))
          : delayed,
      ),
    );
    render(<App />);
    expect(await screen.findByText("Loading leads…")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await new Promise((resolve) => window.setTimeout(resolve, 450));
  });

  test("shows request errors with a retry control", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: "offline", message: "offline" } }),
            { status: 500 },
          ),
        ),
      ),
    );
    render(<App />);
    expect(
      await screen.findByRole("alert", {}, { timeout: 5000 }),
    ).toHaveTextContent("Could not load leads");
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
  });

  test("distinguishes first-run empty from filtered no-results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          respond([], { page: 1, pageSize: 20, total: 0, totalPages: 0 }),
        ),
      ),
    );
    render(<App />);
    expect(await screen.findByText(/No leads yet/)).toBeInTheDocument();
    cleanup();
    queryClient.clear();

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          respond([], { page: 1, pageSize: 20, total: 0, totalPages: 0 }),
        ),
      ),
    );
    window.history.replaceState({}, "", "/leads?status=lost");
    render(<App />);
    expect(
      await screen.findByText("No leads match these filters."),
    ).toBeInTheDocument();
  });
});
