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

  /** Lo que cada transacción abierta tiene pendiente de hacer cuando se confirme. */
  private readonly pending = new WeakMap<Transaction, (() => void)[]>();

  /**
   * Ejecuta `work` en una sola transacción: o se guarda todo o no se guarda
   * nada. Quien la abre pasa la transacción a los repositorios que participan.
   *
   * Lo anotado con `afterCommit` se ejecuta solo si la transacción se
   * confirma, y se descarta si se revierte.
   */
  async transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    let effects: (() => void)[] = [];
    const result = await this.db.transaction(async (tx) => {
      effects = [];
      this.pending.set(tx, effects);
      return work(tx);
    });

    for (const effect of effects) {
      try {
        effect();
      } catch (error) {
        // Lo guardado, guardado está: un aviso que falla no deshace la operación.
        this.logger.error(`Falló una acción posterior a la transacción: ${String(error)}`);
      }
    }
    return result;
  }

  /**
   * Anota algo que debe ocurrir solo cuando la transacción se haya
   * confirmado, como avisar a los clientes (ADR-010, regla 8.9; ADR-013,
   * decisión H6). Cualquier módulo que participa en la transacción puede usarlo.
   */
  afterCommit(tx: Transaction, effect: () => void): void {
    const effects = this.pending.get(tx);
    if (!effects) throw new Error('La transacción no la abrió DatabaseService.transaction()');
    effects.push(effect);
  }

  /** Comprueba que la base de datos responde. */
  async ping(): Promise<void> {
    await this.pool.query('select 1');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
