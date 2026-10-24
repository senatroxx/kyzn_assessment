import { eq } from "drizzle-orm";
import type { createDatabase } from "../../../db/client.ts";
import { conversions, leads } from "../../../db/schema.ts";

type Db = ReturnType<typeof createDatabase>["db"];

export const conversionRepository = (db: Db) => ({
  async create(
    leadId: string,
    conversion: typeof conversions.$inferInsert,
    updatedAt: string,
  ) {
    return db.transaction((tx) => {
      const lead = tx.select().from(leads).where(eq(leads.id, leadId)).get();
      if (!lead) return { lead: null, conversion: null };
      if (
        lead.deletedAt ||
        !["contacted", "trial_scheduled", "trial_completed"].includes(
          lead.status,
        )
      )
        return { lead, conversion: null };
      tx.insert(conversions).values(conversion).run();
      tx.update(leads)
        .set({ status: "converted", updatedAt })
        .where(eq(leads.id, leadId))
        .run();
      const created = tx
        .select()
        .from(conversions)
        .where(eq(conversions.id, conversion.id))
        .get();
      return { lead, conversion: created };
    });
  },
});
