CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_name_idx` ON `skills` (`name`);--> statement-breakpoint
ALTER TABLE `chats` ADD `needs_attention` integer DEFAULT false NOT NULL;