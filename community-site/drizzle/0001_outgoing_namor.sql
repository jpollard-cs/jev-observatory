CREATE TABLE `execution_accounts` (
	`owner` text PRIMARY KEY NOT NULL,
	`maximum_nano` integer NOT NULL,
	`prior_nano` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `execution_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`plan_hash` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`object_key` text NOT NULL,
	`prepared_hash` text NOT NULL,
	`requests` integer NOT NULL,
	`reserve_nano` integer NOT NULL,
	`known_nano` integer DEFAULT 0 NOT NULL,
	`held_nano` integer DEFAULT 0 NOT NULL,
	`next_index` integer DEFAULT 0 NOT NULL,
	`inflight` integer,
	`inflight_reserve` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `execution_owner_created` ON `execution_runs` (`owner`,`created_at`);