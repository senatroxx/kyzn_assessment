import { and, asc, eq, isNull } from "drizzle-orm";
import type { createDatabase } from "../../../db/client.ts";
import { leads, trials, venues } from "../../../db/schema.ts";

type Db = ReturnType<typeof createDatabase>["db"];

export const trialRepository = (db: Db) => ({
  listForLead(leadId: string) {
    return db
      .select()
      .from(trials)
      .where(eq(trials.leadId, leadId))
      .orderBy(asc(trials.scheduledAt), asc(trials.id))
      .all();
  },
  transact<T>(run: (tx: Parameters<Parameters<Db["transaction"]>[0]>[0]) => T) {
    return db.transaction(run);
  },
  lead(tx: Parameters<Parameters<Db["transaction"]>[0]>[0], id: string) {
    return tx.select().from(leads).where(eq(leads.id, id)).get();
  },
  venue(tx: Parameters<Parameters<Db["transaction"]>[0]>[0], id: string) {
    return tx
      .select()
      .from(venues)
      .where(and(eq(venues.id, id), eq(venues.active, true)))
      .get();
  },
  trial(tx: Parameters<Parameters<Db["transaction"]>[0]>[0], id: string) {
    return tx.select().from(trials).where(eq(trials.id, id)).get();
  },
  trialsForLead(
    tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
    leadId: string,
  ) {
    return tx.select().from(trials).where(eq(trials.leadId, leadId)).all();
  },
  insertTrial(
    tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
    value: typeof trials.$inferInsert,
  ) {
    tx.insert(trials).values(value).run();
    return this.trial(tx, value.id);
  },
  updateTrial(
    tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
    id: string,
    value: Partial<typeof trials.$inferInsert>,
  ) {
    tx.update(trials).set(value).where(eq(trials.id, id)).run();
    return this.trial(tx, id);
  },
  updateLead(
    tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
    id: string,
    status: string,
    updatedAt: string,
  ) {
    tx.update(leads)
      .set({ status, updatedAt })
      .where(and(eq(leads.id, id), isNull(leads.deletedAt)))
      .run();
  },
});
