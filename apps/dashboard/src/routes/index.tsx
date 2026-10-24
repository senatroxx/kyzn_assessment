import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { dashboardMetricsResponseSchema } from "@kyzn/shared";
import { apiBaseUrl } from "../lib/api";

const metricsQueryKey = ["dashboard-metrics"];

async function getDashboardMetrics() {
  const response = await fetch(`${apiBaseUrl}/v1/dashboard/metrics`);
  if (!response.ok) throw new Error("Dashboard metrics could not be loaded.");
  return dashboardMetricsResponseSchema.parse(await response.json()).data;
}

const metrics = [
  { key: "totalLeads", label: "Total leads" },
  { key: "newLeads", label: "New leads" },
  { key: "followUpsDue", label: "Follow-ups due today" },
  { key: "trialsScheduled", label: "Trials scheduled" },
  { key: "trialsCompleted", label: "Trials completed" },
  { key: "convertedLeads", label: "Converted leads" },
] as const;

function HomePage() {
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: metricsQueryKey,
    queryFn: getDashboardMetrics,
  });

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm text-[#555a53]">Case Study A</p>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        <nav aria-label="Applications">
          <a
            className="inline-flex min-h-11 items-center rounded border border-[#b9bdb3] px-4 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#334638]"
            href={import.meta.env.VITE_LEADS_URL ?? "http://localhost:3001"}
          >
            Lead Management
          </a>
        </nav>
      </div>

      <section aria-labelledby="metrics-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="metrics-heading" className="text-lg font-semibold">
            Key metrics
          </h2>
          <button
            className="min-h-11 rounded px-3 text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#334638] disabled:opacity-60"
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Refreshing…" : "Refresh metrics"}
          </button>
        </div>

        {isPending ? (
          <p role="status">Loading dashboard metrics…</p>
        ) : error ? (
          <div role="alert" className="rounded border border-[#b65b48] p-4">
            <p>
              Dashboard metrics could not be loaded. Check the API connection
              and try again.
            </p>
            <button
              className="mt-3 min-h-11 rounded px-3 font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#334638]"
              type="button"
              onClick={() => void refetch()}
            >
              Try again
            </button>
          </div>
        ) : data ? (
          <>
            {data.totalLeads === 0 && (
              <p className="mb-4 text-sm text-[#555a53]">No leads yet.</p>
            )}
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {metrics.map(({ key, label }) => (
                <div
                  className="min-w-0 border border-[#d5d7cf] bg-white p-5"
                  key={key}
                >
                  <dt className="text-sm text-[#555a53]">{label}</dt>
                  <dd className="mt-2 text-3xl font-semibold tabular-nums">
                    {data[key].toLocaleString()}
                  </dd>
                </div>
              ))}
              <div className="min-w-0 border border-[#d5d7cf] bg-white p-5">
                <dt className="text-sm text-[#555a53]">Conversion rate</dt>
                <dd className="mt-2 text-3xl font-semibold tabular-nums">
                  {new Intl.NumberFormat("en-US", {
                    maximumFractionDigits: 1,
                    minimumFractionDigits: Number.isInteger(data.conversionRate)
                      ? 0
                      : 1,
                  }).format(data.conversionRate)}
                  %
                </dd>
              </div>
            </dl>
          </>
        ) : null}
      </section>
    </div>
  );
}

export const Route = createFileRoute("/")({ component: HomePage });
