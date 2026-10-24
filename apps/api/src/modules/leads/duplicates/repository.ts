import { and, eq, isNull, ne, or } from "drizzle-orm";
import type { createDatabase } from "../../../db/client.ts";
import { leads } from "../../../db/schema.ts";

type Db = ReturnType<typeof createDatabase>["db"];

export function duplicateRepository(db: Db) {
  return {
    async find(phone?: string, email?: string, excludeId?: string) {
      const matches = [
        ...(phone ? [eq(leads.phoneNormalized, phone)] : []),
        ...(email ? [eq(leads.emailNormalized, email)] : []),
      ];
      const contactMatch = or(...matches);
      if (!contactMatch) return [];
      return db
        .select()
        .from(leads)
        .where(
          and(
            isNull(leads.deletedAt),
            ne(leads.status, "invalid"),
            ...(excludeId ? [ne(leads.id, excludeId)] : []),
            contactMatch,
          ),
        )
        .all();
    },
  };
}
