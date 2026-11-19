import { randomUUID } from 'node:crypto';
import type {
  GameEventView,
  ListMyMatchesQuery,
  MatchAbortReason,
  MatchEndReason,
  MatchSummaryView,
  Page,
  PlayerRef,
  TimeControl,
} from '@gameboard/contracts';
import type { AnyGameEngine, SeatRetirementReason } from '@gameboard/game-engine';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Clock } from '../../common/clock.js';
import { AppError } from '../../common/errors/app-error.js';
import { CommandRejection } from '../../common/errors/command-rejection.js';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import { decodePageCursor, encodePageCursor } from '../../common/http/page-cursor.js';
import {
  DatabaseService,
  type DbExecutor,
  type Transaction,
} from '../../database/database.service.js';
import type { MatchSnapshot } from '../broadcast/match-snapshot.js';
import { Presence } from '../broadcast/presence.js';
import { RealtimeEvents } from '../broadcast/realtime-events.js';
import { GamesService, type GameVersion } from '../games/games.service.js';
import type { MatchRecord, MatchResultRecord } from '../matches/match-record.js';
import { MatchesService } from '../matches/matches.service.js';
import { PlayersService } from '../players/players.service.js';
import {
  type MatchStarter,
  MatchStarterSlot,
  type RoomMatches,
  type RoomReadyToStart,
} from '../rooms/match-starter.js';
import { RoomsService } from '../rooms/rooms.service.js';
import { StatisticsService } from '../statistics/statistics.service.js';
import { AbandonmentWatch } from './abandonment-watch.js';
import {
  type GameSessionChange,
  type GameSessionRow,
  GameSessionsRepository,
} from './game-sessions.repository.js';
import {
  clocksAt,
  clocksFromStored,
  clocksToStored,
  deadlineOf,
  expiredSeats,
} from './match-clock.js';
import { type MatchOutline, type PlayerPresence, toMatchSummary } from './match-views.js';
import { Randomness } from './randomness.js';
import { assignSeats } from './seats.js';
import { TurnTimers } from './turn-timers.js';

/** Cuántas partidas con el reloj vencido se atienden, como mucho, en una revisión. */
const EXPIRED_BATCH_SIZE = 100;

/** Una partida con todo lo necesario para aplicarle un cambio o para mostrarla. */
interface LoadedMatch {
  readonly record: MatchRecord;
  readonly session: GameSessionRow;
  readonly version: GameVersion;
  /** El jugador de cada asiento. */
  readonly players: readonly PlayerRef[];
}

/** El juego de una partida, con su estado ya leído por su motor. */
interface LoadedGame {
  readonly engine: AnyGameEngine;
  readonly state: unknown;
}

/** Un asiento que la plataforma retira del juego, y por qué. */
interface SeatRetirement {
  readonly seat: number;
  readonly reason: SeatRetirementReason;
}

/** La orden de un jugador que provocó un cambio. */
interface CommandOrigin {
  readonly playerId: string;
  readonly requestId: string;
}

/**
 * Lo que deja una operación. Si trae un rechazo, lo guardado se confirma
 * igualmente y el rechazo se lanza después: es lo que pasa cuando una
 * jugada llega con el reloj ya vencido.
 */
interface Outcome {
  readonly snapshot: MatchSnapshot;
  readonly rejection?: Error;
}

function matchNotFound(): AppError {
  return new AppError('MATCH_NOT_FOUND', 'The match does not exist');
}

function playerNotInMatch(): AppError {
  return new AppError('PLAYER_NOT_IN_MATCH', 'The player is not a participant of the match');
}

function matchNotInProgress(): AppError {
  return new AppError('MATCH_NOT_IN_PROGRESS', 'The match is finished or aborted');
}

/** El tiempo con el que empieza cada jugador. El control de tiempo es una política intercambiable (regla 7.7). */
function initialClockMs(timeControl: TimeControl): number {
  switch (timeControl.type) {
    case 'TOTAL_PER_PLAYER':
      return timeControl.totalMs;
  }
}

/**
 * La sesión de juego: dirige cada partida de principio a fin (ADR-014,
 * decisión K1). La inicia cuando `rooms` se lo pide, aplica las jugadas con
 * el motor, lleva los relojes y la termina. Anota el inicio y el final en
 * `matches` y devuelve la sala a `rooms`, todo en la misma transacción.
 *
 * No guarda nada de la partida en memoria: cada operación lee la sesión de
 * la base de datos con su fila bloqueada, aplica el cambio y lo guarda
 * (decisión K2). En memoria viven solo los temporizadores y la cuenta de
 * los jugadores ausentes (ADR-015, decisión V1). El bloqueo de la sesión
 * va siempre antes que el de la sala (decisión K10).
 *
 * Nada se anuncia a los clientes hasta que la transacción se confirma
 * (ADR-010, regla 8.9).
 */
