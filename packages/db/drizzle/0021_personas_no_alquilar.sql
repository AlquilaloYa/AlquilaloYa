CREATE TABLE IF NOT EXISTS "personas_no_alquilar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombres" varchar(255) NOT NULL,
	"documento_identidad" varchar(50) NOT NULL,
	"telefono" varchar(30),
	"foto_storage_key" text,
	"foto_mime_type" varchar(100),
	"creado_por" varchar(255),
	"eliminado_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "personas_no_alquilar_documento_idx" ON "personas_no_alquilar" USING btree ("documento_identidad");
