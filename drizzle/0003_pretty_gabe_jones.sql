CREATE TABLE `clan` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tag` text NOT NULL,
	`description` text NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_clan_name` ON `clan` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_clan_tag` ON `clan` (`tag`);--> statement-breakpoint
CREATE INDEX `idx_clan_owner` ON `clan` (`owner_id`);--> statement-breakpoint
CREATE TABLE `clan_forum_post` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `clan_forum_thread`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_clan_forum_post_thread_created` ON `clan_forum_post` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_clan_forum_post_author` ON `clan_forum_post` (`author_id`);--> statement-breakpoint
CREATE TABLE `clan_forum_thread` (
	`id` text PRIMARY KEY NOT NULL,
	`clan_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`reply_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`clan_id`) REFERENCES `clan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_clan_forum_thread_clan_updated` ON `clan_forum_thread` (`clan_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_clan_forum_thread_author` ON `clan_forum_thread` (`author_id`);--> statement-breakpoint
CREATE TABLE `clan_member` (
	`clan_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`clan_id`, `user_id`),
	FOREIGN KEY (`clan_id`) REFERENCES `clan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_clan_member_user` ON `clan_member` (`user_id`);--> statement-breakpoint
CREATE TABLE `community_friendship` (
	`user_low_id` text NOT NULL,
	`user_high_id` text NOT NULL,
	`requested_by_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_low_id`, `user_high_id`),
	FOREIGN KEY (`user_low_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_high_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_community_friendship_low_status` ON `community_friendship` (`user_low_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_community_friendship_high_status` ON `community_friendship` (`user_high_id`,`status`);--> statement-breakpoint
CREATE TABLE `community_presence` (
	`user_id` text PRIMARY KEY NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_community_presence_last_seen` ON `community_presence` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `direct_conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`user_low_id` text NOT NULL,
	`user_high_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_low_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_high_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_direct_conversation_pair` ON `direct_conversation` (`user_low_id`,`user_high_id`);--> statement-breakpoint
CREATE INDEX `idx_direct_conversation_low_updated` ON `direct_conversation` (`user_low_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_direct_conversation_high_updated` ON `direct_conversation` (`user_high_id`,`updated_at`);
--> statement-breakpoint
PRAGMA optimize;
