import type { createDatabase } from "../../../db/client.ts";
import { businessDateAt } from "../../../time.ts";
import { dashboardMetricsRepository } from "./repository.ts";

export function dashboardMetricsService(
  db: ReturnType<typeof createDatabase>["db"],
  now: () => Date,
  timeZone = "Asia/Jakarta",
) {
  const repository = dashboardMetricsRepository(db);
  return async () => {
    const counts = await repository.get(businessDateAt(now(), timeZone));
    return {
      ...counts,
      conversionRate: counts.totalLeads
        ? (counts.convertedLeads / counts.totalLeads) * 100
        : 0,
    };
  };
}
