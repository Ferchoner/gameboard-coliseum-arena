/**
 * Reglas de dependencias del repositorio (ADR-012, decisión S4).
 *
 * Se comprueban con `pnpm deps:check` y en cada pull request. Cada regla
 * cita la decisión de la que sale.
 */

/** Archivos de prueba y de apoyo a las pruebas. Las reglas de aislamiento no les aplican. */
const TESTS = '(\\.test\\.ts$|/test/|/testing/)';

module.exports = {
  forbidden: [
    // --- Paquetes ---------------------------------------------------------
    {
      name: 'motor-aislado',
      severity: 'error',
      comment:
        'El motor de juego es TypeScript puro: no importa nada de fuera de su paquete, ' +
        'ni librerías ni módulos de Node.js (ADR-001, condición 5.5).',
      from: { path: '^packages/game-engine/src/', pathNot: TESTS },
      to: { pathNot: '^packages/game-engine/src/' },
    },
    {
      name: 'contratos-solo-dependen-del-motor',
      severity: 'error',
      comment:
        'El paquete de contratos solo puede depender de la entrada `shared` del motor ' +
        'y de zod (ADR-012, decisión S2).',
      from: { path: '^packages/contracts/src/', pathNot: TESTS },
      to: {
        pathNot: [
          '^packages/contracts/src/',
          '^packages/game-engine/(dist|src)/shared\\.',
          'node_modules/zod/',
        ],
      },
    },
    {
      name: 'paquetes-no-dependen-de-aplicaciones',
      severity: 'error',
      comment: 'Las flechas van solo de `apps/` hacia `packages/` (ADR-005).',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'aplicaciones-separadas',
      severity: 'error',
      comment: 'El frontend y el backend solo se comunican por los contratos (ADR-005).',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'frontend-sin-motor',
      severity: 'error',
      comment:
        'El frontend depende solo del paquete de contratos. Si usa el motor se decide en el ' +
        'Hito 3 (ADR-012, decisión S25).',
      from: { path: '^apps/frontend/' },
      to: { path: '(^packages/game-engine/|^@gameboard/game-engine)' },
    },
    {
      name: 'codigo-de-pruebas-fuera-de-produccion',
      severity: 'error',
      comment: 'El motor de pruebas y los archivos de prueba no se usan desde el código real.',
      from: { path: '^(apps|packages)/[^/]+/src/', pathNot: TESTS },
      to: { path: TESTS },
    },

    // --- Módulos del backend ----------------------------------------------
    {
      name: 'drizzle-solo-en-repositorios',
      severity: 'error',
      comment:
        'Todo acceso a datos pasa por repositorios. Ningún controlador ni servicio importa ' +
        'Drizzle ni el controlador de PostgreSQL (ADR-002, condición 5.4).',
      from: {
        path: '^apps/backend/src/',
        pathNot: ['\\.repository\\.ts$', '\\.schema\\.ts$', '^apps/backend/src/database/', TESTS],
      },
      to: { path: 'node_modules/(drizzle-orm|pg)/' },
    },
    {
      name: 'repositorio-privado-del-modulo',
      severity: 'error',
      comment:
        'El repositorio de un módulo solo lo usa ese módulo. Los demás pasan por su servicio ' +
        '(arquitectura, decisión D3).',
      from: { path: '^apps/backend/src/modules/([^/]+)/' },
      to: {
        path: '^apps/backend/src/modules/[^/]+/.+\\.repository\\.ts$',
        pathNot: '^apps/backend/src/modules/$1/',
      },
    },
    {
      name: 'tablas-con-un-solo-dueno',
      severity: 'error',
      comment:
        'Cada tabla pertenece a un módulo, que es el único que la lee y la escribe. Otro módulo ' +
        'solo puede nombrarla en su propia definición de tablas, para una clave ajena ' +
        '(arquitectura, decisión D3).',
      from: {
        path: '^apps/backend/src/modules/([^/]+)/',
        pathNot: '\\.schema\\.ts$',
      },
      to: {
        path: '^apps/backend/src/modules/[^/]+/.+\\.schema\\.ts$',
        pathNot: '^apps/backend/src/modules/$1/',
      },
    },
    {
      name: 'esquema-completo-solo-para-migraciones',
      severity: 'error',
      comment:
        'El archivo que reúne todas las tablas existe para generar migraciones. El código no lo importa.',
      from: { path: '^apps/backend/src/' },
      to: { path: '^apps/backend/src/database/schema\\.ts$' },
    },
    {
      name: 'websocket-solo-en-realtime',
      severity: 'error',
      comment:
        'El módulo `realtime` es el único que conoce el transporte. Ningún otro importa las ' +
        'librerías de WebSocket (arquitectura, regla 6; ADR-003).',
      from: {
        path: '^apps/backend/src/',
        pathNot: ['^apps/backend/src/modules/realtime/', TESTS],
      },
      to: { path: 'node_modules/(@nestjs/websockets|@nestjs/platform-ws|ws)/' },
    },
    {
      name: 'nadie-depende-de-realtime',
      severity: 'error',
      comment:
        'Los módulos avisan de sus cambios y preguntan por la presencia a través de `broadcast`, ' +
        'sin importar `realtime` (ADR-013, decisión H5). Solo el arranque de la aplicación lo monta.',
      from: {
        path: '^apps/backend/src/(modules|common|config|database)/',
        pathNot: '^apps/backend/src/modules/realtime/',
      },
      to: { path: '^apps/backend/src/modules/realtime/' },
    },
    {
      name: 'broadcast-es-neutral',
      severity: 'error',
      comment:
        'La interfaz de difusión y presencia no conoce a ningún módulo de negocio: por eso todos ' +
        'pueden depender de ella sin crear ciclos (ADR-013, decisión H5).',
      from: { path: '^apps/backend/src/modules/broadcast/' },
      to: { path: '^apps/backend/src/modules/', pathNot: '^apps/backend/src/modules/broadcast/' },
    },
    {
      name: 'rooms-no-conoce-las-partidas',
      severity: 'error',
      comment:
        '`rooms` define la interfaz con la que pide el inicio de una partida y `game-sessions` ' +
        'la implementa. La dependencia va en un solo sentido (ADR-013, decisión H1; ADR-014, ' +
        'decisión K1).',
      from: { path: '^apps/backend/src/modules/rooms/' },
      to: { path: '^apps/backend/src/modules/(matches|game-sessions)/' },
    },
    {
      name: 'matches-solo-registra',
      severity: 'error',
      comment:
        '`matches` es el registro de las partidas: no conoce ni las salas ni la sesión de ' +
        'juego, que es quien la dirige. Solo nombra la tabla de salas para su clave ajena ' +
        '(ADR-014, decisión K1).',
      from: { path: '^apps/backend/src/modules/matches/', pathNot: '\\.schema\\.ts$' },
      to: { path: '^apps/backend/src/modules/(rooms|game-sessions)/' },
    },
    {
      name: 'solo-realtime-conoce-game-sessions',
      severity: 'error',
      comment:
        '`game-sessions` conoce a `rooms`, `matches`, `games` y `players`, y ninguno de ellos ' +
        'la conoce a ella. Solo el canal de tiempo real le pasa las órdenes de juego ' +
        '(ADR-014, decisión K1).',
      from: {
        path: '^apps/backend/src/modules/',
        pathNot: '^apps/backend/src/modules/(game-sessions|realtime)/',
      },
      to: { path: '^apps/backend/src/modules/game-sessions/' },
    },
    {
      name: 'infraestructura-no-depende-de-modulos',
      severity: 'error',
      comment: 'La infraestructura compartida no conoce los módulos de negocio.',
      from: { path: '^apps/backend/src/(common|config)/' },
      to: { path: '^apps/backend/src/modules/' },
    },

    // --- Generales ----------------------------------------------------------
    {
      name: 'sin-ciclos',
      severity: 'error',
      comment: 'Las dependencias circulares hacen el código difícil de entender y de probar.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    // Se analiza el código fuente. De lo compilado y de las librerías solo interesa
    // saber que alguien los importa, no lo que importan ellos.
    doNotFollow: { path: ['node_modules', '^(apps|packages)/[^/]+/dist/'] },
    exclude: { path: '^apps/frontend/(\\.nuxt|\\.output)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'default'],
    },
  },
};
