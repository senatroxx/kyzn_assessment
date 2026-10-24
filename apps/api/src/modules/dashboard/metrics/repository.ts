import { and, count, eq, isNull, lte, ne, sql } from "drizzle-orm";
import type { createDatabase } from "../../../db/client.ts";
import { conversions, leads, trials } from "../../../db/schema.ts";

type Db = ReturnType<typeof createDatabase>["db"];
const eligible = and(isNull(leads.deletedAt), ne(leads.status, "invalid"));

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
        db.select({ value: count() }).from(leads).where(eligible).all(),
        db
          .select({ value: count() })
          .from(leads)
          .where(and(eligible, eq(leads.status, "new")))
          .all(),
        db
          .select({ value: count() })
          .from(leads)
          .where(
            and(
              eligible,
              sql`${leads.status} IN ('new','contacted','trial_scheduled','trial_completed')`,
              lte(leads.nextFollowUpDate, followUpDate),
            ),
          )
          .all(),
        db
          .select({ value: count() })
          .from(trials)
          .innerJoin(leads, eq(trials.leadId, leads.id))
          .where(and(eligible, eq(trials.status, "scheduled")))
          .all(),
        db
          .select({ value: count() })
          .from(trials)
          .innerJoin(leads, eq(trials.leadId, leads.id))
          .where(and(eligible, eq(trials.status, "completed")))
          .all(),
        db
          .select({ value: sql<number>`count(distinct ${conversions.leadId})` })
          .from(conversions)
          .innerJoin(leads, eq(conversions.leadId, leads.id))
          .where(eligible)
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
