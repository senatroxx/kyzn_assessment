import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  consultantsResponseSchema,
  leadDetailResponseSchema,
  venuesResponseSchema,
  type LeadDetailResponse,
} from "@kyzn/shared";
import { Alert, AlertDescription } from "@kyzn/ui/components/alert";
import { Button } from "@kyzn/ui/components/button";
import { Card, CardContent } from "@kyzn/ui/components/card";
import { ActivityTimeline } from "./ActivityTimeline";
import { FollowUpCard } from "./FollowUpCard";
import { Skeleton } from "@kyzn/ui/components/skeleton";
import { apiRequest, ApiRequestError } from "../../lib/api";
import { formatBusinessDateTime } from "../../lib/dates";
import { leadQueryKeys } from "../../lib/query-keys";
import { LeadStatusBadge } from "../lead-status/LeadStatusBadge";
import { ContactPanel } from "../lead-workflows/ContactPanel";
import { ConversionPanel } from "../lead-workflows/ConversionPanel";
import { TrialPanel } from "../lead-workflows/TrialPanel";

const sourceLabels: Record<string, string> = {
  website: "Website",
  whatsapp: "WhatsApp",
  social_media: "Social media",
  referral: "Referral",
  walk_in: "Walk-in",
  other: "Other",
};
const linkClass =
  "underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#31634c]";

export function LeadDetail({ leadId }: { leadId: string }) {
  const detail = useQuery({
    queryKey: leadQueryKeys.detail(leadId),
    queryFn: () =>
      apiRequest(
        `/v1/leads/${encodeURIComponent(leadId)}`,
        leadDetailResponseSchema,
      ),
  });
  const venues = useQuery({
    queryKey: [...leadQueryKeys.lookups(), "venues"],
    queryFn: () => apiRequest("/v1/venues", venuesResponseSchema),
  });
  const consultants = useQuery({
    queryKey: [...leadQueryKeys.lookups(), "consultants"],
    queryFn: () => apiRequest("/v1/consultants", consultantsResponseSchema),
  });

  if (detail.isPending)
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">Loading lead details…</span>
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  if (detail.isError) {
    const missing =
      detail.error instanceof ApiRequestError && detail.error.status === 404;
    return (
      <section aria-labelledby="detail-heading" className="max-w-3xl">
        <h1 id="detail-heading" className="text-xl font-semibold">
          {missing ? "Lead not found" : "Could not load lead details"}
        </h1>
        <Alert role="alert" variant="destructive" className="mt-3">
          <AlertDescription>
            {missing
              ? "This lead may have been removed or the link may be incorrect."
              : detail.error.message}
          </AlertDescription>
        </Alert>
        <div className="mt-4 flex flex-wrap gap-5">
          {!missing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void detail.refetch()}
            >
              Retry
            </Button>
          )}
          <Link className={linkClass} to="/leads">
            Back to leads
          </Link>
        </div>
      </section>
    );
  }

  const lead = detail.data.data;
  return (
    <LeadWorkspace
      key={lead.id}
      lead={lead}
      venueName={
        venues.data?.data.find((venue) => venue.id === lead.venueId)?.name ??
        lead.venueId
      }
      consultantName={
        consultants.data?.data.find(
          (consultant) => consultant.id === lead.consultantId,
        )?.name ?? lead.consultantId
      }
    />
  );
}

