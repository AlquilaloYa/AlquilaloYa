CREATE TABLE "servicios_extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"cliente_id" uuid,
	"codigo_contrato" varchar(50),
	"tipo_servicio" varchar(50),
	"incluye_internet" boolean DEFAULT false NOT NULL,
	"incluye_carga_electrica" boolean DEFAULT false NOT NULL,
	"monto_internet" numeric(15, 2) DEFAULT '39.00' NOT NULL,
	"monto_carga_electrica" numeric(15, 2) DEFAULT '60.00' NOT NULL,
	"monto_total" numeric(15, 2),
	"fecha_opcion" date NOT NULL,
	"fecha_pago" date,
	"departamento_numero" varchar(100),
	"cliente_nombre" varchar(255),
	"cliente_documento" varchar(50),
	"estado" varchar(30) DEFAULT 'PENDIENTE' NOT NULL,
	"document_id" uuid,
	"filename" varchar(255),
	"storage_key" text,
	"sha256" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "servicios_extras" ADD CONSTRAINT "servicios_extras_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "servicios_extras" ADD CONSTRAINT "servicios_extras_cliente_id_clients_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "servicios_extras_contract_idx" ON "servicios_extras" USING btree ("contract_id");
--> statement-breakpoint
CREATE INDEX "servicios_extras_cliente_idx" ON "servicios_extras" USING btree ("cliente_id");
