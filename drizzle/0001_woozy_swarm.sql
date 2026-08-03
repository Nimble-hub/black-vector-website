CREATE TABLE `forum_post` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `forum_thread`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_forum_post_thread_created` ON `forum_post` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_forum_post_author` ON `forum_post` (`author_id`);--> statement-breakpoint
CREATE TABLE `forum_thread` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`author_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`reply_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_forum_thread_category_updated` ON `forum_thread` (`category`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_forum_thread_author` ON `forum_thread` (`author_id`);
--> statement-breakpoint
PRAGMA optimize;
