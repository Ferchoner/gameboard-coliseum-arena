import { randomUUID } from 'node:crypto';
import {
  type MatchView,
  type Notification,
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_PARAM,
  REALTIME_PATH,
} from '@gameboard/contracts';
import { type Browser, expect, type Locator, type Page } from '@playwright/test';
import { API_ORIGIN } from './settings.mjs';

/** Una persona con su propio navegador, ya con la sesión iniciada. */
export interface Player {
  readonly name: string;
  readonly password: string;
  readonly page: Page;
}

/** Una partida en curso. `seats` son sus dos jugadores por asiento: juega primero `seats[0]`. */
export interface Match {
  readonly matchId: string;
  readonly roomId: string;
  readonly seats: readonly [Player, Player];
}

const PASSWORD = 'una-clave-larga-1';
const UUID = '[0-9a-f-]{36}';

/** Crea una cuenta desde la página de registro, en un navegador aparte. */
export async function signUp(browser: Browser, prefix: string): Promise<Player> {
  const context = await browser.newContext();
  const page = await context.newPage();
  // El nombre es único para que las pruebas no dependan unas de otras.
  const name = `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 10)}`;

  await page.goto('/registro');
  await page.getByLabel('Correo electrónico').fill(`${name}@example.test`);
  await page.getByLabel('Nombre de usuario').fill(name);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText(`Hola, ${name}.`)).toBeVisible();

  return { name, password: PASSWORD, page };
}

/** Crea una sala de Cuatro en raya en tiempo real, de cinco minutos por jugador. */
export async function createRoom(owner: Player): Promise<string> {
  await owner.page.getByRole('link', { name: 'Salas', exact: true }).click();
  // La lista de salas tiene sus propios filtros de juego y modalidad: estos son los del formulario.
  await owner.page.locator('#create-game').selectOption({ label: 'Cuatro en raya' });
  await owner.page.locator('#create-mode').selectOption({ label: 'En tiempo real' });
  await owner.page.getByLabel('Tiempo por jugador').selectOption({ label: '5 minutos' });
  await owner.page.getByRole('button', { name: 'Crear sala' }).click();
  await owner.page.waitForURL(new RegExp(`/salas/${UUID}$`));
  return lastSegment(owner.page);
}

/** Todos se marcan listos y esperan a que la partida empiece y los lleve a ella. */
export async function getReady(...players: Player[]): Promise<string> {
  for (const { page } of players) {
    await page.getByRole('button', { name: 'Estoy listo' }).click();
  }
  for (const { page } of players) {
    await page.waitForURL(new RegExp(`/partidas/${UUID}$`));
    await expect(board(page)).toBeVisible();
  }
  return lastSegment(players[0]?.page);
}

/** Dos personas nuevas crean una sala, entran, se marcan listas y empiezan una partida. */
export async function startMatch(browser: Browser): Promise<Match> {
  const owner = await signUp(browser, 'ana');
  const guest = await signUp(browser, 'bea');

  const roomId = await createRoom(owner);
  await guest.page.goto(`/salas/${roomId}`);
  await guest.page.getByRole('button', { name: 'Entrar a la sala' }).click();
  const matchId = await getReady(owner, guest);

  return { matchId, roomId, seats: await bySeat(owner, guest) };
}

/** Ordena a dos jugadores por el asiento que les tocó, que se sortea al empezar. */
export async function bySeat(one: Player, other: Player): Promise<readonly [Player, Player]> {
  return (await seatOf(one)) === 0 ? [one, other] : [other, one];
}

export async function seatOf({ page }: Player): Promise<number> {
  const mine = page.locator('.match-player', { has: page.getByText('Tú', { exact: true }) });
  return Number(await mine.getAttribute('data-seat'));
}

function lastSegment(page: Page | undefined): string {
  return new URL(page?.url() ?? '').pathname.split('/').at(-1) ?? '';
}

// --- El tablero --------------------------------------------------------------

