CREATE TABLE `auth_sessions` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`refresh_token_hash` varchar(64) NOT NULL,
	`family_id` varchar(36) NOT NULL,
	`issued_at` timestamp(3) NOT NULL DEFAULT (now()),
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`revoked_reason` varchar(120),
	`replaced_by_session_id` varchar(36),
	`user_agent` varchar(300),
	`ip_address` varchar(64),
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_auth_sessions_refresh_hash` UNIQUE(`refresh_token_hash`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`code` varchar(64) NOT NULL,
	`description` varchar(300) NOT NULL,
	`category` varchar(48) NOT NULL,
	CONSTRAINT `permissions_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_code` varchar(32) NOT NULL,
	`permission_code` varchar(64) NOT NULL,
	CONSTRAINT `role_permissions_role_code_permission_code_pk` PRIMARY KEY(`role_code`,`permission_code`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`code` varchar(32) NOT NULL,
	`name` varchar(80) NOT NULL,
	`description` varchar(500),
	`is_system` boolean NOT NULL DEFAULT false,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `roles_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` varchar(36) NOT NULL,
	`role_code` varchar(32) NOT NULL,
	`assigned_by` varchar(36),
	`assigned_at` timestamp(3) NOT NULL DEFAULT (now()),
	`revoked_at` timestamp,
	CONSTRAINT `user_roles_user_id_role_code_pk` PRIMARY KEY(`user_id`,`role_code`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(254) NOT NULL,
	`email_normalized` varchar(254) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`full_name` varchar(160) NOT NULL,
	`mobile` varchar(32) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`must_change_password` boolean NOT NULL DEFAULT false,
	`session_epoch` int NOT NULL DEFAULT 1,
	`failed_login_attempts` int NOT NULL DEFAULT 0,
	`locked_until` timestamp,
	`last_login_at` timestamp,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_users_email_normalized` UNIQUE(`email_normalized`)
);
--> statement-breakpoint
CREATE TABLE `candidate_addresses` (
	`id` varchar(36) NOT NULL,
	`profile_id` varchar(36) NOT NULL,
	`type` varchar(16) NOT NULL,
	`line1` varchar(200) NOT NULL,
	`line2` varchar(200),
	`city` varchar(120) NOT NULL,
	`state` varchar(120) NOT NULL,
	`country` varchar(120) NOT NULL,
	`postal_code` varchar(20),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `candidate_addresses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `candidate_education` (
	`id` varchar(36) NOT NULL,
	`profile_id` varchar(36) NOT NULL,
	`qualification` varchar(200) NOT NULL,
	`institution` varchar(200) NOT NULL,
	`university_or_board` varchar(200),
	`registration_number` varchar(100),
	`year_of_passing` int NOT NULL,
	`score_or_percentage` varchar(50),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `candidate_education_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `candidate_employments` (
	`id` varchar(36) NOT NULL,
	`profile_id` varchar(36) NOT NULL,
	`employer` varchar(200) NOT NULL,
	`designation` varchar(200) NOT NULL,
	`employee_id` varchar(100),
	`from_date` date NOT NULL,
	`to_date` date,
	`is_current` boolean NOT NULL DEFAULT false,
	`contact_name` varchar(160),
	`contact_email_encrypted` varchar(512),
	`contact_mobile_encrypted` varchar(512),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `candidate_employments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `candidate_profile_values` (
	`id` varchar(36) NOT NULL,
	`profile_id` varchar(36) NOT NULL,
	`field_key` varchar(80) NOT NULL,
	`value_text` varchar(4000),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `candidate_profile_values_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_candidate_profile_values_key` UNIQUE(`profile_id`,`field_key`)
);
--> statement-breakpoint
CREATE TABLE `candidate_profiles` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`candidate_id` varchar(64) NOT NULL,
	`full_name` varchar(160) NOT NULL,
	`date_of_birth` date,
	`gender` varchar(32),
	`email` varchar(254) NOT NULL,
	`mobile` varchar(32) NOT NULL,
	`pan_encrypted` varchar(512),
	`passport_number_encrypted` varchar(512),
	`passport_expiry` date,
	`driving_licence_number_encrypted` varchar(512),
	`profile_completed` boolean NOT NULL DEFAULT false,
	`last_profile_change_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `candidate_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_candidate_profiles_user` UNIQUE(`user_id`),
	CONSTRAINT `uq_candidate_profiles_candidate_id` UNIQUE(`candidate_id`)
);
--> statement-breakpoint
CREATE TABLE `bgv_package_checks` (
	`package_id` varchar(36) NOT NULL,
	`check_definition_id` varchar(36) NOT NULL,
	`is_mandatory` boolean NOT NULL DEFAULT true,
	`weight` int NOT NULL DEFAULT 0,
	`display_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `bgv_package_checks_package_id_check_definition_id_pk` PRIMARY KEY(`package_id`,`check_definition_id`)
);
--> statement-breakpoint
CREATE TABLE `bgv_package_profile_fields` (
	`package_id` varchar(36) NOT NULL,
	`field_key` varchar(80) NOT NULL,
	CONSTRAINT `bgv_package_profile_fields_package_id_field_key_pk` PRIMARY KEY(`package_id`,`field_key`)
);
--> statement-breakpoint
CREATE TABLE `bgv_packages` (
	`id` varchar(36) NOT NULL,
	`code` varchar(48) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`requires_maker_checker` boolean NOT NULL DEFAULT true,
	`scoring_config_id` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bgv_packages_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_bgv_packages_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `check_definitions` (
	`id` varchar(36) NOT NULL,
	`code` varchar(48) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` varchar(1000),
	`is_mandatory_default` boolean NOT NULL DEFAULT true,
	`requires_review_on_discrepancy` boolean NOT NULL DEFAULT true,
	`is_available` boolean NOT NULL DEFAULT true,
	`display_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `check_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_check_definitions_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `document_categories` (
	`id` varchar(36) NOT NULL,
	`code` varchar(48) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(500),
	`is_active` boolean NOT NULL DEFAULT true,
	`display_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `document_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_document_categories_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `document_requirements` (
	`id` varchar(36) NOT NULL,
	`package_id` varchar(36) NOT NULL,
	`category_id` varchar(36) NOT NULL,
	`document_type_id` varchar(36) NOT NULL,
	`label` varchar(160) NOT NULL,
	`description` varchar(1000),
	`is_mandatory` boolean NOT NULL DEFAULT true,
	`max_versions` int NOT NULL DEFAULT 10,
	`display_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `document_requirements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_types` (
	`id` varchar(36) NOT NULL,
	`category_id` varchar(36) NOT NULL,
	`code` varchar(48) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` varchar(500),
	`is_active` boolean NOT NULL DEFAULT true,
	`display_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `document_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_document_types_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `profile_field_definitions` (
	`id` varchar(36) NOT NULL,
	`field_key` varchar(80) NOT NULL,
	`label` varchar(160) NOT NULL,
	`section` varchar(48) NOT NULL,
	`data_type` varchar(24) NOT NULL,
	`is_required` boolean NOT NULL DEFAULT false,
	`options` json,
	`validation` json,
	`display_order` int NOT NULL DEFAULT 0,
	`applies_to` json,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `profile_field_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_profile_field_definitions_key` UNIQUE(`field_key`)
);
--> statement-breakpoint
CREATE TABLE `bgv_cases` (
	`id` varchar(36) NOT NULL,
	`case_number` varchar(32) NOT NULL,
	`profile_id` varchar(36) NOT NULL,
	`package_id` varchar(36) NOT NULL,
	`status` varchar(40) NOT NULL DEFAULT 'DRAFT',
	`assigned_verifier_id` varchar(36),
	`assigned_reviewer_id` varchar(36),
	`company` varchar(160),
	`department` varchar(160),
	`position` varchar(160),
	`score` decimal(5,2),
	`score_outcome` varchar(32),
	`eligibility_result` varchar(40),
	`legal_hold` boolean NOT NULL DEFAULT false,
	`version` int NOT NULL DEFAULT 1,
	`initiated_at` timestamp(3),
	`submitted_at` timestamp(3),
	`verification_started_at` timestamp(3),
	`verification_completed_at` timestamp(3),
	`closed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bgv_cases_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_bgv_cases_number` UNIQUE(`case_number`)
);
--> statement-breakpoint
CREATE TABLE `bgv_submission_events` (
	`id` varchar(36) NOT NULL,
	`case_id` varchar(36) NOT NULL,
	`idempotency_key` varchar(100) NOT NULL,
	`submitted_by` varchar(36) NOT NULL,
	`submitted_at` timestamp(3) NOT NULL DEFAULT (now()),
	`readiness_snapshot` json,
	CONSTRAINT `bgv_submission_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_submission_case` UNIQUE(`case_id`),
	CONSTRAINT `uq_submission_case_key` UNIQUE(`case_id`,`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `case_assignments` (
	`id` varchar(36) NOT NULL,
	`case_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`assignment_role` varchar(24) NOT NULL,
	`assigned_by` varchar(36),
	`assigned_at` timestamp(3) NOT NULL DEFAULT (now()),
	`unassigned_at` timestamp,
	`reason` varchar(1000),
	CONSTRAINT `case_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `case_status_history` (
	`id` varchar(36) NOT NULL,
	`case_id` varchar(36) NOT NULL,
	`from_status` varchar(40),
	`to_status` varchar(40) NOT NULL,
	`actor_id` varchar(36),
	`actor_role` varchar(32),
	`reason` varchar(2000),
	`metadata` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `case_status_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`version_number` int NOT NULL,
	`storage_key` varchar(255) NOT NULL,
	`original_filename` varchar(255) NOT NULL,
	`mime_type` varchar(120) NOT NULL,
	`size_bytes` int NOT NULL,
	`checksum_sha256` varchar(64) NOT NULL,
	`malware_scan_status` varchar(16) NOT NULL DEFAULT 'PENDING',
	`malware_scan_detail` varchar(500),
	`uploaded_by` varchar(36) NOT NULL,
	`uploaded_at` timestamp(3) NOT NULL DEFAULT (now()),
	`is_current` boolean NOT NULL DEFAULT true,
	`superseded_at` timestamp,
	CONSTRAINT `document_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_document_versions_number` UNIQUE(`document_id`,`version_number`),
	CONSTRAINT `uq_document_versions_storage_key` UNIQUE(`storage_key`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` varchar(36) NOT NULL,
	`case_id` varchar(36) NOT NULL,
	`profile_id` varchar(36) NOT NULL,
	`requirement_id` varchar(36) NOT NULL,
	`document_type_id` varchar(36) NOT NULL,
	`label` varchar(160) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'MISSING',
	`current_version_id` varchar(36),
	`assigned_verifier_id` varchar(36),
	`verified_at` timestamp(3),
	`reviewer_remarks` varchar(2000),
	`evidence_reference` varchar(500),
	`version_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_documents_case_requirement` UNIQUE(`case_id`,`requirement_id`)
);
--> statement-breakpoint
CREATE TABLE `clarification_requests` (
	`id` varchar(36) NOT NULL,
	`case_id` varchar(36) NOT NULL,
	`check_id` varchar(36),
	`document_id` varchar(36),
	`issue_summary` varchar(500) NOT NULL,
	`required_action` varchar(2000) NOT NULL,
	`remarks` varchar(4000),
	`due_date` date,
	`status` varchar(16) NOT NULL DEFAULT 'OPEN',
	`requested_by` varchar(36) NOT NULL,
	`requested_at` timestamp(3) NOT NULL DEFAULT (now()),
	`responded_at` timestamp(3),
	`response_text` varchar(4000),
	`closed_at` timestamp(3),
	`closed_by` varchar(36),
	`close_reason` varchar(2000),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clarification_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clarification_responses` (
	`id` varchar(36) NOT NULL,
	`clarification_id` varchar(36) NOT NULL,
	`response_text` varchar(4000) NOT NULL,
	`attached_document_ids` json NOT NULL,
	`responded_by` varchar(36) NOT NULL,
	`responded_at` timestamp(3) NOT NULL DEFAULT (now()),
	`is_late` boolean NOT NULL DEFAULT false,
	CONSTRAINT `clarification_responses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `verification_check_results` (
	`id` varchar(36) NOT NULL,
	`check_id` varchar(36) NOT NULL,
	`sequence` int NOT NULL,
	`status` varchar(32) NOT NULL,
	`outcome_code` varchar(64),
	`remarks` varchar(4000),
	`evidence_reference` varchar(1000),
	`requires_review` boolean NOT NULL DEFAULT false,
	`recorded_by` varchar(36) NOT NULL,
	`recorded_at` timestamp(3) NOT NULL DEFAULT (now()),
	`is_current` boolean NOT NULL DEFAULT true,
	CONSTRAINT `verification_check_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_verification_check_results_seq` UNIQUE(`check_id`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `verification_checks` (
	`id` varchar(36) NOT NULL,
	`case_id` varchar(36) NOT NULL,
	`check_definition_id` varchar(36) NOT NULL,
	`label` varchar(160) NOT NULL,
	`check_type_code` varchar(48) NOT NULL,
	`is_mandatory` boolean NOT NULL DEFAULT true,
	`weight` int NOT NULL DEFAULT 0,
	`status` varchar(32) NOT NULL DEFAULT 'NOT_SUBMITTED',
	`outcome_code` varchar(64),
	`verifier_id` varchar(36),
	`remarks` varchar(4000),
	`evidence_reference` varchar(1000),
	`requires_review` boolean NOT NULL DEFAULT false,
	`started_at` timestamp(3),
	`completed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `verification_checks_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_verification_checks_case_def` UNIQUE(`case_id`,`check_definition_id`)
);
--> statement-breakpoint
CREATE TABLE `bgv_scores` (
	`id` varchar(36) NOT NULL,
	`case_id` varchar(36) NOT NULL,
	`scoring_config_id` varchar(36) NOT NULL,
	`scoring_config_version` int NOT NULL,
	`total_score` decimal(5,2) NOT NULL,
	`threshold` decimal(5,2) NOT NULL,
	`outcome` varchar(24) NOT NULL,
	`is_provisional` boolean NOT NULL DEFAULT false,
	`is_manual_adjustment` boolean NOT NULL DEFAULT false,
	`previous_score` decimal(5,2),
	`adjustment_reason` varchar(2000),
	`adjusted_by` varchar(36),
	`adjusted_at` timestamp(3),
	`components` json NOT NULL,
	`generated_by` varchar(36),
	`generated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`superseded_at` timestamp,
	CONSTRAINT `bgv_scores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scoring_config_components` (
	`id` varchar(36) NOT NULL,
	`scoring_config_id` varchar(36) NOT NULL,
	`check_type_codes` json NOT NULL,
	`label` varchar(160) NOT NULL,
	`weight` decimal(5,2) NOT NULL,
	`outcome_multipliers` json NOT NULL,
	`excluded_statuses` json NOT NULL,
	CONSTRAINT `scoring_config_components_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scoring_configurations` (
	`id` varchar(36) NOT NULL,
	`version` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`threshold` decimal(5,2) NOT NULL,
	`allow_provisional` boolean NOT NULL DEFAULT false,
	`status` varchar(16) NOT NULL DEFAULT 'DRAFT',
	`is_approved` boolean NOT NULL DEFAULT false,
	`approved_by` varchar(36),
	`approved_at` timestamp(3),
	`notes` varchar(2000),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scoring_configurations_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_scoring_configurations_version` UNIQUE(`version`)
);
--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` varchar(36) NOT NULL,
	`case_id` varchar(36) NOT NULL,
	`approved_by` varchar(36) NOT NULL,
	`approved_by_role` varchar(32),
	`decision` varchar(32) NOT NULL,
	`remarks` varchar(4000),
	`score_at_approval` varchar(16),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consent_acceptances` (
	`id` varchar(36) NOT NULL,
	`consent_version_id` varchar(36) NOT NULL,
	`version` varchar(32) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`profile_id` varchar(36),
	`candidate_id` varchar(64) NOT NULL,
	`accepted_at` timestamp(3) NOT NULL DEFAULT (now()),
	`ip_address` varchar(64),
	`user_agent` varchar(300),
	CONSTRAINT `consent_acceptances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consent_versions` (
	`id` varchar(36) NOT NULL,
	`version` varchar(32) NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`effective_from` timestamp(3) NOT NULL DEFAULT (now()),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `consent_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_consent_versions_version` UNIQUE(`version`)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` varchar(36) NOT NULL,
	`case_id` varchar(36) NOT NULL,
	`round` int NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'PENDING',
	`reviewer_id` varchar(36) NOT NULL,
	`reviewer_role` varchar(32),
	`decision` varchar(32),
	`remarks` varchar(4000),
	`return_reason` varchar(2000),
	`is_maker_checker_satisfied` boolean NOT NULL DEFAULT false,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`decided_at` timestamp(3),
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_reviews_case_round` UNIQUE(`case_id`,`round`)
);
--> statement-breakpoint
CREATE TABLE `notification_delivery_attempts` (
	`id` varchar(36) NOT NULL,
	`notification_id` varchar(36) NOT NULL,
	`attempt_number` int NOT NULL,
	`status` varchar(16) NOT NULL,
	`error` varchar(1000),
	`provider_response` varchar(1000),
	`attempted_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_delivery_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_templates` (
	`id` varchar(36) NOT NULL,
	`event` varchar(48) NOT NULL,
	`channel` varchar(16) NOT NULL,
	`name` varchar(160) NOT NULL,
	`subject_template` varchar(500) NOT NULL,
	`body_template` text NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_notification_templates_event_channel` UNIQUE(`event`,`channel`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` varchar(36) NOT NULL,
	`event` varchar(48) NOT NULL,
	`channel` varchar(16) NOT NULL,
	`template_id` varchar(36),
	`recipient_user_id` varchar(36) NOT NULL,
	`case_id` varchar(36),
	`subject` varchar(500) NOT NULL,
	`body` text NOT NULL,
	`delivery_status` varchar(16) NOT NULL DEFAULT 'PENDING',
	`attempt_count` int NOT NULL DEFAULT 0,
	`last_error` varchar(1000),
	`sent_at` timestamp(3),
	`read_at` timestamp(3),
	`deduplication_key` varchar(160),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_notifications_dedup` UNIQUE(`deduplication_key`)
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` varchar(36) NOT NULL,
	`action` varchar(64) NOT NULL,
	`actor_id` varchar(36),
	`actor_name` varchar(160),
	`actor_role` varchar(32),
	`entity_type` varchar(64) NOT NULL,
	`entity_id` varchar(36),
	`case_id` varchar(36),
	`candidate_id` varchar(64),
	`previous_value` json,
	`new_value` json,
	`reason` varchar(2000),
	`ip_address` varchar(64),
	`user_agent` varchar(300),
	`request_id` varchar(64),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_config` (
	`key` varchar(96) NOT NULL,
	`value` varchar(4000) NOT NULL,
	`value_type` varchar(16) NOT NULL DEFAULT 'STRING',
	`category` varchar(48) NOT NULL DEFAULT 'GENERAL',
	`description` varchar(500),
	`is_secret` boolean NOT NULL DEFAULT false,
	`updated_by` varchar(36),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_config_key` PRIMARY KEY(`key`),
	CONSTRAINT `uq_system_config_key` UNIQUE(`key`)
);
--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_code_roles_code_fk` FOREIGN KEY (`role_code`) REFERENCES `roles`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_code_permissions_code_fk` FOREIGN KEY (`permission_code`) REFERENCES `permissions`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_code_roles_code_fk` FOREIGN KEY (`role_code`) REFERENCES `roles`(`code`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_assigned_by_users_id_fk` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `candidate_addresses` ADD CONSTRAINT `candidate_addresses_profile_id_candidate_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `candidate_profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `candidate_education` ADD CONSTRAINT `candidate_education_profile_id_candidate_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `candidate_profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `candidate_employments` ADD CONSTRAINT `candidate_employments_profile_id_candidate_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `candidate_profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `candidate_profile_values` ADD CONSTRAINT `candidate_profile_values_profile_id_candidate_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `candidate_profiles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD CONSTRAINT `candidate_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bgv_package_checks` ADD CONSTRAINT `bgv_package_checks_package_id_bgv_packages_id_fk` FOREIGN KEY (`package_id`) REFERENCES `bgv_packages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bgv_package_checks` ADD CONSTRAINT `bgv_package_checks_check_definition_id_check_definitions_id_fk` FOREIGN KEY (`check_definition_id`) REFERENCES `check_definitions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bgv_package_profile_fields` ADD CONSTRAINT `bgv_package_profile_fields_package_id_bgv_packages_id_fk` FOREIGN KEY (`package_id`) REFERENCES `bgv_packages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_requirements` ADD CONSTRAINT `document_requirements_package_id_bgv_packages_id_fk` FOREIGN KEY (`package_id`) REFERENCES `bgv_packages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_requirements` ADD CONSTRAINT `document_requirements_category_id_document_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `document_categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_requirements` ADD CONSTRAINT `document_requirements_document_type_id_document_types_id_fk` FOREIGN KEY (`document_type_id`) REFERENCES `document_types`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_types` ADD CONSTRAINT `document_types_category_id_document_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `document_categories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bgv_cases` ADD CONSTRAINT `bgv_cases_profile_id_candidate_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `candidate_profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bgv_cases` ADD CONSTRAINT `bgv_cases_package_id_bgv_packages_id_fk` FOREIGN KEY (`package_id`) REFERENCES `bgv_packages`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bgv_cases` ADD CONSTRAINT `bgv_cases_assigned_verifier_id_users_id_fk` FOREIGN KEY (`assigned_verifier_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bgv_cases` ADD CONSTRAINT `bgv_cases_assigned_reviewer_id_users_id_fk` FOREIGN KEY (`assigned_reviewer_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bgv_submission_events` ADD CONSTRAINT `bgv_submission_events_case_id_bgv_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `bgv_cases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bgv_submission_events` ADD CONSTRAINT `bgv_submission_events_submitted_by_users_id_fk` FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `case_assignments` ADD CONSTRAINT `case_assignments_case_id_bgv_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `bgv_cases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `case_assignments` ADD CONSTRAINT `case_assignments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `case_assignments` ADD CONSTRAINT `case_assignments_assigned_by_users_id_fk` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `case_status_history` ADD CONSTRAINT `case_status_history_case_id_bgv_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `bgv_cases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `case_status_history` ADD CONSTRAINT `case_status_history_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_versions` ADD CONSTRAINT `document_versions_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_versions` ADD CONSTRAINT `document_versions_uploaded_by_users_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_case_id_bgv_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `bgv_cases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_profile_id_candidate_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `candidate_profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_requirement_id_document_requirements_id_fk` FOREIGN KEY (`requirement_id`) REFERENCES `document_requirements`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_document_type_id_document_types_id_fk` FOREIGN KEY (`document_type_id`) REFERENCES `document_types`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_assigned_verifier_id_users_id_fk` FOREIGN KEY (`assigned_verifier_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clarification_requests` ADD CONSTRAINT `clarification_requests_case_id_bgv_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `bgv_cases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clarification_requests` ADD CONSTRAINT `clarification_requests_check_id_verification_checks_id_fk` FOREIGN KEY (`check_id`) REFERENCES `verification_checks`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clarification_requests` ADD CONSTRAINT `clarification_requests_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clarification_requests` ADD CONSTRAINT `clarification_requests_requested_by_users_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clarification_requests` ADD CONSTRAINT `clarification_requests_closed_by_users_id_fk` FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clarification_responses` ADD CONSTRAINT `clarification_responses_responded_by_users_id_fk` FOREIGN KEY (`responded_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `clarification_responses` ADD CONSTRAINT `fk_clarif_response_clarification` FOREIGN KEY (`clarification_id`) REFERENCES `clarification_requests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `verification_check_results` ADD CONSTRAINT `verification_check_results_check_id_verification_checks_id_fk` FOREIGN KEY (`check_id`) REFERENCES `verification_checks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `verification_check_results` ADD CONSTRAINT `verification_check_results_recorded_by_users_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `verification_checks` ADD CONSTRAINT `verification_checks_case_id_bgv_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `bgv_cases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `verification_checks` ADD CONSTRAINT `verification_checks_check_definition_id_check_definitions_id_fk` FOREIGN KEY (`check_definition_id`) REFERENCES `check_definitions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `verification_checks` ADD CONSTRAINT `verification_checks_verifier_id_users_id_fk` FOREIGN KEY (`verifier_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bgv_scores` ADD CONSTRAINT `bgv_scores_case_id_bgv_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `bgv_cases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bgv_scores` ADD CONSTRAINT `bgv_scores_scoring_config_id_scoring_configurations_id_fk` FOREIGN KEY (`scoring_config_id`) REFERENCES `scoring_configurations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bgv_scores` ADD CONSTRAINT `bgv_scores_adjusted_by_users_id_fk` FOREIGN KEY (`adjusted_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bgv_scores` ADD CONSTRAINT `bgv_scores_generated_by_users_id_fk` FOREIGN KEY (`generated_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scoring_config_components` ADD CONSTRAINT `fk_scoring_component_config` FOREIGN KEY (`scoring_config_id`) REFERENCES `scoring_configurations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scoring_configurations` ADD CONSTRAINT `scoring_configurations_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approvals` ADD CONSTRAINT `approvals_case_id_bgv_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `bgv_cases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approvals` ADD CONSTRAINT `approvals_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consent_acceptances` ADD CONSTRAINT `consent_acceptances_consent_version_id_consent_versions_id_fk` FOREIGN KEY (`consent_version_id`) REFERENCES `consent_versions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consent_acceptances` ADD CONSTRAINT `consent_acceptances_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consent_acceptances` ADD CONSTRAINT `consent_acceptances_profile_id_candidate_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `candidate_profiles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consent_versions` ADD CONSTRAINT `consent_versions_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_case_id_bgv_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `bgv_cases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_reviewer_id_users_id_fk` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_delivery_attempts` ADD CONSTRAINT `fk_delivery_attempt_notification` FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_template_id_notification_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `notification_templates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_recipient_user_id_users_id_fk` FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_case_id_bgv_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `bgv_cases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_events` ADD CONSTRAINT `audit_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_events` ADD CONSTRAINT `audit_events_case_id_bgv_cases_id_fk` FOREIGN KEY (`case_id`) REFERENCES `bgv_cases`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `system_config` ADD CONSTRAINT `system_config_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ix_auth_sessions_user` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_auth_sessions_family` ON `auth_sessions` (`family_id`);--> statement-breakpoint
CREATE INDEX `ix_auth_sessions_expires` ON `auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `ix_user_roles_role` ON `user_roles` (`role_code`);--> statement-breakpoint
CREATE INDEX `ix_users_active` ON `users` (`is_active`);--> statement-breakpoint
CREATE INDEX `ix_candidate_addresses_profile` ON `candidate_addresses` (`profile_id`);--> statement-breakpoint
CREATE INDEX `ix_candidate_education_profile` ON `candidate_education` (`profile_id`);--> statement-breakpoint
CREATE INDEX `ix_candidate_employments_profile` ON `candidate_employments` (`profile_id`);--> statement-breakpoint
CREATE INDEX `ix_candidate_profile_values_profile` ON `candidate_profile_values` (`profile_id`);--> statement-breakpoint
CREATE INDEX `ix_candidate_profiles_name` ON `candidate_profiles` (`full_name`);--> statement-breakpoint
CREATE INDEX `ix_document_requirements_package` ON `document_requirements` (`package_id`);--> statement-breakpoint
CREATE INDEX `ix_document_requirements_type` ON `document_requirements` (`document_type_id`);--> statement-breakpoint
CREATE INDEX `ix_document_types_category` ON `document_types` (`category_id`);--> statement-breakpoint
CREATE INDEX `ix_bgv_cases_profile` ON `bgv_cases` (`profile_id`);--> statement-breakpoint
CREATE INDEX `ix_bgv_cases_status` ON `bgv_cases` (`status`);--> statement-breakpoint
CREATE INDEX `ix_bgv_cases_verifier` ON `bgv_cases` (`assigned_verifier_id`);--> statement-breakpoint
CREATE INDEX `ix_bgv_cases_reviewer` ON `bgv_cases` (`assigned_reviewer_id`);--> statement-breakpoint
CREATE INDEX `ix_bgv_cases_submitted_at` ON `bgv_cases` (`submitted_at`);--> statement-breakpoint
CREATE INDEX `ix_bgv_cases_queue` ON `bgv_cases` (`status`,`assigned_verifier_id`);--> statement-breakpoint
CREATE INDEX `ix_case_assignments_case` ON `case_assignments` (`case_id`);--> statement-breakpoint
CREATE INDEX `ix_case_assignments_user` ON `case_assignments` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_case_status_history_case` ON `case_status_history` (`case_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_document_versions_document` ON `document_versions` (`document_id`);--> statement-breakpoint
CREATE INDEX `ix_document_versions_uploaded_by` ON `document_versions` (`uploaded_by`);--> statement-breakpoint
CREATE INDEX `ix_documents_case` ON `documents` (`case_id`);--> statement-breakpoint
CREATE INDEX `ix_documents_status` ON `documents` (`status`);--> statement-breakpoint
CREATE INDEX `ix_documents_verifier` ON `documents` (`assigned_verifier_id`);--> statement-breakpoint
CREATE INDEX `ix_clarification_requests_case` ON `clarification_requests` (`case_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_clarification_requests_due` ON `clarification_requests` (`due_date`);--> statement-breakpoint
CREATE INDEX `ix_clarification_responses_clarification` ON `clarification_responses` (`clarification_id`);--> statement-breakpoint
CREATE INDEX `ix_verification_check_results_check` ON `verification_check_results` (`check_id`);--> statement-breakpoint
CREATE INDEX `ix_verification_checks_status` ON `verification_checks` (`status`);--> statement-breakpoint
CREATE INDEX `ix_verification_checks_verifier` ON `verification_checks` (`verifier_id`);--> statement-breakpoint
CREATE INDEX `ix_bgv_scores_case` ON `bgv_scores` (`case_id`,`generated_at`);--> statement-breakpoint
CREATE INDEX `ix_bgv_scores_config_version` ON `bgv_scores` (`scoring_config_version`);--> statement-breakpoint
CREATE INDEX `ix_scoring_config_components_config` ON `scoring_config_components` (`scoring_config_id`);--> statement-breakpoint
CREATE INDEX `ix_approvals_case` ON `approvals` (`case_id`);--> statement-breakpoint
CREATE INDEX `ix_consent_acceptances_profile` ON `consent_acceptances` (`profile_id`);--> statement-breakpoint
CREATE INDEX `ix_consent_acceptances_version` ON `consent_acceptances` (`consent_version_id`);--> statement-breakpoint
CREATE INDEX `ix_reviews_reviewer` ON `reviews` (`reviewer_id`);--> statement-breakpoint
CREATE INDEX `ix_notification_attempts_notification` ON `notification_delivery_attempts` (`notification_id`);--> statement-breakpoint
CREATE INDEX `ix_notifications_recipient` ON `notifications` (`recipient_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_notifications_case` ON `notifications` (`case_id`);--> statement-breakpoint
CREATE INDEX `ix_notifications_status` ON `notifications` (`delivery_status`);--> statement-breakpoint
CREATE INDEX `ix_audit_events_action` ON `audit_events` (`action`);--> statement-breakpoint
CREATE INDEX `ix_audit_events_actor` ON `audit_events` (`actor_id`);--> statement-breakpoint
CREATE INDEX `ix_audit_events_entity` ON `audit_events` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `ix_audit_events_case` ON `audit_events` (`case_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_audit_events_candidate` ON `audit_events` (`candidate_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_audit_events_created` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `ix_system_config_category` ON `system_config` (`category`);