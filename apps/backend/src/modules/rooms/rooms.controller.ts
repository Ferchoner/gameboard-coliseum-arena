import {
  type CreateRoomRequest,
  createRoomRequestSchema,
  type ListRoomsQuery,
  listRoomsQuerySchema,
  type Page,
  type RoomSummary,
  type RoomView,
  type SetReadyRequest,
  setReadyRequestSchema,
} from '@gameboard/contracts';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { apiPath } from '../../common/http/api-path.js';
import { UuidParam } from '../../common/http/uuid-param.pipe.js';
import { ZodBody } from '../../common/http/zod-body.pipe.js';
import { ZodQuery } from '../../common/http/zod-query.pipe.js';
import { CurrentAuth } from '../auth/session.guard.js';
import type { AuthContext } from '../auth/sessions.service.js';
import { RoomsService } from './rooms.service.js';

const roomId = () => new UuidParam('ROOM_NOT_FOUND');

/**
 * Salas por la API (contrato de la API, sección 2). Quién actúa sale
 * siempre de la sesión: por eso las rutas de pertenencia terminan en `me`.
 */
@Controller(apiPath('rooms'))
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  listRooms(
    @Query(new ZodQuery(listRoomsQuerySchema)) query: ListRoomsQuery,
  ): Promise<Page<RoomSummary>> {
    return this.rooms.list(query);
  }

  @Post()
  @HttpCode(201)
  createRoom(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodBody(createRoomRequestSchema)) body: CreateRoomRequest,
  ): Promise<RoomView> {
    return this.rooms.create(auth.playerId, body);
  }

  @Get(':roomId')
  getRoom(@Param('roomId', roomId()) id: string): Promise<RoomView> {
    return this.rooms.get(id);
  }

  @Put(':roomId/members/me')
  joinRoom(
    @CurrentAuth() auth: AuthContext,
    @Param('roomId', roomId()) id: string,
  ): Promise<RoomView> {
    return this.rooms.join(auth.playerId, id);
  }

  @Delete(':roomId/members/me')
  @HttpCode(204)
  leaveRoom(
    @CurrentAuth() auth: AuthContext,
    @Param('roomId', roomId()) id: string,
  ): Promise<void> {
    return this.rooms.leave(auth.playerId, id);
  }

  @Put(':roomId/members/me/ready')
  setReady(
    @CurrentAuth() auth: AuthContext,
    @Param('roomId', roomId()) id: string,
    @Body(new ZodBody(setReadyRequestSchema)) body: SetReadyRequest,
  ): Promise<RoomView> {
    return this.rooms.setReady(auth.playerId, id, body.ready);
  }
}
