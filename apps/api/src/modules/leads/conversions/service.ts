import { randomUUID } from "node:crypto";
import type { ConversionCreateInput } from "@kyzn/shared";
import type { createDatabase } from "../../../db/client.ts";
import { HttpError } from "../../../middleware/errors.ts";
import { conversionRepository } from "./repository.ts";

type Db = ReturnType<typeof createDatabase>["db"];

export function conversionService(db: Db, now: () => Date = () => new Date()) {
  const repository = conversionRepository(db);
  return async (leadId: string, input: ConversionCreateInput) => {
    const convertedAt = now().toISOString();
    try {
      const result = await repository.create(
        leadId,
        {
          id: randomUUID(),
          leadId,
          convertedAt,
          note: input.note ?? null,
          membershipReference: input.membershipReference ?? null,
        },
        convertedAt,
      );
      if (!result.lead || result.lead.deletedAt)
        throw new HttpError(404, "NOT_FOUND", "Lead not found.");
      if (!result.conversion && result.lead.status === "converted")
        throw new HttpError(
          409,
          "CONFLICT",
          "Lead has already been converted.",
        );
      if (!result.conversion)
        throw new HttpError(
          409,
          "CONFLICT",
          "Lead cannot be converted from its current status.",
        );
      return result.conversion;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed: conversions.lead_id")
      )
        throw new HttpError(
          409,
          "CONFLICT",
          "Lead has already been converted.",
        );
      throw error;
    }
  };
}
