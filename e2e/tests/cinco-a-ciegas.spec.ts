import type { MatchView, Notification } from '@gameboard/contracts';
import { expect, type Page, test } from '@playwright/test';
import { adminApi, grantAdmin } from '../support/account.ts';
import { fetchMatch, type Player, seatOf, sendAction, signUp } from '../support/app.ts';

/**
 * Cinco a ciegas en varios navegadores (ADR-022): ningún jugador recibe sus
 * propios números mientras sigue en juego, ni por REST ni por tiempo real
 * (CA15); se puede cantar fuera de turno (CA9 y CA19); quien falla queda
 * fuera y ve sus números (CA11), y quien acierta gana.
 */

interface StandTile {
  readonly suit: string;
  readonly number: number | null;
}

interface BlindFiveView {
  readonly turn: number | null;
  readonly step: string | null;
  readonly seats: readonly {
    readonly stand: readonly StandTile[];
    readonly out: string | null;
  }[];
  readonly faceUp: readonly { readonly number: number }[];
}

const viewOf = (match: MatchView) => match.view as BlindFiveView;
const blindFiveBoard = (page: Page) => page.locator('.b5-board');

/** El juego entra inactivo (ADR-018, Z8): se activa como se hace de verdad, por la API. */
test.beforeAll(async ({ browser }) => {
  const admin = await signUp(browser, 'admin');
  grantAdmin(admin.name);
  const api = await adminApi(admin);
  // En el orden de la guía de administración: la versión, que sea la vigente, y el juego.
  for (const [path, data] of [
    ['admin/games/blind-five/versions/1.0.0/status', { status: 'ACTIVE' }],
    ['admin/games/blind-five/current-version', { gameVersion: '1.0.0' }],
    ['admin/games/blind-five/status', { status: 'ACTIVE' }],
  ] as const) {
    const response = await api.put(path, { data });
    expect(response.status(), await response.text()).toBe(200);
  }
  await api.dispose();
  await admin.page.context().close();
});

/** Abren una sala de Cinco a ciegas con una plaza por persona y empiezan la partida. */
async function startMatch(
  players: readonly Player[],
): Promise<{ matchId: string; bySeat: Player[] }> {
  const [owner, ...guests] = players as [Player, ...Player[]];
  await owner.page.getByRole('link', { name: 'Salas', exact: true }).click();
  await owner.page.locator('#create-game').selectOption({ label: 'Cinco a ciegas' });
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
    await expect(blindFiveBoard(page)).toBeVisible();
  }
  const matchId = new URL(owner.page.url()).pathname.split('/').at(-1) ?? '';
  const bySeat: Player[] = [];
  for (const player of players) bySeat[await seatOf(player)] = player;
  return { matchId, bySeat };
}

