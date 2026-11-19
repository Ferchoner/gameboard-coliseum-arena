import type { MatchView, Notification } from '@gameboard/contracts';
import { expect, type Page, test } from '@playwright/test';
import { adminApi, grantAdmin } from '../support/account.ts';
import { bySeat, fetchMatch, type Player, sendAction, signUp } from '../support/app.ts';

/**
 * Batalla naval en dos navegadores (ADR-019): las dos flotas se colocan a
 * la vez (X5, X15) y ninguna llega al navegador del rival (X10).
 */

interface Cell {
  readonly row: number;
  readonly col: number;
}

interface Grid {
  readonly placed: boolean;
  readonly ships: readonly { readonly cells: readonly Cell[] }[] | null;
}

interface NavalView {
  readonly phase: 'PLACEMENT' | 'FIRING';
  readonly grids: readonly Grid[];
}

const navalBoard = (page: Page) => page.locator('.naval-board');
const rivalCell = (page: Page, name: string) =>
  page.locator(`[data-grid="rival"] [data-cell="${name}"]`);

const viewOf = (match: MatchView) => match.view as NavalView;

/** El juego entra inactivo (ADR-018, Z8): se activa como se hace de verdad, por la API. */
test.beforeAll(async ({ browser }) => {
  const admin = await signUp(browser, 'admin');
  grantAdmin(admin.name);
  const api = await adminApi(admin);
  // En el orden de la guía de administración: la versión, que sea la vigente, y el juego.
  for (const [path, data] of [
    ['admin/games/naval-battle/versions/1.0.0/status', { status: 'ACTIVE' }],
    ['admin/games/naval-battle/current-version', { gameVersion: '1.0.0' }],
    ['admin/games/naval-battle/status', { status: 'ACTIVE' }],
  ] as const) {
    const response = await api.put(path, { data });
    expect(response.status(), await response.text()).toBe(200);
  }
  await api.dispose();
  await admin.page.context().close();
});

/** Dos personas abren una sala de Batalla naval y empiezan la partida. */
async function startNavalMatch(
  ana: Player,
  bea: Player,
): Promise<{ matchId: string; seats: readonly [Player, Player] }> {
  await ana.page.getByRole('link', { name: 'Salas', exact: true }).click();
  await ana.page.locator('#create-game').selectOption({ label: 'Batalla naval' });
  await ana.page.locator('#create-mode').selectOption({ label: 'En tiempo real' });
  await ana.page.getByLabel('Tiempo por jugador').selectOption({ label: '10 minutos' });
  await ana.page.getByRole('button', { name: 'Crear sala' }).click();
  await ana.page.waitForURL(/\/salas\/[0-9a-f-]{36}$/);
  const roomId = new URL(ana.page.url()).pathname.split('/').at(-1) ?? '';

  await bea.page.goto(`/salas/${roomId}`);
  await bea.page.getByRole('button', { name: 'Entrar a la sala' }).click();
  for (const { page } of [ana, bea]) {
    await page.getByRole('button', { name: 'Estoy listo' }).click();
  }
  for (const { page } of [ana, bea]) {
    await page.waitForURL(/\/partidas\/[0-9a-f-]{36}$/);
    await expect(navalBoard(page)).toBeVisible();
  }
  const matchId = new URL(ana.page.url()).pathname.split('/').at(-1) ?? '';
  return { matchId, seats: await bySeat(ana, bea) };
}

