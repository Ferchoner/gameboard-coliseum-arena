import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type { Clock } from '../../common/clock.js';
import { Mailer, type OutgoingMail } from './mailer.js';

/**
 * El correo simulado del entorno local (ADR-008, punto 17; ADR-017, U6).
 * Guarda cada correo como un archivo de texto en una carpeta y anota en el
 * registro a quién iba y dónde quedó. El servidor no arranca con él en
 * producción (U18).
 */
export class OutboxMailer extends Mailer {
  private readonly logger = new Logger(OutboxMailer.name);

  constructor(
    private readonly directory: string,
    private readonly clock: Clock,
  ) {
    super();
  }

  async send(mail: OutgoingMail): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    // La fecha va delante para que los archivos se ordenen solos, del más antiguo al más nuevo.
    const stamp = this.clock.now().toISOString().replace(/[:.]/g, '-');
    const file = join(this.directory, `${stamp}-${randomUUID().slice(0, 8)}.txt`);
    await writeFile(file, formatMail(mail), { encoding: 'utf8', flag: 'wx' });
    this.logger.log(`Correo simulado para ${mail.to}, "${mail.subject}": ${file}`);
  }
}

export function formatMail(mail: OutgoingMail): string {
  return `Para: ${mail.to}\nAsunto: ${mail.subject}\n\n${mail.text}\n`;
}
