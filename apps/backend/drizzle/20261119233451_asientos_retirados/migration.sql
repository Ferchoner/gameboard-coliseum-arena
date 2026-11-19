-- Asientos retirados de una partida que sigue sin ellos (ADR-020, decisión
-- DO18). Se rellenan desde las retiradas guardadas (ADR-018, Z2), con el
-- asiento de cada jugador. Hasta esta migración solo hay juegos de dos
-- jugadores, en los que toda retirada termina la partida, así que las
-- sesiones activas quedan vacías; las cerradas también, porque una sesión
-- cerrada ya no atiende órdenes.
ALTER TABLE "game_sessions" ADD COLUMN "retired_seats" smallint[];--> statement-breakpoint
UPDATE "game_sessions" SET "retired_seats" = CASE
	WHEN "game_sessions"."status" = 'ACTIVE' THEN COALESCE(
		(SELECT array_agg("match_players"."seat" ORDER BY "match_retirements"."sequence")
		 FROM "match_retirements"
		 JOIN "match_players"
		   ON "match_players"."match_id" = "match_retirements"."match_id"
		  AND "match_players"."player_id" = "match_retirements"."player_id"
		 WHERE "match_retirements"."match_id" = "game_sessions"."match_id"),
		'{}'::smallint[]
	)
	ELSE '{}'::smallint[]
END;--> statement-breakpoint
ALTER TABLE "game_sessions" ALTER COLUMN "retired_seats" SET NOT NULL;
