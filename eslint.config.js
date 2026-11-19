import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Lo que el motor de juego no puede usar (arquitectura, sección 5): la hora,
 * el azar, temporizadores, la red, el disco ni nada del entorno. Su resultado
 * depende solo de lo que recibe.
 */
const ENGINE_FORBIDDEN_GLOBALS = [
  'Date',
  'performance',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'process',
  'crypto',
  'fetch',
  'console',
  'globalThis',
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'WebSocket',
  'XMLHttpRequest',
].map((name) => ({
  name,
  message: 'El motor de juego no usa nada del entorno: recibe por parámetro todo lo que necesita.',
}));

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      'apps/backend/drizzle/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,

  {
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // NestJS declara sus módulos como clases sin miembros.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },

  // Código que se ejecuta en Node.
  {
    files: ['apps/backend/**/*.ts', 'packages/**/*.ts', 'scripts/**/*.mjs', '*.{js,cjs,mjs}'],
    languageOptions: { globals: globals.node },
  },
  // El service worker de la aplicación instalable (ADR-016, decisión N4).
  {
    files: ['apps/frontend/service-worker/**/*.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  // Pruebas en navegador: se ejecutan en Node y parte de su código, dentro de la página.
  {
    files: ['e2e/**/*.{ts,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  // Las herramientas de línea de órdenes y el arranque, que falla antes de que exista el registro, escriben en la consola.
  {
    files: [
      'scripts/**/*.mjs',
      'apps/*/scripts/**/*.mjs',
      'e2e/support/**/*.mjs',
      'apps/backend/src/database/migrate.ts',
      'apps/backend/src/scripts/**/*.ts',
      'apps/backend/src/main.ts',
    ],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },

  // Backend: la inyección de dependencias necesita las clases como valores.
  {
    files: ['apps/backend/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      // Añadir datos propios a la petición de Express se hace ampliando su espacio de nombres.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
  },

  // Motor de juego: aislado y determinista.
  {
    files: ['packages/game-engine/src/**/*.ts'],
    ignores: ['packages/game-engine/src/**/*.test.ts'],
    rules: {
      'no-restricted-globals': ['error', ...ENGINE_FORBIDDEN_GLOBALS],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'El motor de juego no usa azar propio: el azar llega por parámetro.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^[^.]',
              message: 'El motor de juego no depende de ningún paquete ni del entorno.',
            },
          ],
        },
      ],
    },
  },

  // Frontend.
  ...vue.configs['flat/recommended'].map((config) => ({
    ...config,
    files: ['apps/frontend/**/*.vue'],
  })),
  {
    files: ['apps/frontend/**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
      globals: globals.browser,
    },
    rules: {
      // Las páginas de Nuxt se llaman como su ruta.
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['apps/frontend/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['apps/frontend/**/*.{ts,vue}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gameboard/game-engine', '@gameboard/game-engine/*'],
              allowTypeImports: true,
              message:
                'El motor de juego no se ejecuta en el navegador: del motor, el frontend solo ' +
                'puede importar tipos, con `import type` (ADR-014, K7).',
            },
          ],
        },
      ],
    },
  },

  prettier,
);
