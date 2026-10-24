import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LeadStatus, Trial } from "@kyzn/shared";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TrialPanel } from "./TrialPanel";

const venue = { id: "venue-1", name: "Central", active: true };
const trial: Trial = {
  id: "trial-1",
  leadId: "lead-1",
  venueId: venue.id,
  scheduledAt: "2026-10-26T03:00:00.000Z",
  status: "scheduled",
  completedAt: null,
  notes: null,
  createdAt: "2026-10-20T03:00:00.000Z",
  updatedAt: "2026-10-20T03:00:00.000Z",
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function setup(
  leadStatus: LeadStatus = "new",
  trials: Trial[] = [],
  fetcher?: ReturnType<typeof vi.fn>,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const fetchMock =
    fetcher ??
    vi
      .fn()
      .mockImplementation((url: string) =>
        url.endsWith("/venues")
          ? response({ data: [venue] })
          : response({ data: trial }),
      );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={client}>
      <TrialPanel leadId="lead-1" leadStatus={leadStatus} trials={trials} />
    </QueryClientProvider>,
  );
  return { fetchMock, invalidate };
}

async function chooseVenue() {
  const trigger = screen.getByRole("combobox", { name: "Venue" });
  await waitFor(() => expect(trigger).toBeEnabled());
  trigger.focus();
  expect(trigger).toHaveFocus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  const options = await screen.findAllByRole("option");
  const targetIndex = options.findIndex(
    (option) => option.textContent?.trim() === "Central",
  );
  if (targetIndex < 0) throw new Error("Missing venue option: Central");
  await waitFor(() =>
    expect(options).toContain(document.activeElement as HTMLElement),
  );
  let currentIndex = options.findIndex(
    (option) => option === document.activeElement,
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TrialPanel", () => {
  test("looks up venues and schedules a human-entered appointment as UTC", async () => {
    const { fetchMock, invalidate } = setup();
    await chooseVenue();
    fireEvent.change(screen.getByLabelText("Scheduled time"), {
      target: { value: "2026-10-26T10:00" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Schedule trial" })
        .closest("form") as HTMLFormElement,
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/leads/lead-1/trials"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("2026-10-26T03:00:00.000Z"),
        }),
      ),
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["dashboard", "metrics"] }),
    );
  });

  test("reschedules and offers terminal outcomes only on scheduled trials", async () => {
    const { fetchMock } = setup("contacted", [trial]);
    fireEvent.click(await screen.findByRole("button", { name: "Reschedule" }));
    fireEvent.change(screen.getByLabelText("Scheduled time"), {
      target: { value: "2026-10-27T10:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/trials/trial-1"),
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("2026-10-27T03:00:00.000Z"),
        }),
      ),
    );
    expect(
      screen.getByRole("button", { name: "Record attendance" }),
    ).toBeEnabled();
  });

  test("confirms cancellation and preserves converted history actions without reschedule", async () => {
    const { fetchMock } = setup("converted", [trial]);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancel trial" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Reschedule" }),
    ).not.toBeInTheDocument();
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Mark no-show" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/trials/trial-1"),
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("no_show"),
        }),
      ),
    );
  });

  test("does not offer schedule actions to lost leads and shows API errors", async () => {
    const { fetchMock } = setup("lost");
    await screen.findByText("No trials recorded.");
    expect(
      screen.queryByRole("button", { name: "Schedule trial" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("shows venue lookup failures", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response(
          { error: { code: "unavailable", message: "Venue lookup failed" } },
          503,
        ),
      );
    setup("new", [], fetcher);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load venues",
    );
    expect(
      screen.queryByRole("button", { name: "Schedule trial" }),
    ).not.toBeInTheDocument();
  });

  test("keeps entered schedule values after an API conflict", async () => {
    const fetcher = vi.fn().mockImplementation((url: string) =>
      url.endsWith("/venues")
        ? response({ data: [venue] })
        : response(
            {
              error: {
                code: "conflict",
                message: "Trial cannot be scheduled",
              },
            },
            409,
          ),
    );
    setup("new", [], fetcher);
    await chooseVenue();
    fireEvent.change(screen.getByLabelText("Scheduled time"), {
      target: { value: "2026-10-26T10:00" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Schedule trial" })
        .closest("form") as HTMLFormElement,
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Trial cannot be scheduled",
    );
    expect(screen.getByRole("combobox", { name: "Venue" })).toHaveTextContent(
      "Central",
    );
    expect(screen.getByLabelText("Scheduled time")).toHaveValue(
      "2026-10-26T10:00",
    );
  });

  test("records attendance and hides actions from terminal trial records", async () => {
    const completed: Trial = {
      ...trial,
      id: "trial-completed",
      status: "completed",
      completedAt: "2026-10-26T04:00:00.000Z",
    };
    const cancelled: Trial = { ...trial, id: "trial-2", status: "cancelled" };
    const { fetchMock } = setup("trial_scheduled", [
      trial,
      completed,
      cancelled,
    ]);
    expect(
      await screen.findByText("completed", { exact: true }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Record attendance" }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Record attendance" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/trials/trial-1"),
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining("completed"),
        }),
      ),
    );
  });
});
