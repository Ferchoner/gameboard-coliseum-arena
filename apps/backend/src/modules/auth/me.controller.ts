import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  type Me,
  type UpdateMeRequest,
  updateMeRequestSchema,
} from '@gameboard/contracts';
import { Body, Controller, Get, HttpCode, Patch, Put } from '@nestjs/common';
import { apiPath } from '../../common/http/api-path.js';
import { ZodBody } from '../../common/http/zod-body.pipe.js';
import { AuthService } from './auth.service.js';
import { CurrentAuth } from './session.guard.js';
import type { AuthContext } from './sessions.service.js';

/** La cuenta propia. "Yo" es siempre quien tiene la sesión (API, decisión A3). */
@Controller(apiPath('me'))
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  getMe(@CurrentAuth() auth: AuthContext): Promise<Me> {
    return this.auth.getMe(auth.userId);
  }

  @Patch()
  updateMe(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodBody(updateMeRequestSchema)) body: UpdateMeRequest,
  ): Promise<Me> {
    return this.auth.updateMe(auth.userId, body);
  }

  @Put('password')
  @HttpCode(204)
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodBody(changePasswordRequestSchema)) body: ChangePasswordRequest,
  ): Promise<void> {
    await this.auth.changePassword(auth, body);
  }
}
