DROP INDEX "profile_candidate_user_idx";--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "code_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "code_sends" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "candidate_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "candidate_objection_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_one_per_candidate_idx" ON "profile" USING btree ("candidate_user_id") WHERE "profile"."candidate_user_id" is not null and "profile"."status" <> 'deleted';