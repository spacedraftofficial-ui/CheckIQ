ALTER TABLE `users` ADD COLUMN `is_email_verified` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `users` ADD INDEX `ix_users_email_verified` (`is_email_verified`);--> statement-breakpoint
CREATE TABLE `email_verification_tokens` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `email_verification_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_email_verification_tokens_hash` UNIQUE(`token_hash`),
	CONSTRAINT `fk_email_verification_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX `ix_email_verification_tokens_user` ON `email_verification_tokens` (`user_id`);