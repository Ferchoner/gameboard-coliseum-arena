import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import {
  board,
  bySeat,
  cell,
  clock,
  column,
  createRoom,
  fetchMatch,
  getReady,
  type Match,
  play,
  rejectionOf,
  seatOf,
  sendAction,
  sendCommand,
  signUp,
  startMatch,
  tokens,
} from '../support/app.ts';
import { runOutTheClock } from '../support/database.ts';

/**
 * Los diez criterios de aceptación del corte vertical
 * (`planning/backlog-mvp.md`, Hito 3), con dos navegadores, uno por persona.
 */

const drop = (columnIndex: number) => ({ type: 'DROP_TOKEN', column: columnIndex });

/** Las 42 jugadas de una partida que llena el tablero sin que nadie alinee cuatro. */
const DRAW_GAME = [
  0, 1, 0, 1, 0, 1, 2, 3, 2, 3, 2, 3, 1, 0, 1, 0, 1, 0, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5,
  4, 5, 4, 6, 6, 6, 6, 6, 6,
];

/** El panel con el resultado de la partida. */
const result = (page: Page) => page.locator('.result');

/** La fila de una partida en el historial de quien mira, por el nombre de su rival. */
async function historyRow(page: Page, rival: string) {
  await page.getByRole('link', { name: 'Ver mis partidas' }).click();
  const history = page.locator('section', {
    has: page.getByRole('heading', { name: 'Historial' }),
  });
  return history.locator('li', { hasText: `Contra ${rival}` });
}

async function expectInProgress(match: Match): Promise<void> {
  for (const { page } of match.seats) {
    await expect(page.getByText('En curso', { exact: true })).toBeVisible();
    await expect(result(page)).toHaveCount(0);
  }
}

test('criterio 1: una persona crea su cuenta, sale y vuelve a entrar', async ({ browser }) => {
  const { page, name, password } = await signUp(browser, 'ana');

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.getByText('Crea una cuenta o entra para jugar.')).toBeVisible();

  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await page.getByLabel('Nombre de usuario').fill(name);
  await page.getByLabel('Contraseña').fill('otra-clave-distinta');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(
    page.getByText('El nombre de usuario o la contraseña no son correctos.'),
  ).toBeVisible();

  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(`Hola, ${name}.`)).toBeVisible();
});

