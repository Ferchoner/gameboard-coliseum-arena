/**
 * Contrato del motor de juego, versión 1.
 *
 * Este archivo contiene solo definiciones de tipos. No contiene lógica.
 * Las decisiones de diseño y un ejemplo de uso están en `03-game-engine.md`.
 *
 * Reglas que todo motor debe cumplir:
 *
 * 1. Puro y determinista. Las mismas entradas producen siempre las mismas
 *    salidas. El motor no lee el reloj, no genera azar por su cuenta y no
 *    hace entrada ni salida.
 * 2. Aislado. No importa nada de la plataforma: ni el framework, ni el ORM,
 *    ni el transporte, ni los tipos de la API o del protocolo (ADR-001,
 *    condición 5.5).
 * 3. Inmutable. Nunca modifica el estado que recibe; devuelve uno nuevo.
 * 4. Estado serializable. El estado es un valor JSON plano: objetos, listas,
 *    textos, números, booleanos y nulos. Sin clases, fechas, mapas ni
 *    funciones. La plataforma lo guarda tal cual (ADR-010, regla 8.1).
 * 5. Sin identidades. El motor conoce asientos, no jugadores ni cuentas.
 * 6. Sin tiempo. El reloj lo gestiona la capa de sesión (ADR-009, regla 7.8).
 *    El motor solo indica qué asientos pueden jugar.
 */

// ---------------------------------------------------------------------------
// Identificadores
// ---------------------------------------------------------------------------

/** Nombre corto y estable del juego, por ejemplo `four-in-a-row` (ADR-011, 9.5). */
export type GameSlug = string;

/** Versión semántica de las reglas, por ejemplo `1.0.0` (ADR-011, 9.7). */
export type GameVersion = string;

/**
 * Asiento de un participante, empezando en 0. Lo asigna la plataforma antes
 * de crear el estado inicial (ADR-011, 9.19). Es la única forma en que el
 * motor identifica a un participante.
 */
export type Seat = number;

// ---------------------------------------------------------------------------
// Lo que el juego declara sobre sí mismo
// ---------------------------------------------------------------------------

/** Modalidad de partida (ADR-009, regla 7.1). */
export type MatchMode = 'REALTIME' | 'TURN_BASED';

/** Tiempo total por jugador para todas sus jugadas (ADR-009, regla 7.2). */
export interface TotalPerPlayerTimeControl {
  readonly type: 'TOTAL_PER_PLAYER';
  readonly totalMs: number;
}

/**
 * Control de tiempo de una partida. Es una política intercambiable (ADR-009,
 * regla 7.7). La versión 1 incluye una sola; las nuevas se añaden a esta unión.
 */
export type TimeControl = TotalPerPlayerTimeControl;

/**
 * Datos que el motor declara y la plataforma usa para validar salas y para
 * mostrar el catálogo. No se guardan en la base de datos: el motor es su
 * única fuente (modelo de datos, decisión R1).
 */
export interface GameMetadata {
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /**
   * Controles de tiempo que el juego admite en cada modalidad. Una lista
   * vacía significa que el juego no admite esa modalidad.
   */
  readonly timeControls: Readonly<Record<MatchMode, readonly TimeControl[]>>;
}

// ---------------------------------------------------------------------------
// Respuestas del motor
// ---------------------------------------------------------------------------

/**
 * Códigos con los que el motor rechaza una entrada. Es una lista cerrada:
 * la plataforma sabe traducir cada uno a un error del protocolo.
 *
 * - `INVALID_SETTINGS`: las opciones del juego no son válidas.
 * - `INVALID_ACTION`: la acción está mal formada o las reglas no la permiten.
 * - `NOT_YOUR_TURN`: el asiento que la envía no puede jugar ahora.
 * - `GAME_ALREADY_FINISHED`: el juego ya terminó.
 * - `INVALID_GAME_STATE`: el snapshot no es un estado válido de este motor.
 */
export type EngineErrorCode =
  | 'INVALID_SETTINGS'
  | 'INVALID_ACTION'
  | 'NOT_YOUR_TURN'
  | 'GAME_ALREADY_FINISHED'
  | 'INVALID_GAME_STATE';

export interface Accepted<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Rejected {
  readonly ok: false;
  readonly code: EngineErrorCode;
  /**
   * Motivo propio del juego, opcional, que precisa el código. Por ejemplo
   * `COLUMN_FULL`. Cada juego documenta los suyos.
   */
  readonly reason?: string;
}

/** Forma única de toda respuesta que puede ser un rechazo. */
export type EngineResponse<T> = Accepted<T> | Rejected;

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export type SeatOutcome = 'WIN' | 'LOSS' | 'DRAW';

export interface SeatResult {
  readonly seat: Seat;
  readonly outcome: SeatOutcome;
  /** Puntos, para los juegos que los tengan. */
  readonly score?: number;
}

/**
 * Situación del juego en un estado dado. Es la única fuente para saber a
 * quién puede jugar, si el juego terminó y con qué resultado.
 */
export type GameStatus =
  | {
      readonly finished: false;
      /**
       * Asientos que pueden jugar ahora. Sus relojes son los que corren.
       * Nunca está vacía. En un juego por turnos contiene un solo asiento;
       * en un juego con jugadas simultáneas, varios.
       */
      readonly activeSeats: readonly Seat[];
    }
  | {
      readonly finished: true;
      /** Un resultado por asiento. Es el fin natural del juego. */
      readonly results: readonly SeatResult[];
    };

