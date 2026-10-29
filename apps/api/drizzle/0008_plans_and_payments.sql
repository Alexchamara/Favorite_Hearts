ALTER TYPE "public"."payment_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "payment_channel_setting" (
	"channel" "payment_channel" PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"instructions" text,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone,
	CONSTRAINT "payment_channel_setting_ready" CHECK (not "payment_channel_setting"."enabled" or char_length("payment_channel_setting"."instructions") >= 10),
	CONSTRAINT "payment_channel_setting_length" CHECK (char_length("payment_channel_setting"."instructions") <= 1500)
);
--> statement-breakpoint
CREATE TABLE "payment_proof" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"uploaded_by_user_id" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_submission" ADD COLUMN "plan_name" text;--> statement-breakpoint
ALTER TABLE "payment_submission" ADD COLUMN "plan_level" smallint;--> statement-breakpoint
ALTER TABLE "payment_submission" ADD COLUMN "term_months" smallint;--> statement-breakpoint
ALTER TABLE "payment_submission" ADD COLUMN "daily_request_cap" smallint;--> statement-breakpoint
ALTER TABLE "payment_submission" ADD COLUMN "monthly_request_cap" smallint;--> statement-breakpoint
ALTER TABLE "payment_submission" ADD COLUMN "change_kind" text;--> statement-breakpoint
ALTER TABLE "payment_submission" ADD COLUMN "lost_days_ack" smallint;--> statement-breakpoint
ALTER TABLE "payment_submission" ADD COLUMN "refund_terms_version" text;--> statement-breakpoint
ALTER TABLE "payment_submission" ADD COLUMN "proof_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_submission" ADD COLUMN "owner_note" text;--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "level" smallint;--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "sort_order" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Hand-added: name and rank the seeded plans (OWNER-DECISIONS section 2) before the columns become required.
UPDATE "plan" SET
  "name" = CASE "id" WHEN 'starter_1m' THEN 'Starter' WHEN 'premium_3m' THEN 'Premium 3 months'
                     WHEN 'premium_6m' THEN 'Premium 6 months' ELSE "id" END,
  "level" = CASE "id" WHEN 'premium_3m' THEN 2 WHEN 'premium_6m' THEN 3 ELSE 1 END,
  "sort_order" = CASE "id" WHEN 'premium_3m' THEN 2 WHEN 'premium_6m' THEN 3 ELSE 1 END;--> statement-breakpoint
ALTER TABLE "plan" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "plan" ALTER COLUMN "level" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_channel_setting" ADD CONSTRAINT "payment_channel_setting_updated_by_user_id_auth_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proof" ADD CONSTRAINT "payment_proof_payment_id_payment_submission_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proof" ADD CONSTRAINT "payment_proof_uploaded_by_user_id_auth_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_proof_payment_idx" ON "payment_proof" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_submission_one_open_idx" ON "payment_submission" USING btree ("profile_id") WHERE "payment_submission"."status" in ('awaiting_proof', 'pending_review', 'held');--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_name_length" CHECK (char_length("plan"."name") between 2 and 40);--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_level_range" CHECK ("plan"."level" between 1 and 99);