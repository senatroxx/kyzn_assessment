import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { queryClient } from "../../lib/query-client";
import { App } from "../../router";

const venue = { id: "venue-1", name: "Central", active: true };
const consultant = { id: "consultant-1", name: "Ayu", active: true };
const lead = {
  id: "lead-1",
  fullName: "Rani Putri",
  phone: "+6281234567890",
  email: "rani@example.com",
  source: "website",
  venueId: "venue-1",
  consultantId: "consultant-1",
  status: "new",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  lastContactAt: null,
  nextFollowUpDate: null,
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  queryClient.clear();
  window.history.replaceState({}, "", "/leads/new");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("lead forms", () => {
  test("shows shared schema feedback and blocks an invalid submission", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string) =>
        url.endsWith("/venues")
          ? json({ data: [venue] })
          : json({ data: [consultant] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByRole("combobox", { name: "Interested venue" });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Rani Putri" },
    });
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "invalid" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "rani@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Interested venue"), {
      target: { value: venue.id },
    });
    fireEvent.change(screen.getByLabelText("Assigned consultant"), {
      target: { value: consultant.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create lead" }));
    expect(
      await screen.findByText("Expected a supported phone number"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("warns for a duplicate and still creates successfully", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith("/venues")) return json({ data: [venue] });
        if (url.endsWith("/consultants")) return json({ data: [consultant] });
        if (url.includes("/duplicates?"))
          return json({
            data: [
              {
                id: "other",
                fullName: "Rani Existing",
                phone: lead.phone,
                email: lead.email,
                matchedFields: ["phone", "email"],
              },
            ],
          });
        if (url.endsWith("/leads") && init?.method === "POST")
          return json({ data: lead });
        if (url.endsWith("/leads/lead-1"))
          return json({
            data: {
              ...lead,
              activities: [],
              trials: [],
              conversion: null,
              duplicateMatches: [],
            },
          });
        return json({ data: [] });
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await screen.findByRole("combobox", { name: "Interested venue" });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Rani Putri" },
    });
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: lead.phone },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: lead.email },
    });
    fireEvent.change(screen.getByLabelText("Interested venue"), {
      target: { value: venue.id },
    });
    fireEvent.change(screen.getByLabelText("Assigned consultant"), {
      target: { value: consultant.id },
    });
    expect(
      await screen.findByText(/Possible duplicate leads/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create lead" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/leads"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(
      await screen.findByRole("heading", { name: "Rani Putri" }),
    ).toBeInTheDocument();
  });

  test("keeps entered values after server validation rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith("/venues")) return json({ data: [venue] });
        if (url.endsWith("/consultants")) return json({ data: [consultant] });
        if (url.includes("/duplicates?")) return json({ data: [] });
        if (init?.method === "POST")
          return json(
            {
              error: {
                code: "VALIDATION_ERROR",
                message: "Phone already invalid on server",
              },
            },
            422,
          );
        return json({ data: [] });
      }),
    );
    render(<App />);
    await screen.findByRole("combobox", { name: "Interested venue" });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Rani Putri" },
    });
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "+6281234567890" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "rani@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Interested venue"), {
      target: { value: venue.id },
    });
    fireEvent.change(screen.getByLabelText("Assigned consultant"), {
      target: { value: consultant.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create lead" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Phone already invalid on server",
    );
    expect(screen.getByLabelText("Full name")).toHaveValue("Rani Putri");
  });

  test("edit excludes itself from duplicate checks and patches only editable fields", async () => {
    window.history.replaceState({}, "", "/leads/lead-1/edit");
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith("/venues")) return json({ data: [venue] });
        if (url.endsWith("/consultants")) return json({ data: [consultant] });
        if (url.includes("/duplicates?")) return json({ data: [] });
        if (url.endsWith("/leads/lead-1") && init?.method === "PATCH") {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          expect(body).not.toHaveProperty("id");
          expect(body).not.toHaveProperty("status");
          expect(body).not.toHaveProperty("createdAt");
          return json({ data: { ...lead, fullName: body.fullName } });
        }
        if (url.endsWith("/leads/lead-1"))
          return json({
            data: {
              ...lead,
              activities: [],
              trials: [],
              conversion: null,
              duplicateMatches: [],
            },
          });
        return json({ data: [] });
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    const name = await screen.findByLabelText("Full name");
    await screen.findByLabelText("Assigned consultant");
    fireEvent.change(name, { target: { value: "Rani Updated" } });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes("excludeId=lead-1"),
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/leads/lead-1") && init?.method === "PATCH",
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByRole("heading", { name: "Rani Putri" }),
    ).toBeInTheDocument();
  });

  test("shows lookup failures and keeps the form unavailable until references load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) =>
        url.endsWith("/venues")
          ? json(
              {
                error: {
                  code: "ERROR",
                  message: "Venue service unavailable",
                },
              },
              503,
            )
          : json({ data: [consultant] }),
      ),
    );
    render(<App />);
    expect(
      await screen.findByText(
        "Could not load venues or consultants. Please retry the page.",
        {},
        { timeout: 10_000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load venues or consultants",
    );
    expect(screen.getByRole("button", { name: "Create lead" })).toBeDisabled();
  });
});
