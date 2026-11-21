-- Alta de Mareas en el catálogo, inactivo (ADR-018, Z8; ADR-023, MA2;
-- decisión del 2026-11-16 sobre el catálogo). Se activa desde la
-- administración después de desplegar el frontend que sabe mostrarlo (guía
-- de administración): activar la versión, hacerla vigente y activar el
-- juego. La versión entra sin ser la vigente, porque la vigente tiene que
-- estar activa (game_versions_current_is_active). La descripción lleva el
-- aviso neutro sobre su origen, sin la marca (ADR-023, MA1).
INSERT INTO "games" ("id", "slug", "name", "description", "status", "created_at", "updated_at")
VALUES (
	gen_random_uuid(),
	'tides',
	'Mareas',
	'Colocación de dados de 2 a 4 jugadores: lleva tus barcas a las islas del archipiélago, domínalas al final de cada ronda, recoge pescado, sal y algas, y cumple encargos. Inspirado en un juego de mesa comercial; si te gusta, apoya a sus autores comprando el original.',
	'INACTIVE',
	now(),
	now()
)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "game_versions" ("id", "game_id", "version", "status", "is_current", "released_at", "created_at")
SELECT gen_random_uuid(), "games"."id", '1.0.0', 'INACTIVE', false, now(), now()
FROM "games"
WHERE "games"."slug" = 'tides'
ON CONFLICT DO NOTHING;
