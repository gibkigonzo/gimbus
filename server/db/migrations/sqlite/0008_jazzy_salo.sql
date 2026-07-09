CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memories_category_key_idx` ON `memories` (`category`,`key`);