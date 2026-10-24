import type { createDatabase } from "../../../db/client.ts";
import { dashboardMetricsRepository } from "./repository.ts";

export function dashboardMetricsService(
  db: ReturnType<typeof createDatabase>["db"],
  now: () => Date,
  timeZone = "Asia/Jakarta",
) {
  const repository = dashboardMetricsRepository(db);
  return async () => {
    const dateParts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now());
    const date = Object.fromEntries(
      dateParts.map(({ type, value }) => [type, value]),
    );
    const counts = await repository.get(
      `${date.year}-${date.month}-${date.day}`,
    );
    return {
      ...counts,
      conversionRate: counts.totalLeads
        ? (counts.convertedLeads / counts.totalLeads) * 100
        : 0,
    };
  };
}
