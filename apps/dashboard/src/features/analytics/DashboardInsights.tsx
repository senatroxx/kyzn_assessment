import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  DashboardFollowUp,
  DashboardFunnelResponse,
  DashboardLeadsTrendResponse,
} from "@kyzn/shared";
import { Alert, AlertDescription, AlertTitle } from "@kyzn/ui/components/alert";
import { Badge } from "@kyzn/ui/components/badge";
import { Button } from "@kyzn/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@kyzn/ui/components/card";
import { Skeleton } from "@kyzn/ui/components/skeleton";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  dashboardQueryKeys,
  getDashboardFunnel,
  getDashboardFollowUps,
  getDashboardLeadsTrend,
  type TrendDays,
} from "./api";

type LeadTrendPoint = DashboardLeadsTrendResponse["data"][number];
type FunnelStage = DashboardFunnelResponse["data"]["stages"][number];
type FunnelStageKey = FunnelStage["key"];

const stageLabels: Record<FunnelStageKey, string> = {
  total_leads: "Total eligible leads",
  contacted: "Contacted",
  completed_trials: "Completed a trial",
  converted: "Converted",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function dateValue(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: string) {
  return dateFormatter.format(dateValue(value));
}

function formatShortDate(value: string) {
  return shortDateFormatter.format(dateValue(value));
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function SectionError({
  title,
  onRetry,
}: {
  title: string;
  onRetry: () => void;
}) {
  return (
    <Alert role="alert" variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        Check the API connection and try again.
      </AlertDescription>
      <Button className="mt-3" variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </Alert>
  );
}

export function DashboardInsights() {
  const [days, setDays] = useState<TrendDays>(30);
  const trend = useQuery({
    queryKey: dashboardQueryKeys.trend(days),
    queryFn: () => getDashboardLeadsTrend(days),
  });
  const funnel = useQuery({
    queryKey: dashboardQueryKeys.funnel,
    queryFn: getDashboardFunnel,
  });
  const followUps = useQuery({
    queryKey: dashboardQueryKeys.followUps,
    queryFn: getDashboardFollowUps,
  });

  return (
    <>
      <section className="mt-8" aria-labelledby="lead-trend-heading">
        <Card className="min-w-0">
          <CardHeader className="flex flex-wrap items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <CardTitle id="lead-trend-heading">
                Lead acquisition trend
              </CardTitle>
              <CardDescription className="mt-2">
                Leads created per business-local day.
              </CardDescription>
            </div>
            <div
              className="flex gap-2"
              role="group"
              aria-label="Lead trend period"
            >
              {([7, 30] as const).map((period) => (
                <Button
                  key={period}
                  type="button"
                  size="sm"
                  variant={days === period ? "default" : "outline"}
                  aria-pressed={days === period}
                  onClick={() => setDays(period)}
                >
                  Last {period} days
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {trend.isPending ? (
              <div role="status" className="space-y-3">
                <span className="sr-only">Loading lead acquisition trend…</span>
                <Skeleton className="h-64 w-full" />
              </div>
            ) : trend.isError ? (
              <SectionError
                title="Lead acquisition trend could not be loaded."
                onRetry={() => void trend.refetch()}
              />
            ) : (
              <TrendChart data={trend.data} days={days} />
            )}
          </CardContent>
        </Card>
      </section>

      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
        <section aria-labelledby="funnel-heading">
          <Card className="h-full min-w-0">
            <CardHeader>
              <CardTitle id="funnel-heading">Lead conversion funnel</CardTitle>
              <CardDescription>
                Historical milestones, not a required sequence. Each percentage
                uses all eligible leads as its denominator.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {funnel.isPending ? (
                <div role="status" className="space-y-3">
                  <span className="sr-only">Loading lead milestones…</span>
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : funnel.isError ? (
                <SectionError
                  title="Lead milestones could not be loaded."
                  onRetry={() => void funnel.refetch()}
                />
              ) : funnel.data.eligibleLeadCount === 0 ? (
                <p role="status" className="py-4 text-sm text-muted-foreground">
                  No eligible leads yet.
                </p>
              ) : (
                <ol className="space-y-4">
                  {funnel.data.stages.map((stage) => (
                    <FunnelStageRow key={stage.key} stage={stage} />
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="follow-ups-heading">
          <Card className="h-full min-w-0">
            <CardHeader>
              <CardTitle id="follow-ups-heading">
                Follow-ups requiring attention
              </CardTitle>
              <CardDescription>
                Overdue follow-ups first, followed by those due today.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {followUps.isPending ? (
                <div role="status" className="space-y-3">
                  <span className="sr-only">Loading follow-ups…</span>
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : followUps.isError ? (
                <SectionError
                  title="Follow-ups could not be loaded."
                  onRetry={() => void followUps.refetch()}
                />
              ) : followUps.data.length === 0 ? (
                <p role="status" className="py-4 text-sm text-muted-foreground">
                  No follow-ups are due today or overdue.
                </p>
              ) : (
                <>
                  <ul className="divide-y divide-border">
                    {followUps.data.map((lead) => (
                      <FollowUpRow key={lead.id} lead={lead} />
                    ))}
                  </ul>
                  <a
                    className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                    href={allFollowUpsUrl()}
                  >
                    View all leads by follow-up date
                  </a>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}

function TrendChart({
  data,
  days,
}: {
  data: LeadTrendPoint[];
  days: TrendDays;
}) {
  const hasLeads = data.some(({ count }) => count > 0);
  if (!hasLeads) {
    return (
      <div>
        <p role="status" className="mb-2 text-sm text-muted-foreground">
          No leads were created in the last {days} days.
        </p>
        <div className="h-64 w-full min-w-0" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} accessibilityLayer>
              <CartesianGrid stroke="#e1e4df" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                minTickGap={18}
              />
              <YAxis allowDecimals={false} />
              <Line
                dataKey="count"
                stroke="#31634c"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="h-64 w-full min-w-0"
        role="group"
        aria-label={`Lead acquisitions over the last ${days} days`}
        aria-describedby="lead-trend-data-description"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            accessibilityLayer
            margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
          >
            <CartesianGrid stroke="#e1e4df" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              minTickGap={18}
              tick={{ fill: "#555a53", fontSize: 12 }}
            />
            <YAxis
              allowDecimals={false}
              width={32}
              tick={{ fill: "#555a53", fontSize: 12 }}
            />
            <Tooltip
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value) => [
                Number(value).toLocaleString(),
                "Leads created",
              ]}
              contentStyle={{
                backgroundColor: "#ffffff",
                borderColor: "#d5d9d1",
                borderRadius: "0.125rem",
              }}
            />
            <Line
              type="monotone"
              dataKey="count"
              name="Leads created"
              stroke="#31634c"
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p id="lead-trend-data-description" className="sr-only">
        Daily counts for {data.length} business-local calendar days.
      </p>
      <div className="sr-only">
        <table>
          <caption>Daily leads created in the selected period</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Leads created</th>
            </tr>
          </thead>
          <tbody>
            {data.map(({ date, count }) => (
              <tr key={date}>
                <td>{formatDate(date)}</td>
                <td>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FunnelStageRow({ stage }: { stage: FunnelStage }) {
  const label = stageLabels[stage.key];
  return (
    <li className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {stage.leadCount.toLocaleString()} ·{" "}
          {formatPercent(stage.percentOfEligibleLeads)}
        </span>
      </div>
      <div
        className="h-2 rounded-sm bg-muted"
        role="progressbar"
        aria-label={`${label} as a share of eligible leads`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={stage.percentOfEligibleLeads}
      >
        <div
          className="h-full rounded-sm bg-primary"
          style={{ width: `${stage.percentOfEligibleLeads}%` }}
        />
      </div>
    </li>
  );
}

function FollowUpRow({ lead }: { lead: DashboardFollowUp }) {
  const leadsUrl = (
    import.meta.env.VITE_LEADS_URL ?? "http://localhost:3001"
  ).replace(/\/$/, "");
  const overdue = lead.followUpStatus === "overdue";

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <a
          className="font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
          href={`${leadsUrl}/leads/${encodeURIComponent(lead.id)}`}
        >
          {lead.fullName}
        </a>
        <p className="mt-1 text-sm text-muted-foreground">
          {lead.consultantName ?? "Unassigned"} ·{" "}
          {formatDate(lead.nextFollowUpDate)}
        </p>
      </div>
      <Badge variant={overdue ? "destructive" : "secondary"}>
        {overdue ? "Overdue" : "Due today"}
      </Badge>
    </li>
  );
}

function allFollowUpsUrl() {
  const leadsUrl = (
    import.meta.env.VITE_LEADS_URL ?? "http://localhost:3001"
  ).replace(/\/$/, "");
  return `${leadsUrl}/leads?sortBy=nextFollowUpDate&sortOrder=asc`;
}
