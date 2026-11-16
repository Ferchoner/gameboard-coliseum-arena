import {
  type LoginRequest,
  loginRequestSchema,
  type Me,
  type RegisterRequest,
  registerRequestSchema,
} from '@gameboard/contracts';
import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { apiPath } from '../../common/http/api-path.js';
import { ZodBody } from '../../common/http/zod-body.pipe.js';
import { AuthService } from './auth.service.js';
import { SessionCookie } from './session-cookie.js';
import { Public } from './session.guard.js';

@Controller(apiPath('auth'))
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookie: SessionCookie,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(201)
  async register(
    @Body(new ZodBody(registerRequestSchema)) body: RegisterRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Me> {
    const { me, session } = await this.auth.register(body);
    this.cookie.set(response, session);
    return me;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodBody(loginRequestSchema)) body: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Me> {
    const { me, session } = await this.auth.login(body);
    // Si el navegador traía otra sesión, se cierra: iniciar sesión siempre
    // estrena identificador (ADR-004, condición 5.7).
    await this.auth.logout(this.cookie.read(request));
    this.cookie.set(response, session);
    return me;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(this.cookie.read(request));
    this.cookie.clear(response);
  }
}