test('las dos flotas se colocan a la vez, ninguna llega al rival y gana quien hunde la otra', async ({
  browser,
}) => {
  const ana = await signUp(browser, 'ana');
  const bea = await signUp(browser, 'bea');
  const { matchId, seats } = await startNavalMatch(ana, bea);
  const [first, second] = seats;

  // Lo que recibe el navegador de cada uno, desde una conexión nueva.
  const received = new Map<Player, string[]>([
    [first, []],
    [second, []],
  ]);
  for (const player of seats) {
    player.page.on('websocket', (socket) =>
      socket.on('framereceived', (frame) => {
        received.get(player)?.push(String(frame.payload));
      }),
    );
    await player.page.reload();
    await expect(player.page.getByRole('heading', { name: 'Coloca tu flota' })).toBeVisible();
  }

  // Los dos colocan su flota y pulsan "Listo" a la vez: se aceptan las dos (X15).
  for (const { page } of seats) {
    await page.getByRole('button', { name: 'Colocar al azar' }).click();
  }
  await Promise.all(seats.map(({ page }) => page.getByRole('button', { name: 'Listo' }).click()));
  for (const { page } of seats) {
    await expect(page.getByRole('heading', { name: /Flota rival/ })).toBeVisible();
    await expect(page.getByText('La partida cambió mientras jugabas.')).toHaveCount(0);
  }
  await expect(first.page.getByText('Te toca jugar.')).toBeVisible();

  // Cada uno ve su flota y no la del rival, ni en la página ni en lo que le llega (X10).
  const views = await Promise.all(seats.map((player) => fetchMatch(player, matchId)));
  for (const [seat, match] of views.entries()) {
    const view = viewOf(match);
    expect(view.phase).toBe('FIRING');
    expect(view.grids[seat]?.ships).toHaveLength(5);
    expect(view.grids[1 - seat]?.ships).toBeNull();
  }
  for (const [seat, player] of seats.entries()) {
    const updates = (received.get(player) ?? [])
      .map((text) => JSON.parse(text) as Notification)
      .filter(
        (message): message is Extract<Notification, { type: 'MATCH_UPDATED' }> =>
          message.type === 'MATCH_UPDATED',
      );
    expect(updates.length).toBeGreaterThan(0);
    for (const update of updates) {
      const view = viewOf(update.payload.match);
      expect(view.grids[1 - seat]?.ships ?? null).toBeNull();
    }
  }

  // Un disparo desde la página: la casilla queda marcada y el turno pasa.
  await rivalCell(first.page, 'A1').click();
  await expect(rivalCell(first.page, 'A1')).toBeDisabled();
  await expect(rivalCell(first.page, 'A1')).toHaveAttribute('aria-label', /A1, (agua|tocado)/);
  await expect(second.page.getByText('Te toca jugar.')).toBeVisible();

  // El resto, por debajo de la página: el primero dispara a cada casilla de la flota rival y el
  // segundo, a casillas en orden, hasta que se hunde la flota del segundo.
  const targets = (viewOf(views[1] as MatchView).grids[1]?.ships ?? [])
    .flatMap((ship) => ship.cells)
    .filter((cell) => !(cell.row === 0 && cell.col === 0));
  let stateVersion = (await fetchMatch(first, matchId)).stateVersion;
  let next = 0;
  const shoot = async (player: Player, cell: Cell) => {
    const reply = await sendAction(player, matchId, stateVersion, { type: 'FIRE', ...cell });
    if (reply.type !== 'MATCH_UPDATED')
      throw new Error(`Disparo rechazado: ${JSON.stringify(reply)}`);
    stateVersion = reply.payload.match.stateVersion;
    return reply.payload.match;
  };
  let match: MatchView | undefined;
  for (const target of targets) {
    await shoot(second, { row: Math.floor(next / 10), col: next % 10 });
    next += 1;
    match = await shoot(first, target);
  }
  expect(match?.status).toBe('FINISHED');

  for (const { page } of seats) {
    await expect(page.getByText('Hundió toda la flota rival.')).toBeVisible();
  }
});

test('en el móvil, las dos cuadrículas caben a lo ancho', async ({ browser }) => {
  const ana = await signUp(browser, 'ana');
  const bea = await signUp(browser, 'bea');
  await startNavalMatch(ana, bea);
  for (const { page } of [ana, bea]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Colocar al azar' }).click();
    await page.getByRole('button', { name: 'Listo' }).click();
  }
  for (const { page } of [ana, bea]) {
    await expect(page.getByRole('heading', { name: /Flota rival/ })).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
  }
});