@Injectable()
export class GameSessionsService implements MatchStarter, OnModuleInit {
  private readonly logger = new Logger(GameSessionsService.name);

  constructor(
    private readonly repository: GameSessionsRepository,
    private readonly database: DatabaseService,
    private readonly matches: MatchesService,
    private readonly rooms: RoomsService,
    private readonly starterSlot: MatchStarterSlot,
    private readonly games: GamesService,
    private readonly players: PlayersService,
    private readonly statistics: StatisticsService,
    private readonly events: RealtimeEvents,
    private readonly timers: TurnTimers,
    private readonly absences: AbandonmentWatch,
    private readonly presence: Presence,
    private readonly randomness: Randomness,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.starterSlot.register(this);
    this.timers.listen((matchId) => {
      this.expireIfDue(matchId).catch((error: unknown) => {
        // La revisión periódica lo volverá a intentar.
        this.logger.error(`Falló el vencimiento del reloj de ${matchId}: ${String(error)}`);
      });
    });
    this.absences.listen((matchId) => {
      this.abandonIfDue(matchId).catch((error: unknown) => {
        // Se vuelve a mirar cuando alguien de la partida se conecte.
        this.logger.error(`Falló el abandono en la partida ${matchId}: ${String(error)}`);
      });
    });
  }

  /**
   * Al arrancar, ya ajustados los relojes, vuelve a poner lo que vive en
   * memoria y se perdió al pararse: el temporizador de cada partida en
   * curso y la cuenta de ausencias de cada participante de una partida en
   * tiempo real, porque todavía no hay nadie conectado (ADR-015, decisiones
   * V1 y V10; regla 7.29).
   */
  async resume(): Promise<void> {
    for (const { matchId, turnDeadlineAt } of await this.repository.listActiveDeadlines()) {
      this.timers.arm(matchId, turnDeadlineAt);
    }
    const abandonAt = this.abandonAtFrom(this.clock.now());
    for (const { matchId, playerId } of await this.matches.listInProgressParticipants('REALTIME')) {
      if (!this.presence.isConnected(playerId)) {
        this.absences.markAbsent(matchId, playerId, abandonAt);
      }
    }
  }

  // --- Inicio --------------------------------------------------------------

  /**
   * Inicia la partida de una sala que cumple la condición de inicio, dentro
   * de la transacción de `rooms`, que tiene bloqueada la sala (modelo de
   * datos, sección 6).
   */
  async startMatch(room: RoomReadyToStart, tx: Transaction): Promise<string> {
    const version = await this.games.findCurrentVersion(room.gameId, tx);
    const engine = version?.engine;
    if (!version || !engine) {
      throw new Error(`El juego de la sala ${room.roomId} no tiene una versión vigente con motor`);
    }
    const settings = engine.parseSettings(room.settings);
    if (!settings.ok) {
      throw new Error(`El motor rechazó las opciones guardadas de la sala ${room.roomId}`);
    }

    const previous = await this.matches.findLastOfRoom(room.roomId, tx);
    const playerIds = assignSeats(room.playerIds, previous?.playerIds ?? null, (items) =>
      this.randomness.shuffle(items),
    );

    const state = engine.createInitialState({
      playerCount: playerIds.length,
      settings: settings.value,
      seed: this.randomness.seed(),
    });
    const status = engine.getStatus(state);
    if (status.finished) {
      throw new Error(`El juego de la sala ${room.roomId} empezó ya terminado`);
    }

    const now = this.clock.now();
    const matchId = randomUUID();
    const clocks = playerIds.map(() => initialClockMs(room.timeControl));

    const record: MatchRecord = {
      matchId,
      roomId: room.roomId,
      gameVersionId: version.gameVersionId,
      mode: room.mode,
      timeControl: room.timeControl,
      status: 'IN_PROGRESS',
      abortReason: null,
      startedAt: now,
      endedAt: null,
      playerIds,
      result: null,
    };
    const session: GameSessionRow = {
      matchId,
      status: 'ACTIVE',
      state,
      stateVersion: 0,
      activeSeats: [...status.activeSeats],
      clocks: clocksToStored(clocks),
      turnStartedAt: now,
      turnDeadlineAt: deadlineOf(clocks, status.activeSeats, now),
      createdAt: now,
      updatedAt: now,
    };
    await this.matches.create(record, tx);
    await this.repository.insertSession(session, tx);

    const players = await this.findPlayers(playerIds, tx);
    this.announce(tx, this.snapshotOf({ record, session, version, players }), [], null);
    return matchId;
  }

  describeRoom(roomId: string, executor?: DbExecutor): Promise<RoomMatches> {
    return this.matches.describeRoom(roomId, executor);
  }

  // --- Órdenes de los jugadores ---------------------------------------------

