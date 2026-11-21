/**
 * Mareas: los tipos que ven la plataforma y el frontend (ADR-023,
 * decisiones MA2 a MA16).
 *
 * Este archivo contiene solo tipos. Es la entrada `tides` del paquete, y el
 * frontend la importa para conocer la forma de las acciones, de los eventos
 * y de la vista sin recibir el código del juego (ADR-014, K7).
 */

/** Nombre corto del juego (ADR-011, convención 9.6). */
export type TidesSlug = 'tides';

/** Las cuatro estaciones (ADR-023, sección 4.2). */
export type TidesSeason = 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER';

/** Las caras de una barca: red, ancla y vela, dos de cada. */
export type TidesBoatFace = 'NET' | 'ANCHOR' | 'SAIL';

/** Las caras de un dado de clima: calma, tormenta y brisa, dos de cada. */
export type TidesWeatherFace = 'CALM' | 'STORM' | 'BREEZE';

export type TidesFace = TidesBoatFace | TidesWeatherFace;

/** Los ingredientes básicos. */
export type TidesBasic = 'FISH' | 'SALT' | 'ALGAE';

/** Los ingredientes, con la perla, que vale por cualquiera al cumplir un encargo. */
export type TidesIngredient = TidesBasic | 'PEARL';

/** Lo que da una casilla de isla: un ingrediente básico o subir un ave a bordo. */
export type TidesReward = TidesBasic | 'BIRD';

export type TidesIngredients = Readonly<Record<TidesIngredient, number>>;

/** Las cinco casillas del puerto. Las dos `ANY` nunca se ocupan. */
export type TidesPortSpace = 'ANY_1' | 'ANY_2' | 'CALM' | 'STORM' | 'BREEZE';

/** Las dos caras del puerto: pleamar en las rondas impares y bajamar en las pares. */
export type TidesPortSide = 'HIGH' | 'LOW';

/** Los doce tipos de ave del anexo, tres por estación. */
export type TidesBirdKind =
  | 'PUFFIN'
  | 'SKUA'
  | 'AUK'
  | 'TERN'
  | 'CORMORANT'
  | 'GULL'
  | 'PELICAN'
  | 'HERON'
  | 'FLAMINGO'
  | 'ALBATROSS'
  | 'PETREL'
  | 'SHAG';

/** Los siete usos de un encargo. */
export type TidesOrderUse =
  'TURN_DIE' | 'REROLL' | 'DOUBLE_SHIFT' | 'TOW' | 'CROSS' | 'MOOR' | 'RETURN_BOAT';

/** Una casilla de isla del catálogo. */
export interface TidesIslandSpaceCard {
  readonly figure: TidesBoatFace;
  readonly reward: TidesReward;
}

export interface TidesIslandCard {
  readonly id: string;
  readonly seasons: readonly TidesSeason[];
  /** Desde cuántos jugadores entra en el mazo: 2, 3 o 4. */
  readonly minPlayers: number;
  readonly spaces: readonly TidesIslandSpaceCard[];
  readonly points: number;
}

export interface TidesBirdCard {
  readonly id: string;
  readonly kind: TidesBirdKind;
  readonly season: TidesSeason;
}

export interface TidesOrderCard {
  readonly id: string;
  /** Lo que cuesta, por ingrediente básico. La perla vale por cualquiera. */
  readonly cost: Readonly<Record<TidesBasic, number>>;
  readonly points: number;
  readonly use: TidesOrderUse;
}

/** El juego no tiene opciones en la versión 1 (ADR-023, MA11). */
export type TidesSettings = Record<string, never>;

/**
 * Dónde se pone un dado.
 *
 * - `ISLAND`: una casilla de una isla de la fila (`island` es su posición en la fila).
 * - `PORT`: una casilla del puerto.
 * - `BIRD`: la casilla propia de un ave a bordo del propio asiento.
 */
export type TidesTarget =
  | { readonly kind: 'ISLAND'; readonly island: number; readonly space: number }
  | { readonly kind: 'PORT'; readonly space: TidesPortSpace }
  | { readonly kind: 'BIRD'; readonly bird: string };

