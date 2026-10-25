import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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

function setup(path = "/leads", overrides: Partial<typeof lead> = {}) {
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
      respond([{ ...lead, ...overrides }], {
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

async function chooseOption(label: string, option: string) {
  const trigger = screen.getByRole("combobox", { name: label });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const options = await screen.findAllByRole("option");
  const targetIndex = options.findIndex(
    (item) => item.textContent?.trim() === option,
  );
  if (targetIndex < 0) throw new Error(`Missing option: ${option}`);
  await waitFor(() =>
    expect(options).toContain(document.activeElement as HTMLElement),
  );
  let currentIndex = options.findIndex(
    (item) => item === document.activeElement,
  );
  if (targetIndex < currentIndex) {
    fireEvent.keyDown(document.activeElement ?? trigger, { key: "Home" });
    await waitFor(() => expect(options[0]).toHaveFocus());
    currentIndex = 0;
  }
  while (currentIndex < targetIndex) {
    fireEvent.keyDown(document.activeElement ?? trigger, { key: "ArrowDown" });
    currentIndex += 1;
    await waitFor(() => expect(options[currentIndex]).toHaveFocus());
  }
  fireEvent.keyDown(document.activeElement ?? trigger, { key: "Enter" });
}

function pressEnter(button: HTMLElement) {
  button.focus();
  fireEvent.keyDown(button, { key: "Enter" });
  // JSDOM does not synthesize the browser's native Enter activation.
  button.click();
}

function findSortControl(label: string) {
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>("th button[aria-label]"),
  ).find((candidate) => candidate.getAttribute("aria-label") === label);
  const header = button?.closest("th");
  if (!button || !header) throw new Error(`Missing sort control: ${label}`);
  return { button, header };
}

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("server-backed lead discovery", () => {
  test("separates name navigation from independently actionable contact links", async () => {
    const phone = "+62 (812) 3456-789";
    setup("/leads", { phone });
    const name = await screen.findByRole("link", { name: lead.fullName });
    const phoneLink = screen.getByRole("link", { name: phone });
    const emailLink = screen.getByRole("link", { name: lead.email });
    expect(
      screen.getByRole("columnheader", { name: "Name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Contact" }),
    ).toBeInTheDocument();
    expect(name).toHaveAttribute("href", "/leads/lead-1");
    expect(name).toHaveTextContent(/^Ayu Pratama$/);
    expect(phoneLink).toHaveAttribute("href", "tel:+628123456789");
    expect(emailLink).toHaveAttribute("href", "mailto:ayu@example.com");
    const nameCell = name.closest("td");
    const contactCell = phoneLink.closest("td");
    if (!nameCell || !contactCell) throw new Error("Missing lead cells");
    expect(nameCell).not.toBe(contactCell);
    expect(within(nameCell).queryByText(phone)).not.toBeInTheDocument();
    expect(within(contactCell).getAllByRole("link")).toHaveLength(2);
    expect(contactCell.querySelector('a[href^="/leads/"]')).toBeNull();
    expect(within(nameCell).getByText("Name")).toBeInTheDocument();
    expect(within(contactCell).getByText("Contact")).toBeInTheDocument();
    phoneLink.focus();
    expect(phoneLink).toHaveFocus();
    emailLink.focus();
    expect(emailLink).toHaveFocus();
  });

  test("keeps long contact values accessible in the link name and title", async () => {
    const email = "a".repeat(50) + "@long-domain.example.test";
    setup("/leads", { email });
    const link = await screen.findByRole("link", { name: email });
    expect(link).toHaveAttribute("href", `mailto:${email}`);
    expect(link).toHaveAttribute("title", email);
    expect(link).toHaveTextContent(email);
  });

  test.each(["phone", "email"] as const)(
    "rejects a response missing required %s instead of creating an invalid contact action",
    async (field) => {
      setup("/leads", { [field]: undefined });
      expect(
        await screen.findByRole("alert", {}, { timeout: 5000 }),
      ).toHaveTextContent("Could not load leads");
      expect(
        document.querySelector('a[href^="tel:"], a[href^="mailto:"]'),
      ).toBeNull();
    },
  );

  test("sends combined filters and page state to the API, shows rows and detail links", async () => {
    const fetchMock = setup(
      "/leads?source=website&consultantId=consultant-1&status=new&page=2&pageSize=10&sortBy=nextFollowUpDate&sortOrder=asc",
    );
    expect(
      await screen.findByText("Ayu Pratama", {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
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
    expect(screen.getByText("New")).toHaveClass("bg-sky-50");
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(document.querySelectorAll("th")).toHaveLength(8);
    expect(document.querySelectorAll("th button[aria-label]")).toHaveLength(2);
    expect(
      findSortControl(
        "Next follow-up sorted ascending; activate to sort descending",
      ).header,
    ).toHaveAttribute("aria-sort", "ascending");
    expect(
      findSortControl("Sort by Created date ascending").header,
    ).not.toHaveAttribute("aria-sort");
    expect(
      document
        .querySelector('[role="group"][aria-label="Sort leads"]')
        ?.querySelectorAll("button"),
    ).toHaveLength(2);
    const sourceFilter = screen.getByRole("combobox", { name: "Source" });
    expect(sourceFilter).toHaveTextContent("Website");
    sourceFilter.focus();
    fireEvent.keyDown(sourceFilter, { key: "ArrowDown" });
    expect(
      await screen.findByRole("option", { name: "Website" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Website", { selector: "td" })).toBeInTheDocument();
  }, 15_000);

  test("updates URL for search, sorting and paging; clear removes filters", async () => {
    setup();
    await screen.findByText("Ayu Pratama", {}, { timeout: 10_000 });
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
    await chooseOption("Status", "lost");
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("status")).toBe(
        "lost",
      ),
    );
    await chooseOption("Status", "All statuses");
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("status")).toBe(
        null,
      ),
    );
    expect(
      findSortControl(
        "Created date sorted descending; activate to sort ascending",
      ).header,
    ).toHaveAttribute("aria-sort", "descending");
    expect(
      findSortControl("Sort by Next follow-up descending").header,
    ).not.toHaveAttribute("aria-sort");
    fireEvent.click(
      findSortControl("Sort by Next follow-up descending").button,
    );
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("sortBy")).toBe(
        "nextFollowUpDate",
      ),
    );
    expect(new URLSearchParams(window.location.search).get("sortOrder")).toBe(
      "desc",
    );
    await waitFor(() =>
      expect(
        findSortControl(
          "Next follow-up sorted descending; activate to sort ascending",
        ).header,
      ).toHaveAttribute("aria-sort", "descending"),
    );
    pressEnter(
      findSortControl(
        "Next follow-up sorted descending; activate to sort ascending",
      ).button,
    );
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("sortOrder")).toBe(
        "asc",
      ),
    );
    await waitFor(() =>
      expect(
        findSortControl(
          "Next follow-up sorted ascending; activate to sort descending",
        ).header,
      ).toHaveAttribute("aria-sort", "ascending"),
    );
    fireEvent.click(findSortControl("Sort by Created date ascending").button);
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("sortBy")).toBe(
        "createdAt",
      ),
    );
    expect(new URLSearchParams(window.location.search).get("sortOrder")).toBe(
      "asc",
    );
    await waitFor(() =>
      expect(
        findSortControl(
          "Created date sorted ascending; activate to sort descending",
        ).header,
      ).toHaveAttribute("aria-sort", "ascending"),
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
  }, 20_000);

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
