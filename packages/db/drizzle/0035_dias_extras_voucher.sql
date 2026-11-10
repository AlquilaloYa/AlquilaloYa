ALTER TABLE "dias_extras" ADD COLUMN "voucher_filename" varchar(255);--> statement-breakpoint
ALTER TABLE "dias_extras" ADD COLUMN "voucher_storage_key" text;--> statement-breakpoint
ALTER TABLE "dias_extras" ADD COLUMN "voucher_mime_type" varchar(100);
