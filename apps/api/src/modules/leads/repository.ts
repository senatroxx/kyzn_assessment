import { count, desc, eq, isNull } from "drizzle-orm";
import type { createDatabase } from "../../db/client.ts";
import { consultants, conversions, leads, venues } from "../../db/schema.ts";

type Db = ReturnType<typeof createDatabase>["db"];

export const leadRepository = (db: Db) => ({
  async find(id: string) {
    return db.select().from(leads).where(eq(leads.id, id)).get();
  },
  async add(value: typeof leads.$inferInsert) {
    await db.insert(leads).values(value);
    return this.find(value.id);
  },
  async update(id: string, value: Partial<typeof leads.$inferInsert>) {
    await db.update(leads).set(value).where(eq(leads.id, id));
    return this.find(id);
  },
  async list() {
    const where = isNull(leads.deletedAt);
    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(leads)
        .where(where)
        .orderBy(desc(leads.createdAt))
        .limit(20)
        .all(),
      db.select({ total: count() }).from(leads).where(where).all(),
    ]);
    return { rows, total };
  },
  async venues() {
    return db.select().from(venues).where(eq(venues.active, true)).all();
  },
  async consultants() {
    return db
      .select()
      .from(consultants)
      .where(eq(consultants.active, true))
      .all();
  },
  async referenceExists(table: "venue" | "consultant", id: string) {
    const rows =
      table === "venue"
        ? await db.select().from(venues).where(eq(venues.id, id)).all()
        : await db
            .select()
            .from(consultants)
            .where(eq(consultants.id, id))
            .all();
    return rows[0]?.active === true;
  },
  async conversion(leadId: string) {
    return db
      .select()
      .from(conversions)
      .where(eq(conversions.leadId, leadId))
      .get();
  },
});
