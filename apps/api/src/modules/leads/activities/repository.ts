import { asc, eq } from "drizzle-orm";
import type { createDatabase } from "../../../db/client.ts";
import { activities, leads } from "../../../db/schema.ts";

type Db = ReturnType<typeof createDatabase>["db"];

export const activityRepository = (db: Db) => ({
  listForLead(leadId: string) {
    return db
      .select()
      .from(activities)
      .where(eq(activities.leadId, leadId))
      .orderBy(asc(activities.occurredAt), asc(activities.id))
      .all();
  },
  async record(
    leadId: string,
    create: (lead: typeof leads.$inferSelect) => {
      activity: typeof activities.$inferInsert;
      update: Partial<typeof leads.$inferInsert>;
    },
  ) {
    return db.transaction((tx) => {
      const lead = tx.select().from(leads).where(eq(leads.id, leadId)).get();
      if (!lead) return { lead: null, activity: null };
      const { activity: input, update } = create(lead);
      tx.insert(activities).values(input).run();
      tx.update(leads).set(update).where(eq(leads.id, leadId)).run();
      const activity = tx
        .select()
        .from(activities)
        .where(eq(activities.id, input.id))
        .get();
      return { lead, activity };
    });
  },
});
