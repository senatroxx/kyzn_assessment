import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const instant = (name: string) => text(name);

export const venues = sqliteTable("venues", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const consultants = sqliteTable("consultants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const leads = sqliteTable(
  "leads",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    phoneNormalized: text("phone_normalized").notNull(),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    source: text("source").notNull(),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id),
    consultantId: text("consultant_id")
      .notNull()
      .references(() => consultants.id),
    status: text("status").notNull().default("new"),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: instant("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    lastContactAt: instant("last_contact_at"),
    nextFollowUpDate: text("next_follow_up_date"),
    deletedAt: instant("deleted_at"),
  },
  (table) => [
    check(
      "leads_source_check",
      sql`${table.source} IN ('website','whatsapp','social_media','referral','walk_in','other')`,
    ),
    check(
      "leads_status_check",
      sql`${table.status} IN ('new','contacted','trial_scheduled','trial_completed','converted','lost','invalid')`,
    ),
    index("leads_phone_normalized_idx").on(table.phoneNormalized),
    index("leads_email_normalized_idx").on(table.emailNormalized),
    index("leads_source_idx").on(table.source),
    index("leads_consultant_idx").on(table.consultantId),
    index("leads_status_idx").on(table.status),
    index("leads_created_at_idx").on(table.createdAt),
    index("leads_follow_up_idx").on(table.nextFollowUpDate),
  ],
);

export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id),
    type: text("type").notNull(),
    occurredAt: instant("occurred_at").notNull(),
    note: text("note"),
    nextFollowUpDate: text("next_follow_up_date"),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [
    check(
      "activities_type_check",
      sql`${table.type} IN ('call','whatsapp','email','note')`,
    ),
    index("activities_lead_occurred_idx").on(table.leadId, table.occurredAt),
  ],
);

export const trials = sqliteTable(
  "trials",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id),
    scheduledAt: instant("scheduled_at").notNull(),
    status: text("status").notNull().default("scheduled"),
    completedAt: instant("completed_at"),
    notes: text("notes"),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: instant("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [
    check(
      "trials_status_check",
      sql`${table.status} IN ('scheduled','completed','cancelled','no_show')`,
    ),
    index("trials_lead_status_idx").on(table.leadId, table.status),
    index("trials_scheduled_at_idx").on(table.scheduledAt),
  ],
);

export const conversions = sqliteTable(
  "conversions",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id),
    convertedAt: instant("converted_at").notNull(),
    note: text("note"),
    membershipReference: text("membership_reference"),
  },
  (table) => [uniqueIndex("conversions_lead_unique").on(table.leadId)],
);
