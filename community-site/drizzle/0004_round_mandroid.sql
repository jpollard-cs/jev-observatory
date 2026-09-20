ALTER TABLE `community_results` ADD `evidence_kind` text DEFAULT 'legacy-upload' NOT NULL;--> statement-breakpoint
ALTER TABLE `community_results` ADD `source_run_id` text;
--> statement-breakpoint
UPDATE `community_results` SET `visibility` = 'private' WHERE `evidence_kind` = 'legacy-upload';
