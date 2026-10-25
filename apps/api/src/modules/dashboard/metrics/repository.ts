import { and, count, eq, lte, sql } from "drizzle-orm";
import type { createDatabase } from "../../../db/client.ts";
import { conversions, leads, trials } from "../../../db/schema.ts";
import { eligibleLeadCondition, openFollowUpCondition } from "../policies.ts";

type Db = ReturnType<typeof createDatabase>["db"];

export function dashboardMetricsRepository(db: Db) {
  return {
    async get(followUpDate: string) {
      const [
        [totalLeads],
        [newLeads],
        [followUpsDue],
        [trialsScheduled],
        [trialsCompleted],
        [convertedLeads],
      ] = await Promise.all([
        db
          .select({ value: count() })
          .from(leads)
          .where(eligibleLeadCondition())
          .all(),
        db
          .select({ value: count() })
          .from(leads)
          .where(and(eligibleLeadCondition(), eq(leads.status, "new")))
          .all(),
        db
          .select({ value: count() })
          .from(leads)
          .where(
            and(
              eligibleLeadCondition(),
              openFollowUpCondition(),
              lte(leads.nextFollowUpDate, followUpDate),
            ),
          )
          .all(),
        db
          .select({ value: count() })
          .from(trials)
          .innerJoin(leads, eq(trials.leadId, leads.id))
          .where(and(eligibleLeadCondition(), eq(trials.status, "scheduled")))
          .all(),
        db
          .select({ value: count() })
          .from(trials)
          .innerJoin(leads, eq(trials.leadId, leads.id))
          .where(and(eligibleLeadCondition(), eq(trials.status, "completed")))
          .all(),
        db
          .select({ value: sql<number>`count(distinct ${conversions.leadId})` })
          .from(conversions)
          .innerJoin(leads, eq(conversions.leadId, leads.id))
          .where(eligibleLeadCondition())
          .all(),
      ]);
      return {
        totalLeads: totalLeads.value,
        newLeads: newLeads.value,
        followUpsDue: followUpsDue.value,
        trialsScheduled: trialsScheduled.value,
        trialsCompleted: trialsCompleted.value,
        convertedLeads: convertedLeads.value,
      };
    },
  };
}
