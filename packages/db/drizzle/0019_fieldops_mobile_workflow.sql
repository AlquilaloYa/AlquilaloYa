ALTER TABLE "work_orders"
	ADD COLUMN "cause" text DEFAULT '' NOT NULL,
	ADD COLUMN "observations" text DEFAULT '' NOT NULL,
	ADD COLUMN "materials_confirmed" boolean DEFAULT false NOT NULL,
	ADD COLUMN "can_resolve_today" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "work_order_visits"
	ADD COLUMN "note" text DEFAULT '' NOT NULL,
	ADD COLUMN "is_customer_appointment" boolean DEFAULT false NOT NULL,
	ADD COLUMN "customer_name" varchar(255) DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "work_order_attachments"
	ADD COLUMN "kind" varchar(40) DEFAULT 'EVIDENCIA' NOT NULL,
	ADD COLUMN "description" text DEFAULT '' NOT NULL;
