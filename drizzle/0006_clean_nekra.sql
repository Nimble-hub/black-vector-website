CREATE UNIQUE INDEX `uidx_community_notification_system_notice` ON `community_notification` (`user_id`,`type`,`title`) WHERE "community_notification"."actor_id" IS NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `community_notification`
  (`id`, `user_id`, `actor_id`, `type`, `title`, `body`, `href`, `read_at`, `created_at`)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  `id`,
  NULL,
  'direct-message',
  'Contact email required',
  'Add and verify a contact email so Black Vector can reach you about playtest waves, access windows, and important account notices.',
  '/account?email=required',
  NULL,
  cast(unixepoch('subsecond') * 1000 as integer)
FROM `user`
WHERE (`email` = '' OR lower(`email`) LIKE '%.invalid');
