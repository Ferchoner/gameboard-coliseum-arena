-- Alta de Cuatro en raya en el catálogo (ADR-014, decisión K5). Añadir un
-- juego es añadir su motor en el código y dar de alta aquí su nombre y su
-- versión vigente (API, decisión A5). Si el juego ya existe, no cambia nada.
INSERT INTO "games" ("id", "slug", "name", "description", "status", "created_at", "updated_at")
VALUES (
	gen_random_uuid(),
	'four-in-a-row',
	'Cuatro en raya',
	'Dos jugadores dejan caer fichas por turnos en un tablero de siete columnas. Gana quien alinea cuatro.',
	'ACTIVE',
	now(),
	now()
)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "game_versions" ("id", "game_id", "version", "status", "is_current", "released_at", "created_at")
SELECT gen_random_uuid(), "games"."id", '1.0.0', 'ACTIVE', true, now(), now()
FROM "games"
WHERE "games"."slug" = 'four-in-a-row'
ON CONFLICT DO NOTHING;
