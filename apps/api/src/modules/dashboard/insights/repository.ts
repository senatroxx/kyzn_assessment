import { and, asc, count, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import type { createDatabase } from "../../../db/client.ts";
import {
  activities,
  consultants,
  conversions,
  leads,
  trials,
} from "../../../db/schema.ts";
import { eligibleLeadCondition, openFollowUpCondition } from "../policies.ts";

type Db = ReturnType<typeof createDatabase>["db"];

export function dashboardInsightsRepository(db: Db) {
  return {
    async countLeadsCreatedBetween(start: string, end: string) {
      // Compare second-precision UTC prefixes so optional ISO fractions don't shift boundaries.
      const rows = await db
        .select({ value: count() })
        .from(leads)
        .where(
          and(
            eligibleLeadCondition(),
            gte(leads.createdAt, start.slice(0, 19)),
            lt(leads.createdAt, end.slice(0, 19)),
          ),
        )
        .all();
      return rows[0]?.value ?? 0;
    },

    async getFunnelCounts() {
      const [totalLeads, contacted, completedTrials, converted] =
        await Promise.all([
          db
            .select({ value: count() })
            .from(leads)
            .where(eligibleLeadCondition())
            .all(),
          db
            .select({
              value: sql<number>`count(distinct ${activities.leadId})`,
            })
            .from(activities)
            .innerJoin(leads, eq(activities.leadId, leads.id))
            .where(
              and(
                eligibleLeadCondition(),
                inArray(activities.type, ["call", "whatsapp", "email"]),
              ),
            )
            .all(),
          db
            .select({ value: sql<number>`count(distinct ${trials.leadId})` })
            .from(trials)
            .innerJoin(leads, eq(trials.leadId, leads.id))
            .where(and(eligibleLeadCondition(), eq(trials.status, "completed")))
            .all(),
          db
            .select({
              value: sql<number>`count(distinct ${conversions.leadId})`,
            })
            .from(conversions)
            .innerJoin(leads, eq(conversions.leadId, leads.id))
            .where(eligibleLeadCondition())
            .all(),
        ]);

      return {
        totalLeads: totalLeads[0]?.value ?? 0,
        contacted: contacted[0]?.value ?? 0,
        completedTrials: completedTrials[0]?.value ?? 0,
        converted: converted[0]?.value ?? 0,
      };
    },

    async getFollowUps(today: string, limit: number) {
      return db
        .select({
          id: leads.id,
          fullName: leads.fullName,
          consultantName: consultants.name,
          nextFollowUpDate: leads.nextFollowUpDate,
        })
        .from(leads)
        .leftJoin(consultants, eq(leads.consultantId, consultants.id))
        .where(
          and(
            eligibleLeadCondition(),
            openFollowUpCondition(),
            lte(leads.nextFollowUpDate, today),
          ),
        )
        .orderBy(
          asc(leads.nextFollowUpDate),
          asc(leads.createdAt),
          asc(leads.id),
        )
        .limit(limit)
        .all();
    },
  };
}
