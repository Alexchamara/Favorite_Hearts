CREATE TYPE "public"."currency" AS ENUM('LKR', 'USD');--> statement-breakpoint
CREATE TYPE "public"."entitlement_kind" AS ENUM('grant', 'replace', 'forfeit', 'refund', 'revoke');--> statement-breakpoint
CREATE TYPE "public"."payment_channel" AS ENUM('lkr_bank_transfer', 'usd_swift', 'wise', 'paypal');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('awaiting_proof', 'pending_review', 'approved', 'rejected', 'held', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."plan_tier" AS ENUM('starter', 'premium');--> statement-breakpoint
CREATE TYPE "public"."refund_reason" AS ENUM('duplicate_payment', 'mistaken_payment', 'our_failure');--> statement-breakpoint
CREATE TYPE "public"."residence_band" AS ENUM('local', 'diaspora');--> statement-breakpoint
CREATE TYPE "public"."connection_end_reason" AS ENUM('withdrawn', 'blocked', 'candidate_takedown', 'account_deleted', 'moderation');--> statement-breakpoint
CREATE TYPE "public"."disclosure_action" AS ENUM('shared', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."interest_status" AS ENUM('pending', 'accepted', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."report_category" AS ENUM('explicit_content', 'minor_safety', 'threat', 'scam', 'harassment', 'false_identity', 'consent_concern', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'upheld', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."children_plan" AS ENUM('would_like', 'do_not_want', 'open_to_discussing');--> statement-breakpoint
CREATE TYPE "public"."community_openness" AS ENUM('open_to_any', 'prefer_shared', 'open_to_discussing');--> statement-breakpoint
CREATE TYPE "public"."contact_kind" AS ENUM('phone', 'email', 'social');--> statement-breakpoint
CREATE TYPE "public"."contact_person" AS ENUM('candidate', 'manager');--> statement-breakpoint
CREATE TYPE "public"."diet" AS ENUM('vegetarian', 'non_vegetarian', 'vegan', 'pescatarian');--> statement-breakpoint
CREATE TYPE "public"."family_involvement" AS ENUM('candidate_led', 'family_involved', 'decide_together');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('man', 'woman');--> statement-breakpoint
CREATE TYPE "public"."habit_frequency" AS ENUM('never', 'occasionally', 'regularly');--> statement-breakpoint
CREATE TYPE "public"."horoscope_importance" AS ENUM('essential', 'preferred_but_open', 'family_prefers', 'not_important', 'prefer_not_to_say');--> statement-breakpoint
CREATE TYPE "public"."income_range" AS ENUM('prefer_not_to_say', 'no_personal_income', 'below_50k', 'from_50k_to_99k', 'from_100k_to_199k', 'from_200k_to_349k', 'from_350k_to_499k', 'from_500k_to_999k', 'from_1m');--> statement-breakpoint
CREATE TYPE "public"."invitation_channel" AS ENUM('email', 'phone');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'si');--> statement-breakpoint
CREATE TYPE "public"."manager_relationship" AS ENUM('mother', 'father', 'guardian', 'family_member', 'authorized_person');--> statement-breakpoint
CREATE TYPE "public"."manager_revoke_reason" AS ENUM('candidate_removed', 'candidate_declined', 'manager_left', 'owner_action');--> statement-breakpoint
CREATE TYPE "public"."marital_status" AS ENUM('never_married', 'divorced', 'widowed', 'separated');--> statement-breakpoint
CREATE TYPE "public"."photo_moderation_status" AS ENUM('visible', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."profile_management" AS ENUM('self', 'manager');--> statement-breakpoint
CREATE TYPE "public"."profile_status" AS ENUM('draft', 'published', 'paused', 'engaged_or_married', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."religion" AS ENUM('buddhist', 'hindu', 'christian', 'muslim', 'sikh', 'jain', 'other', 'prefer_not_to_say');--> statement-breakpoint
CREATE TYPE "public"."relocation_preference" AS ENUM('open_to_relocating', 'prefer_to_stay', 'open_to_discussing');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'x', 'website');--> statement-breakpoint
CREATE TYPE "public"."timeline" AS ENUM('ready', 'within_1_2_years', 'within_2_3_years', 'open_to_discussing');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."operations_flag_key" AS ENUM('signups_paused', 'document_submissions_paused');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('nic', 'passport', 'driving_licence');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "entitlement_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "entitlement_event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"profile_id" uuid,
	"kind" "entitlement_kind" NOT NULL,
	"plan_id" text,
	"payment_submission_id" uuid,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"daily_request_cap" smallint,
	"monthly_request_cap" smallint,
	"actor_user_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_event_grant_period" CHECK ("entitlement_event"."kind" not in ('grant', 'replace') or ("entitlement_event"."plan_id" is not null and "entitlement_event"."starts_at" is not null and "entitlement_event"."ends_at" > "entitlement_event"."starts_at"))
);
--> statement-breakpoint
CREATE TABLE "payment_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid,
	"payer_user_id" text,
	"price_version_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"currency" "currency" NOT NULL,
	"amount_minor" integer NOT NULL,
	"reference" text NOT NULL,
	"channel" "payment_channel" NOT NULL,
	"declared_residence_country" varchar(2),
	"proof_key" text,
	"status" "payment_status" DEFAULT 'awaiting_proof' NOT NULL,
	"settlement_ref" text,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"decision_note" text,
	"refund_reason" "refund_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_submission_reference_unique" UNIQUE("reference"),
	CONSTRAINT "payment_submission_settlement_ref_unique" UNIQUE("settlement_ref"),
	CONSTRAINT "payment_submission_amount_positive" CHECK ("payment_submission"."amount_minor" > 0),
	CONSTRAINT "payment_submission_proof_before_review" CHECK ("payment_submission"."status" <> 'pending_review' or "payment_submission"."proof_key" is not null),
	CONSTRAINT "payment_submission_approval_evidence" CHECK ("payment_submission"."status" not in ('approved', 'refunded') or ("payment_submission"."settlement_ref" is not null and "payment_submission"."reviewed_at" is not null)),
	CONSTRAINT "payment_submission_refund_reason" CHECK (("payment_submission"."status" = 'refunded') = ("payment_submission"."refund_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" text PRIMARY KEY NOT NULL,
	"tier" "plan_tier" NOT NULL,
	"term_months" smallint NOT NULL,
	"daily_request_cap" smallint NOT NULL,
	"monthly_request_cap" smallint,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_term_positive" CHECK ("plan"."term_months" > 0),
	CONSTRAINT "plan_caps_positive" CHECK ("plan"."daily_request_cap" > 0 and ("plan"."monthly_request_cap" is null or "plan"."monthly_request_cap" > 0))
);
--> statement-breakpoint
CREATE TABLE "price_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" text NOT NULL,
	"residence_band" "residence_band" NOT NULL,
	"currency" "currency" NOT NULL,
	"amount_minor" integer NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_version_amount_positive" CHECK ("price_version"."amount_minor" > 0),
	CONSTRAINT "price_version_band_currency" CHECK (("price_version"."residence_band" = 'local' and "price_version"."currency" = 'LKR') or ("price_version"."residence_band" = 'diaspora' and "price_version"."currency" = 'USD')),
	CONSTRAINT "price_version_dates" CHECK ("price_version"."effective_to" is null or "price_version"."effective_to" > "price_version"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_profile_id" uuid,
	"blocked_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "block_not_self" CHECK ("block"."blocker_profile_id" <> "block"."blocked_profile_id")
);
--> statement-breakpoint
CREATE TABLE "connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interest_id" uuid NOT NULL,
	"profile_low" uuid NOT NULL,
	"profile_high" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by_user_id" text,
	"end_reason" "connection_end_reason",
	CONSTRAINT "connection_interest_id_unique" UNIQUE("interest_id"),
	CONSTRAINT "connection_ordered_pair" CHECK ("connection"."profile_low" < "connection"."profile_high"),
	CONSTRAINT "connection_end_reason" CHECK (("connection"."ended_at" is null) = ("connection"."end_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "disclosure_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_profile_id" uuid,
	"recipient_profile_id" uuid,
	"connection_id" uuid,
	"actor_user_id" text,
	"action" "disclosure_action" NOT NULL,
	"field_categories" text[] NOT NULL,
	"policy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_profile_id" uuid NOT NULL,
	"receiver_profile_id" uuid NOT NULL,
	"sender_user_id" text,
	"pair_low" uuid GENERATED ALWAYS AS (least(sender_profile_id, receiver_profile_id)) STORED,
	"pair_high" uuid GENERATED ALWAYS AS (greatest(sender_profile_id, receiver_profile_id)) STORED,
	"status" "interest_status" DEFAULT 'pending' NOT NULL,
	"share_consent_version" text NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "interest_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "interest_not_self" CHECK ("interest"."sender_profile_id" <> "interest"."receiver_profile_id")
);
--> statement-breakpoint
CREATE TABLE "quota_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"interest_id" uuid NOT NULL,
	"charged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quota_ledger_interest_id_unique" UNIQUE("interest_id")
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" text,
	"reporter_profile_id" uuid,
	"target_profile_id" uuid,
	"target_photo_id" uuid,
	"category" "report_category" NOT NULL,
	"detail" text,
	"reporter_verified" boolean DEFAULT false NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"staff_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_detail_length" CHECK (char_length("report"."detail") <= 1000),
	CONSTRAINT "report_staff_note_length" CHECK (char_length("report"."staff_note") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "shortlist" (
	"owner_profile_id" uuid NOT NULL,
	"target_profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shortlist_owner_profile_id_target_profile_id_pk" PRIMARY KEY("owner_profile_id","target_profile_id"),
	CONSTRAINT "shortlist_not_self" CHECK ("shortlist"."owner_profile_id" <> "shortlist"."target_profile_id")
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"issued_by_user_id" text,
	"channel" "invitation_channel" NOT NULL,
	"contact" text NOT NULL,
	"token_hash" text NOT NULL,
	"code_hash" text,
	"code_attempts" smallint DEFAULT 0 NOT NULL,
	"resend_number" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_by_user_id" text,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitation_valid_24_hours" CHECK ("invitation"."expires_at" > "invitation"."created_at" and "invitation"."expires_at" <= "invitation"."created_at" + interval '24 hours'),
	CONSTRAINT "invitation_single_outcome" CHECK ("invitation"."consumed_at" is null or "invitation"."superseded_at" is null)
);
--> statement-breakpoint
CREATE TABLE "member_account" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"residence_country" varchar(2),
	"max_managed_profiles" smallint DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_account_residence_country_iso" CHECK ("member_account"."residence_country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "member_account_max_managed_positive" CHECK ("member_account"."max_managed_profiles" >= 1)
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"slot" smallint NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"blurred_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"moderation_status" "photo_moderation_status" DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_slot_range" CHECK ("photo"."slot" between 0 and 4)
);
--> statement-breakpoint
CREATE TABLE "photo_original" (
	"photo_id" uuid PRIMARY KEY NOT NULL,
	"object_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"person" "contact_person" NOT NULL,
	"kind" "contact_kind" NOT NULL,
	"platform" "social_platform",
	"value" text NOT NULL,
	"verified_at" timestamp with time zone,
	"share_with_connections" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_contact_platform_for_social" CHECK (("private_contact"."kind" = 'social') = ("private_contact"."platform" is not null)),
	CONSTRAINT "private_contact_value_length" CHECK (char_length("private_contact"."value") between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"management" "profile_management" NOT NULL,
	"created_by_user_id" text,
	"candidate_user_id" text,
	"status" "profile_status" DEFAULT 'draft' NOT NULL,
	"display_name" text,
	"gender" "gender",
	"birth_date" date,
	"country_code" varchar(2),
	"region" text,
	"city" text,
	"occupation" text,
	"education" text,
	"height_cm" smallint,
	"marital_status" "marital_status",
	"religion" "religion" DEFAULT 'prefer_not_to_say' NOT NULL,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"mother_tongue" text,
	"bio" text,
	"family_story" text,
	"values" text[] DEFAULT '{}'::text[] NOT NULL,
	"hobbies" text[] DEFAULT '{}'::text[] NOT NULL,
	"timeline" timeline DEFAULT 'within_1_2_years' NOT NULL,
	"relocation" "relocation_preference" DEFAULT 'open_to_discussing' NOT NULL,
	"mother_name" text,
	"mother_occupation" text,
	"father_name" text,
	"father_occupation" text,
	"sisters" text[] DEFAULT '{}'::text[] NOT NULL,
	"brothers" text[] DEFAULT '{}'::text[] NOT NULL,
	"income_range" "income_range" DEFAULT 'prefer_not_to_say' NOT NULL,
	"caste" text,
	"caste_consented_at" timestamp with time zone,
	"community_openness" "community_openness",
	"diet" "diet",
	"smoking" "habit_frequency",
	"drinking" "habit_frequency",
	"children_plan" "children_plan",
	"family_involvement" "family_involvement",
	"horoscope_importance" "horoscope_importance" DEFAULT 'prefer_not_to_say' NOT NULL,
	"cover_public" boolean DEFAULT false NOT NULL,
	"adult_declared_at" timestamp with time zone,
	"first_published_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_display_name_length" CHECK (char_length("profile"."display_name") between 2 and 60),
	CONSTRAINT "profile_country_code_iso" CHECK ("profile"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "profile_region_length" CHECK (char_length("profile"."region") <= 80),
	CONSTRAINT "profile_city_length" CHECK (char_length("profile"."city") between 1 and 80),
	CONSTRAINT "profile_occupation_length" CHECK (char_length("profile"."occupation") between 1 and 100),
	CONSTRAINT "profile_education_length" CHECK (char_length("profile"."education") between 1 and 200),
	CONSTRAINT "profile_height_range" CHECK ("profile"."height_cm" between 100 and 230),
	CONSTRAINT "profile_bio_length" CHECK (char_length("profile"."bio") between 20 and 600),
	CONSTRAINT "profile_family_story_length" CHECK (char_length("profile"."family_story") <= 600),
	CONSTRAINT "profile_mother_tongue_length" CHECK (char_length("profile"."mother_tongue") <= 80),
	CONSTRAINT "profile_values_count" CHECK (cardinality("profile"."values") <= 5),
	CONSTRAINT "profile_hobbies_count" CHECK (cardinality("profile"."hobbies") <= 6),
	CONSTRAINT "profile_siblings_count" CHECK (cardinality("profile"."sisters") <= 12 and cardinality("profile"."brothers") <= 12),
	CONSTRAINT "profile_family_names_length" CHECK (char_length("profile"."mother_name") <= 80 and char_length("profile"."father_name") <= 80 and char_length("profile"."mother_occupation") <= 100 and char_length("profile"."father_occupation") <= 100),
	CONSTRAINT "profile_caste_length" CHECK (char_length("profile"."caste") between 1 and 80),
	CONSTRAINT "profile_caste_needs_consent" CHECK ("profile"."caste" is null or "profile"."caste_consented_at" is not null),
	CONSTRAINT "profile_published_complete" CHECK ("profile"."status" <> 'published' or ("profile"."display_name" is not null and "profile"."gender" is not null and "profile"."birth_date" is not null and "profile"."country_code" is not null and "profile"."city" is not null and "profile"."occupation" is not null and "profile"."education" is not null and "profile"."height_cm" is not null and "profile"."marital_status" is not null and "profile"."bio" is not null and "profile"."adult_declared_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "profile_manager" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"manager_user_id" text NOT NULL,
	"relationship" "manager_relationship" NOT NULL,
	"authority_declared_at" timestamp with time zone NOT NULL,
	"can_edit" boolean DEFAULT true NOT NULL,
	"can_manage_interests" boolean DEFAULT true NOT NULL,
	"can_view_private_details" boolean DEFAULT true NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" "manager_revoke_reason",
	CONSTRAINT "profile_manager_revoke_reason" CHECK (("profile_manager"."revoked_at" is null) = ("profile_manager"."revoked_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "audit_event_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_user_id" text,
	"actor_role" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"reason" text,
	"correlation_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"template" text NOT NULL,
	"template_version" smallint DEFAULT 1 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "notification_outbox_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE "operations_flag" (
	"key" "operations_flag_key" PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"reason" text,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_user_id" text,
	"profile_id" uuid,
	"document_type" "document_type" NOT NULL,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"evidence_key" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"decision_reason" text,
	"purge_after" timestamp with time zone,
	"purged_at" timestamp with time zone,
	CONSTRAINT "verification_case_review_state" CHECK (("verification_case"."status" = 'pending') = ("verification_case"."reviewed_at" is null)),
	CONSTRAINT "verification_case_rejection_reason" CHECK ("verification_case"."status" <> 'rejected' or "verification_case"."decision_reason" is not null),
	CONSTRAINT "verification_case_purged_evidence" CHECK ("verification_case"."purged_at" is null or "verification_case"."evidence_key" is null)
);
--> statement-breakpoint
ALTER TABLE "entitlement_event" ADD CONSTRAINT "entitlement_event_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_event" ADD CONSTRAINT "entitlement_event_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_event" ADD CONSTRAINT "entitlement_event_payment_submission_id_payment_submission_id_fk" FOREIGN KEY ("payment_submission_id") REFERENCES "public"."payment_submission"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_event" ADD CONSTRAINT "entitlement_event_actor_user_id_auth_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_submission" ADD CONSTRAINT "payment_submission_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_submission" ADD CONSTRAINT "payment_submission_payer_user_id_auth_user_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_submission" ADD CONSTRAINT "payment_submission_price_version_id_price_version_id_fk" FOREIGN KEY ("price_version_id") REFERENCES "public"."price_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_submission" ADD CONSTRAINT "payment_submission_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_submission" ADD CONSTRAINT "payment_submission_reviewed_by_user_id_auth_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_version" ADD CONSTRAINT "price_version_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_version" ADD CONSTRAINT "price_version_created_by_user_id_auth_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block" ADD CONSTRAINT "block_blocker_profile_id_profile_id_fk" FOREIGN KEY ("blocker_profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block" ADD CONSTRAINT "block_blocked_profile_id_profile_id_fk" FOREIGN KEY ("blocked_profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_interest_id_interest_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_profile_low_profile_id_fk" FOREIGN KEY ("profile_low") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_profile_high_profile_id_fk" FOREIGN KEY ("profile_high") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_ended_by_user_id_auth_user_id_fk" FOREIGN KEY ("ended_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosure_event" ADD CONSTRAINT "disclosure_event_subject_profile_id_profile_id_fk" FOREIGN KEY ("subject_profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosure_event" ADD CONSTRAINT "disclosure_event_recipient_profile_id_profile_id_fk" FOREIGN KEY ("recipient_profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosure_event" ADD CONSTRAINT "disclosure_event_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest" ADD CONSTRAINT "interest_sender_profile_id_profile_id_fk" FOREIGN KEY ("sender_profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest" ADD CONSTRAINT "interest_receiver_profile_id_profile_id_fk" FOREIGN KEY ("receiver_profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest" ADD CONSTRAINT "interest_sender_user_id_auth_user_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_ledger" ADD CONSTRAINT "quota_ledger_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quota_ledger" ADD CONSTRAINT "quota_ledger_interest_id_interest_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_user_id_auth_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_profile_id_profile_id_fk" FOREIGN KEY ("reporter_profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_target_profile_id_profile_id_fk" FOREIGN KEY ("target_profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_target_photo_id_photo_id_fk" FOREIGN KEY ("target_photo_id") REFERENCES "public"."photo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reviewed_by_user_id_auth_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist" ADD CONSTRAINT "shortlist_owner_profile_id_profile_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist" ADD CONSTRAINT "shortlist_target_profile_id_profile_id_fk" FOREIGN KEY ("target_profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_issued_by_user_id_auth_user_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_consumed_by_user_id_auth_user_id_fk" FOREIGN KEY ("consumed_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_account" ADD CONSTRAINT "member_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_original" ADD CONSTRAINT "photo_original_photo_id_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_contact" ADD CONSTRAINT "private_contact_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_created_by_user_id_auth_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_candidate_user_id_auth_user_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_manager" ADD CONSTRAINT "profile_manager_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_manager" ADD CONSTRAINT "profile_manager_manager_user_id_auth_user_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_user_id_auth_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_flag" ADD CONSTRAINT "operations_flag_updated_by_user_id_auth_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_case" ADD CONSTRAINT "verification_case_subject_user_id_auth_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_case" ADD CONSTRAINT "verification_case_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_case" ADD CONSTRAINT "verification_case_reviewed_by_user_id_auth_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entitlement_event_profile_idx" ON "entitlement_event" USING btree ("profile_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "entitlement_event_one_grant_per_payment_idx" ON "entitlement_event" USING btree ("payment_submission_id") WHERE "entitlement_event"."kind" in ('grant', 'replace');--> statement-breakpoint
CREATE INDEX "payment_submission_profile_idx" ON "payment_submission" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "payment_submission_status_idx" ON "payment_submission" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "price_version_current_idx" ON "price_version" USING btree ("plan_id","residence_band") WHERE "price_version"."effective_to" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "block_one_active_idx" ON "block" USING btree ("blocker_profile_id","blocked_profile_id") WHERE "block"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "block_blocked_idx" ON "block" USING btree ("blocked_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_one_active_pair_idx" ON "connection" USING btree ("profile_low","profile_high") WHERE "connection"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "connection_high_idx" ON "connection" USING btree ("profile_high");--> statement-breakpoint
CREATE INDEX "disclosure_event_subject_idx" ON "disclosure_event" USING btree ("subject_profile_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "interest_one_pending_pair_idx" ON "interest" USING btree ("pair_low","pair_high") WHERE "interest"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "interest_receiver_idx" ON "interest" USING btree ("receiver_profile_id","status");--> statement-breakpoint
CREATE INDEX "interest_sender_idx" ON "interest" USING btree ("sender_profile_id","created_at");--> statement-breakpoint
CREATE INDEX "quota_ledger_profile_idx" ON "quota_ledger" USING btree ("profile_id","charged_at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_one_open_idx" ON "report" USING btree ("reporter_profile_id","target_profile_id","category") WHERE "report"."status" = 'open';--> statement-breakpoint
CREATE INDEX "report_target_idx" ON "report" USING btree ("target_profile_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_one_live_idx" ON "invitation" USING btree ("profile_id") WHERE "invitation"."consumed_at" is null and "invitation"."superseded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "photo_profile_slot_idx" ON "photo" USING btree ("profile_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_one_cover_idx" ON "photo" USING btree ("profile_id") WHERE "photo"."is_cover";--> statement-breakpoint
CREATE INDEX "private_contact_profile_idx" ON "private_contact" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "profile_candidate_user_idx" ON "profile" USING btree ("candidate_user_id");--> statement-breakpoint
CREATE INDEX "profile_status_idx" ON "profile" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_manager_one_active_idx" ON "profile_manager" USING btree ("profile_id") WHERE "profile_manager"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "profile_manager_active_manager_idx" ON "profile_manager" USING btree ("manager_user_id") WHERE "profile_manager"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "audit_event_entity_idx" ON "audit_event" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "notification_outbox_status_idx" ON "notification_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "verification_case_subject_idx" ON "verification_case" USING btree ("subject_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_case_one_pending_idx" ON "verification_case" USING btree ("subject_user_id") WHERE "verification_case"."status" = 'pending';