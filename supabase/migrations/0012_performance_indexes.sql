CREATE INDEX IF NOT EXISTS "activity_events_entity_timestamp_idx"
  ON "activity_events" USING btree ("entity_id", "timestamp");

CREATE INDEX IF NOT EXISTS "activity_events_user_timestamp_idx"
  ON "activity_events" USING btree ("user_id", "timestamp");

CREATE INDEX IF NOT EXISTS "activity_events_action_timestamp_idx"
  ON "activity_events" USING btree ("action", "timestamp");

CREATE INDEX IF NOT EXISTS "audit_events_accion_fecha_idx"
  ON "audit_events" USING btree ("accion", "fecha");

CREATE INDEX IF NOT EXISTS "audit_events_usuario_fecha_idx"
  ON "audit_events" USING btree ("usuario", "fecha");