/** Motivo por el que termina una partida (ADR-009, regla 7.16). */
export type MatchEndReason = 'COMPLETED' | 'TIMEOUT' | 'RESIGNATION' | 'ABANDONMENT';

/**
 * Resultado de una partida. El motor NO lo construye: lo construye la capa
 * de sesión. Con `COMPLETED`, copia los resultados que da el motor. Con los
 * otros tres motivos, los decide la plataforma (ADR-009, reglas 7.17 y 7.18).
 * Se define aquí para que los dos caminos compartan la misma forma.
 */
export interface MatchResult {
  readonly reason: MatchEndReason;
  readonly seats: readonly SeatResult[];
}

// ---------------------------------------------------------------------------
// Entradas y salidas de una transición
// ---------------------------------------------------------------------------

/** Lo que la plataforma entrega al motor para crear el estado inicial. */
export interface GameSetup<TSettings> {
  /** Número de asientos. Los asientos van de 0 a `playerCount - 1`. */
  readonly playerCount: number;
  /** Opciones del juego, ya validadas con `parseSettings`. */
  readonly settings: TSettings;
  /**
   * Semilla de azar. La genera siempre la plataforma. Un juego con azar
   * guarda el estado de su generador dentro de su propio estado, de modo
   * que cada transición siga siendo determinista. Un juego sin azar la ignora.
   */
  readonly seed: string;
}

/**
 * Lo que el motor emite al aplicar una acción, para que los clientes puedan
 * mostrar lo ocurrido. No se guarda (ADR-010, regla 8.5).
 *
 * Los eventos de juego son públicos: los reciben todos los participantes.
 * No deben contener nada que algún asiento no deba ver. La información
 * privada viaja solo en las vistas.
 */
export interface GameEvent {
  readonly type: string;
}

/** Resultado de aplicar una acción aceptada. */
export interface Transition<TState, TAction, TEvent extends GameEvent> {
  /** El estado nuevo. */
  readonly state: TState;
  /** La acción tal como el motor la aceptó. Es lo que se anota en el registro de jugadas. */
  readonly action: TAction;
  readonly events: readonly TEvent[];
}

// ---------------------------------------------------------------------------
// El motor
// ---------------------------------------------------------------------------

/**
 * Motor de una versión de un juego.
 *
 * @typeParam TSettings Opciones del juego elegidas al crear la sala.
 * @typeParam TState    Estado completo del juego. Valor JSON plano.
 * @typeParam TAction   Acción de un jugador, ya validada.
 * @typeParam TEvent    Eventos de juego que emite.
 * @typeParam TView     Lo que un asiento puede ver del estado.
 */
export interface GameEngine<TSettings, TState, TAction, TEvent extends GameEvent, TView> {
  readonly gameSlug: GameSlug;
  readonly gameVersion: GameVersion;
  readonly metadata: GameMetadata;

  /**
   * Valida las opciones del juego y las devuelve con su tipo. La plataforma
   * la llama al crear la sala, con lo que envió el cliente.
   */
  parseSettings(input: unknown): EngineResponse<TSettings>;

  /** Crea el estado inicial. La plataforma ya validó el número de jugadores. */
  createInitialState(setup: GameSetup<TSettings>): TState;

  /**
   * Comprueba que un snapshot leído de la base de datos es un estado válido
   * de este motor y lo devuelve con su tipo. Si lo rechaza, la partida no
   * puede continuar y la plataforma la anula (ADR-009, regla 7.20).
   */
  restoreState(snapshot: unknown): EngineResponse<TState>;

  /** Quién puede jugar ahora o, si el juego terminó, con qué resultado. */
  getStatus(state: TState): GameStatus;

  /**
   * Valida y aplica una acción. Recibe la acción tal como llegó del cliente.
   * Si la acepta, devuelve el estado nuevo. Si la rechaza, el estado no cambia.
   * Es la única vía para saber si una acción es válida.
   */
  applyAction(
    state: TState,
    seat: Seat,
    input: unknown,
  ): EngineResponse<Transition<TState, TAction, TEvent>>;

  /**
   * Lo que un asiento puede ver del estado. Con `null`, lo que puede ver
   * quien no ocupa ningún asiento. Debe ocultar todo lo que ese asiento no
   * deba conocer.
   */
  getView(state: TState, viewer: Seat | null): TView;
}

// ---------------------------------------------------------------------------
// Registro de motores
// ---------------------------------------------------------------------------

/** Un motor cualquiera, visto desde la plataforma, que no conoce sus tipos. */
export type AnyGameEngine = GameEngine<unknown, unknown, unknown, GameEvent, unknown>;

/**
 * Registro con el que la capa de sesión obtiene el motor de una partida a
 * partir de su juego y su versión (acuerdo B3, ADR-007).
 */
export interface GameEngineRegistry {
  /** Devuelve el motor, o `undefined` si esa versión no está registrada. */
  resolve(gameSlug: GameSlug, gameVersion: GameVersion): AnyGameEngine | undefined;
  list(): readonly AnyGameEngine[];
}
