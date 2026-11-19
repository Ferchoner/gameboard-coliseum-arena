import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Clock } from '../../common/clock.js';
import type { AppConfig } from '../../config/config.js';
import { AbandonmentWatch } from './abandonment-watch.js';

/**
 * Las ausencias y sus temporizadores, con temporizadores falsos (ADR-015,
 * V1). Fuera de estas pruebas no programan nada en el entorno de pruebas
 * (ADR-013, H8; análisis del 2026-11-19, T-12).
 */

const config = { environment: 'development' } as AppConfig;

/** Un reloj que puede ir atrasado respecto de los temporizadores. */
class OffsetClock extends Clock {
  offsetMs = 0;
  override now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
}

describe('ausencias de una partida', () => {
  let clock: OffsetClock;
  let watch: AbandonmentWatch;
  let onDue: ReturnType<typeof vi.fn<(matchId: string) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = new OffsetClock();
    watch = new AbandonmentWatch(clock, config);
    onDue = vi.fn<(matchId: string) => void>();
    watch.listen(onDue);
  });

  afterEach(() => {
    watch.onApplicationShutdown();
    vi.useRealTimers();
  });

  const inMs = (ms: number) => new Date(Date.now() + ms);

  it('avisa cuando vence el plazo del ausente, y no antes', () => {
    watch.markAbsent('m1', 'p1', inMs(120_000));

    vi.advanceTimersByTime(119_999);
    expect(onDue).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDue).toHaveBeenCalledExactlyOnceWith('m1');
  });

  it('si el jugador vuelve, no avisa y deja de contarlo', () => {
    const abandonAt = inMs(120_000);
    watch.markAbsent('m1', 'p1', abandonAt);
    expect(watch.abandonAtOf('m1', 'p1')).toEqual(abandonAt);

    watch.markPresent('m1', 'p1');

    vi.advanceTimersByTime(200_000);
    expect(onDue).not.toHaveBeenCalled();
    expect(watch.abandonAtOf('m1', 'p1')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('marcar ausente a quien ya lo está no cambia su plazo', () => {
    const first = inMs(120_000);
    watch.markAbsent('m1', 'p1', first);
    watch.markAbsent('m1', 'p1', inMs(240_000));

    expect(watch.abandonAtOf('m1', 'p1')).toEqual(first);
    vi.advanceTimersByTime(120_000);
    expect(onDue).toHaveBeenCalledOnce();
  });

  it('si el temporizador salta antes de la hora del reloj, se vuelve a poner', () => {
    clock.offsetMs = -500;
    watch.markAbsent('m1', 'p1', new Date(clock.now().getTime() + 10_000));

    // El temporizador se puso a 10 s. Si mientras tanto el reloj se atrasa
    // medio segundo más, al saltar aún faltan 0,5 s para el plazo.
    clock.offsetMs = -1_000;
    vi.advanceTimersByTime(10_000);
    expect(onDue).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(onDue).toHaveBeenCalledExactlyOnceWith('m1');
  });

  it('dice qué ausentes y qué partidas ya vencieron', () => {
    watch.markAbsent('m1', 'p1', inMs(1_000));
    watch.markAbsent('m1', 'p2', inMs(5_000));
    watch.markAbsent('m2', 'p3', inMs(9_000));

    const now = inMs(6_000);
    expect(watch.dueAbsentees('m1', now)).toEqual(['p1', 'p2']);
    expect(watch.dueAbsentees('m2', now)).toEqual([]);
    expect(watch.dueMatchIds(now)).toEqual(['m1']);
  });

  it('olvidar la partida cancela sus avisos', () => {
    watch.markAbsent('m1', 'p1', inMs(1_000));
    watch.markAbsent('m1', 'p2', inMs(2_000));
    watch.forget('m1');

    vi.advanceTimersByTime(5_000);
    expect(onDue).not.toHaveBeenCalled();
    expect(watch.dueMatchIds(inMs(0))).toEqual([]);
  });

  it('al apagar el servidor no queda ningún aviso pendiente', () => {
    watch.markAbsent('m1', 'p1', inMs(1_000));
    watch.markAbsent('m2', 'p2', inMs(2_000));
    watch.onApplicationShutdown();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('en el entorno de pruebas cuenta la ausencia pero no programa nada', () => {
    const inTests = new AbandonmentWatch(new Clock(), { environment: 'test' } as AppConfig);
    inTests.markAbsent('m1', 'p1', inMs(1_000));

    expect(vi.getTimerCount()).toBe(0);
    expect(inTests.dueMatchIds(inMs(1_000))).toEqual(['m1']);
  });
});
