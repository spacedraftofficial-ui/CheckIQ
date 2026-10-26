ALTER TABLE `users` ADD COLUMN `deleted_at` timestamp NULL DEFAULT NULL AFTER `updated_at`;
CREATE INDEX `ix_users_deleted` ON `users` (`deleted_at`);
