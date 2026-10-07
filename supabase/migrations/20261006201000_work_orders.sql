CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"issue_type" varchar(80) NOT NULL,
	"priority" varchar(20) DEFAULT 'MEDIA' NOT NULL,
	"status" varchar(30) DEFAULT 'CREATED' NOT NULL,
	"location" text NOT NULL,
	"contact_name" varchar(255) DEFAULT '' NOT NULL,
	"site" varchar(20) NOT NULL,
	"department_id" uuid,
	"department_code" varchar(50) NOT NULL,
	"client_id" uuid,
	"assigned_employee_id" uuid,
	"target_at" timestamp with time zone,
	"diagnosis" text DEFAULT '' NOT NULL,
	"resolution" text DEFAULT '' NOT NULL,
	"estimated_cost" numeric(12, 2),
	"actual_cost" numeric(12, 2),
	"estimated_minutes" numeric(8, 0),
	"actual_minutes" numeric(8, 0),
	"created_by" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_orders_code_unique" UNIQUE("code"),
	CONSTRAINT "work_orders_priority_check" CHECK ("priority" IN ('BAJA', 'MEDIA', 'ALTA', 'URGENTE')),
	CONSTRAINT "work_orders_site_check" CHECK ("site" IN ('Angamos', 'Benavides')),
	CONSTRAINT "work_orders_status_check" CHECK ("status" IN ('CREATED', 'ASSIGNED', 'REASSIGNED', 'ACCEPTED', 'VISIT_SCHEDULED', 'ON_SITE', 'DIAGNOSIS', 'ESTIMATED', 'IN_PROGRESS', 'RESOLVED', 'PENDING_CLOSURE', 'COMPLETED', 'REJECTED', 'BLOCKED', 'CANCELLED', 'RESCHEDULED')),
	CONSTRAINT "work_orders_estimated_cost_check" CHECK ("estimated_cost" IS NULL OR "estimated_cost" >= 0),
	CONSTRAINT "work_orders_actual_cost_check" CHECK ("actual_cost" IS NULL OR "actual_cost" >= 0),
	CONSTRAINT "work_orders_estimated_minutes_check" CHECK ("estimated_minutes" IS NULL OR "estimated_minutes" >= 0),
	CONSTRAINT "work_orders_actual_minutes_check" CHECK ("actual_minutes" IS NULL OR "actual_minutes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_employee_id_hr_employees_id_fk" FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."hr_employees"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "work_order_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"assigned_by" uuid,
	"note" text DEFAULT '' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_employee_id_hr_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."hr_employees"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "work_order_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"visit_number" numeric(5, 0) NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"arrived_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"diagnosis" text DEFAULT '' NOT NULL,
	"resolution" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_order_visits_order_visit_unique" UNIQUE("work_order_id", "visit_number"),
	CONSTRAINT "work_order_visits_number_check" CHECK ("visit_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "work_order_visits" ADD CONSTRAINT "work_order_visits_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_order_visits" ADD CONSTRAINT "work_order_visits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "work_order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_name" varchar(255) NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"from_status" varchar(30),
	"to_status" varchar(30),
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_order_events" ADD CONSTRAINT "work_order_events_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_order_events" ADD CONSTRAINT "work_order_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "work_orders_status_idx" ON "work_orders" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "work_orders_priority_idx" ON "work_orders" USING btree ("priority");
--> statement-breakpoint
CREATE INDEX "work_orders_assignee_idx" ON "work_orders" USING btree ("assigned_employee_id");
--> statement-breakpoint
CREATE INDEX "work_orders_target_idx" ON "work_orders" USING btree ("target_at");
--> statement-breakpoint
CREATE INDEX "work_orders_created_idx" ON "work_orders" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "work_order_assignments_order_idx" ON "work_order_assignments" USING btree ("work_order_id");
--> statement-breakpoint
CREATE INDEX "work_order_assignments_employee_idx" ON "work_order_assignments" USING btree ("employee_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "work_order_assignments_active_order_idx" ON "work_order_assignments" USING btree ("work_order_id") WHERE "ended_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "work_order_visits_order_idx" ON "work_order_visits" USING btree ("work_order_id", "visit_number");
--> statement-breakpoint
CREATE INDEX "work_order_events_order_idx" ON "work_order_events" USING btree ("work_order_id", "created_at");
--> statement-breakpoint
CREATE TABLE "work_order_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(80) NOT NULL,
	"size_bytes" numeric(12, 0) NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_order_attachments_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "work_order_attachments_mime_type_check" CHECK ("mime_type" IN ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "work_order_attachments_size_bytes_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 8388608)
);
--> statement-breakpoint
ALTER TABLE "work_order_attachments" ADD CONSTRAINT "work_order_attachments_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_order_attachments" ADD CONSTRAINT "work_order_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "work_order_attachments_order_idx" ON "work_order_attachments" USING btree ("work_order_id", "created_at");
--> statement-breakpoint
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('work-order-evidence', 'work-order-evidence', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