  /**
   * Aplica la jugada de un jugador (protocolo, sección 5). Las
   * comprobaciones van en el orden que fija el protocolo. Devuelve la
   * partida como queda.
   *
   * Repetir una petición ya aplicada no la aplica otra vez: devuelve la
   * partida tal como está (ADR-010, regla 8.13).
   */
  async submitAction(
    playerId: string,
    matchId: string,
    requestId: string,
    expectedStateVersion: number,
    action: unknown,
  ): Promise<MatchSnapshot> {
    const outcome = await this.database.transaction(async (tx): Promise<Outcome> => {
      const { loaded, seat } = await this.lockMatchOf(matchId, playerId, tx);
      const { session } = loaded;

      if (await this.repository.hasAction(matchId, playerId, requestId, tx)) {
        return { snapshot: this.snapshotOf(loaded) };
      }
      if (session.status !== 'ACTIVE') throw matchNotInProgress();
      if (expectedStateVersion !== session.stateVersion) {
        throw new CommandRejection('STALE_STATE_VERSION', {
          currentStateVersion: session.stateVersion,
        });
      }

      const now = this.clock.now();
      if (isDue(session, now)) {
        // El tiempo se agotó antes de que llegara la jugada: se aplica el vencimiento.
        const snapshot = await this.applyTimeouts(loaded, now, tx);
        return { snapshot, rejection: new CommandRejection('CLOCK_EXPIRED') };
      }

      const game = this.restore(loaded);
      if (!game) {
        const snapshot = await this.abortForFailure(loaded, now, tx);
        return { snapshot, rejection: matchNotInProgress() };
      }

      // El motor es la única vía para saber si una jugada es válida.
      const applied = game.engine.applyAction(game.state, seat, action);
      if (!applied.ok) {
        switch (applied.code) {
          case 'NOT_YOUR_TURN':
          case 'INVALID_ACTION':
            throw new CommandRejection(
              applied.code,
              applied.reason === undefined ? {} : { reason: applied.reason },
            );
          case 'GAME_ALREADY_FINISHED':
            throw matchNotInProgress();
          case 'INVALID_GAME_STATE':
          case 'INVALID_SETTINGS': {
            const snapshot = await this.abortForFailure(loaded, now, tx);
            return { snapshot, rejection: matchNotInProgress() };
          }
        }
      }

      // Con cada jugada confirmada se descuenta el tiempo transcurrido a los asientos activos.
      const clocks = this.clocksOf(loaded, now);
      const stateVersion = session.stateVersion + 1;
      await this.repository.insertAction(
        {
          matchId,
          sequence: stateVersion,
          playerId,
          requestId,
          action: applied.value.action,
          clockRemainingMs: clocks[seat] ?? 0,
          createdAt: now,
        },
        tx,
      );
      const snapshot = await this.save(
        loaded,
        { engine: game.engine, state: applied.value.state, stateVersion, clocks, now },
        'COMPLETED',
        tx,
      );
      this.announce(tx, snapshot, applied.value.events as readonly GameEventView[], {
        playerId,
        requestId,
      });
      return { snapshot };
    });

    if (outcome.rejection) throw outcome.rejection;
    return outcome.snapshot;
  }

  /**
   * Un jugador se rinde. Puede hacerlo cualquier participante de una
   * partida en curso, le toque o no (ADR-009, regla 7.19). Devuelve la
   * partida como queda.
   */
  async resign(playerId: string, matchId: string, requestId: string): Promise<MatchSnapshot> {
    return this.database.transaction(async (tx) => {
      const { loaded, seat } = await this.lockMatchOf(matchId, playerId, tx);
      if (loaded.session.status !== 'ACTIVE') throw matchNotInProgress();

      const now = this.clock.now();
      // Si antes de rendirse ya se había agotado un reloj, ese vencimiento va primero.
      const retirements: SeatRetirement[] = [
        ...this.dueTimeouts(loaded, now),
        { seat, reason: 'RESIGNATION' },
      ];
      return this.retire(loaded, retirements, now, { playerId, requestId }, tx);
    });
  }

  // --- Relojes -------------------------------------------------------------

  /**
   * Si el reloj de la partida se agotó, aplica el vencimiento (ADR-009,
   * regla 7.5). La llaman el temporizador de la partida y la revisión
   * periódica: las dos pasan por aquí, y aquí se vuelve a mirar el reloj
   * guardado con la fila bloqueada (ADR-014, decisión K3). Devuelve si
   * aplicó el vencimiento.
   */
  async expireIfDue(matchId: string): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const session = await this.repository.lockSession(matchId, tx);
      if (!session || session.status !== 'ACTIVE') return false;

      const now = this.clock.now();
      if (!isDue(session, now)) {
        // El aviso llegó antes de tiempo, o una jugada movió la fecha límite.
        const { turnDeadlineAt } = session;
        if (turnDeadlineAt) {
          this.database.afterCommit(tx, () => this.timers.arm(matchId, turnDeadlineAt));
        }
        return false;
      }

