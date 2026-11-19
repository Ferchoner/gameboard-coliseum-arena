import { Module } from '@nestjs/common';
import { Clock } from '../../common/clock.js';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import { Mailer } from './mailer.js';
import { OutboxMailer } from './outbox-mailer.js';

/** Envío de correo (ADR-017, U6). No tiene tablas. */
@Module({
  providers: [
    {
      provide: Mailer,
      inject: [APP_CONFIG, Clock],
      useFactory: (config: AppConfig, clock: Clock): Mailer =>
        new OutboxMailer(config.mail.outboxDir, clock),
    },
  ],
  exports: [Mailer],
})
export class MailModule {}
