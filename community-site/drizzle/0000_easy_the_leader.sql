CREATE TABLE `community_results` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`author` text NOT NULL,
	`policy_name` text NOT NULL,
	`policy_hash` text NOT NULL,
	`title` text NOT NULL,
	`model` text NOT NULL,
	`suite_hash` text NOT NULL,
	`bundle_hash` text NOT NULL,
	`source_revision` text NOT NULL,
	`object_key` text NOT NULL,
	`bytes` integer NOT NULL,
	`total` integer NOT NULL,
	`completed` integer NOT NULL,
	`incomplete` integer NOT NULL,
	`exact_matches` integer NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `community_results_visibility_created` ON `community_results` (`visibility`,`created_at`);--> statement-breakpoint
CREATE INDEX `community_results_owner_created` ON `community_results` (`owner`,`created_at`);