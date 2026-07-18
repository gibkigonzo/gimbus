CREATE TABLE `scheduled_task_state` (
	`key` text PRIMARY KEY NOT NULL,
	`consecutive_unopened` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
