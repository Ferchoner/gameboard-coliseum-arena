CREATE TABLE "room_players" (
	"room_id" uuid,
	"player_id" uuid,
	"is_ready" boolean NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	CONSTRAINT "room_players_pk" PRIMARY KEY("room_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY,
	"game_id" uuid NOT NULL,
	"owner_player_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"time_control" jsonb NOT NULL,
	"max_players" smallint NOT NULL,
	"rematch_enabled" boolean NOT NULL,
	"settings" jsonb NOT NULL,
	"status" text NOT NULL,
	"close_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "rooms_mode_valid" CHECK ("mode" in ('REALTIME', 'TURN_BASED')),
	CONSTRAINT "rooms_status_valid" CHECK ("status" in ('WAITING', 'IN_MATCH', 'CLOSED')),
	CONSTRAINT "rooms_close_reason_valid" CHECK ("close_reason" in ('OWNER_LEFT', 'IDLE', 'MATCH_ENDED', 'ADMIN')),
	CONSTRAINT "rooms_max_players_positive" CHECK ("max_players" >= 1),
	CONSTRAINT "rooms_closed_consistent" CHECK (("status" = 'CLOSED') = ("close_reason" is not null) and ("status" = 'CLOSED') = ("closed_at" is not null))
);
--> statement-breakpoint
CREATE INDEX "room_players_player_id_idx" ON "room_players" ("player_id");--> statement-breakpoint
CREATE INDEX "rooms_game_status_mode_idx" ON "rooms" ("game_id","status","mode");--> statement-breakpoint
CREATE INDEX "rooms_waiting_last_activity_idx" ON "rooms" ("last_activity_at") WHERE "status" = 'WAITING';--> statement-breakpoint
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_room_id_rooms_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id");--> statement-breakpoint
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_player_id_players_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id");--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_game_id_games_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id");--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_player_id_players_id_fkey" FOREIGN KEY ("owner_player_id") REFERENCES "players"("id");