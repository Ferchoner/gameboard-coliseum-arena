import {
  type ListMyMatchesQuery,
  listMyMatchesQuerySchema,
  type MatchSummaryView,
  type MatchView,
  type Page,
} from '@gameboard/contracts';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { Clock } from '../../common/clock.js';
import { apiPath } from '../../common/http/api-path.js';
import { UuidParam } from '../../common/http/uuid-param.pipe.js';
import { ZodQuery } from '../../common/http/zod-query.pipe.js';
import { CurrentAuth } from '../auth/session.guard.js';
import type { AuthContext } from '../auth/sessions.service.js';
import { Presence } from '../broadcast/presence.js';
import { GameSessionsService } from './game-sessions.service.js';
import { toMatchView } from './match-views.js';

/**
 * Consulta de partidas por la API (contrato de la API, sección 2). Las
 * jugadas no viajan por aquí: van por el canal de tiempo real. Las sirve
 * `game-sessions`, que es quien conoce el estado vivo (ADR-014, decisión K1).
 */
@Controller()
export class MatchesController {
  constructor(
    private readonly sessions: GameSessionsService,
    private readonly presence: Presence,
    private readonly clock: Clock,
  ) {}

  /** Las partidas propias: en curso, o el historial con `status=FINISHED`. */
  @Get(apiPath('me/matches'))
  listMyMatches(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodQuery(listMyMatchesQuerySchema)) query: ListMyMatchesQuery,
  ): Promise<Page<MatchSummaryView>> {
    return this.sessions.listForPlayer(auth.playerId, query);
  }

  /** Una partida, desde el asiento de quien la pide. Solo para sus participantes. */
  @Get(apiPath('matches/:matchId'))
  async getMatch(
    @CurrentAuth() auth: AuthContext,
    @Param('matchId', new UuidParam('MATCH_NOT_FOUND')) matchId: string,
  ): Promise<MatchView> {
    const { snapshot, seat } = await this.sessions.getForPlayer(matchId, auth.playerId);
    return toMatchView(snapshot, seat, this.clock.now(), (playerId) =>
      this.presence.isConnected(playerId),
    );
  }
}
