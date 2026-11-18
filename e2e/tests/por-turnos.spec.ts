import { expect, type Browser, type Page, test } from '@playwright/test';
import { board, clock, column, type Player, seatOf, signUp, tokens } from '../support/app.ts';

/**
 * El criterio de aceptación del Hito 5 (`planning/backlog-mvp.md`): dos
 * personas juegan una partida completa de Cuatro en raya por turnos sin
 * coincidir conectadas en ningún momento, y cada una ve al entrar que le
 * toca (ADR-016, decisión N6). Cada persona abre su navegador, juega y lo
 * cierra antes de que la otra abra el suyo.
 */

const UUID = '[0-9a-f-]{36}';

/** Abre un navegador nuevo para esta persona e inicia sesión. Llega a la portada. */
async function signIn(browser: Browser, player: Player): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/entrar');
  await page.getByLabel('Nombre de usuario').fill(player.name);
  await page.getByLabel('Contraseña').fill(player.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(`Hola, ${player.name}.`)).toBeVisible();
  return page;
}

async function signOff(page: Page): Promise<void> {
  await page.context().close();
}

/** Crea una sala de Cuatro en raya por turnos, de 12 horas por jugador, sin revancha. */
async function createTurnBasedRoom(page: Page): Promise<string> {
  await page.getByRole('link', { name: 'Salas', exact: true }).click();
  await page.locator('#create-game').selectOption({ label: 'Cuatro en raya' });
  await page.locator('#create-mode').selectOption({ label: 'Por turnos' });
  await page.getByLabel('Tiempo por jugador').selectOption({ label: '12 horas' });
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await page.waitForURL(new RegExp(`/salas/${UUID}$`));
  await expect(page.getByText('La partida empieza en cuanto la sala se complete.')).toBeVisible();
  return new URL(page.url()).pathname.split('/').at(-1) ?? '';
}

/** La sección "Te toca" de la portada. */
const yourTurnSection = (page: Page) => page.getByTestId('your-turn');

/** El número de partidas en las que le toca, junto al enlace "Partidas" de la cabecera. */
const turnCount = (page: Page) => page.getByTestId('turn-count');

test('criterio del Hito 5: una partida completa sin coincidir conectadas', async ({ browser }) => {
  // Ana crea la sala y se va.
  const ana = await signUp(browser, 'ana');
  const roomId = await createTurnBasedRoom(ana.page);
  await signOff(ana.page);

  // Bea entra a la sala, con lo que empieza la partida, y se va.
  const bea = await signUp(browser, 'bea');
  await bea.page.goto(`/salas/${roomId}`);
  await bea.page.getByRole('button', { name: 'Entrar a la sala' }).click();
  await bea.page.waitForURL(new RegExp(`/partidas/${UUID}$`));
  await expect(board(bea.page)).toBeVisible();
  const matchId = new URL(bea.page.url()).pathname.split('/').at(-1) ?? '';
  // Los relojes por turnos se leen en horas.
  await expect(clock(bea.page, 0)).toHaveText(/^1[12] h \d{2} min$/);
  const seats = (await seatOf(bea)) === 0 ? [bea, ana] : [ana, bea];
  await signOff(bea.page);

  // Cuatro en vertical en la columna 0 para quien empieza.
  const columns = [0, 1, 0, 1, 0, 1, 0];
  for (const [index, columnIndex] of columns.entries()) {
    const mover = seats[index % 2] as Player;
    const page = await signIn(browser, mover);

    // Al entrar ve que le toca: en la portada, en la cabecera y en el título.
    const row = yourTurnSection(page).locator(`[data-match-id="${matchId}"]`);
    await expect(row).toContainText('Te toca');
    await expect(row).toContainText('Tienes hasta el');
    await expect(turnCount(page)).toContainText('1');
    await expect(page).toHaveTitle(/^\(1\) /);

    await row.getByRole('link', { name: 'Ir a la partida' }).click();
    await expect(page.getByText('Te toca jugar. Tienes hasta el')).toBeVisible();
    await column(page, columnIndex).click();
    await expect(tokens(page)).toHaveCount(index + 1);

    if (index < columns.length - 1) {
      // Ya no le toca: la cabecera lo dice enseguida.
      await expect(page.getByText(/^Le toca a /)).toBeVisible();
      await expect(turnCount(page)).toHaveCount(0);
    }
    await signOff(page);
  }

  // Quien perdió entra y no le toca nada: su partida está en el historial.
  const [winner, loser] = seats as [Player, Player];
  const page = await signIn(browser, loser);
  await expect(yourTurnSection(page)).toHaveCount(0);
  await expect(turnCount(page)).toHaveCount(0);
  await page.getByRole('link', { name: /^Partidas/ }).click();
  await expect(page.getByText('No tienes ninguna partida en curso.')).toBeVisible();
  const history = page.locator('section', {
    has: page.getByRole('heading', { name: 'Historial' }),
  });
  await expect(history.locator('li', { hasText: `Contra ${winner.name}` })).toContainText(
    'Derrota',
  );

  // Sin revancha, la sala se cerró: la partida no invita a volver a ella (ADR-016, N8).
  await page.goto(`/partidas/${matchId}`);
  await expect(page.locator('.result')).toContainText('Perdiste');
  await expect(page.getByText('La sala de esta partida se cerró al terminar.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver a la sala' })).toHaveCount(0);
  await signOff(page);
});

test('quien tiene la aplicación abierta en otra página recibe el aviso de turno', async ({
  browser,
}) => {
  const ana = await signUp(browser, 'ana');
  const roomId = await createTurnBasedRoom(ana.page);
  const bea = await signUp(browser, 'bea');
  await bea.page.goto(`/salas/${roomId}`);
  await bea.page.getByRole('button', { name: 'Entrar a la sala' }).click();
  await bea.page.waitForURL(new RegExp(`/partidas/${UUID}$`));
  await expect(board(bea.page)).toBeVisible();

  const [first, second] = (await seatOf(bea)) === 0 ? [bea, ana] : [ana, bea];
  // Quien juega primero lo hace desde la partida; la otra persona está en la lista de salas.
  const matchUrl = bea.page.url();
  await first.page.goto(matchUrl);
  await second.page.goto('/salas');
  await expect(second.page.getByRole('heading', { name: 'Salas', exact: true })).toBeVisible();

  await column(first.page, 3).click();
  await expect(tokens(first.page)).toHaveCount(1);

  // Le llega el aviso emergente, con el enlace a la partida, y el número en la cabecera.
  const alert = second.page.getByTestId('turn-alert');
  await expect(alert).toContainText(`Te toca contra ${first.name}.`);
  await expect(turnCount(second.page)).toContainText('1');
  await expect(second.page).toHaveTitle(/^\(1\) /);

  await alert.getByRole('link', { name: 'Jugar' }).click();
  await expect(tokens(second.page)).toHaveCount(1);
  await expect(second.page.getByTestId('turn-alert')).toHaveCount(0);
  await expect(second.page.getByText('Te toca jugar.')).toBeVisible();
});
