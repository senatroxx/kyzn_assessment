import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ContactPanel } from "./ContactPanel";

const activity = {
  id: "activity-1",
  leadId: "lead-1",
  type: "call",
  occurredAt: "2026-10-24T10:00:00Z",
  note: null,
  nextFollowUpDate: null,
  createdAt: "2026-10-24T10:00:00Z",
};
const ok = () =>
  new Response(JSON.stringify({ data: activity }), { status: 201 });
let client: QueryClient;
function renderPanel(fetcher = vi.fn().mockResolvedValue(ok())) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetcher);
  render(
    <QueryClientProvider client={client}>
      <ContactPanel leadId="lead-1" leadStatus="new" />
    </QueryClientProvider>,
  );
  return fetcher;
}
function fillActivity() {
  fireEvent.change(screen.getByLabelText("Occurred at"), {
    target: { value: "2026-10-24T10:00" },
  });
}
function requestBody(fetcher: ReturnType<typeof vi.fn>) {
  return JSON.parse(String(fetcher.mock.calls.at(-1)?.[1]?.body)) as Record<
    string,
    unknown
  >;
}

afterEach(() => {
  cleanup();
  client?.clear();
  vi.unstubAllGlobals();
});

describe("contact panel", () => {
  test("posts a contact, refreshes lead/list/dashboard data, and reports success", async () => {
    const fetcher = renderPanel();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    fillActivity();
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Discussed goals" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record activity" }));
    expect(
      await screen.findByText("Activity recorded successfully."),
    ).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/leads/lead-1/activities",
      expect.objectContaining({ method: "POST" }),
    );
    expect(requestBody(fetcher)).toMatchObject({
      type: "call",
      occurredAt: new Date("2026-10-24T10:00").toISOString(),
      note: "Discussed goals",
    });
    expect(requestBody(fetcher)).not.toHaveProperty("nextFollowUpDate");
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["leads", "detail", "lead-1"],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["leads", "list"] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["dashboard", "metrics"],
    });
  });

  test("submits a note-only activity", async () => {
    const fetcher = renderPanel();
    fillActivity();
    fireEvent.change(screen.getByLabelText("Activity type"), {
      target: { value: "note" },
    });
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Left a message" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record activity" }));
    expect(
      await screen.findByText("Activity recorded successfully."),
    ).toBeInTheDocument();
    expect(requestBody(fetcher)).toMatchObject({
      type: "note",
      note: "Left a message",
    });
  });

  test("sends a selected follow-up date and explicit clear", async () => {
    const fetcher = renderPanel();
    fillActivity();
    fireEvent.change(screen.getByLabelText("Next follow-up"), {
      target: { value: "set" },
    });
    fireEvent.change(screen.getByLabelText("Follow-up date"), {
      target: { value: "2026-10-26" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record activity" }));
    await screen.findByText("Activity recorded successfully.");
    expect(requestBody(fetcher)).toHaveProperty(
      "nextFollowUpDate",
      "2026-10-26",
    );

    fireEvent.change(screen.getByLabelText("Next follow-up"), {
      target: { value: "clear" },
    });
    fillActivity();
    fireEvent.click(screen.getByRole("button", { name: "Record activity" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(requestBody(fetcher)).toHaveProperty("nextFollowUpDate", null);
  });

  test("requires a follow-up date when the set-date option is selected", async () => {
    const fetcher = renderPanel();
    fillActivity();
    fireEvent.change(screen.getByLabelText("Next follow-up"), {
      target: { value: "set" },
    });
    fireEvent.change(screen.getByLabelText("Follow-up date"), {
      target: { value: "2026-02-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record activity" }));
    expect(
      await screen.findByText("Choose a follow-up date."),
    ).toBeInTheDocument();
    const date = document.getElementById("next-follow-up-date");
    expect(date).not.toBeNull();
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(date).toHaveAttribute(
      "aria-describedby",
      "next-follow-up-date-error",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("shows pending state and keeps entered values when the API rejects the request", async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn().mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    renderPanel(fetcher);
    fillActivity();
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Keep this note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record activity" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Recording activity",
    );
    resolve(
      new Response(
        JSON.stringify({
          error: { code: "invalid", message: "Activity is not allowed" },
        }),
        { status: 409 },
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Activity is not allowed",
    );
    expect(screen.getByLabelText("Note (optional)")).toHaveValue(
      "Keep this note",
    );
    expect(screen.getByLabelText("Activity type")).toHaveValue("call");
  });

  test("associates required-field feedback and supports keyboard submission", async () => {
    const fetcher = renderPanel();
    fireEvent.change(screen.getByLabelText("Occurred at"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record activity" }));
    const occurredAt = screen.getByLabelText("Occurred at");
    expect(
      await screen.findByText("Enter when this activity occurred."),
    ).toBeInTheDocument();
    expect(occurredAt).toHaveAttribute("aria-invalid", "true");
    expect(occurredAt).toHaveAttribute(
      "aria-describedby",
      "activity-occurred-at-error",
    );
    expect(fetcher).not.toHaveBeenCalled();

    fireEvent.change(occurredAt, { target: { value: "2026-10-24T10:00" } });
    fireEvent.submit(occurredAt.closest("form")!);
    expect(
      await screen.findByText("Activity recorded successfully."),
    ).toBeInTheDocument();
  });
});
