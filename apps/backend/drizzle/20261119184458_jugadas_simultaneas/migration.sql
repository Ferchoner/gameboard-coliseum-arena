-- Desde qué versión está activo cada asiento (ADR-019, decisión X15). Hasta
-- esta migración ningún juego tiene jugadas simultáneas: cada sesión activa
-- tiene un solo asiento activo, que lo está desde su versión actual. Las
-- sesiones cerradas no tienen asientos activos.
ALTER TABLE "game_sessions" ADD COLUMN "active_since" jsonb;--> statement-breakpoint
UPDATE "game_sessions" SET "active_since" = COALESCE(
	(SELECT jsonb_object_agg("seat"::text, "game_sessions"."state_version") FROM unnest("game_sessions"."active_seats") AS "seat"),
	'{}'::jsonb
);--> statement-breakpoint
ALTER TABLE "game_sessions" ALTER COLUMN "active_since" SET NOT NULL;
