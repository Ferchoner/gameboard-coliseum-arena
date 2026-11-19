import { expect, type Page, test } from '@playwright/test';
import { adminApi, grantAdmin, signInElsewhere } from '../support/account.ts';
import { board, createRoom, signUp, startMatch } from '../support/app.ts';

/**
 * El criterio de aceptación del Hito 6 en lo que toca a la administración
 * (ADR-017, U1 y U10): un administrador, solo con la API, suspende una
 * cuenta, anula una partida y retira un juego del catálogo, y cada persona
 * lo ve en su navegador.
 *
 * Retira Cuatro en raya del catálogo, que usan todas las demás pruebas, así
 * que va en el grupo que corre al final y de una en una.
 */

/** Los juegos de la portada. */
async function catalogOn(page: Page): Promise<Page> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Juegos', exact: true })).toBeVisible();
  return page;
}

test('criterio del Hito 6: la administración, vista desde los navegadores', async ({ browser }) => {
  test.slow();
  const admin = await signUp(browser, 'admin');
  grantAdmin(admin.name);
  const api = await adminApi(admin);

  // --- Suspender una cuenta: su dueña sale al instante de todas sus pestañas.
  const carla = await signUp(browser, 'carla');
  await carla.page.getByRole('link', { name: 'Salas', exact: true }).click();
  const carlaElsewhere = await signInElsewhere(browser, carla);
  await carlaElsewhere.getByRole('link', { name: 'Partidas', exact: true }).click();

  const found = await api.get(`admin/users?username=${carla.name}`);
  expect(found.status()).toBe(200);
  const [carlaAccount] = (await found.json()).data.items as { userId: string }[];
  const suspended = await api.put(`admin/users/${carlaAccount?.userId}/status`, {
    data: { status: 'SUSPENDED' },
  });
  expect(suspended.status()).toBe(200);

  for (const page of [carla.page, carlaElsewhere]) {
    await page.waitForURL('**/entrar');
  }
  await carla.page.getByLabel('Nombre de usuario').fill(carla.name);
  await carla.page.getByLabel('Contraseña').fill(carla.password);
  await carla.page.getByRole('button', { name: 'Entrar' }).click();
  await expect(carla.page.getByText('Tu cuenta está suspendida.')).toBeVisible();

  // --- Anular una partida en curso: los dos ven que se anuló y que no cuenta.
  const match = await startMatch(browser);
  const aborted = await api.post(`admin/matches/${match.matchId}/abort`);
  expect(aborted.status()).toBe(204);
  for (const { page } of match.seats) {
    await expect(
      page.getByText('Un administrador anuló la partida. No cuenta para nadie.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rendirse' })).toHaveCount(0);
  }
  const [first] = match.seats;
  await first.page.goto(`/jugadores/${first.name}`);
  await expect(first.page.getByText('Todavía no ha terminado ninguna partida.')).toBeVisible();

  // --- Retirar Cuatro en raya del catálogo y volver a ponerlo, sin desplegar.
  const dani = await signUp(browser, 'dani');
  const roomId = await createRoom(dani);
  const removed = await api.put('admin/games/four-in-a-row/status', {
    data: { status: 'INACTIVE' },
  });
  expect(removed.status()).toBe(200);

  // La sala que esperaba se cierra delante de quien la creó, y el juego desaparece.
  await expect(dani.page.getByText('Un administrador cerró la sala.')).toBeVisible();
  expect(new URL(dani.page.url()).pathname).toBe(`/salas/${roomId}`);
  // Puede haber otros juegos activos (Batalla naval, si la activó su prueba): solo falta este.
  const home = await catalogOn(dani.page);
  await expect(
    home.locator('.game').or(home.getByText('Todavía no hay juegos disponibles.')).first(),
  ).toBeVisible();
  await expect(home.locator('.game', { hasText: 'Cuatro en raya' })).toHaveCount(0);

  const restored = await api.put('admin/games/four-in-a-row/status', {
    data: { status: 'ACTIVE' },
  });
  expect(restored.status()).toBe(200);
  await catalogOn(dani.page);
  await expect(dani.page.locator('.game', { hasText: 'Cuatro en raya' })).toBeVisible();

  // Y se vuelve a jugar.
  const again = await startMatch(browser);
  await expect(board(again.seats[0].page)).toBeVisible();
  await api.dispose();
});
