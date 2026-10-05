-- La función public.rls_auto_enable() es el helper que instala el event
-- trigger `ensure_rls` de Supabase: activa RLS automaticamente en cada
-- CREATE TABLE del schema public.
--
-- Es SECURITY DEFINER a proposito, porque necesita ser propietaria de la
-- tabla para poder hacer el ALTER TABLE ... ENABLE ROW LEVEL SECURITY. El
-- problema es otro: Postgres concede EXECUTE sobre las funciones del schema
-- public al rol PUBLIC, asi que `anon` y `authenticated` heredaban permiso
-- para invocarla por /rest/v1/rpc/rls_auto_enable.
--
-- Aqui no se toca el modo de seguridad (pasarla a SECURITY INVOKER haria
-- fallar el auto-activate de RLS en las tablas que cree el dashboard, que
-- no es propietario de las tablas). Se revoca el acceso y se deja acceso
-- explicito solo a los roles que administran el schema.
--
-- El permiso no venia solo de PUBLIC: los ALTER DEFAULT PRIVILEGES que
-- aplica Supabase en el schema public dan EXECUTE a anon, authenticated y
-- service_role en toda funcion nueva, asi que el revoke tiene que ser
-- explicito para esos roles. No se tocan los default privileges porque
-- afectarian a las funciones RPC publicas de la API.

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM service_role';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO postgres;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO supabase_admin';
  END IF;
END $$;
