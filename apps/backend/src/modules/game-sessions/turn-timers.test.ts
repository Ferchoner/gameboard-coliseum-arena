import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Clock } from '../../common/clock.js';
import type { AppConfig } from '../../config/config.js';
import { TurnTimers } from './turn-timers.js';

/**
 * Los temporizadores de reloj, con temporizadores falsos (ADR-014, K3). Fuera
 * de estas pruebas no programan nada en el entorno de pruebas (ADR-013, H8),
 * así que, si dejaran de funcionar, la revisión periódica lo taparía
 * (análisis del 2026-11-19, T-12).
 */

const MAX_DELAY_MS = 2 ** 31 - 1;
const config = { environment: 'development' } as AppConfig;

describe('temporizadores de reloj', () => {
  let timers: TurnTimers;
  let onDue: ReturnType<typeof vi.fn<(matchId: string) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    timers = new TurnTimers(new Clock(), config);
    onDue = vi.fn<(matchId: string) => void>();
    timers.listen(onDue);
  });

  afterEach(() => {
    timers.onApplicationShutdown();
    vi.useRealTimers();
  });

  const inMs = (ms: number) => new Date(Date.now() + ms);

  it('avisa a la hora en que se agota el reloj, y no antes', () => {
    timers.arm('m1', inMs(5_000));

    vi.advanceTimersByTime(4_999);
    expect(onDue).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDue).toHaveBeenCalledExactlyOnceWith('m1');
  });

  it('avisa enseguida si la hora ya pasó', () => {
    timers.arm('m1', inMs(-1_000));

    vi.advanceTimersByTime(0);
    expect(onDue).toHaveBeenCalledExactlyOnceWith('m1');
  });

  it('cancelar impide el aviso', () => {
    timers.arm('m1', inMs(5_000));
    timers.cancel('m1');

    vi.advanceTimersByTime(10_000);
    expect(onDue).not.toHaveBeenCalled();
  });

  it('volver a ponerlo sustituye la hora anterior', () => {
    timers.arm('m1', inMs(5_000));
    timers.arm('m1', inMs(8_000));

    vi.advanceTimersByTime(5_000);
    expect(onDue).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3_000);
    expect(onDue).toHaveBeenCalledExactlyOnceWith('m1');
  });

  it('lleva un temporizador por partida', () => {
    timers.arm('m1', inMs(5_000));
    timers.arm('m2', inMs(3_000));
    timers.cancel('m1');

    vi.advanceTimersByTime(10_000);
    expect(onDue).toHaveBeenCalledExactlyOnceWith('m2');
  });

  it('no pasa del mayor retraso que admite Node.js, como en una partida por turnos de 36 horas', () => {
    // Un retraso mayor que 2^31 - 1 ms se convertiría en 1 ms.
    timers.arm('m1', inMs(MAX_DELAY_MS + 60_000));

    vi.advanceTimersByTime(1_000);
    expect(onDue).not.toHaveBeenCalled();

    vi.advanceTimersByTime(MAX_DELAY_MS - 1_000);
    expect(onDue).toHaveBeenCalledExactlyOnceWith('m1');
  });

  it('al apagar el servidor no queda ningún aviso pendiente', () => {
    timers.arm('m1', inMs(5_000));
    timers.arm('m2', inMs(6_000));
    timers.onApplicationShutdown();

    vi.advanceTimersByTime(10_000);
    expect(onDue).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('en el entorno de pruebas no programa nada', () => {
    const inTests = new TurnTimers(new Clock(), { environment: 'test' } as AppConfig);
    inTests.listen(onDue);
    inTests.arm('m1', inMs(5_000));

    expect(vi.getTimerCount()).toBe(0);
  });
});
