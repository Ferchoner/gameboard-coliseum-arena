import 'reflect-metadata';
import { USER_ROLES, type UserRole } from '@gameboard/contracts';
import { Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Clock } from '../common/clock.js';
import { InvalidConfigError, loadConfig } from '../config/config.js';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { UsersModule } from '../modules/users/users.module.js';
import { UsersService } from '../modules/users/users.service.js';

/**
 * Orden de consola: concede o retira el rol de administrador.
 *
 *     pnpm admin:role <usuario> ADMIN
 *     pnpm admin:role <usuario> USER
 *
 * El rol no se concede por la API (API, decisión A5; ADR-017, U3). El
 * servidor no tiene que estar parado: lee el rol en cada petición, así que
 * el cambio vale desde la siguiente.
 */
const USAGE = 'Uso: pnpm admin:role <usuario> ADMIN|USER';

const [username, role] = process.argv.slice(2);
if (!username || !role || !(USER_ROLES as readonly string[]).includes(role)) {
  console.error(USAGE);
  process.exit(1);
}

let config;
try {
  // Solo usa la base de datos. Lo demás toma los valores de `pnpm dev` si faltan.
  config = loadConfig({
    DATABASE_URL: 'postgres://gameboard:gameboard@localhost:5432/gameboard',
    FRONTEND_ORIGIN: 'http://localhost:3001',
    ...process.env,
    NODE_ENV: 'development',
    LOG_LEVEL: 'error',
  });
} catch (error) {
  console.error(error instanceof InvalidConfigError ? error.message : error);
  process.exit(1);
}

/** El reloj, que en la aplicación da `CommonModule` a todos los módulos. */
@Global()
@Module({ providers: [Clock], exports: [Clock] })
class ClockModule {}

/** Lo justo para cambiar una cuenta: ni rutas, ni canal de tiempo real, ni tareas periódicas. */
@Module({ imports: [ConfigModule.forRoot(config), ClockModule, DatabaseModule, UsersModule] })
class AdminRoleModule {}

const app = await NestFactory.createApplicationContext(AdminRoleModule, { logger: ['error'] });
try {
  const users = app.get(UsersService);
  const user = await users.findByUsername(username);
  if (!user) {
    console.error(`No existe ninguna cuenta con el nombre de usuario "${username}".`);
    process.exitCode = 1;
  } else if (user.role === role) {
    console.log(`La cuenta ${user.username} ya tenía el rol ${role}. No cambia nada.`);
  } else {
    await users.setRole(user.id, role as UserRole);
    console.log(`La cuenta ${user.username} pasa del rol ${user.role} al rol ${role}.`);
  }
} catch (error) {
  console.error('No se pudo cambiar el rol.');
  console.error(error);
  process.exitCode = 1;
} finally {
  await app.close();
}
