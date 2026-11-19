CREATE TABLE "match_retirements" (
	"match_id" uuid,
	"sequence" integer,
	"player_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "match_retirements_pk" PRIMARY KEY("match_id","sequence"),
	CONSTRAINT "match_retirements_sequence_valid" CHECK ("sequence" >= 1),
	CONSTRAINT "match_retirements_reason_valid" CHECK ("reason" in ('TIMEOUT', 'RESIGNATION', 'ABANDONMENT'))
);
--> statement-breakpoint
-- Las opciones de cada partida (ADR-018, decisión Z1). Las partidas
-- anteriores reciben las de su sala, que no cambian desde que se crea; su
-- semilla queda nula, porque no se guardó.
ALTER TABLE "matches" ADD COLUMN "settings" jsonb;--> statement-breakpoint
UPDATE "matches" SET "settings" = "rooms"."settings" FROM "rooms" WHERE "rooms"."id" = "matches"."room_id";--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "settings" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "seed" text;--> statement-breakpoint
ALTER TABLE "match_retirements" ADD CONSTRAINT "match_retirements_match_id_matches_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id");--> statement-breakpoint
ALTER TABLE "match_retirements" ADD CONSTRAINT "match_retirements_match_player_fk" FOREIGN KEY ("match_id","player_id") REFERENCES "match_players"("match_id","player_id");--> statement-breakpoint
-- Las retiradas de las partidas anteriores (ADR-018, decisión Z2). Hasta
-- esta migración todos los juegos son de dos jugadores, así que una partida
-- terminada por tiempo, rendición o abandono tuvo exactamente una retirada,
-- la del asiento que perdió, y fue su último cambio de estado.
INSERT INTO "match_retirements" ("match_id", "sequence", "player_id", "reason", "created_at")
SELECT
	"match_results"."match_id",
	"game_sessions"."state_version",
	"player_results"."player_id",
	"match_results"."reason",
	"match_results"."created_at"
FROM "match_results"
JOIN "game_sessions" ON "game_sessions"."match_id" = "match_results"."match_id"
JOIN "player_results" ON "player_results"."match_id" = "match_results"."match_id"
	AND "player_results"."outcome" = 'LOSS'
WHERE "match_results"."reason" IN ('TIMEOUT', 'RESIGNATION', 'ABANDONMENT');
