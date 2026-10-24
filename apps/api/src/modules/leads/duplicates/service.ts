import type { DuplicateQuery } from "@kyzn/shared";
import type { createDatabase } from "../../../db/client.ts";
import { normalizeEmail, normalizePhone } from "../contact-normalization.ts";
import { duplicateRepository } from "./repository.ts";

type Db = ReturnType<typeof createDatabase>["db"];

export function duplicateService(db: Db) {
  const repository = duplicateRepository(db);
  return {
    async find(input: DuplicateQuery) {
      const phone = input.phone ? normalizePhone(input.phone) : undefined;
      const email = input.email ? normalizeEmail(input.email) : undefined;
      const rows = await repository.find(phone, email, input.excludeId);
      return rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        phone: row.phone,
        email: row.email,
        matchedFields: [
          ...(phone && row.phoneNormalized === phone
            ? (["phone"] as const)
            : []),
          ...(email && row.emailNormalized === email
            ? (["email"] as const)
            : []),
        ],
      }));
    },
  };
}
