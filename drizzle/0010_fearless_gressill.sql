CREATE TABLE `stripe_webhook_event` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`processed_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_stripe_webhook_event_processed` ON `stripe_webhook_event` (`processed_at`);--> statement-breakpoint
CREATE TABLE `support_contribution` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`supporter_email` text,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`stripe_checkout_session_id` text,
	`stripe_payment_intent_id` text,
	`amount_refunded_cents` integer DEFAULT 0 NOT NULL,
	`recognition_opt_in` integer DEFAULT false NOT NULL,
	`paid_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_contribution_stripe_checkout_session_id_unique` ON `support_contribution` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `support_contribution_stripe_payment_intent_id_unique` ON `support_contribution` (`stripe_payment_intent_id`);--> statement-breakpoint
CREATE INDEX `idx_support_contribution_user_created` ON `support_contribution` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_support_contribution_status_created` ON `support_contribution` (`status`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
