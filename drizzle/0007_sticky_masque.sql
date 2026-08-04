ALTER TABLE `user` ADD `display_name_set` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `user`
SET `display_name_set` = true
WHERE COALESCE((
  SELECT `provider_id`
  FROM `account`
  WHERE `account`.`user_id` = `user`.`id`
  ORDER BY `created_at` ASC, `id` ASC
  LIMIT 1
), '') IN ('credential', 'discord', 'steam');
--> statement-breakpoint
UPDATE `user`
SET
  `name` = 'Vector-' || upper(substr(hex(randomblob(3)), 1, 6)),
  `display_name_set` = false
WHERE COALESCE((
  SELECT `provider_id`
  FROM `account`
  WHERE `account`.`user_id` = `user`.`id`
  ORDER BY `created_at` ASC, `id` ASC
  LIMIT 1
), '') NOT IN ('credential', 'discord', 'steam');
