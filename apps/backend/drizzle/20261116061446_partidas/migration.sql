CREATE TABLE "game_sessions" (
	"match_id" uuid PRIMARY KEY,
	"status" text NOT NULL,
	"state" jsonb NOT NULL,
	"state_version" integer NOT NULL,
	"active_seats" smallint[] NOT NULL,
	"clocks" jsonb NOT NULL,
	"turn_started_at" timestamp with time zone,
	"turn_deadline_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "game_sessions_status_valid" CHECK ("status" in ('ACTIVE', 'CLOSED')),
	CONSTRAINT "game_sessions_state_version_valid" CHECK ("state_version" >= 0),
	CONSTRAINT "game_sessions_active_has_deadline" CHECK ("status" <> 'ACTIVE' or ("turn_started_at" is not null and "turn_deadline_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "match_actions" (
	"match_id" uuid,
	"sequence" integer,
	"player_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"action" jsonb NOT NULL,
	"clock_remaining_ms" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "match_actions_pk" PRIMARY KEY("match_id","sequence"),
	CONSTRAINT "match_actions_sequence_valid" CHECK ("sequence" >= 1)
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"match_id" uuid,
	"player_id" uuid,
	"seat" smallint NOT NULL,
	CONSTRAINT "match_players_pk" PRIMARY KEY("match_id","player_id"),
	CONSTRAINT "match_players_seat_valid" CHECK ("seat" >= 0)
);
--> statement-breakpoint
CREATE TABLE "match_results" (
	"match_id" uuid PRIMARY KEY,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "match_results_reason_valid" CHECK ("reason" in ('COMPLETED', 'TIMEOUT', 'RESIGNATION', 'ABANDONMENT'))
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY,
	"room_id" uuid NOT NULL,
	"game_version_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"time_control" jsonb NOT NULL,
	"status" text NOT NULL,
	"abort_reason" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "matches_mode_valid" CHECK ("mode" in ('REALTIME', 'TURN_BASED')),
	CONSTRAINT "matches_status_valid" CHECK ("status" in ('IN_PROGRESS', 'FINISHED', 'ABORTED')),
	CONSTRAINT "matches_abort_reason_valid" CHECK ("abort_reason" in ('ADMIN', 'FAILURE')),
	CONSTRAINT "matches_abort_consistent" CHECK (("status" = 'ABORTED') = ("abort_reason" is not null)),
	CONSTRAINT "matches_ended_consistent" CHECK (("status" = 'IN_PROGRESS') = ("ended_at" is null))
);
--> statement-breakpoint
CREATE TABLE "player_results" (
	"match_id" uuid,
	"player_id" uuid,
	"outcome" text NOT NULL,
	"score" integer,
	CONSTRAINT "player_results_pk" PRIMARY KEY("match_id","player_id"),
	CONSTRAINT "player_results_outcome_valid" CHECK ("outcome" in ('WIN', 'LOSS', 'DRAW'))
);
--> statement-breakpoint
CREATE INDEX "game_sessions_active_deadline_idx" ON "game_sessions" ("turn_deadline_at") WHERE "status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "match_actions_request_unique" ON "match_actions" ("match_id","player_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_players_match_seat_unique" ON "match_players" ("match_id","seat");--> statement-breakpoint
CREATE INDEX "match_players_player_match_idx" ON "match_players" ("player_id","match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_room_in_progress_unique" ON "matches" ("room_id") WHERE "status" = 'IN_PROGRESS';--> statement-breakpoint
CREATE INDEX "matches_room_started_at_idx" ON "matches" ("room_id","started_at");--> statement-breakpoint
CREATE INDEX "player_results_player_id_idx" ON "player_results" ("player_id");--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_match_id_matches_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id");--> statement-breakpoint
ALTER TABLE "match_actions" ADD CONSTRAINT "match_actions_match_id_matches_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id");--> statement-breakpoint
ALTER TABLE "match_actions" ADD CONSTRAINT "match_actions_match_player_fk" FOREIGN KEY ("match_id","player_id") REFERENCES "match_players"("match_id","player_id");--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id");--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_player_id_players_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id");--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_match_id_matches_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_room_id_rooms_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_game_version_id_game_versions_id_fkey" FOREIGN KEY ("game_version_id") REFERENCES "game_versions"("id");--> statement-breakpoint
ALTER TABLE "player_results" ADD CONSTRAINT "player_results_match_id_match_results_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "match_results"("match_id");--> statement-breakpoint
ALTER TABLE "player_results" ADD CONSTRAINT "player_results_match_player_fk" FOREIGN KEY ("match_id","player_id") REFERENCES "match_players"("match_id","player_id");