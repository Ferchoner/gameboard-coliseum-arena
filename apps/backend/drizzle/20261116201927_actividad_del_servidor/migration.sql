CREATE TABLE "server_liveness" (
	"id" smallint PRIMARY KEY,
	"started_at" timestamp with time zone NOT NULL,
	"last_alive_at" timestamp with time zone NOT NULL,
	CONSTRAINT "server_liveness_single_row" CHECK ("id" = 1)
);
