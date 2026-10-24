CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`note` text,
	`next_follow_up_date` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "activities_type_check" CHECK("activities"."type" IN ('call','whatsapp','email','note'))
);
--> statement-breakpoint
CREATE INDEX `activities_lead_occurred_idx` ON `activities` (`lead_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `consultants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversions` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`converted_at` text NOT NULL,
	`note` text,
	`membership_reference` text,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversions_lead_unique` ON `conversions` (`lead_id`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`phone` text NOT NULL,
	`phone_normalized` text NOT NULL,
	`email` text NOT NULL,
	`email_normalized` text NOT NULL,
	`source` text NOT NULL,
	`venue_id` text NOT NULL,
	`consultant_id` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_contact_at` text,
	`next_follow_up_date` text,
	`deleted_at` text,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`consultant_id`) REFERENCES `consultants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "leads_source_check" CHECK("leads"."source" IN ('website','whatsapp','social_media','referral','walk_in','other')),
	CONSTRAINT "leads_status_check" CHECK("leads"."status" IN ('new','contacted','trial_scheduled','trial_completed','converted','lost','invalid'))
);
--> statement-breakpoint
CREATE INDEX `leads_phone_normalized_idx` ON `leads` (`phone_normalized`);--> statement-breakpoint
CREATE INDEX `leads_email_normalized_idx` ON `leads` (`email_normalized`);--> statement-breakpoint
CREATE INDEX `leads_source_idx` ON `leads` (`source`);--> statement-breakpoint
CREATE INDEX `leads_consultant_idx` ON `leads` (`consultant_id`);--> statement-breakpoint
CREATE INDEX `leads_status_idx` ON `leads` (`status`);--> statement-breakpoint
CREATE INDEX `leads_created_at_idx` ON `leads` (`created_at`);--> statement-breakpoint
CREATE INDEX `leads_follow_up_idx` ON `leads` (`next_follow_up_date`);--> statement-breakpoint
CREATE TABLE `trials` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`venue_id` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`completed_at` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "trials_status_check" CHECK("trials"."status" IN ('scheduled','completed','cancelled','no_show'))
);
--> statement-breakpoint
CREATE INDEX `trials_lead_status_idx` ON `trials` (`lead_id`,`status`);--> statement-breakpoint
CREATE INDEX `trials_scheduled_at_idx` ON `trials` (`scheduled_at`);--> statement-breakpoint
CREATE TABLE `venues` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