/**
 * Colocar un dado de la reserva propia (MA6). `force` paga el forzado de una
 * barca en una casilla de isla de otra figura: el ingrediente de la casilla
 * o una perla; en una casilla de ave, solo perla. Forzar no recoge.
 */
export interface TidesPlaceAction {
  readonly type: 'PLACE';
  readonly die: string;
  readonly target: TidesTarget;
  readonly force?: TidesIngredient;
}

/** Lo que se paga al cumplir un encargo. Tiene que cubrir el coste justo. */
export type TidesPayment = Readonly<Record<TidesIngredient, number>>;

/** Cumplir un encargo del mercado o uno apalabrado propio (una vez por turno). */
export interface TidesFulfilAction {
  readonly type: 'FULFIL';
  readonly order: string;
  readonly payment: TidesPayment;
}

/**
 * Usar un encargo de la mano (una vez por turno). Lo que lleva depende del uso:
 *
 * - `TURN_DIE`: `die` (de la reserva propia) y `face`.
 * - `REROLL`: `dice`, los de la reserva propia que se vuelven a tirar.
 * - `DOUBLE_SHIFT`: nada.
 * - `TOW`: `die` (una barca en una isla) y `to` (casilla vacía de isla).
 * - `CROSS`: `dice`, dos barcas en islas con la misma cara.
 * - `MOOR`: `die`, cualquier dado colocado.
 * - `RETURN_BOAT`: `die`, una barca propia colocada.
 */
export interface TidesUseAction {
  readonly type: 'USE';
  readonly order: string;
  readonly die?: string;
  readonly dice?: readonly string[];
  readonly face?: TidesFace;
  readonly to?: { readonly island: number; readonly space: number };
}

/** Dejar anidar un ave suelta en una isla reclamada de su estación. */
export interface TidesNestAction {
  readonly type: 'NEST';
  readonly bird: string;
  readonly island: string;
}

/**
 * Resolver la decisión pendiente (MA7). Lo que lleva depende de la decisión:
 *
 * - `BOARD_BIRD`: `season`, el montón del que sube el ave.
 * - `RELEASE_BIRD`: `bird`, el ave que se suelta.
 * - `CHOOSE_INGREDIENTS`: `ingredients`.
 * - `EXCHANGE`: `give` y `take`, de la misma longitud (vacías para no cambiar).
 * - `SHOAL`: `island` y `space`, o `skip`.
 * - `MOVE_BOAT`: `die` y `to`.
 * - `PROMISE`: `order` (la revelada o una del mercado), o `skip` si es opcional.
 */
export interface TidesResolveAction {
  readonly type: 'RESOLVE';
  readonly season?: TidesSeason;
  readonly bird?: string;
  readonly ingredients?: readonly TidesBasic[];
  readonly give?: readonly TidesIngredient[];
  readonly take?: readonly TidesBasic[];
  readonly island?: number;
  readonly space?: number;
  readonly die?: string;
  readonly to?: { readonly island: number; readonly space: number };
  readonly order?: string;
  readonly skip?: boolean;
}

export interface TidesEndTurnAction {
  readonly type: 'END_TURN';
}

/** Las elecciones de fin de ronda: cuántas veces se paga el Flamenco (MA8). */
export interface TidesRoundChoicesAction {
  readonly type: 'ROUND_CHOICES';
  readonly flamingo: number;
}

export type TidesAction =
  | TidesPlaceAction
  | TidesFulfilAction
  | TidesUseAction
  | TidesNestAction
  | TidesResolveAction
  | TidesEndTurnAction
  | TidesRoundChoicesAction;

