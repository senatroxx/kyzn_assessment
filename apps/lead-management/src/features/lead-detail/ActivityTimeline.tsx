import type { Activity } from "@kyzn/shared";
import { formatBusinessDate, formatBusinessDateTime } from "../../lib/dates";

const labels = {
  call: "Call",
  whatsapp: "WhatsApp",
  email: "Email",
  note: "Note",
};

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  const ordered = [...activities].sort(
    (a, b) =>
      Date.parse(b.occurredAt) - Date.parse(a.occurredAt) ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      a.id.localeCompare(b.id),
  );
  return (
    <section aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="font-semibold">
        Activity history
      </h2>
      {ordered.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No activities recorded. Log the first interaction to start this
          timeline.
        </p>
      ) : (
        <ol className="mt-5">
          {ordered.map((activity) => (
            <li
              key={activity.id}
              className="relative ml-1 border-l border-border pb-6 pl-5 last:pb-0 before:absolute before:top-1 before:-left-1 before:h-2 before:w-2 before:rounded-full before:bg-primary"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold">{labels[activity.type]}</p>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={activity.occurredAt}
                >
                  {formatBusinessDateTime(activity.occurredAt)}
                </time>
              </div>
              {activity.note && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
                  {activity.note}
                </p>
              )}
              {activity.nextFollowUpDate && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Follow-up:{" "}
                  <time dateTime={activity.nextFollowUpDate}>
                    {formatBusinessDate(activity.nextFollowUpDate)}
                  </time>
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
