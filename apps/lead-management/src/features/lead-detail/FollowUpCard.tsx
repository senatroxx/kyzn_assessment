import type { MouseEventHandler } from "react";
import type { LeadStatus } from "@kyzn/shared";
import { Badge } from "@kyzn/ui/components/badge";
import { Button } from "@kyzn/ui/components/button";
import { Card, CardContent } from "@kyzn/ui/components/card";
import { businessToday, formatBusinessDate } from "../../lib/dates";

export function FollowUpCard({
  date,
  leadStatus,
  onSchedule,
  expanded,
  disabled = false,
}: {
  date: string | null;
  leadStatus: LeadStatus;
  onSchedule: MouseEventHandler<HTMLButtonElement>;
  expanded: boolean;
  disabled?: boolean;
}) {
  const active = [
    "new",
    "contacted",
    "trial_scheduled",
    "trial_completed",
  ].includes(leadStatus);
  const today = businessToday();
  const label = !active
    ? "No active follow-up"
    : !date
      ? "No follow-up scheduled"
      : date < today
        ? "Overdue"
        : date === today
          ? "Due today"
          : "Scheduled";
  return (
    <Card className="min-w-0">
      <CardContent className="p-4 sm:p-5">
        <section aria-labelledby="follow-up-heading">
          <h2 id="follow-up-heading" className="font-semibold">
            Next follow-up
          </h2>
          <Badge
            variant="outline"
            className={`mt-3 ${label === "Overdue" ? "border-red-300 bg-red-50 text-red-900" : ""}`}
          >
            {label}
          </Badge>
          {date && (
            <p className="mt-3 font-medium">
              <time dateTime={date}>{formatBusinessDate(date)}</time>
            </p>
          )}
          {!active ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Closed and invalid leads are excluded from active follow-ups.
            </p>
          ) : (
            <>
              {!date && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Set the next date to keep this enquiry moving.
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                disabled={disabled}
                onClick={onSchedule}
                aria-expanded={expanded}
                aria-controls="lead-activity-panel"
              >
                {date ? "Reschedule follow-up" : "Schedule follow-up"}
              </Button>
            </>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
