CREATE TABLE IF NOT EXISTS "inventario_catalogo" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "categoria" varchar(50) NOT NULL,
  "etiqueta" varchar(255) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventario_catalogo_categoria_etiqueta_unique" UNIQUE ("categoria", "etiqueta")
);