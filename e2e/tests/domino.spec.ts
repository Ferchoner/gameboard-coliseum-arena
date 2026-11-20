import type { MatchView, Notification } from '@gameboard/contracts';
import { expect, type Page, test } from '@playwright/test';
import { adminApi, grantAdmin } from '../support/account.ts';
import { fetchMatch, type Player, seatOf, sendAction, signUp } from '../support/app.ts';

/**
 * El Dominó en varios navegadores (ADR-020): ninguno recibe las fichas de
 * otro, ni por REST ni por tiempo real (DO14); con tres, quien se rinde
 * queda retirado y los otros dos terminan (DO11).
 */

type Tile = readonly [number, number];

interface DominoView {
  readonly handNumber: number;
  readonly turn: number | null;
  readonly line: readonly Tile[];
  readonly boneyardCount: number;
  readonly tileCounts: readonly number[];
  readonly hand: readonly Tile[] | null;
  readonly playable: readonly { readonly tile: Tile; readonly ends: readonly string[] }[];
  readonly scores: readonly number[];
}

const viewOf = (match: MatchView) => match.view as DominoView;
const keyOf = (tile: Tile) => `${tile[0]}-${tile[1]}`;
const dominoBoard = (page: Page) => page.locator('.domino-board');
const lineTiles = (page: Page) => page.locator('[data-line] .domino');

/** El juego entra inactivo (ADR-018, Z8): se activa como se hace de verdad, por la API. */
test.beforeAll(async ({ browser }) => {
  const admin = await signUp(browser, 'admin');
  grantAdmin(admin.name);
  const api = await adminApi(admin);
  // En el orden de la guía de administración: la versión, que sea la vigente, y el juego.
  for (const [path, data] of [
    ['admin/games/dominoes/versions/1.0.0/status', { status: 'ACTIVE' }],
    ['admin/games/dominoes/current-version', { gameVersion: '1.0.0' }],
    ['admin/games/dominoes/status', { status: 'ACTIVE' }],
  ] as const) {
    const response = await api.put(path, { data });
    expect(response.status(), await response.text()).toBe(200);
  }
  await api.dispose();
  await admin.page.context().close();
});

/** Abren una sala de Dominó con una plaza por persona y empiezan la partida. */
async function startDominoMatch(
  players: readonly Player[],
): Promise<{ matchId: string; bySeat: Player[] }> {
  const [owner, ...guests] = players as [Player, ...Player[]];
  await owner.page.getByRole('link', { name: 'Salas', exact: true }).click();
  await owner.page.locator('#create-game').selectOption({ label: 'Dominó' });
  await owner.page.locator('#create-mode').selectOption({ label: 'En tiempo real' });
  await owner.page.getByLabel('Tiempo por jugador').selectOption({ label: '10 minutos' });
  await owner.page.locator('#create-players').selectOption(`${players.length}`);
  await owner.page.getByRole('button', { name: 'Crear sala' }).click();
  await owner.page.waitForURL(/\/salas\/[0-9a-f-]{36}$/);
  const roomId = new URL(owner.page.url()).pathname.split('/').at(-1) ?? '';

  for (const { page } of guests) {
    await page.goto(`/salas/${roomId}`);
    await page.getByRole('button', { name: 'Entrar a la sala' }).click();
  }
  for (const { page } of players) {
    await page.getByRole('button', { name: 'Estoy listo' }).click();
  }
  for (const { page } of players) {
    await page.waitForURL(/\/partidas\/[0-9a-f-]{36}$/);
    await expect(dominoBoard(page)).toBeVisible();
  }
  const matchId = new URL(owner.page.url()).pathname.split('/').at(-1) ?? '';
  const bySeat: Player[] = [];
  for (const player of players) bySeat[await seatOf(player)] = player;
  return { matchId, bySeat };
}

/** Juega por debajo de la página quien tenga el turno, con su primera ficha jugable. */
async function playOne(seats: readonly Player[], matchId: string): Promise<MatchView> {
  const anyone = seats[0] as Player;
  const { view } = await fetchMatch(anyone, matchId);
  const turn = (view as DominoView).turn;
  const mover = seats[turn ?? -1];
  if (!mover) throw new Error('Nadie tiene el turno');
  const match = await fetchMatch(mover, matchId);
  const [first] = viewOf(match).playable;
  if (!first) throw new Error('Le toca a quien no puede jugar');
  const reply = await sendAction(mover, matchId, match.stateVersion, {
    type: 'PLAY',
    tile: first.tile,
    end: first.ends[0],
  });
  if (reply.type !== 'MATCH_UPDATED') throw new Error(`Rechazada: ${JSON.stringify(reply)}`);
  return reply.payload.match;
}

