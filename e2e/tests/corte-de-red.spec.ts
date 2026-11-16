import { expect, type Page, test } from '@playwright/test';
import {
  abandonCountdown,
  column,
  connectionLost,
  play,
  playerCard,
  startMatch,
  tokens,
} from '../support/app.ts';
import { ABANDON_SECONDS } from '../support/settings.mjs';

/**
 * Un corte de red de verdad: la conexión deja de recibir sin cerrarse, y
 * el servidor solo se entera cuando falla un ping (ADR-015, decisiones V3
 * y V6). Aquí los latidos van cada 2 segundos y el abandono llega a los
 * 10, para no esperar minutos.
 */

const result = (page: Page) => page.locator('.result');

test('quien pierde la red y vuelve a tiempo sigue jugando', async ({ browser }) => {
  const match = await startMatch(browser);
  const [first, second] = match.seats;
  await play(match, [3]);

  await second.page.context().setOffline(true);

  // Su rival lo ve desconectado, con la cuenta atrás del abandono.
  await expect(playerCard(first.page, 1)).toContainText('Desconectado');
  await expect(abandonCountdown(first.page, 1)).toContainText('Pierde por abandono en 0:');
  // Quien perdió la red ve el aviso, y que puede perder la partida.
  await expect(connectionLost(second.page)).toContainText(
    'Si no vuelves a conectar en 2 minutos, perderás la partida.',
  );

  // Al volver la red reconecta enseguida, sin esperar al siguiente reintento (V7).
  // Sin el aviso de la red, la espera progresiva tardaría hasta 8 segundos más.
  await second.page.context().setOffline(false);
  await expect(connectionLost(second.page)).toHaveCount(0, { timeout: 2_000 });
  await expect(playerCard(first.page, 1)).toContainText('Conectado');
  await expect(abandonCountdown(first.page, 1)).toHaveCount(0);

  // La partida sigue donde estaba.
  await column(second.page, 4).click();
  for (const { page } of match.seats) await expect(tokens(page)).toHaveCount(2);
  await expect(result(first.page)).toHaveCount(0);
});

test('quien no vuelve a tiempo pierde por abandono y sale de la sala', async ({ browser }) => {
  test.slow();
  const match = await startMatch(browser);
  const [first, second] = match.seats;
  await play(match, [3]);

  await second.page.context().setOffline(true);
  await expect(abandonCountdown(first.page, 1)).toBeVisible();

  await expect(result(first.page)).toContainText('Ganaste', {
    timeout: (ABANDON_SECONDS + 10) * 1000,
  });
  await expect(result(first.page)).toContainText(`${second.name} abandonó la partida.`);

  // Cuando vuelve, ve que perdió y que ya no está en la sala (regla 7.32).
  await second.page.context().setOffline(false);
  await expect(result(second.page)).toContainText('Perdiste');
  await expect(result(second.page)).toContainText('Abandonaste la partida.');
  await expect(second.page.getByText('Al perder por abandono saliste de la sala.')).toBeVisible();
  await expect(second.page.getByRole('link', { name: 'Volver a la sala' })).toHaveCount(0);
});
