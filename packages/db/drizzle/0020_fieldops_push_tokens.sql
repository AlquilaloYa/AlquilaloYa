CREATE TABLE "fieldops_push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" varchar(20) DEFAULT 'android' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fieldops_push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fieldops_push_tokens_token_key" ON "fieldops_push_tokens" USING btree ("token");
--> statement-breakpoint
CREATE INDEX "fieldops_push_tokens_user_id_idx" ON "fieldops_push_tokens" USING btree ("user_id");