test('con tres, nadie ve las fichas de otro; uno se rinde y los otros dos terminan', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const players = await Promise.all(
    ['ana', 'bea', 'cris'].map((prefix) => signUp(browser, prefix)),
  );
  const { matchId, bySeat } = await startDominoMatch(players);

  // Lo que recibe el navegador de cada uno, desde una conexión nueva.
  const received = new Map<Player, string[]>(players.map((player) => [player, []]));
  for (const player of players) {
    player.page.on('websocket', (socket) =>
      socket.on('framereceived', (frame) => {
        received.get(player)?.push(String(frame.payload));
      }),
    );
    await player.page.reload();
    await expect(dominoBoard(player.page)).toBeVisible();
  }

  // Sale quien tiene la ficha de salida, pulsándola en su mano: es la única que puede jugar.
  const opening = await fetchMatch(players[0] as Player, matchId);
  const leader = bySeat[viewOf(opening).turn ?? -1] as Player;
  const enabled = leader.page.locator('.domino-hand [data-tile]:enabled');
  await expect(enabled).toHaveCount(1);
  await enabled.click();
  for (const { page } of players) await expect(lineTiles(page)).toHaveCount(1);

  // Cada uno tiene su mano y ninguna se repite: entre las tres, la línea y el pozo están las 28.
  const views = await Promise.all(bySeat.map((player) => fetchMatch(player, matchId)));
  const hands = views.map((match) => viewOf(match).hand ?? []);
  const all = [...hands.flat(), ...viewOf(views[0] as MatchView).line].map(keyOf);
  expect(new Set(all).size).toBe(all.length);
  expect(all.length + viewOf(views[0] as MatchView).boneyardCount).toBe(28);
  for (const [seat, match] of views.entries()) {
    expect(viewOf(match).tileCounts[seat]).toBe(hands[seat]?.length);
  }

  // Lo que llegó en vivo a cada uno nunca lleva una ficha de la mano de otro.
  for (const [seat, player] of bySeat.entries()) {
    const others = new Set(
      hands
        .filter((_, one) => one !== seat)
        .flat()
        .map(keyOf),
    );
    const updates = (received.get(player) ?? [])
      .map((text) => JSON.parse(text) as Notification)
      .filter(
        (message): message is Extract<Notification, { type: 'MATCH_UPDATED' }> =>
          message.type === 'MATCH_UPDATED',
      );
    expect(updates.length).toBeGreaterThan(0);
    for (const update of updates) {
      const view = viewOf(update.payload.match);
      expect((view.hand ?? []).some((tile) => others.has(keyOf(tile)))).toBe(false);
    }
  }

  // Se rinde uno al que no le toca, y no es el anfitrión.
  const now = viewOf(await fetchMatch(leader, matchId));
  const quitterSeat = bySeat.findIndex(
    (player, seat) => seat !== now.turn && player !== players[0],
  );
  const quitter = bySeat[quitterSeat] as Player;
  await quitter.page.getByRole('button', { name: 'Rendirse' }).click();
  await quitter.page.getByRole('button', { name: 'Sí, rendirme' }).click();
  await expect(quitter.page.getByText('Te retiraste. La partida sigue sin ti.')).toBeVisible();
  await expect(quitter.page.locator('.domino-hand')).toHaveCount(0);
  const rest = bySeat.filter((player) => player !== quitter);
  for (const { page } of rest) {
    await expect(page.locator(`.domino-player[data-seat="${quitterSeat}"]`)).toContainText(
      'se retiró',
    );
  }

  // Los otros dos juegan hasta que uno llega a 100.
  let match: MatchView | undefined;
  for (let move = 0; move < 600; move += 1) {
    match = await playOne(bySeat, matchId);
    if (match.status !== 'IN_PROGRESS') break;
  }
  expect(match?.status).toBe('FINISHED');
  expect(match?.result?.seats.find((one) => one.seat === quitterSeat)?.outcome).toBe('LOSS');
  for (const { page } of rest) {
    await expect(page.getByText('Llegó a 100 puntos.')).toBeVisible();
  }
});

test('en el móvil, el tablero de cuatro cabe a lo ancho', async ({ browser }) => {
  test.setTimeout(120_000);
  const players = await Promise.all(
    ['ana', 'bea', 'cris', 'dani'].map((prefix) => signUp(browser, prefix)),
  );
  const { matchId, bySeat } = await startDominoMatch(players);
  // Doce fichas en la línea, para que se parta en varias filas.
  for (let move = 0; move < 12; move += 1) await playOne(bySeat, matchId);

  for (const { page } of players) {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.domino-teams')).toContainText('Pareja A');
    await expect(lineTiles(page).first()).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
  }
  // La mano se ve entera: siete fichas menos las jugadas.
  const first = players[0] as Player;
  const view = viewOf(await fetchMatch(first, matchId));
  await expect(first.page.locator('.domino-hand [data-tile]')).toHaveCount(view.hand?.length ?? 0);
});
