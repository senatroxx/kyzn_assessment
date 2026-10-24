import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { leadDetailResponseSchema } from "@kyzn/shared";
import { apiRequest, ApiRequestError } from "../../lib/api";
import { leadQueryKeys } from "../../lib/query-keys";
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
const readable = (value: string) => value.replaceAll("_", " ");
const dateTime = (value: string) => new Date(value).toLocaleString();
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

  if (detail.isPending) return <p role="status">Loading lead details…</p>;
  if (detail.isError) {
    const missing =
      detail.error instanceof ApiRequestError && detail.error.status === 404;
    return (
      <section aria-labelledby="detail-heading" className="max-w-3xl">
        <h2 id="detail-heading" className="text-xl font-semibold">
          {missing ? "Lead not found" : "Could not load lead details"}
        </h2>
        <p role="alert" className="mt-3">
          {missing
            ? "This lead may have been removed or the link may be incorrect."
            : detail.error.message}
        </p>
        <div className="mt-4 flex flex-wrap gap-5">
          {!missing && (
            <button
              type="button"
              className={linkClass}
              onClick={() => void detail.refetch()}
            >
              Retry
            </button>
          )}
          <Link className={linkClass} to="/leads">
            Back to leads
          </Link>
        </div>
      </section>
    );
  }

  const lead = detail.data.data;
  const fields: [string, string | null][] = [
    ["Lead ID", lead.id],
    ["Full name", lead.fullName],
    ["Phone", lead.phone],
    ["Email", lead.email],
    ["Lead source", sourceLabels[lead.source]],
    ["Interested venue ID", lead.venueId],
    ["Assigned consultant ID", lead.consultantId],
    ["Status", readable(lead.status)],
    ["Created", lead.createdAt],
    ["Last contacted", lead.lastContactAt],
    ["Next follow-up", lead.nextFollowUpDate],
  ];
  return (
    <section aria-labelledby="detail-heading" className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="detail-heading" className="text-xl font-semibold">
            {lead.fullName}
          </h2>
          <p className="mt-1 text-sm">{readable(lead.status)}</p>
        </div>
        <nav aria-label="Lead actions" className="flex flex-wrap gap-5">
          <Link
            className={linkClass}
            to="/leads/$leadId/edit"
            params={{ leadId }}
          >
            Edit lead
          </Link>
          <Link className={linkClass} to="/leads">
            Back to leads
          </Link>
        </nav>
      </div>

      <section aria-labelledby="profile-heading" className="mt-6">
        <h3 id="profile-heading" className="font-semibold">
          Lead profile
        </h3>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-sm text-[#555a53]">{label}</dt>
              <dd className="mt-1 break-words">
                {value === null ? (
                  "Not recorded"
                ) : label === "Created" || label === "Last contacted" ? (
                  <time dateTime={value}>{dateTime(value)}</time>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="duplicate-heading" className="mt-8">
        <h3 id="duplicate-heading" className="font-semibold">
          Matching records
        </h3>
        {lead.duplicateMatches.length === 0 ? (
          <p className="mt-2">No matching leads found.</p>
        ) : (
          <ul className="mt-2 list-disc space-y-2 pl-5">
            {lead.duplicateMatches.map((match) => (
              <li key={match.id}>
                <Link
                  className={linkClass}
                  to="/leads/$leadId"
                  params={{ leadId: match.id }}
                >
                  {match.fullName}
                </Link>{" "}
                · matches {match.matchedFields.join(" and ")}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="activity-heading" className="mt-8">
        <h3 id="activity-heading" className="font-semibold">
          Activity history
        </h3>
        {lead.activities.length === 0 ? (
          <p className="mt-2">No activities recorded.</p>
        ) : (
          <ol className="mt-2 space-y-3">
            {lead.activities.map((activity) => (
              <li
                key={activity.id}
                className="rounded-sm border border-[#d5d9d1] p-3"
              >
                <p className="font-medium">
                  {readable(activity.type)} ·{" "}
                  <time dateTime={activity.occurredAt}>
                    {dateTime(activity.occurredAt)}
                  </time>
                </p>
                {activity.note && <p className="mt-1">{activity.note}</p>}
                {activity.nextFollowUpDate && (
                  <p className="mt-1 text-sm">
                    Follow-up: {activity.nextFollowUpDate}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <ContactPanel leadId={lead.id} leadStatus={lead.status} />

      <TrialPanel
        leadId={lead.id}
        leadStatus={lead.status}
        trials={lead.trials}
      />

      <ConversionPanel
        leadId={lead.id}
        leadStatus={lead.status}
        conversion={lead.conversion}
      />
    </section>
  );
}
