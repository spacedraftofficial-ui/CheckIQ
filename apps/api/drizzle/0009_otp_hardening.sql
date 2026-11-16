ALTER TABLE `email_verification_tokens` ADD COLUMN `failed_attempts` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `email_verification_tokens` DROP INDEX `uq_email_verification_tokens_hash`;--> statement-breakpoint
ALTER TABLE `password_reset_tokens` ADD COLUMN `failed_attempts` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `password_reset_tokens` DROP INDEX `uq_password_reset_tokens_hash`;
