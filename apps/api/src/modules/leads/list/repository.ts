import { and, asc, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { LeadListQuery } from "@kyzn/shared";
import type { createDatabase } from "../../../db/client.ts";
import { leads } from "../../../db/schema.ts";

type Db = ReturnType<typeof createDatabase>["db"];

const literalLike = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;

export const leadListRepository = (db: Db) => ({
  async list(query: LeadListQuery, phoneTerms: string[]) {
    const filters = [isNull(leads.deletedAt)];
    if (query.source) filters.push(eq(leads.source, query.source));
    if (query.consultantId)
      filters.push(eq(leads.consultantId, query.consultantId));
    if (query.status) filters.push(eq(leads.status, query.status));
    if (query.search) {
      const pattern = literalLike(query.search);
      const search = [
        sql`${leads.fullName} LIKE ${pattern} ESCAPE '\\'`,
        sql`${leads.email} LIKE ${pattern} ESCAPE '\\'`,
      ];
      for (const term of phoneTerms)
        search.push(
          sql`${leads.phoneNormalized} LIKE ${literalLike(term)} ESCAPE '\\'`,
        );
      filters.push(or(...search)!);
    }
    const where = and(...filters)!;
    const order =
      query.sortBy === "createdAt"
        ? query.sortOrder === "asc"
          ? [asc(leads.createdAt), asc(leads.id)]
          : [desc(leads.createdAt), asc(leads.id)]
        : [
            sql`CASE WHEN ${leads.nextFollowUpDate} IS NULL THEN 1 ELSE 0 END`,
            query.sortOrder === "asc"
              ? asc(leads.nextFollowUpDate)
              : desc(leads.nextFollowUpDate),
            asc(leads.id),
          ];
    const offset = (query.page - 1) * query.pageSize;
    const listing = db
      .select({
        id: leads.id,
        fullName: leads.fullName,
        phone: leads.phone,
        email: leads.email,
        source: leads.source,
        venueId: leads.venueId,
        consultantId: leads.consultantId,
        status: leads.status,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
        lastContactAt: leads.lastContactAt,
        nextFollowUpDate: leads.nextFollowUpDate,
        isDuplicate: sql<boolean>`EXISTS (
            SELECT 1 FROM leads AS other
            WHERE other.id <> leads.id
              AND other.deleted_at IS NULL
              AND other.status <> 'invalid'
              AND leads.status <> 'invalid'
              AND (other.phone_normalized = leads.phone_normalized
                OR other.email_normalized = leads.email_normalized)
          )`,
      })
      .from(leads)
      .where(where)
      .orderBy(...order)
      .limit(query.pageSize)
      .offset(offset);
    const [rows, [{ total }]] = await Promise.all([
      listing.all(),
      db.select({ total: count() }).from(leads).where(where).all(),
    ]);
    return { rows, total };
  },
});
