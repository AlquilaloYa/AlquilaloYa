ALTER TABLE "servicios_extras" ADD COLUMN "voucher_filename" varchar(255);
--> statement-breakpoint
ALTER TABLE "servicios_extras" ADD COLUMN "voucher_storage_key" text;
--> statement-breakpoint
ALTER TABLE "servicios_extras" ADD COLUMN "voucher_mime_type" varchar(100);
--> statement-breakpoint
UPDATE "servicios_extras"
SET "fecha_pago" = "fecha_opcion"
WHERE "incluye_internet" = true;
