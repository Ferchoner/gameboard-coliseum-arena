import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app.setup.js';
import { InvalidConfigError, loadConfig } from './config/config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await createApp(config);
  await app.listen(config.http.port, config.http.host);

  const scheme = config.http.tls ? 'https' : 'http';
  new Logger('Main').log(
    `API en ${scheme}://${config.http.host}:${config.http.port}. Origen del frontend: ${config.http.frontendOrigin}`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof InvalidConfigError) {
    console.error(error.message);
  } else {
    console.error('El servidor no pudo arrancar.');
    console.error(error);
  }
  process.exit(1);
});
