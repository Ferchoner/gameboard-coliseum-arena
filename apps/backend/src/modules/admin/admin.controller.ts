import {
  type AdminGame,
  type AdminListUsersQuery,
  adminListUsersQuerySchema,
  type AdminUser,
  type ItemList,
  type Page,
  type SetCatalogStatusRequest,
  setCatalogStatusRequestSchema,
  type SetCurrentVersionRequest,
  setCurrentVersionRequestSchema,
  type SetUserStatusRequest,
  setUserStatusRequestSchema,
} from '@gameboard/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { apiPath } from '../../common/http/api-path.js';
import { UuidParam } from '../../common/http/uuid-param.pipe.js';
import { ZodBody } from '../../common/http/zod-body.pipe.js';
import { ZodQuery } from '../../common/http/zod-query.pipe.js';
import { CurrentAuth } from '../auth/session.guard.js';
import type { AuthContext } from '../auth/sessions.service.js';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';

/**
 * Las operaciones de administración (API, etiqueta "Administración";
 * matriz de permisos, sección 5). No hay ninguna por el canal de tiempo
 * real (P5), ni páginas en el frontend (ADR-017, U2).
 */
@UseGuards(AdminGuard)
@Controller(apiPath('admin'))
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listUsers(
    @Query(new ZodQuery(adminListUsersQuerySchema)) query: AdminListUsersQuery,
  ): Promise<Page<AdminUser>> {
    return this.admin.listUsers(query);
  }

  @Put('users/:userId/status')
  setUserStatus(
    @CurrentAuth() auth: AuthContext,
    @Param('userId', new UuidParam('USER_NOT_FOUND')) userId: string,
    @Body(new ZodBody(setUserStatusRequestSchema)) body: SetUserStatusRequest,
  ): Promise<AdminUser> {
    return this.admin.setUserStatus(auth, userId, body.status);
  }

  @Post('rooms/:roomId/close')
  @HttpCode(204)
  async closeRoom(
    @CurrentAuth() auth: AuthContext,
    @Param('roomId', new UuidParam('ROOM_NOT_FOUND')) roomId: string,
  ): Promise<void> {
    await this.admin.closeRoom(auth, roomId);
  }

  @Post('matches/:matchId/abort')
  @HttpCode(204)
  async abortMatch(
    @CurrentAuth() auth: AuthContext,
    @Param('matchId', new UuidParam('MATCH_NOT_FOUND')) matchId: string,
  ): Promise<void> {
    await this.admin.abortMatch(auth, matchId);
  }

  @Get('games')
  async listGames(): Promise<ItemList<AdminGame>> {
    return { items: await this.admin.listGames() };
  }

  @Put('games/:gameSlug/status')
  setGameStatus(
    @CurrentAuth() auth: AuthContext,
    @Param('gameSlug') gameSlug: string,
    @Body(new ZodBody(setCatalogStatusRequestSchema)) body: SetCatalogStatusRequest,
  ): Promise<AdminGame> {
    return this.admin.setGameStatus(auth, gameSlug, body.status);
  }

  @Put('games/:gameSlug/versions/:gameVersion/status')
  setGameVersionStatus(
    @CurrentAuth() auth: AuthContext,
    @Param('gameSlug') gameSlug: string,
    @Param('gameVersion') gameVersion: string,
    @Body(new ZodBody(setCatalogStatusRequestSchema)) body: SetCatalogStatusRequest,
  ): Promise<AdminGame> {
    return this.admin.setGameVersionStatus(auth, gameSlug, gameVersion, body.status);
  }

  @Put('games/:gameSlug/current-version')
  setCurrentGameVersion(
    @CurrentAuth() auth: AuthContext,
    @Param('gameSlug') gameSlug: string,
    @Body(new ZodBody(setCurrentVersionRequestSchema)) body: SetCurrentVersionRequest,
  ): Promise<AdminGame> {
    return this.admin.setCurrentGameVersion(auth, gameSlug, body.gameVersion);
  }
}
