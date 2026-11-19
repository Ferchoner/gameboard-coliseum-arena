import { expect, type Page, test } from '@playwright/test';
import { emailOf, resetLinkFor, signInElsewhere } from '../support/account.ts';
import { board, signUp, startMatch } from '../support/app.ts';

/**
 * El criterio de aceptación del Hito 6 (`planning/backlog-mvp.md`; ADR-017,
 * U1 y U10), en lo que toca a la cuenta: el perfil, la contraseña, su
 * recuperación por correo y el perfil público con las estadísticas. La
 * administración va en `administracion.spec.ts`.
 */

/** La página de entrada, que es adonde va quien se queda sin sesión en una página privada. */
async function expectSignedOut(page: Page): Promise<void> {
  await page.waitForURL('**/entrar');
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
}

test('criterio del Hito 6: cambiar el nombre visible y la contraseña', async ({ browser }) => {
  const ana = await signUp(browser, 'ana');
  const bea = await signUp(browser, 'bea');
  // Ana tiene la sesión abierta también en otro navegador, en las salas.
  const elsewhere = await signInElsewhere(browser, ana);
  await elsewhere.getByRole('link', { name: 'Salas', exact: true }).click();

  // Su nombre en la cabecera lleva a su cuenta.
  await ana.page.getByTestId('nav-account').click();
  await ana.page.waitForURL('**/cuenta');
  await expect(ana.page.getByTestId('account-username')).toHaveText(ana.name);

  await ana.page.getByLabel('Nombre visible').fill('  Ana López  ');
  await ana.page.getByLabel('Sobre ti').fill('Juego por las tardes.');
  await ana.page.getByRole('button', { name: 'Guardar el perfil' }).click();
  await expect(ana.page.getByText('Perfil guardado.')).toBeVisible();
  await expect(ana.page.getByTestId('nav-account')).toHaveText('Sesión de Ana López');

  // Los demás ven el nombre nuevo en su perfil público.
  await bea.page.goto(`/jugadores/${ana.name}`);
  await expect(bea.page.getByRole('heading', { name: 'Ana López' })).toBeVisible();
  await expect(bea.page.getByText('Juego por las tardes.')).toBeVisible();
  await expect(bea.page.getByRole('link', { name: 'Editar tu perfil' })).toHaveCount(0);

  // Con la contraseña actual equivocada no cambia.
  await ana.page.getByLabel('Contraseña actual').fill('no-es-esta-clave');
  await ana.page.getByLabel('Contraseña nueva').fill('otra-clave-larga-2');
  await ana.page.getByRole('button', { name: 'Cambiar la contraseña' }).click();
  await expect(ana.page.getByText('La contraseña actual no es correcta.')).toBeVisible();

  await ana.page.getByLabel('Contraseña actual').fill(ana.password);
  await ana.page.getByRole('button', { name: 'Cambiar la contraseña' }).click();
  await expect(ana.page.getByText('Contraseña cambiada.')).toBeVisible();

  // La sesión del otro navegador se cierra al instante; esta sigue abierta.
  await expectSignedOut(elsewhere);
  await ana.page.reload();
  await expect(ana.page.getByTestId('account-username')).toHaveText(ana.name);
  await signInElsewhere(browser, ana, 'otra-clave-larga-2');
});

test('criterio del Hito 6: recuperar la contraseña con el enlace del correo', async ({
  browser,
}) => {
  const ana = await signUp(browser, 'ana');
  await ana.page.getByRole('link', { name: 'Salas', exact: true }).click();
  const elsewhere = await signInElsewhere(browser, ana);
  await elsewhere.getByRole('link', { name: 'Partidas', exact: true }).click();

  // En otro navegador, sin sesión, la ha olvidado.
  const forgot = await (await browser.newContext()).newPage();
  await forgot.goto('/entrar');
  await forgot.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await forgot.waitForURL('**/recuperar-contrasena');
  await forgot.getByLabel('Correo electrónico').fill(emailOf(ana));
  await forgot.getByRole('button', { name: 'Enviar el enlace' }).click();
  await expect(forgot.getByText(`Si hay una cuenta con el correo ${emailOf(ana)}`)).toBeVisible();

  // Abre el enlace del correo. El token no se queda en la dirección.
  const link = await resetLinkFor(emailOf(ana));
  await forgot.goto(link);
  await expect(forgot.getByText('Elige tu contraseña nueva.')).toBeVisible();
  expect(new URL(forgot.url()).hash).toBe('');
  await forgot.getByLabel('Contraseña nueva').fill('clave-recuperada-3');
  await forgot.getByRole('button', { name: 'Guardar la contraseña nueva' }).click();
  await expect(forgot.getByText('Contraseña cambiada. Ya puedes entrar con ella.')).toBeVisible();

  // Todas sus sesiones abiertas se cierran.
  await expectSignedOut(ana.page);
  await expectSignedOut(elsewhere);

  // El mismo enlace no sirve otra vez.
  const again = await (await browser.newContext()).newPage();
  await again.goto(link);
  await again.getByLabel('Contraseña nueva').fill('otra-clave-mas-4');
  await again.getByRole('button', { name: 'Guardar la contraseña nueva' }).click();
  await expect(again.getByText('El enlace para cambiar la contraseña no es válido')).toBeVisible();

  await forgot.goto('/entrar');
  await forgot.getByLabel('Nombre de usuario').fill(ana.name);
  await forgot.getByLabel('Contraseña').fill('clave-recuperada-3');
  await forgot.getByRole('button', { name: 'Entrar' }).click();
  await expect(forgot.getByText(`Hola, ${ana.name}.`)).toBeVisible();
});

test('criterio del Hito 6: el perfil público muestra las estadísticas al día', async ({
  browser,
}) => {
  const match = await startMatch(browser);
  const [first, second] = match.seats;

  // El nombre del rival en la partida lleva a su perfil, todavía sin partidas terminadas.
  await second.page.locator('.match-player').getByRole('link', { name: first.name }).click();
  await second.page.waitForURL(`**/jugadores/${first.name}`);
  await expect(second.page.getByRole('heading', { name: first.name })).toBeVisible();
  await expect(second.page.getByText('Todavía no ha terminado ninguna partida.')).toBeVisible();
  await second.page.goBack();
  await expect(board(second.page)).toBeVisible();

  await second.page.getByRole('button', { name: 'Rendirse' }).click();
  await second.page.getByRole('button', { name: 'Sí, rendirme' }).click();
  await expect(second.page.getByText('Te rendiste.')).toBeVisible();

  // Al terminar, las estadísticas de los dos ya cuentan la partida.
  await second.page.goto(`/jugadores/${first.name}`);
  const winner = second.page.locator('tr[data-game="four-in-a-row"]');
  await expect(winner.getByRole('rowheader')).toHaveText('Cuatro en raya');
  await expect(winner.locator('[data-stat="played"]')).toHaveText('1');
  await expect(winner.locator('[data-stat="wins"]')).toHaveText('1');
  await expect(winner.locator('[data-stat="losses"]')).toHaveText('0');

  await first.page.goto(`/jugadores/${second.name}`);
  const loser = first.page.locator('tr[data-game="four-in-a-row"]');
  await expect(loser.locator('[data-stat="played"]')).toHaveText('1');
  await expect(loser.locator('[data-stat="losses"]')).toHaveText('1');

  // Su propio perfil le ofrece editarlo.
  await first.page.goto(`/jugadores/${first.name}`);
  await first.page.getByRole('link', { name: 'Editar tu perfil' }).click();
  await first.page.waitForURL('**/cuenta');
});