test('con tres, nadie recibe sus números; uno canta mal fuera de turno y otro acierta', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const players = await Promise.all(
    ['ana', 'bea', 'cris'].map((prefix) => signUp(browser, prefix)),
  );
  const { matchId, bySeat } = await startMatch(players);

  // Lo que recibe el navegador de cada uno, desde una conexión nueva.
  const received = new Map<Player, string[]>(players.map((player) => [player, []]));
  for (const player of players) {
    player.page.on('websocket', (socket) =>
      socket.on('framereceived', (frame) => {
        received.get(player)?.push(String(frame.payload));
      }),
    );
    await player.page.reload();
    await expect(blindFiveBoard(player.page)).toBeVisible();
  }

  // Los números de cada asiento, vistos por otro jugador.
  const numbersOf = async (seat: number): Promise<number[]> => {
    const other = bySeat[(seat + 1) % bySeat.length] as Player;
    const stand = viewOf(await fetchMatch(other, matchId)).seats[seat]?.stand ?? [];
    return stand.map((tile) => tile.number as number);
  };
  const stands = await Promise.all(bySeat.map((_, seat) => numbersOf(seat)));
  for (const stand of stands) expect(stand.every((number) => Number.isInteger(number))).toBe(true);

  // Cada uno ve los atriles ajenos, pero el suyo solo de espaldas.
  for (const [seat, player] of bySeat.entries()) {
    const own = viewOf(await fetchMatch(player, matchId)).seats[seat]?.stand ?? [];
    expect(own.every((tile) => tile.number === null)).toBe(true);
    await expect(player.page.locator('[data-own-stand] .b5-tile.hidden')).toHaveCount(5);
  }

  // Quien tiene el turno revela y pide una pista desde el tablero.
  const turnHolder = bySeat[0] as Player;
  await turnHolder.page.locator('[data-reveal="S1"]').click();
  for (const { page } of players) await expect(page.locator('[data-face-up]')).toHaveCount(6);
  await turnHolder.page.locator('[data-face-up]').first().click();
  await turnHolder.page.locator('[data-sort]').click();
  for (const { page } of players) await expect(page.locator('[data-face-up]')).toHaveCount(5);
  await expect(turnHolder.page.locator('[data-own-stand] .b5-tile.small')).toHaveCount(1);

  // Al asiento 2 no le toca, y canta mal desde el tablero: queda fuera y ve sus números.
  const loser = bySeat[2] as Player;
  const wrong = [1, 2, 3, 4, 5].join() === stands[2]?.join() ? [6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
  await loser.page.locator('[data-declare-open]').click();
  for (const [index, number] of wrong.entries()) {
    await loser.page.locator(`[data-guess="${index}"]`).fill(String(number));
  }
  await loser.page.locator('[data-declare]').click();
  await expect(loser.page.getByText('Fallaste.', { exact: false })).toBeVisible();
  await expect(loser.page.locator('[data-own-stand] .b5-tile.hidden')).toHaveCount(0);
  for (const { page } of bySeat.slice(0, 2)) {
    await expect(page.locator('.b5-rival[data-seat="2"]')).toContainText('falló');
  }

  // Lo que llegó en vivo a cada uno, mientras seguía en juego, nunca lleva sus números.
  for (const [seat, player] of bySeat.entries()) {
    const updates = (received.get(player) ?? [])
      .map((text) => JSON.parse(text) as Notification)
      .filter(
        (message): message is Extract<Notification, { type: 'MATCH_UPDATED' }> =>
          message.type === 'MATCH_UPDATED',
      );
    expect(updates.length).toBeGreaterThan(0);
    for (const update of updates) {
      const view = viewOf(update.payload.match);
      if (view.seats[seat]?.out) continue;
      expect(view.seats[seat]?.stand.every((tile) => tile.number === null)).toBe(true);
    }
  }

  // Ahora le toca al asiento 1. El 0 canta sus cinco fuera de turno y gana.
  const winner = bySeat[0] as Player;
  const now = await fetchMatch(winner, matchId);
  expect(viewOf(now).turn).toBe(1);
  const reply = await sendAction(winner, matchId, now.stateVersion, {
    type: 'DECLARE',
    numbers: stands[0],
  });
  expect(reply.type).toBe('MATCH_UPDATED');
  for (const { page } of players) {
    await expect(page.getByText('Acertó sus cinco números.')).toBeVisible();
  }
  const final = await fetchMatch(winner, matchId);
  expect(final.status).toBe('FINISHED');
  expect(final.result?.seats.find((one) => one.seat === 0)?.outcome).toBe('WIN');
});

test('en el móvil, el tablero de cuatro cabe a lo ancho y la hoja se abre', async ({ browser }) => {
  test.setTimeout(120_000);
  const players = await Promise.all(
    ['ana', 'bea', 'cris', 'dani'].map((prefix) => signUp(browser, prefix)),
  );
  await startMatch(players);

  for (const { page } of players) {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.b5-rival')).toHaveCount(3);
    await page.locator('[data-sheet] summary').click();
    await expect(page.locator('[data-sheet-number]')).toHaveCount(60);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
  }

  // Lo que está a la vista se tacha solo, y una marca se guarda al recargar.
  const first = players[0] as Player;
  const seen = first.page.locator('[data-sheet-number]:disabled');
  // Los tres atriles ajenos y las cinco fichas que empezaron boca arriba.
  expect(await seen.count()).toBe(3 * 5 + 5);
  const free = first.page.locator('[data-sheet-number]:enabled').first();
  const number = await free.getAttribute('data-sheet-number');
  await free.click();
  await first.page.reload();
  await first.page.locator('[data-sheet] summary').click();
  await expect(first.page.locator(`[data-sheet-number="${number}"]`)).toHaveClass(/crossed/);
});