test('criterios 2, 3, 4, 7, 8 y 9: una partida entera, del registro a la revancha', async ({
  browser,
}) => {
  const ana = await signUp(browser, 'ana');
  const bea = await signUp(browser, 'bea');

  // 2. Ana crea una sala de Cuatro en raya en tiempo real y Bea entra desde la lista.
  const roomId = await createRoom(ana);
  await expect(ana.page.getByRole('heading', { name: `Sala de ${ana.name}` })).toBeVisible();
  await expect(ana.page.getByText('Jugadores (1 de 2)')).toBeVisible();

  await bea.page.getByRole('link', { name: 'Salas', exact: true }).click();
  await bea.page
    .locator('li.room', { hasText: `Sala de ${ana.name}` })
    .getByRole('button', { name: 'Entrar' })
    .click();
  await bea.page.waitForURL(`**/salas/${roomId}`);
  for (const { page } of [ana, bea]) {
    await expect(page.getByText('Jugadores (2 de 2)')).toBeVisible();
    await expect(page.getByText('Cuatro en raya')).toBeVisible();
    await expect(page.getByText('En tiempo real')).toBeVisible();
  }

  // 3. Con una sola persona lista no empieza; cuando lo están las dos, empieza sola.
  await ana.page.getByRole('button', { name: 'Estoy listo' }).click();
  await expect(bea.page.locator('.member', { hasText: ana.name }).getByText('Listo')).toBeVisible();
  await expect(ana.page.getByText('En espera')).toBeVisible();

  await bea.page.getByRole('button', { name: 'Estoy listo' }).click();
  for (const { page } of [ana, bea]) {
    await page.waitForURL(/\/partidas\//);
    await expect(board(page)).toBeVisible();
  }
  const matchId = new URL(ana.page.url()).pathname.split('/').at(-1) ?? '';
  expect(new URL(bea.page.url()).pathname).toBe(`/partidas/${matchId}`);

  // 4. Juegan por turnos, y el tablero y los dos relojes están al día para los dos.
  const seats = await bySeat(ana, bea);
  const [first, second] = seats;
  const match: Match = { matchId, roomId, seats };
  await expect(first.page.getByText('Te toca jugar.')).toBeVisible();
  await expect(second.page.getByText(`Le toca a ${first.name}.`)).toBeVisible();
  await expect(column(second.page, 3)).toBeDisabled();
  for (const { page } of seats) {
    await expect(tokens(page)).toHaveCount(0);
    await expect(clock(page, 1)).toHaveText('5:00');
  }

  await column(first.page, 3).click();
  for (const { page } of seats) {
    await expect(cell(page, 3, 0)).toHaveClass(/seat-0/);
    await expect(tokens(page)).toHaveCount(1);
  }
  await expect(second.page.getByText('Te toca jugar.')).toBeVisible();
  await expect(first.page.getByText(`Le toca a ${second.name}.`)).toBeVisible();

  // Corre el reloj de quien tiene el turno y el otro está parado, en las dos pantallas.
  const stopped = await clock(first.page, 0).textContent();
  for (const { page } of seats) {
    await expect(clock(page, 1)).not.toHaveText('5:00');
    await expect(clock(page, 0)).toHaveText(stopped ?? '');
  }

  // 7. Quien juega primero alinea cuatro en la columna central, y los dos ven lo mismo.
  await play(match, [4, 3, 4, 3, 4, 3], 1);
  await expect(result(first.page)).toContainText('Ganaste');
  await expect(result(second.page)).toContainText('Perdiste');
  for (const { page } of seats) {
    await expect(result(page)).toContainText('Cuatro en línea.');
    await expect(page.getByText('Terminada', { exact: true })).toBeVisible();
    await expect(board(page).locator('.four-cell.winning')).toHaveCount(4);
    await expect(board(page).locator('.four-cell.winning.seat-0')).toHaveCount(4);
    await expect(column(page, 0)).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Rendirse' })).toHaveCount(0);
  }

  // 8. Los dos tienen la partida en su historial y pueden volver a ver cómo quedó.
  const wonRow = await historyRow(first.page, second.name);
  await expect(wonRow).toContainText('Victoria');
  await expect(wonRow).toContainText('partida completa');
  const lostRow = await historyRow(second.page, first.name);
  await expect(lostRow).toContainText('Derrota');
  for (const [page, row] of [
    [first.page, wonRow],
    [second.page, lostRow],
  ] as const) {
    await row.getByRole('link', { name: 'Ver' }).click();
    await page.waitForURL(`**/partidas/${matchId}`);
    await expect(tokens(page)).toHaveCount(7);
    await expect(board(page).locator('.four-cell.winning')).toHaveCount(4);
  }

  // 9. La sala vuelve a estar en espera, sin nadie listo, y la revancha cambia los asientos.
  for (const { page } of seats) {
    await page.getByRole('link', { name: 'Volver a la sala' }).click();
    await page.waitForURL(`**/salas/${roomId}`);
    await expect(page.getByText('En espera')).toBeVisible();
    await expect(page.getByText('Sin marcar')).toHaveCount(2);
  }
  const rematchId = await getReady(first, second);
  expect(rematchId).not.toBe(matchId);
  expect(await seatOf(first)).toBe(1);
  expect(await seatOf(second)).toBe(0);
  await expect(second.page.getByText('Te toca jugar.')).toBeVisible();
  await expect(tokens(first.page)).toHaveCount(0);
});

test('criterios 5 y 6: el servidor rechaza cada jugada inválida con su código y no aplica dos veces la repetida', async ({
  browser,
}) => {
  const match = await startMatch(browser);
  const [first, second] = match.seats;
  const { matchId } = match;

  // Fuera de turno.
  const atStart = (await fetchMatch(first, matchId)).stateVersion;
  await expect(column(second.page, 0)).toBeDisabled();
  expect(rejectionOf(await sendAction(second, matchId, atStart, drop(0)))).toEqual({
    code: 'NOT_YOUR_TURN',
  });

  // Columna llena: la página ya no deja pulsarla y el servidor la rechaza igual.
  await play(match, [0, 0, 0, 0, 0, 0]);
  const version = (await fetchMatch(first, matchId)).stateVersion;
  await expect(first.page.getByText('Te toca jugar.')).toBeVisible();
  await expect(column(first.page, 0)).toBeDisabled();
  await expect(column(first.page, 1)).toBeEnabled();
  expect(rejectionOf(await sendAction(first, matchId, version, drop(0)))).toEqual({
    code: 'INVALID_ACTION',
    reason: 'COLUMN_FULL',
  });
  expect(rejectionOf(await sendAction(first, matchId, version, drop(7)))).toEqual({
    code: 'INVALID_ACTION',
    reason: 'COLUMN_OUT_OF_RANGE',
  });

  // Estado antiguo: una jugada pensada sobre un tablero que ya cambió.
  const stale = await sendAction(first, matchId, version - 1, drop(1));
  expect(rejectionOf(stale)).toEqual({ code: 'STALE_STATE_VERSION' });
  expect(stale).toMatchObject({ payload: { currentStateVersion: version } });

  // Nada de lo anterior tocó la partida.
  expect((await fetchMatch(first, matchId)).stateVersion).toBe(version);
  for (const { page } of match.seats) await expect(tokens(page)).toHaveCount(6);

  // 6. La misma jugada enviada dos veces, con el mismo identificador, se aplica una vez.
  const requestId = randomUUID();
  const applied = await sendAction(first, matchId, version, drop(1), requestId);
  const repeated = await sendAction(first, matchId, version, drop(1), requestId);
  expect(applied).toMatchObject({ type: 'MATCH_UPDATED', requestId });
  expect(repeated).toMatchObject({ type: 'MATCH_UPDATED', requestId });

  const after = await fetchMatch(first, matchId);
  expect(after.stateVersion).toBeGreaterThan(version);
  expect(applied).toMatchObject({ payload: { match: { stateVersion: after.stateVersion } } });
  expect(repeated).toMatchObject({ payload: { match: { stateVersion: after.stateVersion } } });
  for (const { page } of match.seats) {
    await expect(tokens(page)).toHaveCount(7);
    await expect(column(page, 1).locator('.seat-0, .seat-1')).toHaveCount(1);
  }
  await expect(second.page.getByText('Te toca jugar.')).toBeVisible();
});

test('criterio 7: la partida termina por rendición y los dos ven el mismo resultado', async ({
  browser,
}) => {
  const match = await startMatch(browser);
  const [first, second] = match.seats;
  await play(match, [3, 3]);

  // Rendirse pide confirmación, y se puede hacer sin tener el turno.
  await second.page.getByRole('button', { name: 'Rendirse' }).click();
  await second.page.getByRole('button', { name: 'Seguir jugando' }).click();
  await expectInProgress(match);

  await second.page.getByRole('button', { name: 'Rendirse' }).click();
  await second.page.getByRole('button', { name: 'Sí, rendirme' }).click();

  await expect(result(second.page)).toContainText('Perdiste');
  await expect(result(second.page)).toContainText('Te rendiste.');
  await expect(result(first.page)).toContainText('Ganaste');
  await expect(result(first.page)).toContainText(`${second.name} se rindió.`);
  for (const { page } of match.seats) {
    await expect(tokens(page)).toHaveCount(2);
    await expect(column(page, 0)).toBeDisabled();
  }

  await expect(await historyRow(first.page, second.name)).toContainText('Victoria · por rendición');
  await expect(await historyRow(second.page, first.name)).toContainText('Derrota · por rendición');
});

test('criterio 7: la partida termina cuando a alguien se le acaba el tiempo', async ({
  browser,
}) => {
  const match = await startMatch(browser);
  const [first, second] = match.seats;
  await play(match, [3]);

  // Le toca a quien juega segundo, y su reloj se agota sin que nadie envíe nada.
  await runOutTheClock(match.matchId);

  await expect(result(second.page)).toContainText('Perdiste');
  await expect(result(second.page)).toContainText('Se te acabó el tiempo.');
  await expect(result(first.page)).toContainText('Ganaste');
  await expect(result(first.page)).toContainText(`A ${second.name} se le acabó el tiempo.`);
  for (const { page } of match.seats) {
    await expect(clock(page, 1)).toHaveText('0:00');
    await expect(clock(page, 0)).not.toHaveText('0:00');
    await expect(column(page, 0)).toBeDisabled();
  }

  await expect(await historyRow(first.page, second.name)).toContainText('Victoria · por tiempo');
  await expect(await historyRow(second.page, first.name)).toContainText('Derrota · por tiempo');
});

test('criterio 7: la partida termina en empate cuando el tablero se llena', async ({ browser }) => {
  const match = await startMatch(browser);
  const [first, second] = match.seats;

  await play(match, DRAW_GAME);

  for (const { page } of match.seats) {
    await expect(result(page)).toContainText('Empate');
    await expect(result(page)).toContainText('El tablero se llenó sin cuatro en línea.');
    await expect(tokens(page)).toHaveCount(42);
    await expect(board(page).locator('.four-cell.winning')).toHaveCount(0);
  }
  await expect(await historyRow(first.page, second.name)).toContainText('Empate');
  await expect(await historyRow(second.page, first.name)).toContainText('Empate');
});

test('criterio 10: nadie puede actuar por otra persona, envíe lo que envíe', async ({
  browser,
}) => {
  const match = await startMatch(browser);
  const [first, second] = match.seats;
  const { matchId } = match;
  const { stateVersion, players } = await fetchMatch(first, matchId);
  const outsider = await signUp(browser, 'eva');

  // Quien no juega la partida no puede jugarla, rendirla, seguirla ni verla.
  expect(rejectionOf(await sendAction(outsider, matchId, stateVersion, drop(3)))).toEqual({
    code: 'PLAYER_NOT_IN_MATCH',
  });
  for (const type of ['RESIGN_MATCH', 'SUBSCRIBE_MATCH']) {
    expect(rejectionOf(await sendCommand(outsider, { type, matchId }))).toEqual({
      code: 'PLAYER_NOT_IN_MATCH',
    });
  }
  await outsider.page.goto(`/partidas/${matchId}`);
  await expect(outsider.page.getByText('No participas en esa partida.')).toBeVisible();
  await expect(board(outsider.page)).toHaveCount(0);

  // Quien no tiene el turno no puede jugar diciendo que es el otro asiento ni la otra persona:
  // el servidor sabe quién es por su sesión y no acepta que el mensaje lo diga.
  expect(
    rejectionOf(await sendAction(second, matchId, stateVersion, { ...drop(3), seat: 0 })),
  ).toEqual({ code: 'NOT_YOUR_TURN' });
  const asAnother = await sendCommand(second, {
    type: 'SUBMIT_ACTION',
    matchId,
    playerId: players[0]?.playerId,
    payload: { stateVersion, action: drop(3) },
  });
  expect(rejectionOf(asAnother)).toEqual({ code: 'INVALID_MESSAGE' });

  // Sin sesión no se llega ni a la página ni a los datos.
  const anonymous = await (await browser.newContext()).newPage();
  await anonymous.goto(`/partidas/${matchId}`);
  await anonymous.waitForURL('**/entrar');

  // La partida sigue como estaba: sin fichas, en curso y con el turno de quien empieza.
  expect((await fetchMatch(first, matchId)).stateVersion).toBe(stateVersion);
  await expectInProgress(match);
  for (const { page } of match.seats) await expect(tokens(page)).toHaveCount(0);
  await expect(first.page.getByText('Te toca jugar.')).toBeVisible();
});
