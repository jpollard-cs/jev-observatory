CREATE TABLE `write_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`hits` integer NOT NULL
);
