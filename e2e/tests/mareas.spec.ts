import type { MatchView } from '@gameboard/contracts';
import { expect, type Page, test } from '@playwright/test';
import { adminApi, grantAdmin } from '../support/account.ts';
import { fetchMatch, type Player, seatOf, sendAction, signUp } from '../support/app.ts';

/**
 * Mareas en varios navegadores (ADR-023): tres personas empiezan una
 * partida, quien tiene el turno coloca un dado en el puerto desde el
 * tablero, resuelve lo que pide y pasa el turno; todos lo ven, y el
 * servidor rechaza un dado que no es de quien juega.
 */

interface TidesView {
  readonly round: number;
  readonly turn: { readonly seat: number; readonly placed: number } | null;
  readonly pending: { readonly kind: string } | null;
  readonly port: readonly { readonly space: string; readonly dice: readonly unknown[] }[];
  readonly seats: readonly {
    readonly pool: readonly { readonly id: string }[];
    readonly ingredients: Readonly<Record<string, number>>;
  }[];
}

const viewOf = (match: MatchView) => match.view as TidesView;
const tidesBoard = (page: Page) => page.locator('.td-board');

/** El juego entra inactivo (ADR-018, Z8): se activa como se hace de verdad, por la API. */
test.beforeAll(async ({ browser }) => {
  const admin = await signUp(browser, 'admin');
  grantAdmin(admin.name);
  const api = await adminApi(admin);
  for (const [path, data] of [
    ['admin/games/tides/versions/1.0.0/status', { status: 'ACTIVE' }],
    ['admin/games/tides/current-version', { gameVersion: '1.0.0' }],
    ['admin/games/tides/status', { status: 'ACTIVE' }],
  ] as const) {
    const response = await api.put(path, { data });
    expect(response.status(), await response.text()).toBe(200);
  }
  await api.dispose();
  await admin.page.context().close();
});

/** Abren una sala de Mareas con una plaza por persona y empiezan la partida. */
async function startMatch(
  players: readonly Player[],
): Promise<{ matchId: string; bySeat: Player[] }> {
  const [owner, ...guests] = players as [Player, ...Player[]];
  await owner.page.getByRole('link', { name: 'Salas', exact: true }).click();
  await owner.page.locator('#create-game').selectOption({ label: 'Mareas' });
  await owner.page.locator('#create-mode').selectOption({ label: 'En tiempo real' });
  await owner.page.getByLabel('Tiempo por jugador').selectOption({ label: '15 minutos' });
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
    await expect(tidesBoard(page)).toBeVisible();
  }
  const matchId = new URL(owner.page.url()).pathname.split('/').at(-1) ?? '';
  const bySeat: Player[] = [];
  for (const player of players) bySeat[await seatOf(player)] = player;
  return { matchId, bySeat };
}

test('con tres, quien juega coloca en el puerto, elige su ingrediente y pasa el turno', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const players = await Promise.all(
    ['ana', 'bea', 'cris'].map((prefix) => signUp(browser, prefix)),
  );
  const { matchId, bySeat } = await startMatch(players);
  const first = bySeat[0] as Player;

  const start = viewOf(await fetchMatch(first, matchId));
  expect(start.round).toBe(1);
  expect(start.turn?.seat).toBe(0);
  for (const { page } of players) {
    // Tres islas más una, el puerto de cinco casillas y los seis dados propios.
    await expect(page.locator('[data-island]')).toHaveCount(4);
    await expect(page.locator('[data-port]')).toHaveCount(5);
    await expect(page.locator('[data-die]')).toHaveCount(6);
    await expect(page.getByText('Inspirado en un juego de mesa comercial.')).toBeVisible();
  }

  // El asiento 0 pone su primer dado en la casilla del puerto que admite cualquiera.
  const die = start.seats[0]?.pool[0]?.id as string;
  await first.page.locator(`[data-die="${die}"]`).click();
  await first.page.locator('[data-port="ANY_1"]').click();
  await expect(first.page.locator('[data-pending]')).toBeVisible();
  await first.page.locator('[data-ingredients="FISH"]').click();
  await expect(first.page.locator('[data-ingredient="0-FISH"]')).toContainText('1');

  // Si le queda algo que hacer, termina el turno él mismo.
  const after = viewOf(await fetchMatch(first, matchId));
  expect(after.pending).toBeNull();
  if (after.turn?.seat === 0) await first.page.locator('[data-end-turn]').click();

  for (const { page } of players) {
    await expect(page.locator('[data-port="ANY_1"] .td-die')).toHaveCount(1);
    await expect(page.locator('.td-seat[data-seat="1"]')).toContainText('juega');
  }
  const now = viewOf(await fetchMatch(first, matchId));
  expect(now.turn?.seat).toBe(1);
  expect(now.seats[0]?.ingredients.FISH).toBe(1);

  // Un dado ajeno no se puede colocar: el servidor lo rechaza y nada cambia.
  const second = bySeat[1] as Player;
  const current = await fetchMatch(second, matchId);
  const reply = await sendAction(second, matchId, current.stateVersion, {
    type: 'PLACE',
    die: '0B3',
    target: { kind: 'PORT', space: 'ANY_2' },
  });
  expect(reply.type).not.toBe('MATCH_UPDATED');
  expect((await fetchMatch(second, matchId)).stateVersion).toBe(current.stateVersion);

  // El resto de la ronda, por debajo: cada uno lleva sus dados al puerto. Al
  // terminar, nadie domina ninguna isla y empieza la ronda 2, en bajamar.
  for (let step = 0; step < 80; step += 1) {
    const match = await fetchMatch(first, matchId);
    const view = viewOf(match);
    if (view.round > 1 || !view.turn) break;
    const player = bySeat[view.turn.seat] as Player;
    const pool = view.seats[view.turn.seat]?.pool ?? [];
    const action =
      view.pending?.kind === 'CHOOSE_INGREDIENTS'
        ? { type: 'RESOLVE', ingredients: ['SALT'] }
        : view.pending
          ? { type: 'RESOLVE', season: 'SPRING' }
          : view.turn.placed > 0 || pool.length === 0
            ? { type: 'END_TURN' }
            : { type: 'PLACE', die: pool[0]?.id, target: { kind: 'PORT', space: 'ANY_1' } };
    const answer = await sendAction(player, matchId, match.stateVersion, action);
    if (answer.type !== 'MATCH_UPDATED') throw new Error(`Rechazada: ${JSON.stringify(answer)}`);
  }
  const secondRound = viewOf(await fetchMatch(first, matchId));
  expect(secondRound.round).toBe(2);
  expect(secondRound.turn?.seat).toBe(1);
  for (const { page } of players) {
    await expect(page.getByText('Ronda 2 · Bajamar')).toBeVisible();
    await expect(page.locator('[data-port="ANY_1"] .td-die')).toHaveCount(0);
  }
});

test('en el móvil, el tablero de cuatro cabe a lo ancho', async ({ browser }) => {
  test.setTimeout(120_000);
  const players = await Promise.all(
    ['ana', 'bea', 'cris', 'dani'].map((prefix) => signUp(browser, prefix)),
  );
  await startMatch(players);
  for (const { page } of players) {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-island]')).toHaveCount(5);
    await expect(page.locator('.td-seat')).toHaveCount(4);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
  }
});