export function board(page: Page): Locator {
  return page.locator('.four-board');
}

export function column(page: Page, index: number): Locator {
  return board(page).locator(`.four-column[data-column="${index}"]`);
}

/** Las fichas que hay en el tablero. */
export function tokens(page: Page): Locator {
  return board(page).locator('.four-cell.seat-0, .four-cell.seat-1');
}

export function cell(page: Page, columnIndex: number, row: number): Locator {
  return column(page, columnIndex).locator(`.four-cell[data-row="${row}"]`);
}

export function clock(page: Page, seat: number): Locator {
  return page.locator(`[data-clock-seat="${seat}"]`);
}

/**
 * Juega una serie de columnas pulsando el tablero, alternando los asientos.
 * Tras cada jugada espera a que los dos la vean. `played` son las jugadas
 * que la partida ya lleva.
 */
export async function play(match: Match, columns: readonly number[], played = 0): Promise<void> {
  for (const [index, columnIndex] of columns.entries()) {
    const mover = match.seats[(played + index) % 2];
    if (!mover) throw new Error('La partida no tiene dos jugadores');
    await column(mover.page, columnIndex).click();
    for (const { page } of match.seats) {
      await expect(tokens(page)).toHaveCount(played + index + 1);
    }
  }
}

// --- Por debajo de la página -------------------------------------------------

/** La partida tal como la API se la da a esta persona. */
export async function fetchMatch({ page }: Player, matchId: string): Promise<MatchView> {
  const body = await page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: 'include' });
    return (await response.json()) as { data: unknown };
  }, `${API_ORIGIN}/api/v1/matches/${matchId}`);
  return body.data as MatchView;
}

/**
 * Envía una orden por el canal de tiempo real sin pasar por la aplicación,
 * con una conexión propia abierta desde la página de esta persona (así
 * lleva su sesión y no la de otra), y devuelve lo que el servidor le
 * responde. Sirve para comprobar que el servidor decide, envíe lo que envíe
 * el navegador.
 */
export async function sendCommand(
  { page }: Player,
  command: { readonly type: string; readonly requestId?: string; readonly [key: string]: unknown },
): Promise<Notification> {
  const url = `${API_ORIGIN.replace(/^http/, 'ws')}${REALTIME_PATH}?${PROTOCOL_VERSION_PARAM}=${PROTOCOL_VERSION}`;
  const sent = { requestId: randomUUID(), ...command };

  return page.evaluate(
    ({ url, sent }) =>
      new Promise<Notification>((resolve, reject) => {
        const socket = new WebSocket(url);
        const finish = (settle: () => void) => {
          clearTimeout(timer);
          socket.close();
          settle();
        };
        const timer = setTimeout(
          () => finish(() => reject(new Error(`Sin respuesta a ${sent.type}`))),
          10_000,
        );
        socket.onmessage = (event) => {
          const received = JSON.parse(String(event.data)) as Notification;
          if (received.type === 'CONNECTION_ESTABLISHED') {
            socket.send(JSON.stringify(sent));
          } else if ('requestId' in received && received.requestId === sent.requestId) {
            finish(() => resolve(received));
          }
        };
        socket.onclose = (event) =>
          finish(() => reject(new Error(`El servidor cerró la conexión (${event.code})`)));
      }),
    { url, sent },
  );
}

/** Envía una jugada por debajo de la página. */
export function sendAction(
  player: Player,
  matchId: string,
  stateVersion: number,
  action: unknown,
  requestId: string = randomUUID(),
): Promise<Notification> {
  return sendCommand(player, {
    type: 'SUBMIT_ACTION',
    requestId,
    matchId,
    payload: { stateVersion, action },
  });
}

/** El código con el que el servidor rechazó una orden, con su motivo si lo trae. */
export function rejectionOf(notification: Notification): { code: string; reason?: string } | null {
  if (notification.type !== 'COMMAND_REJECTED') return null;
  const { code, reason } = notification.payload;
  return reason === undefined ? { code } : { code, reason };
}
