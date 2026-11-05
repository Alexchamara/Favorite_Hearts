CREATE TYPE "public"."document_side" AS ENUM('front', 'back', 'selfie');--> statement-breakpoint
ALTER TYPE "public"."operations_flag_key" ADD VALUE 'selfie_required';--> statement-breakpoint
CREATE TABLE "verification_draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"side" "document_side" NOT NULL,
	"object_key" text NOT NULL,
	"via" text DEFAULT 'device' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_draft_via" CHECK ("verification_draft"."via" in ('device', 'phone'))
);
--> statement-breakpoint
CREATE TABLE "verification_upload_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "verification_case" DROP CONSTRAINT "verification_case_purged_evidence";--> statement-breakpoint
ALTER TABLE "verification_case" ADD COLUMN "evidence_back_key" text;--> statement-breakpoint
ALTER TABLE "verification_case" ADD COLUMN "selfie_key" text;--> statement-breakpoint
ALTER TABLE "verification_draft" ADD CONSTRAINT "verification_draft_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_upload_link" ADD CONSTRAINT "verification_upload_link_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "verification_draft_side_idx" ON "verification_draft" USING btree ("user_id","side");--> statement-breakpoint
CREATE INDEX "verification_draft_expiry_idx" ON "verification_draft" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_upload_link_token_idx" ON "verification_upload_link" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "verification_upload_link_user_idx" ON "verification_upload_link" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "verification_case" ADD CONSTRAINT "verification_case_purged_evidence" CHECK ("verification_case"."purged_at" is null or ("verification_case"."evidence_key" is null and "verification_case"."evidence_back_key" is null and "verification_case"."selfie_key" is null));