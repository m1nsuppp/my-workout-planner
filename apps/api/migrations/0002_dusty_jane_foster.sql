CREATE TABLE `plan_exercise_muscles` (
	`plan_exercise_id` text NOT NULL,
	`muscle_group` text NOT NULL,
	PRIMARY KEY(`plan_exercise_id`, `muscle_group`)
);
--> statement-breakpoint
CREATE TABLE `plan_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`name` text NOT NULL,
	`note` text,
	`order_index` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_exercises_plan_id_order_index_unique` ON `plan_exercises` (`plan_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `planned_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`target_weight_kg` real NOT NULL,
	`target_reps` integer NOT NULL,
	`actual_weight_kg` real,
	`actual_reps` integer,
	`actual_rir` integer,
	`completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planned_sets_plan_exercise_id_order_index_unique` ON `planned_sets` (`plan_exercise_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`routine_id` text NOT NULL,
	`routine_day_id` text,
	`routine_day_label` text NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`overload_note` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plans_user_date` ON `plans` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_plans_day_lookup` ON `plans` (`routine_id`,`routine_day_id`,`status`,`date`);