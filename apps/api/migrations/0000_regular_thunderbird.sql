CREATE TABLE `routine_days` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`label` text NOT NULL,
	`order_index` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routine_days_routine_id_order_index_unique` ON `routine_days` (`routine_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `routine_exercise_muscles` (
	`routine_exercise_id` text NOT NULL,
	`muscle_group` text NOT NULL,
	PRIMARY KEY(`routine_exercise_id`, `muscle_group`)
);
--> statement-breakpoint
CREATE TABLE `routine_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_day_id` text NOT NULL,
	`name` text NOT NULL,
	`target_sets` integer NOT NULL,
	`target_rep_min` integer NOT NULL,
	`target_rep_max` integer NOT NULL,
	`order_index` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routine_exercises_routine_day_id_order_index_unique` ON `routine_exercises` (`routine_day_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`goal` text NOT NULL,
	`split_type` text NOT NULL,
	`days_per_week` integer NOT NULL,
	`created_at` text NOT NULL
);
