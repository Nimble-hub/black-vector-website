CREATE TABLE `community_staff_role` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`assigned_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_community_staff_role` ON `community_staff_role` (`role`);
--> statement-breakpoint
PRAGMA optimize;
