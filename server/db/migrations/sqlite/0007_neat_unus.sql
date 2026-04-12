DROP TABLE `workflows`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text,
	`model` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`cached_tokens` integer,
	`tool_calls` text,
	`tool_call_id` text,
	`tool_called_with` text,
	`attachments` text,
	`sealed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_messages`("id", "chat_id", "role", "content", "model", "input_tokens", "output_tokens", "cached_tokens", "tool_calls", "tool_call_id", "tool_called_with", "attachments", "sealed", "created_at") SELECT "id", "chat_id", "role", "content", "model", "input_tokens", "output_tokens", "cached_tokens", "tool_calls", "tool_call_id", "tool_called_with", "attachments", "sealed", "created_at" FROM `messages`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `messages_chat_id_idx` ON `messages` (`chat_id`);