import { Controller, Get, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RawResponse } from '../../common/http/raw-response.decorator.js';
import { DatabaseService } from '../../database/database.service.js';
import { Public } from '../auth/session.guard.js';

/**
 * Comprobación de salud (ADR-012, decisión S19). Es una operación de
 * servicio: está fuera de `/api/v1` y responde sin el sobre de la API.
 * Responde `200` si el servidor y la base de datos contestan y `503` si no.
 */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly database: DatabaseService) {}

  @Public()
  @RawResponse()
  @Get()
  async check(@Res({ passthrough: true }) response: Response): Promise<{ status: string }> {
    try {
      await this.database.ping();
      return { status: 'ok' };
    } catch (error) {
      this.logger.error(
        `La base de datos no responde: ${error instanceof Error ? error.message : String(error)}`,
      );
      response.status(503);
      return { status: 'unavailable' };
    }
  }
}
