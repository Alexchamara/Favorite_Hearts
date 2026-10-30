CREATE TABLE "rate_limit_counter" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"hits" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retained_identity" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_hash" text,
	"phone_hash" text,
	"profile_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_after" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_deletion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_deletion_bucket" CHECK ("storage_deletion"."bucket" in ('private', 'derived'))
);
--> statement-breakpoint
ALTER TABLE "member_account" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "retained_identity" ADD CONSTRAINT "retained_identity_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "retained_identity_email_idx" ON "retained_identity" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "retained_identity_phone_idx" ON "retained_identity" USING btree ("phone_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_deletion_object_idx" ON "storage_deletion" USING btree ("bucket","object_key");--> statement-breakpoint
ALTER TABLE "member_account" ADD CONSTRAINT "member_account_deleted_at" CHECK (("member_account"."status" = 'deleted') = ("member_account"."deleted_at" is not null));--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_deleted_at" CHECK (("profile"."status" = 'deleted') = ("profile"."deleted_at" is not null));