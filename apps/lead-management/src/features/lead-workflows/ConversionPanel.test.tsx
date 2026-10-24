import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Conversion } from "@kyzn/shared";
import { ConversionPanel } from "./ConversionPanel";

const conversion: Conversion = {
  id: "conversion-1",
  leadId: "lead-1",
  convertedAt: "2026-10-24T10:00:00Z",
  note: "Paid in person",
  membershipReference: "member-42",
};
const response = (data: unknown, status = 201) =>
  new Response(
    JSON.stringify(
      status >= 200 && status < 300
        ? { data }
        : {
            error: {
              code: "conflict",
              message:
                status === 409
                  ? "Lead already converted"
                  : "Server unavailable",
            },
          },
    ),
    { status },
  );
let client: QueryClient;

function renderPanel(
  leadStatus:
    | "new"
    | "contacted"
    | "trial_scheduled"
    | "trial_completed"
    | "converted"
    | "lost"
    | "invalid",
  saved: Conversion | null = null,
) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  render(
    <QueryClientProvider client={client}>
      <ConversionPanel
        leadId="lead-1"
        leadStatus={leadStatus}
        conversion={saved}
      />
    </QueryClientProvider>,
  );
  return { invalidate };
}

afterEach(() => {
  cleanup();
  client?.clear();
  vi.unstubAllGlobals();
});

describe("paid membership conversion", () => {
  test.each(["new", "lost", "invalid", "converted"] as const)(
    "does not offer conversion for %s status",
    (status) => {
      renderPanel(status);
      expect(
        screen.getByText("Conversion is unavailable for this lead status."),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Record paid membership" }),
      ).not.toBeInTheDocument();
    },
  );

  test("cancel closes confirmation without posting", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    renderPanel("contacted");
    fireEvent.click(
      screen.getByRole("button", { name: "Record paid membership" }),
    );
    expect(screen.getByText(/manual business record/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("button", { name: "Confirm conversion" }),
    ).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("confirms without a trial, disables repeat submit, shows response and invalidates affected queries", async () => {
    let resolvePost!: (value: Response) => void;
    const fetcher = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolvePost = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const { invalidate } = renderPanel("trial_scheduled");
    fireEvent.click(
      screen.getByRole("button", { name: "Record paid membership" }),
    );
    const note = screen.getByLabelText("Note (optional)");
    expect(note).toHaveFocus();
    fireEvent.change(note, { target: { value: "Paid in person" } });
    fireEvent.change(screen.getByLabelText("Membership reference (optional)"), {
      target: { value: "member-42" },
    });
    const confirm = screen.getByRole("button", { name: "Confirm conversion" });
    fireEvent.click(confirm);
    expect(
      await screen.findByRole("button", { name: "Recording…" }),
    ).toBeDisabled();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/api/v1/leads/lead-1/conversion",
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      note: "Paid in person",
      membershipReference: "member-42",
    });
    resolvePost(response(conversion));
    expect(await screen.findByText("member-42")).toBeInTheDocument();
    expect(screen.getByText("Paid in person")).toBeInTheDocument();
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["leads", "detail", "lead-1"],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["leads", "list"] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["dashboard", "metrics"],
    });
  });

  test.each([409, 500])(
    "preserves optional values after HTTP %i",
    async (status) => {
      const fetcher = vi.fn().mockResolvedValue(response(null, status));
      vi.stubGlobal("fetch", fetcher);
      renderPanel("contacted");
      fireEvent.click(
        screen.getByRole("button", { name: "Record paid membership" }),
      );
      fireEvent.change(screen.getByLabelText("Note (optional)"), {
        target: { value: "Keep this" },
      });
      fireEvent.change(
        screen.getByLabelText("Membership reference (optional)"),
        { target: { value: "ref-99" } },
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Confirm conversion" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        status === 409 ? "Lead already converted" : "Server unavailable",
      );
      expect(screen.getByLabelText("Note (optional)")).toHaveValue("Keep this");
      expect(
        screen.getByLabelText("Membership reference (optional)"),
      ).toHaveValue("ref-99");
      expect(
        screen.getByRole("button", { name: "Confirm conversion" }),
      ).toBeEnabled();
    },
  );

  test("shows persisted conversion and never offers another action", () => {
    renderPanel("converted", conversion);
    expect(screen.getByText("member-42")).toBeInTheDocument();
    expect(screen.getByText("Paid in person")).toBeInTheDocument();
    expect(screen.getByRole("time")).toHaveAttribute(
      "dateTime",
      conversion.convertedAt,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
