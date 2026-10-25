import {
  dashboardFunnelResponseSchema,
  dashboardFollowUpsResponseSchema,
  dashboardLeadsTrendResponseSchema,
  dashboardMetricsResponseSchema,
} from "@kyzn/shared";
import { apiBaseUrl } from "../../lib/api";

export type TrendDays = 7 | 30;

export const dashboardQueryKeys = {
  all: ["dashboard"] as const,
  metrics: ["dashboard", "metrics"] as const,
  trend: (days: TrendDays) => ["dashboard", "leads-trend", days] as const,
  funnel: ["dashboard", "funnel"] as const,
  followUps: ["dashboard", "follow-ups", 5] as const,
};

async function getJson(path: string) {
  const response = await fetch(`${apiBaseUrl}/v1/dashboard/${path}`);
  if (!response.ok) throw new Error("Dashboard data could not be loaded.");
  return response.json();
}

export async function getDashboardMetrics() {
  return dashboardMetricsResponseSchema.parse(await getJson("metrics")).data;
}

export async function getDashboardLeadsTrend(days: TrendDays) {
  return dashboardLeadsTrendResponseSchema.parse(
    await getJson(`leads-trend?days=${days}`),
  ).data;
}

export async function getDashboardFunnel() {
  return dashboardFunnelResponseSchema.parse(await getJson("funnel")).data;
}

export async function getDashboardFollowUps() {
  return dashboardFollowUpsResponseSchema.parse(
    await getJson("follow-ups?limit=5"),
  ).data;
}