/** Motivos con los que el juego precisa un rechazo `INVALID_ACTION` (MA16). */
export type TidesRejectionReason =
  | 'MALFORMED_ACTION'
  | 'DIE_NOT_IN_POOL'
  | 'SPACE_OCCUPIED'
  | 'SPACE_SHOALED'
  | 'FACE_MISMATCH'
  | 'CANNOT_FORCE'
  | 'CANNOT_AFFORD'
  | 'ALREADY_PLACED'
  | 'ALREADY_FULFILLED'
  | 'ALREADY_USED'
  | 'MUST_PLACE_FIRST'
  | 'PENDING_DECISION'
  | 'NO_PENDING_DECISION'
  | 'ORDER_NOT_AVAILABLE'
  | 'BAD_TARGET'
  | 'NEST_NOT_ALLOWED'
  | 'PORT_SPACE_USED'
  | 'NOT_YOUR_BIRD'
  | 'BAD_PAYMENT'
  | 'BAD_CHOICE'
  | 'WRONG_PHASE';

/** Una decisión pendiente del asiento que tiene el turno (MA7). */
export type TidesPending =
  | { readonly kind: 'BOARD_BIRD' }
  | { readonly kind: 'RELEASE_BIRD' }
  | {
      readonly kind: 'CHOOSE_INGREDIENTS';
      /** `ONE`: uno a elegir; `TWO_SAME`: dos iguales; `TWO_DISTINCT`: dos distintos. */
      readonly mode: 'ONE' | 'TWO_SAME' | 'TWO_DISTINCT';
    }
  | { readonly kind: 'EXCHANGE'; readonly upTo: number }
  | {
      readonly kind: 'SHOAL';
      /** Cuántos bajíos quedan por poner con esta decisión. */
      readonly remaining: number;
      /** Si solo vale en una isla de la fila. `null`: en cualquiera. */
      readonly island: number | null;
    }
  | { readonly kind: 'MOVE_BOAT'; readonly sameFace: boolean }
  | {
      readonly kind: 'PROMISE';
      readonly remaining: number;
      /** La carta revelada del mazo, que puede quedarse. `null` si el mazo está vacío. */
      readonly revealed: string | null;
      readonly optional: boolean;
    };

/** Un dado tal como se ve. */
export interface TidesDieView {
  readonly id: string;
  /** El asiento dueño del dado. Los de clima no cuentan para nadie una vez colocados. */
  readonly owner: number;
  readonly kind: 'BOAT' | 'WEATHER';
  readonly face: TidesFace;
}

export interface TidesIslandSpaceView extends TidesIslandSpaceCard {
  /** Los dados de la casilla, de abajo arriba. Solo cuenta el de arriba. */
  readonly stack: readonly TidesDieView[];
  readonly shoal: boolean;
}

export interface TidesIslandView {
  readonly id: string;
  readonly seasons: readonly TidesSeason[];
  readonly points: number;
  readonly spaces: readonly TidesIslandSpaceView[];
  /** Quién la domina ahora mismo, calculado por el motor. `null`: nadie. */
  readonly leader: number | null;
}

export interface TidesBirdView {
  readonly id: string;
  readonly kind: TidesBirdKind;
  readonly season: TidesSeason;
  /** El dado en su casilla propia, si la tiene y está ocupada. */
  readonly die: TidesDieView | null;
}

export interface TidesNestView {
  readonly bird: string;
  readonly island: string;
}

export interface TidesScoreView {
  readonly islands: number;
  readonly orders: number;
  readonly birds: number;
  readonly tokens: number;
  readonly leftovers: number;
  readonly total: number;
}

export interface TidesSeatView {
  readonly pool: readonly TidesDieView[];
  readonly setAside: readonly TidesDieView[];
  readonly ingredients: TidesIngredients;
  readonly aboard: readonly TidesBirdView[];
  readonly free: readonly TidesBirdView[];
  readonly nests: readonly TidesNestView[];
  /** Encargos cumplidos sin usar. La mano es visible para todos (MA10). */
  readonly hand: readonly TidesOrderCard[];
  readonly used: readonly TidesOrderCard[];
  readonly promised: readonly TidesOrderCard[];
  readonly claimed: readonly TidesIslandCard[];
  /** Puntos de fichas ganados con poderes. */
  readonly tokens: number;
  readonly retired: boolean;
  /** Los puntos a la vista, contando como al final. */
  readonly score: TidesScoreView;
}

