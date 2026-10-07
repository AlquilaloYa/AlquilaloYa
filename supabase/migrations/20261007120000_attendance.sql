-- Cronograma de asistencia: una fila por jornada del trabajador.
CREATE TABLE IF NOT EXISTS "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"dni" varchar(30) NOT NULL,
	"entrada_at" timestamp with time zone,
	"refrigerio_inicio_at" timestamp with time zone,
	"refrigerio_fin_at" timestamp with time zone,
	"salida_at" timestamp with time zone,
	"asistio" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "attendance_dni_idx" ON "attendance" ("dni");
CREATE INDEX IF NOT EXISTS "attendance_created_idx" ON "attendance" ("created_at");