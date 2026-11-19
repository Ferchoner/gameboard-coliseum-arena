# Guía para añadir un juego

Esta guía dice qué hay que tocar, y en qué orden, para añadir un juego o una versión nueva de un juego que ya existe ([ADR-018](adr/0018-preparacion-del-segundo-juego.md), decisión Z8). El contrato que cumple todo motor está en [`contracts/03-game-engine.md`](../contracts/03-game-engine.md); el ejemplo completo es Cuatro en raya, en [`packages/game-engine/src/games/four-in-a-row/`](../packages/game-engine/src/games/four-in-a-row/README.md).

Lo esencial: **un juego o una versión nuevos llegan con su motor y su tablero, y entran inactivos**. Se activan desde la administración cuando el frontend que sabe mostrarlos ya está desplegado (decisión del 2026-11-16 sobre el catálogo; ADR-018, Z6).

---

## 1. El motor

En `packages/game-engine/src/games/<gameSlug>/`, con el nombre corto del juego en minúsculas y con guiones (por ejemplo `checkers`):

- `types.ts`: las opciones, la acción, los eventos, la vista y los motivos de rechazo. Es lo único que importa el frontend, así que no lleva lógica.
- `engine.ts`: el motor, que implementa `GameEngine` del contrato.
- `engine.test.ts`: las reglas propias del juego.
- `README.md`: reglas, opciones, controles de tiempo, acción, eventos, vista y motivos de rechazo, como el de Cuatro en raya. El catálogo de errores dice que cada juego documenta junto a su motor los motivos con los que precisa `INVALID_ACTION` (ADR-014, K6).

Lo que el motor debe cumplir y que se olvida con facilidad:

- **Puro y determinista.** Nada de `Date`, `Math.random`, red ni disco. El azar sale de la semilla que recibe `createInitialState`; el estado del generador va dentro del estado del juego (contrato, M7). La plataforma guarda la semilla con la partida (ADR-018, Z1).
- **No modifica lo que recibe.** Devuelve estados nuevos.
- **Todo es JSON plano**: estado, acción, eventos y vista. Sin clases, fechas, `Map` ni `undefined`.
- **`restoreState`** acepta un estado serializado y rechaza lo que no lo es.
- **`retireSeat`** en juegos de dos: el asiento retirado pierde y gana el otro (regla 7.18).
- **La vista no filtra información oculta de otro asiento** (`getPlayerView`).

### Metadatos y controles de tiempo

`metadata` declara el número de jugadores y los controles de tiempo de cada modalidad. El registro de motores los comprueba al arrancar y, si no cumplen, **el servidor no arranca** (ADR-018, Z4):

- `minPlayers` y `maxPlayers` enteros, con `1 <= minPlayers <= maxPlayers`.
- Al menos una modalidad con controles. Una lista vacía significa que el juego no admite esa modalidad.
- En tiempo real, cada control dura más de 0 y como mucho 30 minutos (regla 7.2).
- Por turnos, cada control es de 12, 24 o 36 horas (regla 7.2; ADR-016, N1).
- Sin controles repetidos en una modalidad.

### Registro

Añadir el motor a `GAME_ENGINES` en `packages/game-engine/src/engines.ts`. Si el frontend necesita sus tipos, añadir en `packages/game-engine/package.json` una entrada `./<gameSlug>` que apunte a `types`, como la de `./four-in-a-row`.

### La comprobación común

`packages/game-engine/src/conformance.test.ts` pasa la batería `checkEngineConformance` a cada motor de `GAME_ENGINES` (ADR-018, Z3) y **falla si un motor no tiene sus datos de prueba**. Añadir a `FIXTURES`, con la clave `<gameSlug>@<versión>`:

```ts
'checkers@1.0.0': {
  settings: {},                         // unas opciones que el motor acepta
  candidateActions: (state, seat) => [  // jugadas posibles, válidas o no
    /* … */
  ],
},
```

La batería juega varias partidas eligiendo al azar, con semilla, entre `candidateActions`. Conviene incluir también alguna jugada no válida, para que compruebe los rechazos. Si una acción válida es difícil de adivinar, `candidateActions` recibe el estado y puede calcularla.

## 2. El alta en el catálogo: una migración que la deja inactiva

El juego y su versión se dan de alta en la base de datos con una migración escrita a mano (API, A5; ADR-014, K5). Se crea vacía con:

```sh
pnpm build
pnpm --filter @gameboard/backend exec drizzle-kit generate --custom --name=alta_<juego>
```

y se rellena con esta plantilla. El estado es **`INACTIVE`** en el juego y en la versión:

