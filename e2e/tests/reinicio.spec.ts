import { expect, test } from '@playwright/test';
import {
  clock,
  clockMs,
  column,
  connectionLost,
  fetchMatch,
  play,
  startMatch,
  tokens,
} from '../support/app.ts';
import { CONTROL_ORIGIN } from '../support/settings.mjs';

/**
 * El criterio de aceptación del Hito 4: con dos personas jugando, el
 * servidor se reinicia y la partida sigue donde estaba, sin descontar a
 * nadie el tiempo que estuvo parado (reglas 7.28 y 7.29; ADR-015, V4 y V6).
 *
 * Reinicia la API de verdad, así que va en su propio grupo, después de
 * todas las demás pruebas.
 */

/** Cuánto está parada la API. */
const DOWN_MS = 6000;

async function restartApi(): Promise<void> {
  const response = await fetch(`${CONTROL_ORIGIN}/restart?downMs=${DOWN_MS}`, { method: 'POST' });
  expect(response.status).toBe(204);
}

test('la partida sigue tras reiniciar el servidor, sin descontar el tiempo parado', async ({
  browser,
}) => {
  test.slow();
  const match = await startMatch(browser);
  const [first, second] = match.seats;
  await play(match, [3]);

  // Le toca al asiento 1: su reloj corre.
  const before = await fetchMatch(second, match.matchId);
  const startedAt = Date.now();

  const restarted = restartApi();
  for (const { page } of match.seats) await expect(connectionLost(page)).toBeVisible();
  await restarted;
  const downFor = Date.now() - startedAt;

  // En cuanto vuelve, el reloj solo ha perdido lo que la API estuvo en marcha, no los 6 segundos.
  const after = await fetchMatch(second, match.matchId);
  expect(after.stateVersion).toBe(before.stateVersion);
  const lost =
    (before.players[1]?.clockRemainingMs ?? 0) - (after.players[1]?.clockRemainingMs ?? 0);
  expect(downFor).toBeGreaterThanOrEqual(DOWN_MS);
  expect(lost).toBeLessThan(DOWN_MS / 2);
  expect(after.players[0]?.clockRemainingMs).toBe(before.players[0]?.clockRemainingMs);

  // Los dos reconectan solos y ven la partida como estaba. Mientras no
  // había conexión, la página siguió descontando por su cuenta: al volver
  // muestra otra vez el reloj del servidor.
  for (const { page } of match.seats) {
    await expect(connectionLost(page)).toHaveCount(0, { timeout: 20_000 });
    await expect(tokens(page)).toHaveCount(1);
  }
  await expect
    .poll(async () => {
      const current = await fetchMatch(second, match.matchId);
      const shown = clockMs(await clock(first.page, 1).innerText());
      return Math.abs(shown - (current.players[1]?.clockRemainingMs ?? 0));
    })
    .toBeLessThanOrEqual(2000);

  // Y siguen jugando.
  await column(second.page, 4).click();
  for (const { page } of match.seats) await expect(tokens(page)).toHaveCount(2);
  await column(first.page, 3).click();
  for (const { page } of match.seats) await expect(tokens(page)).toHaveCount(3);
});
