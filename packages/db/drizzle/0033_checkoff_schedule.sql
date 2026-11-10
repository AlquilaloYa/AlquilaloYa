ALTER TABLE "tasks"
  ADD COLUMN "hora_ejecucion" varchar(5) NOT NULL DEFAULT '09:00',
  ADD COLUMN "repetir_cada_hora" boolean NOT NULL DEFAULT false;