```sql
-- Alta de <Nombre> en el catálogo, inactivo (ADR-018, Z8; decisión del
-- 2026-11-16 sobre el catálogo). Se activa desde la administración después
-- de desplegar el frontend que sabe mostrarlo (guía de administración).
INSERT INTO "games" ("id", "slug", "name", "description", "status", "created_at", "updated_at")
VALUES (
	gen_random_uuid(),
	'<gameSlug>',
	'<Nombre>',
	'<Una o dos frases para el catálogo.>',
	'INACTIVE',
	now(),
	now()
)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "game_versions" ("id", "game_id", "version", "status", "is_current", "released_at", "created_at")
SELECT gen_random_uuid(), "games"."id", '1.0.0', 'INACTIVE', false, now(), now()
FROM "games"
WHERE "games"."slug" = '<gameSlug>'
ON CONFLICT DO NOTHING;
```

La versión entra **sin ser la vigente** (`is_current` a `false`), porque la base de datos solo admite como vigente una versión activa (`game_versions_current_is_active`). Al activarla, se hace vigente desde la administración. *Corregido el 2026-11-19 (ADR-019): la plantilla decía `true`, y la migración fallaba; se vio al dar de alta Batalla naval.*

Para **una versión nueva de un juego que ya existe**, solo la segunda sentencia, con la versión nueva, `'INACTIVE'` y `is_current` a `false`: la vigente se cambia desde la administración.

La versión de la migración tiene que ser la misma que `gameVersion` del motor: así la encuentra el registro. Una versión sin motor no se puede activar (`409 ENGINE_NOT_REGISTERED`).

Cuatro en raya entró activo, como excepción por ser el primero; su migración no se toca porque ya está aplicada.

Después, `pnpm db:check` comprueba que las migraciones siguen al esquema.

## 3. El tablero en el frontend

En `apps/frontend/app/games/<gameSlug>/` (ADR-018, Z7):

- `texts.ts`: los textos del juego (nombre de cada asiento, cómo terminó, motivos de rechazo). No van en `i18n/es.ts`.
- `index.ts`: los textos como `GameTexts`.
- `<Nombre>Board.vue`: el tablero. Recibe `BoardProps` (`games/game-ui.ts`): la vista, el asiento propio, los asientos activos, los jugadores, los eventos del último cambio, la versión y si se puede jugar. Emite `play` con la acción. **No decide si una jugada es válida**: eso lo hace el servidor (ADR-014, K7).

Para los colores de cada asiento, la clase `seat-N` fija la variable `--seat-color` (hay colores para seis asientos en `assets/css/main.css`). El tablero no define colores de asiento propios.

Registrarlo en `GAME_UIS` de `apps/frontend/app/games/index.ts`, con la clave `<gameSlug>@<versión mayor>` y el tablero cargado solo cuando hace falta:

```ts
'checkers@1': {
  ...checkersTexts,
  board: defineAsyncComponent(() => import('./checkers/CheckersBoard.vue')),
},
```

El frontend no puede importar el motor en sus pruebas (ADR-014, K7), así que nada comprueba de forma automática que cada motor de `GAME_ENGINES` tenga su tablero: hay que añadir a `games/games.test.ts` una prueba con el juego y su versión, como la de Cuatro en raya. El motor y el tablero van juntos, en la misma pull request.

Una versión nueva del motor que **no cambia la vista** sube la versión menor o de parche (`1.1.0`) y usa el mismo tablero. Si cambia la vista, sube la versión mayor (`2.0.0`) y necesita su propia entrada en `GAME_UIS`, aunque reutilice el componente.

## 4. Pruebas en navegador

Si el juego tiene algo que no se ve en Cuatro en raya (más de dos asientos, jugadas simultáneas, información oculta), conviene una prueba en `e2e/` que juegue una partida.

## 5. Desplegar y activar

En este orden, que también está en la [guía de administración](guia-administracion.md#en-qué-orden-activar-un-juego-o-una-versión-nuevos):

1. Desplegar el backend: la migración da de alta el juego inactivo.
2. Desplegar el frontend con su tablero.
3. Comprobar con `GET /admin/games` que la versión tiene motor y, en el frontend, que el juego se ve.
4. Desde la administración, activar la versión, hacerla vigente y activar el juego.

## Lista de comprobación

- [ ] Motor en `packages/game-engine/src/games/<gameSlug>/`, con `types.ts`, `engine.ts`, pruebas y `README.md`.
- [ ] Metadatos dentro de la regla 7.2.
- [ ] Motor en `GAME_ENGINES` y datos de prueba en `FIXTURES`.
- [ ] Migración de alta con `'INACTIVE'`; `pnpm db:check` sin diferencias.
- [ ] Tablero, textos y entrada en `GAME_UIS`.
- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde.
- [ ] Desplegado el frontend antes de activar.
