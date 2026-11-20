-- Alta del Dominó en el catálogo, inactivo (ADR-018, Z8; ADR-020, DO1;
-- decisión del 2026-11-16 sobre el catálogo). Se activa desde la
-- administración después de desplegar el frontend que sabe mostrarlo (guía
-- de administración): activar la versión, hacerla vigente y activar el
-- juego. La versión entra sin ser la vigente, porque la vigente tiene que
-- estar activa (game_versions_current_is_active).
INSERT INTO "games" ("id", "slug", "name", "description", "status", "created_at", "updated_at")
VALUES (
	gen_random_uuid(),
	'dominoes',
	'Dominó',
	'Doble seis, de 2 a 4 jugadores y con 4 en parejas. Gana quien llega antes a 100 puntos.',
	'INACTIVE',
	now(),
	now()
)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "game_versions" ("id", "game_id", "version", "status", "is_current", "released_at", "created_at")
SELECT gen_random_uuid(), "games"."id", '1.0.0', 'INACTIVE', false, now(), now()
FROM "games"
WHERE "games"."slug" = 'dominoes'
ON CONFLICT DO NOTHING;