function LeadWorkspace({
  lead,
  venueName,
  consultantName,
}: {
  lead: LeadDetailResponse["data"];
  venueName: string;
  consultantName: string;
}) {
  const [action, setAction] = useState<"activity" | "followUp" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [activityPending, setActivityPending] = useState(false);
  const actionTrigger = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (restoreFocus.current && !action && !activityPending) {
      actionTrigger.current?.focus();
      restoreFocus.current = false;
    }
  }, [action, activityPending]);
  const canLogActivity = !["converted", "invalid"].includes(lead.status);
  function closeAction() {
    restoreFocus.current = true;
    setAction(null);
    setActivityPending(false);
  }
  const fields = [
    ["Lead ID", lead.id],
    ["Interested venue", venueName],
    ["Assigned consultant", consultantName],
  ];
  return (
    <section aria-labelledby="detail-heading" className="min-w-0">
      <nav
        aria-label="Breadcrumb"
        className="mb-4 text-sm text-muted-foreground"
      >
        <ol className="flex min-w-0 flex-wrap items-center gap-2">
          <li>
            <Link className={linkClass} to="/leads" aria-label="Back to leads">
              Leads
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="min-w-0 break-words" aria-current="page">
            {lead.fullName}
          </li>
        </ol>
      </nav>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1
            id="detail-heading"
            className="break-words text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            {lead.fullName}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <LeadStatusBadge status={lead.status} />
            <span className="text-sm text-muted-foreground">
              Source: {sourceLabels[lead.source]}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex min-h-11 items-center rounded-sm border border-input bg-card px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            to="/leads/$leadId/edit"
            params={{ leadId: lead.id }}
          >
            Edit lead
          </Link>
          <Button
            type="button"
            disabled={!canLogActivity || activityPending}
            aria-expanded={action === "activity"}
            aria-controls="lead-activity-panel"
            onClick={(event) => {
              actionTrigger.current = event.currentTarget;
              setAction("activity");
              setFeedback("");
            }}
          >
            Log activity
          </Button>
        </div>
      </header>
      {feedback && (
        <p role="status" className="mb-4 text-sm text-primary">
          {feedback}
        </p>
      )}
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <section aria-labelledby="profile-heading">
                <h2 id="profile-heading" className="font-semibold">
                  Lead information
                </h2>
                <dl className="mt-4 grid min-w-0 gap-x-6 gap-y-5 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-sm text-muted-foreground">Phone</dt>
                    <dd className="mt-1">
                      <a
                        className={`${linkClass} break-all`}
                        href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}
                      >
                        {lead.phone}
                      </a>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-sm text-muted-foreground">Email</dt>
                    <dd className="mt-1">
                      <a
                        className={`${linkClass} break-all`}
                        href={`mailto:${lead.email}`}
                      >
                        {lead.email}
                      </a>
                    </dd>
                  </div>
                  {fields.map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-sm text-muted-foreground">{label}</dt>
                      <dd className="mt-1 break-words [overflow-wrap:anywhere]">
                        {value}
                      </dd>
                    </div>
                  ))}
                  <div>
                    <dt className="text-sm text-muted-foreground">Created</dt>
                    <dd className="mt-1">
                      <time dateTime={lead.createdAt}>
                        {formatBusinessDateTime(lead.createdAt)}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">
                      Last contacted
                    </dt>
                    <dd className="mt-1">
                      {lead.lastContactAt ? (
                        <time dateTime={lead.lastContactAt}>
                          {formatBusinessDateTime(lead.lastContactAt)}
                        </time>
                      ) : (
                        "Not recorded"
                      )}
                    </dd>
                  </div>
                </dl>
              </section>
            </CardContent>
          </Card>
          {action && (
            <Card id="lead-activity-panel" className="min-w-0">
              <CardContent className="p-4 sm:p-5">
                <ContactPanel
                  key={action}
                  leadId={lead.id}
                  leadStatus={lead.status}
                  mode={action}
                  onCancel={closeAction}
                  onPendingChange={setActivityPending}
                  onSaved={() => {
                    setFeedback(
                      action === "followUp"
                        ? "Follow-up updated successfully."
                        : "Activity recorded successfully.",
                    );
                    closeAction();
                  }}
                />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <ActivityTimeline activities={lead.activities} />
            </CardContent>
          </Card>
        </div>
        <aside aria-label="Lead operations" className="min-w-0 space-y-5">
          <FollowUpCard
            disabled={activityPending}
            leadStatus={lead.status}
            date={lead.nextFollowUpDate}
            onSchedule={(event) => {
              actionTrigger.current = event.currentTarget;
              setAction("followUp");
              setFeedback("");
            }}
            expanded={action === "followUp"}
          />
          <Card className="min-w-0">
            <CardContent className="p-4 sm:p-5">
              <TrialPanel
                leadId={lead.id}
                leadStatus={lead.status}
                trials={lead.trials}
              />
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardContent className="p-4 sm:p-5">
              <ConversionPanel
                leadId={lead.id}
                leadStatus={lead.status}
                conversion={lead.conversion}
              />
            </CardContent>
          </Card>
          {lead.duplicateMatches.length > 0 && (
            <Card className="min-w-0">
              <CardContent className="p-4 sm:p-5">
                <section aria-labelledby="duplicate-heading">
                  <h2 id="duplicate-heading" className="font-semibold">
                    Potential duplicates
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Review these matches before contacting the lead.
                  </p>
                  <ul className="mt-3 space-y-3">
                    {lead.duplicateMatches.map((match) => (
                      <li key={match.id} className="min-w-0 text-sm">
                        <Link
                          className={`${linkClass} break-words`}
                          to="/leads/$leadId"
                          params={{ leadId: match.id }}
                        >
                          {match.fullName}
                        </Link>
                        <p className="mt-1 text-muted-foreground">
                          Matches {match.matchedFields.join(" and ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </section>
  );
}
