CREATE TABLE `game_build` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text DEFAULT 'playtest' NOT NULL,
	`platform` text DEFAULT 'windows' NOT NULL,
	`version` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text,
	`release_notes` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_build_object_key_unique` ON `game_build` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_game_build_distribution` ON `game_build` (`channel`,`platform`,`state`,`published_at`);--> statement-breakpoint
CREATE TABLE `game_download_entitlement` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel` text DEFAULT 'playtest' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`expires_at` integer,
	`granted_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_game_download_entitlement_user_channel` ON `game_download_entitlement` (`user_id`,`channel`);--> statement-breakpoint
CREATE INDEX `idx_game_download_entitlement_access` ON `game_download_entitlement` (`user_id`,`active`,`expires_at`);