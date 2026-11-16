CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_versions" (
	"id" uuid PRIMARY KEY,
	"game_id" uuid NOT NULL,
	"version" text NOT NULL,
	"status" text NOT NULL,
	"is_current" boolean NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "game_versions_status_valid" CHECK ("status" in ('ACTIVE', 'INACTIVE')),
	CONSTRAINT "game_versions_current_is_active" CHECK (not "is_current" or "status" = 'ACTIVE')
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "games_status_valid" CHECK ("status" in ('ACTIVE', 'INACTIVE'))
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY,
	"user_id" uuid,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"biography" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'USER' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email")),
	CONSTRAINT "users_role_valid" CHECK ("role" in ('USER', 'ADMIN')),
	CONSTRAINT "users_status_valid" CHECK ("status" in ('ACTIVE', 'SUSPENDED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_unique" ON "auth_sessions" ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "game_versions_game_version_unique" ON "game_versions" ("game_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "game_versions_current_unique" ON "game_versions" ("game_id") WHERE "is_current";--> statement-breakpoint
CREATE UNIQUE INDEX "games_slug_unique" ON "games" ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "players_user_id_unique" ON "players" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" (lower("username"));--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "game_versions" ADD CONSTRAINT "game_versions_game_id_games_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id");--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");