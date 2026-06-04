CREATE TABLE `coach_applications` (
	`idempotency_key` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`applied_at` text NOT NULL
);
