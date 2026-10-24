import { randomUUID } from "node:crypto";
import type { TrialCreateInput, TrialUpdateInput } from "@kyzn/shared";
import type { createDatabase } from "../../../db/client.ts";
import { HttpError } from "../../../middleware/errors.ts";
import { compareUtcInstants } from "../../../time.ts";
import { trialRepository } from "./repository.ts";

type Db = ReturnType<typeof createDatabase>["db"];
type Clock = () => Date | string;
const conflict = (message: string) => new HttpError(409, "CONFLICT", message);
const missing = (message: string) => new HttpError(404, "NOT_FOUND", message);
const instant = (value: Date | string) =>
  typeof value === "string" ? value : value.toISOString();

export function trialService(db: Db, now: Clock = () => new Date()) {
  const repo = trialRepository(db);
  return {
    create(leadId: string, input: TrialCreateInput) {
      const timestamp = instant(now());
      if (compareUtcInstants(input.scheduledAt, timestamp) < 0)
        throw conflict("A trial must be scheduled for now or later.");
      return repo.transact((tx) => {
        const lead = repo.lead(tx, leadId);
        if (!lead || lead.deletedAt) throw missing("Lead not found.");
        if (!["new", "contacted", "trial_scheduled"].includes(lead.status))
          throw conflict("This lead cannot receive a new trial.");
        if (!repo.venue(tx, input.venueId))
          throw missing("Venue not found or inactive.");
        const id = randomUUID();
        const result = repo.insertTrial(tx, {
          id,
          leadId,
          venueId: input.venueId,
          scheduledAt: input.scheduledAt,
          status: "scheduled",
          completedAt: null,
          notes: input.notes ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        if (lead.status === "new" || lead.status === "contacted")
          repo.updateLead(tx, leadId, "trial_scheduled", timestamp);
        if (!result) throw new Error("Created trial could not be read.");
        return result;
      });
    },
    update(leadId: string, trialId: string, input: TrialUpdateInput) {
      const timestamp = instant(now());
      return repo.transact((tx) => {
        const lead = repo.lead(tx, leadId);
        if (!lead || lead.deletedAt) throw missing("Lead not found.");
        const trial = repo.trial(tx, trialId);
        if (!trial || trial.leadId !== leadId)
          throw missing("Trial not found for this lead.");
        if (
          ![
            "new",
            "contacted",
            "trial_scheduled",
            "trial_completed",
            "converted",
          ].includes(lead.status)
        )
          throw conflict("This lead cannot have its trial changed.");
        if (trial.status !== "scheduled")
          throw conflict("Only scheduled trials can be changed.");

        const isOutcome = "status" in input;
        if (!isOutcome) {
          const scheduledAt = input.scheduledAt ?? trial.scheduledAt;
          if (
            input.scheduledAt &&
            compareUtcInstants(scheduledAt, timestamp) < 0
          )
            throw conflict("A trial must be scheduled for now or later.");
          if (input.venueId && !repo.venue(tx, input.venueId))
            throw missing("Venue not found or inactive.");
          const result = repo.updateTrial(tx, trialId, {
            ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
            ...(input.venueId ? { venueId: input.venueId } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
            updatedAt: timestamp,
          });
          if (!result) throw new Error("Updated trial could not be read.");
          return result;
        }

        if (
          (input.status === "completed" || input.status === "no_show") &&
          compareUtcInstants(timestamp, trial.scheduledAt) < 0
        )
          throw conflict(
            "A trial cannot be completed before its scheduled time.",
          );
        const result = repo.updateTrial(tx, trialId, {
          status: input.status,
          completedAt: input.status === "completed" ? timestamp : null,
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          updatedAt: timestamp,
        });
        if (!result) throw new Error("Updated trial could not be read.");

        if (lead.status !== "converted") {
          const allTrials = repo.trialsForLead(tx, leadId);
          let status = lead.status;
          if (allTrials.some((item) => item.status === "scheduled"))
            status = "trial_scheduled";
          else if (allTrials.some((item) => item.status === "completed"))
            status = "trial_completed";
          else if (lead.status === "trial_scheduled") status = "contacted";
          if (status !== lead.status)
            repo.updateLead(tx, leadId, status, timestamp);
        }
        return result;
      });
    },
  };
}