export interface TidesPortSpaceView {
  readonly space: TidesPortSpace;
  readonly dice: readonly TidesDieView[];
}

export interface TidesTurnView {
  readonly seat: number;
  readonly placementsLeft: number;
  readonly placed: number;
  readonly fulfilled: boolean;
  readonly used: boolean;
}

/** La fase: turnos de la ronda, elecciones de fin de ronda o partida terminada. */
export type TidesPhase = 'TURNS' | 'ROUND_END' | 'FINISHED';

export interface TidesView {
  readonly playerCount: number;
  readonly round: number;
  readonly phase: TidesPhase;
  readonly firstSeat: number;
  readonly portSide: TidesPortSide;
  readonly port: readonly TidesPortSpaceView[];
  readonly row: readonly TidesIslandView[];
  readonly islandsLeft: number;
  /** Los cuatro huecos del mercado; `null` si está vacío. */
  readonly market: readonly (TidesOrderCard | null)[];
  readonly ordersLeft: number;
  /** La carta de arriba de cada montón de aves y cuántas quedan. */
  readonly birdPiles: readonly {
    readonly season: TidesSeason;
    readonly top: TidesBirdCard | null;
    readonly count: number;
  }[];
  readonly seats: readonly TidesSeatView[];
  readonly turn: TidesTurnView | null;
  /** La decisión pendiente. La carta revelada al apalabrar solo la ve quien decide. */
  readonly pending: TidesPending | null;
  /** En el fin de ronda, los asientos que aún tienen que elegir. */
  readonly roundChoices: readonly number[];
  /** Al terminar, los asientos que ganan. */
  readonly winners: readonly number[];
}

/**
 * Los eventos de juego. Son públicos (contrato del motor, M8).
 */
export type TidesEvent =
  | { readonly type: 'ROUND_STARTED'; readonly round: number; readonly firstSeat: number }
  | { readonly type: 'DICE_ROLLED'; readonly seat: number; readonly dice: readonly TidesDieView[] }
  | {
      readonly type: 'DIE_PLACED';
      readonly seat: number;
      readonly die: TidesDieView;
      readonly target: TidesTarget;
      readonly forced: boolean;
    }
  | {
      readonly type: 'GATHERED';
      readonly seat: number;
      readonly ingredient: TidesIngredient;
      readonly amount: number;
    }
  | { readonly type: 'BIRD_BOARDED'; readonly seat: number; readonly bird: string }
  | { readonly type: 'BIRD_RELEASED'; readonly seat: number; readonly bird: string }
  | {
      readonly type: 'BIRD_NESTED';
      readonly seat: number;
      readonly bird: string;
      readonly island: string;
    }
  | { readonly type: 'ORDER_PROMISED'; readonly seat: number; readonly order: string }
  | { readonly type: 'ORDER_FULFILLED'; readonly seat: number; readonly order: string }
  | { readonly type: 'ORDER_USED'; readonly seat: number; readonly order: string }
  | { readonly type: 'DIE_MOVED'; readonly die: string; readonly to: TidesTarget }
  | { readonly type: 'DIE_SET_ASIDE'; readonly die: string }
  | { readonly type: 'DIE_RETURNED'; readonly die: string }
  | { readonly type: 'SHOAL_PLACED'; readonly island: number; readonly space: number }
  | { readonly type: 'POINTS_GAINED'; readonly seat: number; readonly points: number }
  | { readonly type: 'TURN_ENDED'; readonly seat: number }
  | { readonly type: 'ISLAND_CLAIMED'; readonly seat: number; readonly island: string }
  | { readonly type: 'ISLAND_DISCARDED'; readonly island: string }
  | { readonly type: 'ORDERS_RESHUFFLED' }
  | { readonly type: 'SEAT_RETIRED'; readonly seat: number }
  | {
      readonly type: 'GAME_SCORED';
      readonly scores: readonly TidesScoreView[];
      readonly winners: readonly number[];
    };
