import type {
  DashboardFunnelResponse,
  DashboardFollowUpsQuery,
  DashboardLeadsTrendQuery,
} from "@kyzn/shared";
import type { createDatabase } from "../../../db/client.ts";
import {
  addDateOnlyDays,
  businessDateAt,
  businessDateStartUtc,
} from "../../../time.ts";
import { dashboardInsightsRepository } from "./repository.ts";

type Db = ReturnType<typeof createDatabase>["db"];

export function dashboardInsightsService(
  db: Db,
  now: () => Date,
  timeZone = "Asia/Jakarta",
) {
  const repository = dashboardInsightsRepository(db);

  return {
    async leadsTrend({ days }: DashboardLeadsTrendQuery) {
      const today = businessDateAt(now(), timeZone);
      const dates = Array.from({ length: days }, (_, index) =>
        addDateOnlyDays(today, index - days + 1),
      );
      const counts = await Promise.all(
        dates.map((date) =>
          repository.countLeadsCreatedBetween(
            businessDateStartUtc(date, timeZone),
            businessDateStartUtc(addDateOnlyDays(date, 1), timeZone),
          ),
        ),
      );
      return dates.map((date, index) => ({ date, count: counts[index] ?? 0 }));
    },

    async funnel(): Promise<DashboardFunnelResponse["data"]> {
      const counts = await repository.getFunnelCounts();
      const share = (count: number) =>
        counts.totalLeads ? (count / counts.totalLeads) * 100 : 0;
      return {
        eligibleLeadCount: counts.totalLeads,
        stages: [
          {
            key: "total_leads",
            leadCount: counts.totalLeads,
            percentOfEligibleLeads: share(counts.totalLeads),
          },
          {
            key: "contacted",
            leadCount: counts.contacted,
            percentOfEligibleLeads: share(counts.contacted),
          },
          {
            key: "completed_trials",
            leadCount: counts.completedTrials,
            percentOfEligibleLeads: share(counts.completedTrials),
          },
          {
            key: "converted",
            leadCount: counts.converted,
            percentOfEligibleLeads: share(counts.converted),
          },
        ],
      };
    },

    async followUps({ limit }: DashboardFollowUpsQuery) {
      const today = businessDateAt(now(), timeZone);
      const rows = await repository.getFollowUps(today, limit);
      return rows.flatMap((row) =>
        row.nextFollowUpDate === null
          ? []
          : [
              {
                ...row,
                followUpStatus:
                  row.nextFollowUpDate < today ? "overdue" : "due_today",
              },
            ],
      );
    },
  };
}
