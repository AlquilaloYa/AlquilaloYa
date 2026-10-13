CREATE TABLE "work_order_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"material" varchar(255) NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" varchar(40) NOT NULL,
	"unit_cost" numeric(12, 2) NOT NULL,
	"total_cost" numeric(14, 2) NOT NULL,
	"observations" text DEFAULT '' NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_order_materials_quantity_check" CHECK ("quantity" > 0),
	CONSTRAINT "work_order_materials_unit_cost_check" CHECK ("unit_cost" >= 0),
	CONSTRAINT "work_order_materials_total_cost_check" CHECK ("total_cost" >= 0)
);
--> statement-breakpoint
ALTER TABLE "work_order_materials" ADD CONSTRAINT "work_order_materials_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_order_materials" ADD CONSTRAINT "work_order_materials_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "work_order_materials_order_idx" ON "work_order_materials" USING btree ("work_order_id", "created_at");