      const record = await this.matches.find(matchId, tx);
      if (!record) throw new Error(`La sesión ${matchId} no tiene partida`);
      await this.applyTimeouts(await this.load(record, session, tx), now, tx);
      return true;
    });
  }

  /**
   * Busca las partidas cuyo reloj venció y aplica el vencimiento a cada
   * una, en su propia transacción (ADR-010, regla 8.17). Cubre los
   * temporizadores que se pierden si el servidor se reinicia. Devuelve
   * cuántos vencimientos aplicó.
   */
  async expireDueMatches(): Promise<number> {
    const matchIds = await this.repository.findExpiredMatchIds(
      this.clock.now(),
      EXPIRED_BATCH_SIZE,
    );
    let expired = 0;
    for (const matchId of matchIds) {
      try {
        if (await this.expireIfDue(matchId)) expired += 1;
      } catch (error) {
        // Una partida que falla no impide atender las demás.
        this.logger.error(`Falló el vencimiento del reloj de ${matchId}: ${String(error)}`);
      }
    }
    return expired;
  }

  // --- Presencia y abandono ------------------------------------------------

  /**
   * El canal de tiempo real avisa de que un jugador se dio por
   * desconectado, pasado el margen (ADR-015, decisiones V1 y V3). Empieza
   * a contar su plazo de abandono en cada partida en tiempo real en curso
   * en la que juega (regla 7.26).
   */
  async playerDisconnected(playerId: string): Promise<void> {
    const matchIds = await this.matches.findInProgressIdsOf(playerId, 'REALTIME');
    // Mientras se buscaban sus partidas pudo volver.
    if (this.presence.isConnected(playerId)) return;
    const abandonAt = this.abandonAtFrom(this.clock.now());
    for (const matchId of matchIds) this.absences.markAbsent(matchId, playerId, abandonAt);
  }

  /**
   * El canal de tiempo real avisa de que un jugador volvió. Deja de contar
   * su ausencia y, ahora que hay un rival conectado, pierde quien lleve ya
   * su plazo vencido (ADR-015, decisión V2).
   */
  async playerConnected(playerId: string): Promise<void> {
    const matchIds = await this.matches.findInProgressIdsOf(playerId, 'REALTIME');
    if (!this.presence.isConnected(playerId)) return;
    for (const matchId of matchIds) {
      this.absences.markPresent(matchId, playerId);
      try {
        await this.abandonIfDue(matchId);
      } catch (error) {
        this.logger.error(`Falló el abandono en la partida ${matchId}: ${String(error)}`);
      }
    }
  }

  /**
   * Si en la partida hay algún ausente con el plazo vencido y algún rival
   * conectado, el ausente pierde por abandono (reglas 7.26 y 7.32; ADR-015,
   * decisiones V1 y V2). Si no queda nadie conectado, todavía no pierde
   * nadie: decide el reloj, o el primero que vuelva. Antes se aplican los
   * vencimientos de reloj pendientes, igual que en la rendición. Devuelve
   * si aplicó el abandono.
   */
  async abandonIfDue(matchId: string): Promise<boolean> {
    if (this.absences.dueAbsentees(matchId, this.clock.now()).length === 0) return false;

    return this.database.transaction(async (tx) => {
      const session = await this.repository.lockSession(matchId, tx);
      if (!session || session.status !== 'ACTIVE') return false;
      const record = await this.matches.find(matchId, tx);
      if (!record) throw new Error(`La sesión ${matchId} no tiene partida`);

      // Con la fila bloqueada se vuelve a mirar quién falta y quién está.
      const now = this.clock.now();
      const absent = new Set(this.absences.dueAbsentees(matchId, now));
      const rivalConnected = record.playerIds.some(
        (playerId) => !absent.has(playerId) && this.presence.isConnected(playerId),
      );
      if (absent.size === 0 || !rivalConnected) return false;

      const loaded = await this.load(record, session, tx);
      const retirements: SeatRetirement[] = [
        ...this.dueTimeouts(loaded, now),
        ...record.playerIds.flatMap((playerId, seat): SeatRetirement[] =>
          absent.has(playerId) ? [{ seat, reason: 'ABANDONMENT' }] : [],
        ),
      ];
      await this.retire(loaded, retirements, now, null, tx);
      return true;
    });
  }

  /**
   * Revisa las partidas con algún ausente de plazo vencido. Cubre un
   * aviso que falló, igual que la revisión de relojes cubre a sus
   * temporizadores. Devuelve cuántos abandonos aplicó.
   */
  async abandonDueMatches(): Promise<number> {
    let abandoned = 0;
    for (const matchId of this.absences.dueMatchIds(this.clock.now())) {
      try {
        if (await this.abandonIfDue(matchId)) abandoned += 1;
      } catch (error) {
        this.logger.error(`Falló el abandono en la partida ${matchId}: ${String(error)}`);
      }
    }
    return abandoned;
  }

  /**
   * Cómo está cada jugador de una partida para quien la ve: si está
   * conectado y, si falta en una partida en tiempo real, cuándo pierde por
   * abandono (protocolo, `abandonAt`).
   */
  presenceIn(matchId: string): (playerId: string) => PlayerPresence {
    return (playerId) => ({
      connected: this.presence.isConnected(playerId),
      abandonAt: this.absences.abandonAtOf(matchId, playerId),
    });
  }

  /** Empieza a contar la ausencia de los participantes que no están conectados. */
  private countAbsences(snapshot: MatchSnapshot): void {
    const abandonAt = this.abandonAtFrom(this.clock.now());
    for (const { playerId } of snapshot.players) {
      if (!this.presence.isConnected(playerId)) {
        this.absences.markAbsent(snapshot.matchId, playerId, abandonAt);
      }
    }
  }

  private abandonAtFrom(now: Date): Date {
    return new Date(now.getTime() + this.config.matches.abandonMs);
  }

  // --- Consultas -----------------------------------------------------------

  /**
   * Una partida, para uno de sus participantes, con el asiento que ocupa.
   * Solo los participantes pueden verla (API, decisión A10).
   */
  async getForPlayer(
    matchId: string,
    playerId: string,
  ): Promise<{ snapshot: MatchSnapshot; seat: number }> {
    const loaded = await this.find(matchId);
    if (!loaded) throw matchNotFound();
    const seat = loaded.record.playerIds.indexOf(playerId);
    if (seat === -1) throw playerNotInMatch();
    return { snapshot: this.snapshotOf(loaded), seat };
  }

  /** La partida tal como está ahora, para avisar a quien la sigue. `null` si no existe. */
  async findSnapshot(matchId: string): Promise<MatchSnapshot | null> {
    const loaded = await this.find(matchId);
    return loaded ? this.snapshotOf(loaded) : null;
  }

  /** Las partidas en curso en las que participa el jugador. */
  findInProgressMatchIdsOf(playerId: string): Promise<string[]> {
    return this.matches.findInProgressIdsOf(playerId);
  }

  /**
   * Una página de las partidas del jugador en ese estado, de la más
   * reciente a la más antigua. En curso, dice en cuáles le toca; terminadas,
   * es su historial (API, sección 2).
   */
  async listForPlayer(
    playerId: string,
    query: ListMyMatchesQuery,
  ): Promise<Page<MatchSummaryView>> {
    const after = query.cursor === undefined ? undefined : decodePageCursor(query.cursor);
    if (after === null) {
      throw new AppError('VALIDATION_ERROR', 'The query parameters are not valid', {
        fields: [{ field: 'cursor', rule: 'INVALID_FORMAT' }],
      });
    }

    // Una partida guarda la versión del juego, no el juego: se buscan todas sus versiones.
    const gameVersionIds =
      query.gameSlug === undefined
        ? undefined
        : await this.games.findVersionIdsOfGame(query.gameSlug);

    // Se pide una de más para saber si hay página siguiente.
    const records = await this.matches.listOfPlayer({
      playerId,
      status: query.status,
      gameVersionIds,
      after: after && { startedAt: after.at, matchId: after.id },
      limit: query.limit + 1,
    });
    const page = records.slice(0, query.limit);
    const last = page.at(-1);

    const [sessions, versions, refs] = await Promise.all([
      this.repository.findSessions(page.map((record) => record.matchId)),
      this.games.findVersions(page.map((record) => record.gameVersionId)),
      this.players.findRefs(page.flatMap((record) => record.playerIds)),
    ]);

    const items = page.map((record): MatchSummaryView => {
      const session = sessions.find((one) => one.matchId === record.matchId);
      const version = versions.get(record.gameVersionId);
      if (!session || !version) {
        throw new Error(`La partida ${record.matchId} no tiene sesión o versión de juego`);
      }
      const outline: MatchOutline = {
        matchId: record.matchId,
        roomId: record.roomId,
        gameSlug: version.gameSlug,
        mode: record.mode,
        status: record.status,
        players: record.playerIds.map((id) => requireRef(refs, id)),
        activeSeats: session.activeSeats,
        turnDeadlineAt: session.turnDeadlineAt,
        result: record.result,
        startedAt: record.startedAt,
        endedAt: record.endedAt,
      };
      return toMatchSummary(outline, record.playerIds.indexOf(playerId));
    });

    return {
      items,
      nextCursor:
        records.length > query.limit && last
          ? encodePageCursor({ at: last.startedAt, id: last.matchId })
          : null,
    };
  }

  // --- Administración ------------------------------------------------------

  /**
   * Un administrador anula una partida en curso (API,
   * `POST /admin/matches/{matchId}/abort`). Si ya estaba anulada, no hace
   * nada. Con `closeRoom`, la sala se cierra en la misma transacción; sin
   * él, vuelve a la espera o se cierra como al terminar (decisión R8).
   *
   * Devuelve si la anuló esta llamada.
   */
  async abortByAdmin(matchId: string, options: { readonly closeRoom: boolean }): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const session = await this.repository.lockSession(matchId, tx);
      const record = session && (await this.matches.find(matchId, tx));
      if (!session || !record) throw matchNotFound();
      if (record.status === 'ABORTED') return false;
      if (record.status !== 'IN_PROGRESS') throw matchNotInProgress();

      const loaded = await this.load(record, session, tx);
      await this.abort(
        loaded,
        'ADMIN',
        this.clock.now(),
        tx,
        options.closeRoom ? 'CLOSE' : 'FOLLOW_MATCH_END',
      );
      return true;
    });
  }

  // --- Piezas: cargar ------------------------------------------------------

  /**
   * Bloquea la sesión de la partida y la carga para un participante. Las
   * dos primeras comprobaciones de toda orden son que la partida exista y
   * que quien la envía participe en ella (protocolo, sección 5).
   */
  private async lockMatchOf(
    matchId: string,
    playerId: string,
    tx: Transaction,
  ): Promise<{ loaded: LoadedMatch; seat: number }> {
    const session = await this.repository.lockSession(matchId, tx);
    const record = session && (await this.matches.find(matchId, tx));
    if (!session || !record) throw matchNotFound();

    // Un jugador solo actúa por su propio asiento, que sale de su sesión.
    const seat = record.playerIds.indexOf(playerId);
    if (seat === -1) throw playerNotInMatch();
    return { loaded: await this.load(record, session, tx), seat };
  }

  /** Lee una partida sin bloquearla. `null` si no existe. */
  private async find(matchId: string): Promise<LoadedMatch | null> {
    let record = await this.matches.find(matchId);
    if (!record) return null;
    const session = await this.repository.findSession(matchId);
    if (!session) throw new Error(`La partida ${matchId} no tiene sesión`);

    // Son dos lecturas: si entre una y otra la partida terminó, se relee la primera.
    if (record.status === 'IN_PROGRESS' && session.status !== 'ACTIVE') {
      record = await this.matches.find(matchId);
      if (!record) return null;
    }
    return this.load(record, session);
  }

  private async load(
    record: MatchRecord,
    session: GameSessionRow,
    executor?: DbExecutor,
  ): Promise<LoadedMatch> {
    // Una detrás de otra: dentro de una transacción comparten la misma conexión.
    const version = await this.games.findVersion(record.gameVersionId, executor);
    if (!version) throw new Error(`La partida ${record.matchId} no tiene versión de juego`);
    const players = await this.findPlayers(record.playerIds, executor);
    return { record, session, version, players };
  }

  private async findPlayers(
    playerIds: readonly string[],
    executor?: DbExecutor,
  ): Promise<PlayerRef[]> {
    const refs = await this.players.findRefs(playerIds, executor);
    return playerIds.map((playerId) => requireRef(refs, playerId));
  }

  /**
   * El estado de la partida, leído por su motor. `null` si la partida no
   * puede continuar: su versión ya no tiene motor o el motor no reconoce
   * el snapshot (ADR-009, regla 7.20).
   */
  private restore(loaded: LoadedMatch): LoadedGame | null {
    const { engine } = loaded.version;
    if (!engine) return null;
    const restored = engine.restoreState(loaded.session.state);
    return restored.ok ? { engine, state: restored.value } : null;
  }

  /** El tiempo que le queda a cada asiento en `now`. */
  private clocksOf(loaded: LoadedMatch, now: Date): number[] {
    const { session, record } = loaded;
    return clocksAt(
      clocksFromStored(session.clocks, record.playerIds.length),
      session.activeSeats,
      session.turnStartedAt,
      now,
    );
  }

  /** Los asientos a los que se les agotó el tiempo, como retiradas pendientes de aplicar. */
  private dueTimeouts(loaded: LoadedMatch, now: Date): SeatRetirement[] {
    if (!isDue(loaded.session, now)) return [];
    return expiredSeats(this.clocksOf(loaded, now), loaded.session.activeSeats).map((seat) => ({
      seat,
      reason: 'TIMEOUT',
    }));
  }

  // --- Piezas: cambiar -----------------------------------------------------

  private applyTimeouts(loaded: LoadedMatch, now: Date, tx: Transaction): Promise<MatchSnapshot> {
    return this.retire(loaded, this.dueTimeouts(loaded, now), now, null, tx);
  }

  /**
   * Retira asientos del juego, uno detrás de otro, hasta que el juego
   * termine. El resultado lo da siempre el motor (ADR-009, regla 7.17). El
   * motivo del final es el de la retirada que lo produjo.
   */
  private async retire(
    loaded: LoadedMatch,
    retirements: readonly SeatRetirement[],
    now: Date,
    origin: CommandOrigin | null,
    tx: Transaction,
  ): Promise<MatchSnapshot> {
    const game = this.restore(loaded);
    if (!game) return this.abortForFailure(loaded, now, tx);

    let { state } = game;
    let { stateVersion } = loaded.session;
    let endReason: MatchEndReason = 'COMPLETED';
    const events: GameEventView[] = [];
    const retired = new Set<number>();
    // Quien pierde por abandono sale de la sala al terminar la partida (regla 7.32).
    const departing: string[] = [];

    for (const { seat, reason } of retirements) {
      if (retired.has(seat) || game.engine.getStatus(state).finished) continue;
      const retirement = game.engine.retireSeat(state, seat, reason);
      state = retirement.state;
      // La versión del estado sube también con cada retirada.
      stateVersion += 1;
      endReason = reason;
      retired.add(seat);
      events.push(...(retirement.events as readonly GameEventView[]));
      const playerId = loaded.record.playerIds[seat];
      if (reason === 'ABANDONMENT' && playerId !== undefined) departing.push(playerId);
    }

    const snapshot = await this.save(
      loaded,
      { engine: game.engine, state, stateVersion, clocks: this.clocksOf(loaded, now), now },
      endReason,
      tx,
      departing,
    );
    this.announce(tx, snapshot, events, origin);
    return snapshot;
  }

  /**
   * Guarda el estado nuevo de la partida. Si el juego terminó, pasa por la
   * operación de final de partida; si no, la partida sigue con los relojes
   * medidos ahora.
   */
  private async save(
    loaded: LoadedMatch,
    next: {
      readonly engine: AnyGameEngine;
      readonly state: unknown;
      readonly stateVersion: number;
      readonly clocks: readonly number[];
      readonly now: Date;
    },
    endReason: MatchEndReason,
    tx: Transaction,
    departing: readonly string[] = [],
  ): Promise<MatchSnapshot> {
    const { now } = next;
    const status = next.engine.getStatus(next.state);

    if (status.finished) {
      const seats = [...status.results].sort((a, b) => a.seat - b.seat);
      return this.finish(loaded, next, { reason: endReason, seats }, tx, departing);
    }

    const session = await this.updateSession(
      loaded.session,
      {
        status: 'ACTIVE',
        state: next.state,
        stateVersion: next.stateVersion,
        activeSeats: [...status.activeSeats],
        clocks: clocksToStored(next.clocks),
        turnStartedAt: now,
        turnDeadlineAt: deadlineOf(next.clocks, status.activeSeats, now),
        updatedAt: now,
      },
      tx,
    );
    return this.snapshotOf({ ...loaded, session });
  }

  /**
   * El final de partida, en una sola transacción: cierra la sesión, anota
   * el resultado y devuelve la sala a la espera o la cierra (ADR-010,
   * reglas 8.14 a 8.16). Vale igual para el final natural, el tiempo
   * agotado, la rendición y el abandono. Quien perdió por abandono sale de
   * la sala en la misma transacción (regla 7.32).
   */
  private async finish(
    loaded: LoadedMatch,
    final: {
      readonly state: unknown;
      readonly stateVersion: number;
      readonly clocks: readonly number[];
      readonly now: Date;
    },
    result: MatchResultRecord,
    tx: Transaction,
    departing: readonly string[],
  ): Promise<MatchSnapshot> {
    const { now } = final;
    const session = await this.updateSession(
      loaded.session,
      {
        status: 'CLOSED',
        state: final.state,
        stateVersion: final.stateVersion,
        activeSeats: [],
        clocks: clocksToStored(final.clocks),
        turnStartedAt: null,
        turnDeadlineAt: null,
        updatedAt: now,
      },
      tx,
    );
    await this.matches.finish(loaded.record, result, now, tx);
    // En la misma transacción que el resultado: una partida no cuenta dos veces (regla 8.15).
    await this.statistics.recordFinishedMatch(
      loaded.version.gameId,
      result.seats.map(({ seat, outcome }) => ({
        playerId: requirePlayer(loaded.record, seat),
        outcome,
      })),
      now,
      tx,
    );
    await this.rooms.matchEnded(loaded.record.roomId, now, tx, departing);

    const record: MatchRecord = { ...loaded.record, status: 'FINISHED', endedAt: now, result };
    return this.snapshotOf({ ...loaded, record, session });
  }

  /**
   * Anula una partida que no puede continuar por un fallo: su versión ya no
   * tiene motor o el motor no reconoce el snapshot (ADR-009, regla 7.20;
   * ADR-014, decisión K12).
   */
  private abortForFailure(loaded: LoadedMatch, now: Date, tx: Transaction): Promise<MatchSnapshot> {
    this.logger.error(
      `La partida ${loaded.record.matchId} se anula: el motor de ` +
        `${loaded.version.gameSlug}@${loaded.version.gameVersion} no existe o no reconoce su estado guardado.`,
    );
    return this.abort(loaded, 'FAILURE', now, tx, 'FOLLOW_MATCH_END');
  }

  /**
   * Anula una partida en curso, sin resultado ni estadísticas (regla 7.20).
   * Con `FOLLOW_MATCH_END`, la sala vuelve a la espera o se cierra, igual
   * que al terminar; con `CLOSE`, se cierra, porque la cierra un
   * administrador (modelo de datos, decisión R8).
   */
  private async abort(
    loaded: LoadedMatch,
    reason: MatchAbortReason,
    now: Date,
    tx: Transaction,
    room: 'FOLLOW_MATCH_END' | 'CLOSE',
  ): Promise<MatchSnapshot> {
    const { matchId, roomId } = loaded.record;
    const session = await this.updateSession(
      loaded.session,
      {
        status: 'CLOSED',
        state: loaded.session.state,
        stateVersion: loaded.session.stateVersion,
        activeSeats: [],
        clocks: clocksToStored(this.clocksOf(loaded, now)),
        turnStartedAt: null,
        turnDeadlineAt: null,
        updatedAt: now,
      },
      tx,
    );
    await this.matches.abort(matchId, reason, now, tx);
    if (room === 'CLOSE') {
      await this.rooms.closeByAdmin(roomId, now, tx);
    } else {
      await this.rooms.matchEnded(roomId, now, tx);
    }

    const record: MatchRecord = {
      ...loaded.record,
      status: 'ABORTED',
      abortReason: reason,
      endedAt: now,
    };
    const snapshot = this.snapshotOf({ ...loaded, record, session });
    this.announce(tx, snapshot, [], null);
    return snapshot;
  }

  /**
   * Guarda el cambio de la sesión, condicionado a que siga activa y en la
   * versión que se leyó. Debe afectar exactamente a una fila (modelo de
   * datos, sección 6): si no, la transacción se deshace.
   */
  private async updateSession(
    session: GameSessionRow,
    change: GameSessionChange,
    tx: Transaction,
  ): Promise<GameSessionRow> {
    const saved = await this.repository.updateSession(
      session.matchId,
      session.stateVersion,
      change,
      tx,
    );
    if (!saved) {
      throw new Error(`La sesión ${session.matchId} cambió mientras se le aplicaba un cambio`);
    }
    return { ...session, ...change };
  }

  // --- Piezas: mostrar y avisar --------------------------------------------

  /** La partida tal como está guardada, con lo que ve cada asiento. */
  private snapshotOf(loaded: LoadedMatch): MatchSnapshot {
    const { record, session, version, players } = loaded;
    const game = this.restore(loaded);
    return {
      matchId: record.matchId,
      roomId: record.roomId,
      gameSlug: version.gameSlug,
      gameVersion: version.gameVersion,
      mode: record.mode,
      timeControl: record.timeControl,
      status: record.status,
      abortReason: record.abortReason,
      stateVersion: session.stateVersion,
      players,
      activeSeats: session.activeSeats,
      clocks: clocksFromStored(session.clocks, players.length),
      turnStartedAt: session.turnStartedAt,
      turnDeadlineAt: session.turnDeadlineAt,
      views: players.map((_, seat) => (game ? game.engine.getView(game.state, seat) : null)),
      result: record.result,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
    };
  }

  /**
   * Cuando la transacción se confirme, anuncia el cambio y pone el
   * temporizador de la partida a su nueva fecha límite, o lo quita si la
   * partida ya no está en curso. Una partida en tiempo real recién empezada
   * cuenta ya la ausencia de quien no esté conectado.
   */
  private announce(
    tx: Transaction,
    snapshot: MatchSnapshot,
    events: readonly GameEventView[],
    origin: CommandOrigin | null,
  ): void {
    this.database.afterCommit(tx, () => {
      if (snapshot.status === 'IN_PROGRESS' && snapshot.turnDeadlineAt) {
        this.timers.arm(snapshot.matchId, snapshot.turnDeadlineAt);
        if (snapshot.mode === 'REALTIME') this.countAbsences(snapshot);
      } else {
        this.timers.cancel(snapshot.matchId);
        this.absences.forget(snapshot.matchId);
      }
      this.events.publish({ type: 'MATCH_CHANGED', snapshot, events, origin });
    });
  }
}

/** El primer reloj de los asientos activos ya se agotó. */
function isDue(session: GameSessionRow, now: Date): boolean {
  return session.turnDeadlineAt !== null && now.getTime() >= session.turnDeadlineAt.getTime();
}

function requireRef(refs: ReadonlyMap<string, PlayerRef>, playerId: string): PlayerRef {
  const ref = refs.get(playerId);
  if (!ref) throw new Error(`El jugador ${playerId} no tiene cuenta`);
  return ref;
}

function requirePlayer(record: MatchRecord, seat: number): string {
  const playerId = record.playerIds[seat];
  if (playerId === undefined) {
    throw new Error(`La partida ${record.matchId} no tiene el asiento ${seat}`);
  }
  return playerId;
}
