import type { Me } from '@gameboard/contracts';
import { Controller, Get } from '@nestjs/common';
import { apiPath } from '../../common/http/api-path.js';
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
}
