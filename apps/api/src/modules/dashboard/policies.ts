import { sql } from "drizzle-orm";
import { leads } from "../../db/schema.ts";

export const eligibleLeadCondition = () =>
  sql`${leads.deletedAt} IS NULL AND ${leads.status} != 'invalid'`;

export const openFollowUpCondition = () =>
  sql`${leads.status} IN ('new','contacted','trial_scheduled','trial_completed')`;
