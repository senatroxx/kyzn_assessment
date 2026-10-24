import { randomUUID } from "node:crypto";
import type { LeadCreateInput, LeadUpdateInput } from "@kyzn/shared";
import type { createDatabase } from "../../db/client.ts";
import { HttpError } from "../../middleware/errors.ts";
import { normalizeEmail, normalizePhone } from "./contact-normalization.ts";
import { duplicateRepository } from "./duplicates/repository.ts";
import { leadRepository } from "./repository.ts";

type Db = ReturnType<typeof createDatabase>["db"];
const present = (
  row: NonNullable<
    Awaited<ReturnType<ReturnType<typeof leadRepository>["find"]>>
  >,
) => ({
  id: row.id,
  fullName: row.fullName,
  phone: row.phone,
  email: row.email,
  source: row.source,
  venueId: row.venueId,
  consultantId: row.consultantId,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  lastContactAt: row.lastContactAt,
  nextFollowUpDate: row.nextFollowUpDate,
});

export function leadService(db: Db) {
  const repo = leadRepository(db);
  const duplicateRepo = duplicateRepository(db);
  const resolveRefs = async (input: {
    venueId?: string;
    consultantId?: string;
  }) => {
    if (input.venueId && !(await repo.referenceExists("venue", input.venueId)))
      throw new HttpError(404, "NOT_FOUND", "Venue not found or inactive.");
    if (
      input.consultantId &&
      !(await repo.referenceExists("consultant", input.consultantId))
    )
      throw new HttpError(
        404,
        "NOT_FOUND",
        "Consultant not found or inactive.",
      );
  };
  const detail = async (
    row: NonNullable<Awaited<ReturnType<typeof repo.find>>>,
  ) => {
    const matches = await duplicateRepo.find(
      row.phoneNormalized,
      row.emailNormalized,
      row.id,
    );
    return {
      ...present(row),
      activities: [],
      trials: [],
      conversion: (await repo.conversion(row.id)) ?? null,
      duplicateMatches: matches.map((match) => ({
        id: match.id,
        fullName: match.fullName,
        phone: match.phone,
        email: match.email,
        matchedFields: [
          ...(row.phoneNormalized === match.phoneNormalized
            ? (["phone"] as const)
            : []),
          ...(row.emailNormalized === match.emailNormalized
            ? (["email"] as const)
            : []),
        ],
      })),
    };
  };
  return {
    async create(input: LeadCreateInput) {
      await resolveRefs(input);
      const now = new Date().toISOString();
      const row = await repo.add({
        id: randomUUID(),
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        phoneNormalized: normalizePhone(input.phone),
        email: input.email.trim(),
        emailNormalized: normalizeEmail(input.email),
        source: input.source,
        venueId: input.venueId,
        consultantId: input.consultantId,
        status: "new",
        createdAt: now,
        updatedAt: now,
        lastContactAt: null,
        nextFollowUpDate: input.nextFollowUpDate ?? null,
      });
      if (!row) throw new Error("Created lead could not be read.");
      return detail(row);
    },
    async get(id: string) {
      const row = await repo.find(id);
      if (!row || row.deletedAt)
        throw new HttpError(404, "NOT_FOUND", "Lead not found.");
      return detail(row);
    },
    async update(id: string, input: LeadUpdateInput) {
      const current = await repo.find(id);
      if (!current || current.deletedAt)
        throw new HttpError(404, "NOT_FOUND", "Lead not found.");
      await resolveRefs(input);
      const patch = { ...input, updatedAt: new Date().toISOString() };
      if (input.fullName !== undefined) patch.fullName = input.fullName.trim();
      if (input.phone !== undefined) {
        Object.assign(patch, {
          phone: input.phone.trim(),
          phoneNormalized: normalizePhone(input.phone),
        });
      }
      if (input.email !== undefined) {
        Object.assign(patch, {
          email: input.email.trim(),
          emailNormalized: normalizeEmail(input.email),
        });
      }
      const row = await repo.update(id, patch);
      if (!row) throw new Error("Updated lead could not be read.");
      return detail(row);
    },
    async list() {
      const { rows, total } = await repo.list();
      return {
        data: rows.map((row) => ({ ...present(row), isDuplicate: false })),
        meta: {
          page: 1,
          pageSize: 20,
          total,
          totalPages: Math.ceil(total / 20),
        },
      };
    },
    venues: () => repo.venues(),
    consultants: () => repo.consultants(),
  };
}
