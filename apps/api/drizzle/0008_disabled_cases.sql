ALTER TABLE `bgv_cases` ADD COLUMN `disabled_at` timestamp(3);--> statement-breakpoint
CREATE INDEX `ix_bgv_cases_disabled` ON `bgv_cases` (`disabled_at`);
