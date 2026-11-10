CREATE TABLE "dias_extras" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contract_id" uuid NOT NULL REFERENCES "contracts"("id") ON DELETE CASCADE,
  "dias" integer NOT NULL,
  "monto" numeric(15, 2) NOT NULL,
  "fecha_fin_periodo" date NOT NULL,
  "estado" varchar(20) DEFAULT 'PENDIENTE' NOT NULL,
  "fecha_pago" date,
  "creado_por" varchar(255) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "dias_extras_dias_limit_check" CHECK ("dias" BETWEEN 1 AND 7),
  CONSTRAINT "dias_extras_monto_check" CHECK ("monto" = "dias" * 100)
);
--> statement-breakpoint
CREATE INDEX "dias_extras_contract_periodo_idx"
  ON "dias_extras" USING btree ("contract_id", "fecha_fin_periodo");
--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_contract_checkinout_unique"
  ON "tasks" USING btree ("origen_contrato_id", "origen_evento")
  WHERE "origen_contrato_id" IS NOT NULL
    AND "origen_evento" IN ('CHECKIN', 'CHECKOFF');
