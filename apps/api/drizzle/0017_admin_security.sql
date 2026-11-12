CREATE TABLE "auth_passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"aaguid" text,
	CONSTRAINT "auth_passkey_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "audit_tombstone" (
	"seq" bigint PRIMARY KEY NOT NULL,
	"row_hash" text,
	"purged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_device" (
	"user_id" text NOT NULL,
	"device_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "staff_invite_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "notification_outbox" ALTER COLUMN "recipient_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "realm" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "amr" text;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "step_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_session" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "audit_event" ADD COLUMN "row_hash" text;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "recipient_address" text;--> statement-breakpoint
ALTER TABLE "auth_passkey" ADD CONSTRAINT "auth_passkey_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_device" ADD CONSTRAINT "staff_device_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invite" ADD CONSTRAINT "staff_invite_invited_by_user_id_auth_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_passkey_user_idx" ON "auth_passkey" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_device_user_device_idx" ON "staff_device" USING btree ("user_id","device_hash");--> statement-breakpoint
CREATE INDEX "staff_invite_email_idx" ON "staff_invite" USING btree ("email");--> statement-breakpoint
CREATE INDEX "audit_event_actor_idx" ON "audit_event" USING btree ("actor_user_id","created_at");--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_one_recipient" CHECK (("notification_outbox"."recipient_user_id" IS NULL) <> ("notification_outbox"."recipient_address" IS NULL));