import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadStatus, Trial, Venue } from "@kyzn/shared";
import {
  trialResponseSchema,
  trialUpdateSchema,
  venuesResponseSchema,
} from "@kyzn/shared";
import { useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api";
import { leadQueryKeys } from "../../lib/query-keys";

const dateTime = (value: string) => new Date(value).toLocaleString();
const toLocalInput = (value: string) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

export function TrialPanel({
  leadId,
  leadStatus,
  trials,
}: {
  leadId: string;
  leadStatus: LeadStatus;
  trials: Trial[];
}) {
  const client = useQueryClient();
  const venues = useQuery({
    queryKey: [...leadQueryKeys.lookups(), "venues"],
    queryFn: () => apiRequest("/v1/venues", venuesResponseSchema),
  });
  const [venueId, setVenueId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const canSchedule = ["new", "contacted", "trial_scheduled"].includes(
    leadStatus,
  );
  const mutation = useMutation({
    mutationFn: ({ trialId, body }: { trialId?: string; body: unknown }) =>
      apiRequest(
        `/v1/leads/${encodeURIComponent(leadId)}/trials${trialId ? `/${encodeURIComponent(trialId)}` : ""}`,
        trialResponseSchema,
        {
          method: trialId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    onSuccess: async () => {
      setError("");
      setSuccess("Trial updated successfully.");
      setEditing(null);
      setScheduledAt("");
      await Promise.all([
        client.invalidateQueries({ queryKey: leadQueryKeys.detail(leadId) }),
        client.invalidateQueries({ queryKey: leadQueryKeys.lists() }),
        client.invalidateQueries({ queryKey: ["dashboard", "metrics"] }),
      ]);
    },
    onError: (cause: Error) => setError(cause.message),
  });
  const venueNames = new Map(
    (venues.data?.data ?? []).map((venue: Venue) => [venue.id, venue.name]),
  );

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scheduledAt || (!editing && !venueId)) return;
    setSuccess("");
    mutation.mutate({
      trialId: editing ?? undefined,
      body: editing
        ? {
            scheduledAt: new Date(scheduledAt).toISOString(),
            ...(venueId ? { venueId } : {}),
          }
        : { venueId, scheduledAt: new Date(scheduledAt).toISOString() },
    });
  }

  function outcome(
    trialId: string,
    status: "completed" | "cancelled" | "no_show",
  ) {
    const verb =
      status === "no_show"
        ? "mark this trial as no-show"
        : status === "cancelled"
          ? "cancel this trial"
          : "record attendance for this trial";
    if (
      (status === "cancelled" || status === "no_show") &&
      !window.confirm(`Are you sure you want to ${verb}?`)
    )
      return;
    setSuccess("");
    mutation.mutate({ trialId, body: trialUpdateSchema.parse({ status }) });
  }

  return (
    <section aria-labelledby="trial-heading" className="mt-8">
      <h3 id="trial-heading" className="font-semibold">
        Trials
      </h3>
      {venues.isPending && (
        <p role="status" className="mt-2">
          Loading venues…
        </p>
      )}
      {venues.isError && (
        <p role="alert" className="mt-2">
          Could not load venues. Retry by reloading this page.
        </p>
      )}
      {mutation.isPending && (
        <p role="status" className="mt-2">
          Saving trial…
        </p>
      )}
      {success && (
        <p role="status" className="mt-2">
          {success}
        </p>
      )}
      {trials.length === 0 ? (
        <p className="mt-2">No trials recorded.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {trials.map((trial) => {
            const scheduledAction =
              trial.status === "scheduled" &&
              !["lost", "invalid"].includes(leadStatus);
            return (
              <li key={trial.id} className="border border-[#d5d9d1] p-3">
                <p className="font-medium">
                  {trial.status.replaceAll("_", " ")} ·{" "}
                  <time dateTime={trial.scheduledAt}>
                    {dateTime(trial.scheduledAt)}
                  </time>
                </p>
                <p className="mt-1 text-sm">
                  Venue: {venueNames.get(trial.venueId) ?? trial.venueId}
                </p>
                {trial.completedAt && (
                  <p className="mt-1 text-sm">
                    Completed:{" "}
                    <time dateTime={trial.completedAt}>
                      {dateTime(trial.completedAt)}
                    </time>
                  </p>
                )}
                {trial.notes && <p className="mt-1">{trial.notes}</p>}
                {scheduledAction && (
                  <div className="mt-3 flex flex-wrap gap-4">
                    {leadStatus !== "converted" && (
                      <button
                        className="underline focus-visible:outline-2"
                        type="button"
                        disabled={mutation.isPending}
                        onClick={() => {
                          setEditing(trial.id);
                          setScheduledAt(toLocalInput(trial.scheduledAt));
                          setVenueId(trial.venueId);
                        }}
                      >
                        Reschedule
                      </button>
                    )}
                    <button
                      className="underline focus-visible:outline-2"
                      type="button"
                      disabled={mutation.isPending}
                      onClick={() => outcome(trial.id, "completed")}
                    >
                      Record attendance
                    </button>
                    <button
                      className="underline focus-visible:outline-2"
                      type="button"
                      disabled={mutation.isPending}
                      onClick={() => outcome(trial.id, "cancelled")}
                    >
                      Cancel trial
                    </button>
                    <button
                      className="underline focus-visible:outline-2"
                      type="button"
                      disabled={mutation.isPending}
                      onClick={() => outcome(trial.id, "no_show")}
                    >
                      Mark no-show
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {canSchedule && !venues.isError && (
        <form className="mt-4 grid max-w-xl gap-3" onSubmit={save}>
          <h4 className="font-medium">
            {editing ? "Reschedule trial" : "Schedule a trial"}
          </h4>
          <label className="grid gap-1">
            Venue
            <select
              required
              value={venueId}
              onChange={(event) => setVenueId(event.target.value)}
              className="border border-[#858b81] p-2 focus-visible:outline-2"
              disabled={venues.isPending || mutation.isPending}
            >
              <option value="">Choose a venue</option>
              {(venues.data?.data ?? []).map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            Scheduled time
            <input
              required
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className="border border-[#858b81] p-2 focus-visible:outline-2"
              disabled={mutation.isPending}
            />
          </label>
          <div className="flex gap-4">
            <button
              className="border border-[#31634c] px-3 py-2 focus-visible:outline-2"
              type="submit"
              disabled={
                mutation.isPending || venues.isPending || venues.isError
              }
            >
              {mutation.isPending
                ? "Saving…"
                : editing
                  ? "Save schedule"
                  : "Schedule trial"}
            </button>
            {editing && (
              <button
                className="underline focus-visible:outline-2"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setScheduledAt("");
                }}
              >
                Stop rescheduling
              </button>
            )}
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3">
          {error}. Your entries are still here.
        </p>
      )}
    </section>
  );
}
