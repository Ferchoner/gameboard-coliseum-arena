/** CONTRATO DE REFERENCIA — NO IMPLEMENTACIÓN FINAL.
 * Motor determinista/puro; sin dependencias de WebSocket, DB o Nuxt.
 */
export type PlayerId = string;
export type GameId = string;
export type GameVersion = string;

export interface GameAction<TPayload = unknown> {
  type: string;
  payload: TPayload;
}
export interface GameEvent<TPayload = unknown> {
  type: string;
  payload: TPayload;
}
export interface GameResult {
  status: 'FINISHED';
  winnerPlayerIds: PlayerId[]; // [] para empate o sin ganador
  reason: string;
  players: Array<{ playerId: PlayerId; outcome: 'WIN' | 'LOSS' | 'DRAW' | 'OTHER'; score?: number }>;
}
export interface GameState<TState = unknown> {
  gameId: GameId;
  gameVersion: GameVersion;
  phase: string;
  players: Array<{ playerId: PlayerId; seat: number }>;
  currentTurn: PlayerId | null;
  state: TState;
  metadata: Record<string, unknown>;
}
export type ApplyResult<TState> =
  | { success: true; state: GameState<TState>; events: GameEvent[]; result: GameResult | null }
  | { success: false; code: string; message?: string };

export interface GameEngine<TState = unknown, TAction extends GameAction = GameAction, TView = unknown> {
  readonly gameId: GameId;
  readonly gameVersion: GameVersion;
  getInitialState(players: PlayerId[], settings: unknown, seed?: string): GameState<TState>;
  validateAction(state: GameState<TState>, actorId: PlayerId, action: TAction): { valid: true } | { valid: false; code: string };
  applyAction(state: GameState<TState>, actorId: PlayerId, action: TAction): ApplyResult<TState>;
  getAvailableActions(state: GameState<TState>, actorId: PlayerId): TAction[];
  getPlayerView(state: GameState<TState>, viewerId: PlayerId | null): TView;
  isFinished(state: GameState<TState>): boolean;
  getResult(state: GameState<TState>): GameResult | null;
  restoreState(serialized: unknown): GameState<TState>;
  serializeState(state: GameState<TState>): unknown;
}

// La capa de aplicación, NO el motor, gestiona: sessionId, requestId,
// autenticación, deduplicación, stateVersion, persistencia y broadcast.
