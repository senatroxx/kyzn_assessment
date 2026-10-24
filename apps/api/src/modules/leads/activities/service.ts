import { randomUUID } from "node:crypto";
import type { ActivityCreateInput } from "@kyzn/shared";
import type { createDatabase } from "../../../db/client.ts";
import { HttpError } from "../../../middleware/errors.ts";
import { compareUtcInstants } from "../../../time.ts";
import { activityRepository } from "./repository.ts";

type Db = ReturnType<typeof createDatabase>["db"];
const contactTypes = new Set(["call", "whatsapp", "email"]);

export function activityService(db: Db, now: () => Date = () => new Date()) {
  const repository = activityRepository(db);
  return async (leadId: string, input: ActivityCreateInput) => {
    const currentTime = now().toISOString();
    const occurredAt = input.occurredAt ?? currentTime;
    return repository
      .record(leadId, (lead) => {
        if (lead.deletedAt)
          throw new HttpError(404, "NOT_FOUND", "Lead not found.");
        if (["invalid", "converted"].includes(lead.status))
          throw new HttpError(
            409,
            "CONFLICT",
            "Activity cannot be recorded for this lead.",
          );
        if (
          compareUtcInstants(occurredAt, lead.createdAt) < 0 ||
          compareUtcInstants(occurredAt, currentTime) > 0
        )
          throw new HttpError(
            422,
            "VALIDATION_ERROR",
            "Activity time must be within the lead lifetime and not in the future.",
          );

        const isContact = contactTypes.has(input.type);
        const status = isContact
          ? lead.status === "new" ||
            lead.status === "lost" ||
            lead.status === "trial_completed"
            ? "contacted"
            : lead.status
          : lead.status;
        const lastContactAt =
          isContact &&
          (!lead.lastContactAt ||
            compareUtcInstants(occurredAt, lead.lastContactAt) > 0)
            ? occurredAt
            : lead.lastContactAt;
        const nextFollowUpDate =
          input.nextFollowUpDate === undefined
            ? lead.nextFollowUpDate
            : input.nextFollowUpDate;
        return {
          activity: {
            id: randomUUID(),
            leadId,
            type: input.type,
            occurredAt,
            note: input.note ?? null,
            nextFollowUpDate: input.nextFollowUpDate ?? null,
            createdAt: currentTime,
          },
          update: {
            status,
            lastContactAt,
            nextFollowUpDate,
            updatedAt: currentTime,
          },
        };
      })
      .then(({ activity }) => {
        if (!activity) throw new HttpError(404, "NOT_FOUND", "Lead not found.");
        return activity;
      });
  };
}
