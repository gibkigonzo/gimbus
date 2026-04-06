CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`original_name` text NOT NULL,
	`media_type` text NOT NULL,
	`pathname` text NOT NULL,
	`playground_path` text,
	`is_chunked` integer DEFAULT false NOT NULL,
	`description_path` text,
	`description` text,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
