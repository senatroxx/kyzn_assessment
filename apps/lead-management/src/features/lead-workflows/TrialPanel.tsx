import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadStatus, Trial, Venue } from "@kyzn/shared";
import { Alert, AlertDescription } from "@kyzn/ui/components/alert";
import { Badge } from "@kyzn/ui/components/badge";
import { Button } from "@kyzn/ui/components/button";
import { Input } from "@kyzn/ui/components/input";
import { Label } from "@kyzn/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kyzn/ui/components/select";
import { Skeleton } from "@kyzn/ui/components/skeleton";
import {
  trialResponseSchema,
  trialUpdateSchema,
  venuesResponseSchema,
} from "@kyzn/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api";
import { formatBusinessDateTime } from "../../lib/dates";
import { leadQueryKeys } from "../../lib/query-keys";

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
  const [formOpen, setFormOpen] = useState(false);
  const scheduleTrigger = useRef<HTMLButtonElement>(null);
  const scheduledInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (formOpen) scheduledInput.current?.focus();
  }, [formOpen, editing]);
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
      setFormOpen(false);
      scheduleTrigger.current?.focus();
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
  useEffect(() => {
    if (success && !formOpen && !mutation.isPending)
      scheduleTrigger.current?.focus();
  }, [success, formOpen, mutation.isPending]);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    if (
      (!editing && !venueId) ||
      !scheduledAt ||
      !Number.isFinite(Date.parse(scheduledAt))
    ) {
      setError("Choose a venue and a valid scheduled time.");
      return;
    }
    setSuccess("");
    setError("");
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
    if (mutation.isPending) return;
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
    <section aria-labelledby="trial-heading">
      <h2 id="trial-heading" className="font-semibold">
        Trial session
      </h2>
      {venues.isPending && (
        <div role="status" className="mt-2 space-y-2">
          <span className="sr-only">Loading venues…</span>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full max-w-xl" />
        </div>
      )}
      {venues.isError && (
        <Alert role="alert" variant="destructive" className="mt-2">
          <AlertDescription>
            Could not load venues. Retry by reloading this page.
          </AlertDescription>
        </Alert>
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
        <ol className="mt-3 divide-y divide-border">
          {[...trials]
            .sort(
              (a, b) =>
                Number(b.status === "scheduled") -
                  Number(a.status === "scheduled") ||
                Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt),
            )
            .map((trial) => {
              const scheduledAction =
                trial.status === "scheduled" &&
                !["lost", "invalid"].includes(leadStatus);
              return (
                <li key={trial.id}>
                  <div className="py-3 text-sm break-words">
                    <p className="font-medium">
                      <Badge variant="outline">
                        {trial.status.replaceAll("_", " ")}
                      </Badge>{" "}
                      ·{" "}
                      <time dateTime={trial.scheduledAt}>
                        {formatBusinessDateTime(trial.scheduledAt)}
                      </time>
                    </p>
                    <p className="mt-1 text-sm">
                      Venue: {venueNames.get(trial.venueId) ?? trial.venueId}
                    </p>
                    {trial.completedAt && (
                      <p className="mt-1 text-sm">
                        Completed:{" "}
                        <time dateTime={trial.completedAt}>
                          {formatBusinessDateTime(trial.completedAt)}
                        </time>
                      </p>
                    )}
                    {trial.notes && <p className="mt-1">{trial.notes}</p>}
                    {scheduledAction && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {leadStatus !== "converted" && (
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            disabled={mutation.isPending}
                            onClick={() => {
                              setEditing(trial.id);
                              setScheduledAt(toLocalInput(trial.scheduledAt));
                              setVenueId(trial.venueId);
                              setFormOpen(true);
                            }}
                          >
                            Reschedule
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={mutation.isPending}
                          onClick={() => outcome(trial.id, "completed")}
                        >
                          Record attendance
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          disabled={mutation.isPending}
                          onClick={() => outcome(trial.id, "cancelled")}
                        >
                          Cancel trial
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          disabled={mutation.isPending}
                          onClick={() => outcome(trial.id, "no_show")}
                        >
                          Mark no-show
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
        </ol>
      )}
      {canSchedule && !venues.isError && (
        <Button
          ref={scheduleTrigger}
          type="button"
          variant="outline"
          className="mt-3"
          disabled={mutation.isPending}
          aria-expanded={formOpen}
          aria-controls="trial-schedule-form"
          onClick={() => {
            setError("");
            setSuccess("");
            if (formOpen) setFormOpen(false);
            else {
              setEditing(null);
              setFormOpen(true);
            }
          }}
        >
          {formOpen ? "Close scheduling" : "Schedule trial"}
        </Button>
      )}
      {canSchedule && !venues.isError && formOpen && (
        <form
          id="trial-schedule-form"
          className="mt-4 grid max-w-xl gap-3"
          onSubmit={save}
          aria-labelledby="trial-form-heading"
        >
          <h3 id="trial-form-heading" className="font-medium">
            {editing ? "Reschedule trial" : "Schedule a trial"}
          </h3>
          <p className="text-sm text-muted-foreground">
            Choose the venue and appointment time. Times entered here use your
            device timezone.
          </p>
          <div className="grid gap-1">
            <Label htmlFor="trial-venue">Venue</Label>
            <Select
              value={venueId}
              onValueChange={setVenueId}
              disabled={venues.isPending || mutation.isPending}
            >
              <SelectTrigger
                id="trial-venue"
                aria-required="true"
                aria-invalid={Boolean(error && !venueId)}
                aria-describedby={error && !venueId ? "trial-error" : undefined}
              >
                <SelectValue placeholder="Choose a venue" />
              </SelectTrigger>
              <SelectContent>
                {(venues.data?.data ?? []).map((venue) => (
                  <SelectItem key={venue.id} value={venue.id}>
                    {venue.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Label className="grid gap-1" htmlFor="trial-scheduled-at">
            Scheduled time
            <Input
              id="trial-scheduled-at"
              ref={scheduledInput}
              required
              aria-invalid={Boolean(error && !scheduledAt)}
              aria-describedby={
                error && !scheduledAt ? "trial-error" : undefined
              }
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              disabled={mutation.isPending}
            />
          </Label>
          <div className="flex gap-4">
            <Button
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
            </Button>
            <Button
              variant="outline"
              type="button"
              disabled={mutation.isPending}
              onClick={() => {
                setEditing(null);
                setScheduledAt("");
                setFormOpen(false);
                setError("");
                scheduleTrigger.current?.focus();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {error && (
        <Alert
          id="trial-error"
          role="alert"
          variant="destructive"
          className="mt-3"
        >
          <AlertDescription>
            {error} Your entries are still here.
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
