import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/config.module.js';

export type Database = NodePgDatabase;

/** Una transacción abierta. Se obtiene con `DatabaseService.transaction()`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Con qué ejecuta un repositorio sus consultas: la conexión normal o una
 * transacción abierta por otro módulo (arquitectura, decisión D4).
 */
export type DbExecutor = Database | Transaction;

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: pg.Pool;
  readonly db: Database;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = new pg.Pool({
      connectionString: config.database.url,
      max: config.database.poolMax,
    });
    // Un fallo en una conexión en reposo no debe tumbar el proceso.
    this.pool.on('error', (error) => {
      this.logger.error(`Fallo en una conexión en reposo: ${error.message}`);
    });
    this.db = drizzle({ client: this.pool });
  }

  /**
   * Ejecuta `work` en una sola transacción: o se guarda todo o no se guarda
   * nada. Quien la abre pasa la transacción a los repositorios que participan.
   */
  transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(work);
  }

  /** Comprueba que la base de datos responde. */
  async ping(): Promise<void> {
    await this.pool.query('select 1');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
