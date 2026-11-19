CREATE TABLE "game_statistics" (
	"player_id" uuid,
	"game_id" uuid,
	"played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "game_statistics_pkey" PRIMARY KEY("player_id","game_id"),
	CONSTRAINT "game_statistics_played_is_sum" CHECK ("played" = "wins" + "losses" + "draws"),
	CONSTRAINT "game_statistics_counts_not_negative" CHECK ("wins" >= 0 and "losses" >= 0 and "draws" >= 0)
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_unique" ON "password_reset_tokens" ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" ("user_id");--> statement-breakpoint
ALTER TABLE "game_statistics" ADD CONSTRAINT "game_statistics_player_id_players_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id");--> statement-breakpoint
ALTER TABLE "game_statistics" ADD CONSTRAINT "game_statistics_game_id_games_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id");--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
-- Relleno de las estadísticas con las partidas terminadas antes de esta
-- migración (ADR-014, decisión K4; ADR-017, U8). Desde aquí, el final de
-- partida las pone al día en su misma transacción. Una partida anulada no
-- tiene resultado, así que no cuenta (regla 7.20).
INSERT INTO "game_statistics" ("player_id", "game_id", "played", "wins", "losses", "draws", "updated_at")
SELECT
	"player_results"."player_id",
	"game_versions"."game_id",
	count(*)::integer,
	(count(*) FILTER (WHERE "player_results"."outcome" = 'WIN'))::integer,
	(count(*) FILTER (WHERE "player_results"."outcome" = 'LOSS'))::integer,
	(count(*) FILTER (WHERE "player_results"."outcome" = 'DRAW'))::integer,
	now()
FROM "player_results"
JOIN "matches" ON "matches"."id" = "player_results"."match_id"
JOIN "game_versions" ON "game_versions"."id" = "matches"."game_version_id"
WHERE "matches"."status" = 'FINISHED'
GROUP BY "player_results"."player_id", "game_versions"."game_id";
