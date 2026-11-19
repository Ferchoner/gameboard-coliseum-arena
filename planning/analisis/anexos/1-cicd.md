# Revisión de integración y entrega continuas

- **Repositorio:** `Ferchoner/gameboard-coliseum-arena`, rama `main` en `d7719b5` (Hito 6 fusionado en la PR #8).
- **Fecha:** 2026-11-19.
- **Método:** solo lectura. Análisis estático del repositorio y lectura, mediante la API de GitHub, de las 28 ejecuciones del flujo "Comprobaciones", los pasos de 5 ejecuciones y los registros completos de 3 trabajos (ejecuciones 20 y 28). No se ha instalado, compilado ni ejecutado nada.
- **Lo que no pude comprobar:** la configuración del repositorio en GitHub (si es público o privado, reglas de rama más allá del indicador `protected`, alertas de Dependabot, escaneo de secretos, permisos por defecto de Actions). La API de ramas sí dice `"protected": false` para `main`. La descarga del ZIP de registros la bloqueó el proxy, así que los registros los leí trabajo a trabajo.

---

## 1. Resumen del estado actual

- El flujo `.github/workflows/ci.yml` cumple ADR-012 S23 y va algo más allá. Comprueba formato, análisis, compilación, reglas de dependencias, tipos y pruebas contra PostgreSQL 18 real (S11). Las pruebas en navegador van en un trabajo aparte y en paralelo, como fijan ADR-014 K8 y ADR-015 V12.
- El token tiene solo `contents: read`, y el registro lo confirma: `Contents: read`, `Metadata: read`. Ningún flujo usa `pull_request_target` ni secretos.
- La instalación es reproducible. Usa `--frozen-lockfile`, pnpm fijado en `packageManager` y leído por `pnpm/action-setup`, la caché del almacén de pnpm (se recupera siempre y la instalación tarda unos 3 s) y Node tomado de `.nvmrc`. Solo dos paquetes pueden ejecutar scripts de instalación (`allowBuilds`), y pnpm verifica el lockfile contra sus políticas de cadena de suministro.
- Las 28 ejecuciones terminaron en éxito al primer intento. En los registros leídos no aparece ninguna prueba inestable. Un trabajo dura unos 2 minutos, con dos excepciones explicadas en CI-2.
- La regla de dependencias está bien cubierta. dependency-cruiser tiene 20 reglas, cada una con su ADR, y ESLint prohíbe en el motor la hora, el azar y el entorno.
- Las pruebas en navegador están bien aisladas. Crean su propia base de datos, que se niega a borrar si su nombre no acaba en `_e2e`. `forbidOnly` está activo en CI y Vitest no admite `.only` en CI por defecto.
- La configuración se valida con Zod al arrancar (S21). El servidor se niega a arrancar en producción con la cookie sin `Secure` o con el correo simulado, y hay pruebas de ello (`apps/backend/src/config/config.test.ts:45-50`).
- **Lo que falta:** que la rama `main` exija las comprobaciones, guardar las trazas de Playwright cuando algo falla, comprobar que las migraciones siguen al esquema, fijar las acciones por SHA y tener análisis de seguridad. Para el despliegue no hay nada todavía, como corresponde a una decisión aplazada.

### Datos de las ejecuciones

| Dato | Valor observado |
|---|---|
| Ejecuciones del flujo | 28, todas con éxito y con `run_attempt: 1` |
| Duración habitual de una ejecución | De 1 min 4 s (Hito 1) a unos 2 min (Hito 6) |
| Ejecuciones anómalas | La 20 (7 min 17 s) y la 26 (4 min 47 s) |
| Causa de las anómalas | El paso "Instalar el navegador": 5 min 57 s y 3 min 23 s. En las demás muestras tardó de 19 a 29 s |
| Pruebas del servidor | 312 pruebas en 15 archivos, 56,5 s, en serie (`fileParallelism: false`) |
| Pruebas en navegador | 18 pruebas en 57 s con 2 trabajadores, ninguna inestable |
| Avisos en el registro | `Duplicated imports "Session"` de Nuxt (inofensivo: `useSession.ts:15` reexporta el tipo de `useSessionState.ts:5`) y `NUXT_B7015` (buscado: `payloadExtraction: false` está puesto a propósito en `nuxt.config.ts:66`) |

---

## 2. Hallazgos

Por prioridad: CI-1 es alta; CI-2 a CI-6 son medias; CI-7 a CI-11 son bajas.

### CI-1. La rama `main` no exige las comprobaciones

- **Prioridad:** alta. S23 es la única barrera automática del proyecto, y hoy nada impide fusionar una pull request con las comprobaciones en rojo o empujar directamente a `main`. El arreglo cuesta minutos y no toca código.
- **Evidencia:**
  - La API de GitHub devuelve `{"name":"main","protected":false}`.
  - `.github/workflows/ci.yml:4-7` lanza el flujo en cada pull request, pero ninguna regla de GitHub lo exige.
  - No pude ver si existe algún conjunto de reglas (ruleset) a nivel de organización.
- **Problema:** las comprobaciones se ejecutan pero son solo informativas. El trabajo lo hacen agentes que abren pull requests y una sola persona que las fusiona, así que una fusión con un trabajo fallido, o todavía en curso, pasa sin que nada lo frene.
- **Propuesta:** un conjunto de reglas sobre `main` que:
  - exija pull request para fusionar, con 0 aprobaciones, porque hay una sola persona que decide;
  - exija los dos trabajos: "Formato, análisis, dependencias, tipos y pruebas" y "Pruebas en navegador";
  - bloquee el empuje forzado y el borrado de la rama.

  Pedir además que la rama esté al día con `main` es opcional: obliga a repetir las comprobaciones tras cada fusión. Un aviso: el nombre del trabajo es lo que se exige, así que renombrar un trabajo en `ci.yml` obliga a actualizar la regla.
- **Impacto:** las comprobaciones pasan de informativas a obligatorias. Cuesta unos 10 minutos de configuración en GitHub, sin archivos nuevos.
- **Relación:** ADR-012 S23 ("Comprobaciones en cada pull request"). La complementa sin cambiarla.
- **Clasificación:** recomendación nueva.

### CI-2. Instalar el navegador con `--with-deps` puede tardar 6 minutos por la réplica de Ubuntu

- **Prioridad:** media. Ya ha pasado dos veces en 28 ejecuciones y deja al trabajo cerca de su límite. Una réplica algo más lenta haría fallar el trabajo sin que el código tenga nada que ver.
- **Evidencia:**
  - `.github/workflows/ci.yml:111-112` ejecuta `playwright install --with-deps chromium`.
  - En el registro del trabajo 135142958819 (ejecución 20), todas las librerías del sistema ya estaban instaladas ("is already the newest version"). Lo único nuevo eran 9 paquetes de fuentes (`fonts-ipafont-gothic`, `fonts-wqy-zenhei`, etc.): `Fetched 21.9 MB in 5min 4s (72.0 kB/s)`. La descarga de Chromium tardó unos 6 s.
  - En la ejecución 26, el mismo paso tardó 3 min 23 s. En las ejecuciones 23, 27 y 28 tardó 29, 22 y 19 s.
  - El trabajo tiene `timeout-minutes: 15` (`ci.yml:74`).
- **Problema:** lo lento no es Playwright: es `apt` instalando fuentes de idiomas asiáticos que estas pruebas no usan. No comparan capturas y los textos están en español.
- **Propuesta, por orden:**
  1. Quitar `--with-deps`: `pnpm --filter @gameboard/e2e exec playwright install chromium`. El registro muestra que la imagen `ubuntu-latest` ya trae todas las librerías que pide Chromium. Si una imagen futura dejara de traer alguna, el navegador no arrancaría y el fallo sería inmediato y claro, no silencioso.
  2. Opcional: añadir `--only-shell`, porque las pruebas corren sin ventana. Ahorra los 199 MiB del Chrome completo, unos 3 s. No pude comprobar que la prueba del service worker (`aplicacion-instalable.spec.ts`) pase con el navegador reducido, así que habría que probarlo en una pull request.
  3. No recomiendo guardar el navegador en la caché de Actions: la descarga es la parte rápida y solo ahorraría unos 6 s.
- **Impacto:** quita una variación de hasta 6 minutos y el riesgo de agotar el tiempo del trabajo. El cambio es de una línea y se verifica con una pull request.
- **Relación:** ADR-014 K8 ya preveía "la descarga de un navegador en GitHub en cada ejecución" como coste. Su sección 13 midió 1 min 6 s para el trabajo entero.
- **Clasificación:** recomendación nueva.

### CI-3. Cuando una prueba en navegador falla, sus trazas y capturas se pierden

- **Prioridad:** media. Las pruebas en navegador reproducen reinicios, cortes de red y relojes, que son difíciles de reproducir en local. Si alguna falla en GitHub, hoy solo queda el texto del registro.
- **Evidencia:**
  - `e2e/playwright.config.ts:22` pone `retries: 1` en CI.
  - `e2e/playwright.config.ts:31-32` pone `trace: 'on-first-retry'` y `screenshot: 'only-on-failure'`, que se escriben en `e2e/test-results/`.
  - `e2e/playwright.config.ts:25` pone `reporter: [['list'], ['github']]`, sin informe HTML.
  - `ci.yml:114-115` no tiene ningún paso que suba artefactos.
- **Problema:** la configuración genera trazas pensadas para depurar en GitHub, pero el trabajo las tira al terminar. Además, una prueba que falla una vez y pasa al reintentarlo deja el trabajo en verde: la traza que explicaría esa inestabilidad también se pierde.
- **Propuesta:** un paso al final del trabajo `e2e`:

  ```yaml
  - name: Guardar trazas y capturas de las pruebas en navegador
    if: ${{ !cancelled() }}
    uses: actions/upload-artifact@<SHA de la versión mayor vigente>
    with:
      name: pruebas-en-navegador
      path: e2e/test-results/
      if-no-files-found: ignore
      retention-days: 7
  ```

  Con `!cancelled()` se guarda también lo de las pruebas que pasaron al reintentarlas. Si no hubo ningún fallo, la carpeta queda vacía y no se sube nada. Si se quiere, se puede añadir `['html', { open: 'never' }]` al informe en CI y subir también `e2e/playwright-report/`, que ya está en `.gitignore:7` y `.prettierignore:6`.
- **Impacto:** un fallo en GitHub se depura con la traza de Playwright (red, consola, DOM paso a paso) en vez de repetirlo a ciegas. Cuesta un paso del flujo y almacenamiento solo cuando algo falla.
- **Relación:** ADR-014 K8 y ADR-015 V6, que piden que la prueba del reinicio sea fiable en GitHub.
- **Clasificación:** recomendación nueva.

### CI-4. Nada comprueba que las migraciones sigan al esquema de Drizzle

- **Prioridad:** media. Un cambio en un archivo `*.schema.ts` sin su migración compila y pasa los tipos. Las pruebas se ejecutan contra la base de datos que crean las migraciones, así que solo fallan si alguna prueba toca justo lo que cambió. El desajuste llegaría a producción en silencio.
- **Evidencia:**
  - `apps/backend/package.json:13` tiene `db:generate: drizzle-kit generate`, pero no se ejecuta en CI.
  - `ci.yml:53-69` no tiene ninguna comprobación sobre `apps/backend/drizzle/`.
  - `apps/backend/test/migrations.test.ts` comprueba que las migraciones se aplican, que son idempotentes y el relleno de las estadísticas, pero no que coincidan con `src/database/schema.ts`.
  - Las seis carpetas de `apps/backend/drizzle/` tienen su `snapshot.json`, que es lo que compara `drizzle-kit`.
- **Problema:** ADR-002, condición 5.3, pide que las migraciones "se generan como archivos SQL, se revisan y se versionan", pero nada garantiza que se hayan generado.
- **Propuesta:** un paso en el trabajo `check`, después de "Compilar":

  ```yaml
  - name: Migraciones al día con el esquema
    run: |
      pnpm --filter @gameboard/backend exec drizzle-kit check
      pnpm --filter @gameboard/backend exec drizzle-kit generate --name=comprobacion
      test -z "$(git status --porcelain -- apps/backend/drizzle)" || {
        echo "El esquema cambió sin su migración: ejecuta pnpm --filter @gameboard/backend db:generate"
        git status --porcelain -- apps/backend/drizzle
        exit 1
      }
  ```

  `drizzle-kit check` detecta en el formato 1.0 las migraciones creadas a la vez en dos ramas. `generate` no se conecta a la base de datos y no debería crear nada si el esquema y la última instantánea coinciden. La comprobación se limita a `apps/backend/drizzle` porque el árbol queda modificado por otra causa (CI-7).

  **No pude ejecutarlo.** Hay que verificar que `drizzle-kit 1.0.0-rc.5` carga `schema.ts`, que importa con extensión `.js` (`schema.ts:7` y siguientes). Hay que verificar también que la migración con relleno escrito a mano (`20261119052221_estadisticas_y_recuperacion/migration.sql`) no produce diferencias: debería ser así, porque se compara la instantánea y no el SQL.
- **Impacto:** un olvido de migración se detecta en la pull request y no al desplegar. Además, servirá de red al pasar de `rc.5` a la 1.0 definitiva, que es el paso de ADR-012 S8. Cuesta un paso de pocos segundos y ninguna dependencia nueva, porque `drizzle-kit` ya está en `apps/backend/package.json:40`.
- **Relación:** ADR-002, condición 5.3; ADR-012 S8; `planning/decisiones-y-pendientes.md:128`, el paso a Drizzle 1.0.
- **Clasificación:** recomendación nueva.

### CI-5. Las acciones van fijadas por etiqueta, una de ellas de terceros, y nada las actualiza

- **Prioridad:** media. `pnpm/action-setup` es de terceros y corre con el código y el token del repositorio. Una etiqueta se puede mover, y un SHA no.
- **Evidencia:** `ci.yml:41,43,45,96,98,100` usan `actions/checkout@v7`, `pnpm/action-setup@v6` y `actions/setup-node@v7`. No existe `.github/dependabot.yml` ni configuración de Renovate.
- **Problema:**
  - Si alguien comprometiera la etiqueta `v6` de `pnpm/action-setup`, el código nuevo se ejecutaría en la siguiente pull request sin ningún cambio en el repositorio. El permiso `contents: read` limita el daño, pero no a cero: hay acceso al código y a la caché.
  - Sin actualizaciones automáticas, fijar por SHA envejece.
- **Propuesta:**
  1. Fijar las tres acciones por SHA completo con la versión en un comentario. Por ejemplo, `uses: pnpm/action-setup@<sha> # v6.x.y`.
  2. Añadir `.github/dependabot.yml` solo para el ecosistema `github-actions`, con frecuencia semanal o mensual. Dependabot actualiza el SHA y el comentario.
  3. Para npm, no recomiendo actualizaciones automáticas de versión: el proyecto fija versiones exactas y comprobadas a propósito (ADR-012, sección 13, y S8). Las alertas de seguridad son otra cosa (CI-6).

  Dependabot es un servicio de GitHub, no una dependencia del proyecto, pero añade un proceso: según `planning/decisiones-y-pendientes.md:165`, necesita aprobación.
- **Impacto:** cierra la principal vía de cadena de suministro del propio flujo. Cuesta 15 minutos y luego un par de pull requests al mes para revisar.
- **Relación:** ADR-012 S3 y S16 (fijar versiones). No hay ninguna decisión sobre las acciones.
- **Clasificación:** recomendación nueva.

### CI-6. No hay auditoría de dependencias ni análisis estático de seguridad

- **Prioridad:** media. La plataforma maneja contraseñas, sesiones y un canal en tiempo real con 768 paquetes instalados, y ninguna comprobación avisa de una vulnerabilidad conocida. El backlog ya tiene pendiente una "Revisión de seguridad" en el Hito 7.
- **Evidencia:**
  - En `ci.yml` no hay ningún paso de auditoría.
  - No hay flujo de CodeQL ni de análisis de secretos.
  - No pude comprobar si están activadas las alertas de Dependabot, el escaneo de secretos o la configuración por defecto de CodeQL, porque son ajustes del repositorio.
  - En el registro sí aparece `✓ Lockfile passes supply-chain policies (849 entries in 1.7s)` (pnpm 12). No pude ver qué políticas aplica, porque no hay `.npmrc` ni ajustes de política en `pnpm-workspace.yaml`.
- **Problema:** una vulnerabilidad publicada en `pg`, `ws`, `@nestjs/*` o `nuxt` no la ve nadie hasta revisarla a mano.
- **Propuesta, de menor a mayor coste:**
  1. Activar en GitHub las alertas de Dependabot, el escaneo de secretos y la protección al empujar. Son ajustes y no añaden archivos. La protección al empujar es útil porque ya hay `.env` locales, ignorados por `.gitignore:10-12`.
  2. Activar la configuración por defecto de CodeQL para JavaScript/TypeScript y para Actions. Es gratis en repositorios públicos; en privados necesita una licencia de GitHub Code Security. No sé cuál es el caso.
  3. Una auditoría de dependencias de producción, como `pnpm audit --prod --audit-level=high`, en un flujo programado semanal con ejecución manual (`workflow_dispatch`), y no en cada pull request: así una vulnerabilidad recién publicada en un paquete que el cambio no toca no bloquea un cambio ajeno. Hay que verificar que la orden existe con esa forma en pnpm 12.
- **Impacto:** detección temprana de vulnerabilidades conocidas y de secretos subidos por error. Los puntos 1 y 2 cuestan minutos; el 3, un archivo de flujo pequeño.
- **Relación:** `planning/backlog-mvp.md:148` ("Revisión de seguridad", Hito 7, no autorizado). Los puntos 1 y 2 son ajustes del repositorio y no código del hito, pero según `planning/decisiones-y-pendientes.md:165` conviene que quien decide los apruebe.
- **Clasificación:** recomendación nueva (adelanta parte de un pendiente del Hito 7).

### CI-7. Hay un enlace simbólico con ruta absoluta de una máquina concreta en el repositorio

- **Prioridad:** baja. No rompe nada hoy, pero ensucia el árbol de trabajo tras cada compilación y deja en el repositorio una ruta local.
- **Evidencia:**
  - `git ls-files -s apps/frontend/dist` da `120000 … apps/frontend/dist`, un enlace simbólico que apunta a `/home/user/gameboard-coliseum-arena/apps/frontend/.output/public`.
  - Entró en el commit `25d230e` ("feat(frontend): registro, entrada y catálogo").
  - `.gitignore:2` pone `dist/` con barra final, que solo excluye directorios, y un enlace simbólico no lo es para git.
- **Problema:** `nuxt generate` crea ese enlace en cada compilación.
  - En cualquier otra máquina, incluido GitHub, el enlace versionado no apunta a nada hasta compilar, y después aparece como modificado. Así es fácil volver a subirlo con otra ruta.
  - En Windows, que el proyecto dice soportar (`README.md:24`, `.gitattributes`), git sin enlaces simbólicos lo saca como un archivo de texto.
  - Además, invalida cualquier comprobación del tipo `git diff --exit-code` sobre todo el árbol (ver CI-4).
- **Propuesta:** `git rm --cached apps/frontend/dist`, y en `.gitignore` cambiar `dist/` por `dist`, o añadir `apps/frontend/dist`. Las pruebas en navegador no usan el enlace: leen `apps/frontend/.output/public/` (`e2e/support/settings.mjs:103-105`).
- **Impacto:** árbol limpio tras compilar y ninguna ruta local en el repositorio. Cuesta un commit de dos líneas.
- **Relación:** ninguna decisión.
- **Clasificación:** recomendación nueva (defecto).

### CI-8. La concurrencia cancela ejecuciones en `main` y el token queda guardado en el clon

- **Prioridad:** baja. Endurecimiento menor que no cambia el resultado de las comprobaciones.
- **Evidencia:**
  - `ci.yml:12-14` pone `group: ci-${{ github.ref }}` con `cancel-in-progress: true` también para los empujes a `main`.
  - `ci.yml:41` y `ci.yml:96` usan `actions/checkout` con `persist-credentials` por defecto. El registro muestra cómo se configura y se retira `includeIf … git-credentials`.
- **Problema:**
  - Dos fusiones seguidas cancelan la comprobación de la primera, y un commit de `main` se queda sin resultado completo. Cuando exista despliegue, será justo el commit que se querría desplegar o al que se querría volver.
  - Ningún paso usa git con credenciales, así que guardarlas en `.git/config` durante el trabajo no aporta nada.
- **Propuesta:** `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` y `with: { persist-credentials: false }` en los dos `checkout`.
- **Impacto:** cada commit de `main` tiene su resultado, y hay menos superficie si una dependencia maliciosa leyera `.git/config`. Son tres líneas.
- **Relación:** ninguna decisión.
- **Clasificación:** recomendación nueva.

### CI-9. Los pendientes del Hito 7 en las pruebas, y cómo encajarían en CI

- **Prioridad:** baja hoy, porque el Hito 7 no está autorizado. Lo anoto para que el coste en CI se conozca antes de autorizarlo.
- **Evidencia:**
  - `planning/decisiones-y-pendientes.md:125`: otros navegadores y modo HTTPS (ADR-014, sección 13, línea 352).
  - `planning/decisiones-y-pendientes.md:127`: cierre con 1008 (ADR-013 H9, línea 275).
  - `planning/backlog-mvp.md:122`: prueba a mano de la PWA (ADR-016 N6).
  - `planning/backlog-mvp.md:151`: cookie en Safari con un despliegue real (ADR-004).
  - `e2e/playwright.config.ts:35-51` solo tiene proyectos con `devices['Desktop Chrome']`.
- **Lo que implica para CI:**
  - **Otros navegadores:** añadir proyectos `firefox` y `webkit`, pero en un trabajo aparte que corra en los empujes a `main` o con una programación, no en cada pull request, para no alargarlas. Tres cuidados:
    - Las pruebas de corte de red dependen de cómo se comporta Chromium con `setOffline` y el WebSocket abierto (ADR-015, sección 9, línea 184, y `corte-de-red.spec.ts:27-65`). Habría que verificarlas en los otros dos o excluirlas.
    - WebKit en Linux necesita muchas más librerías del sistema que Chromium, así que ahí `--with-deps` sí hará falta, y el problema de CI-2 volverá: conviene tenerlo resuelto antes.
    - WebKit en Linux no es Safari. No sustituye la prueba de la cookie de 7 días con un despliegue real.
  - **Modo HTTPS:** el certificado se puede crear en GitHub con `scripts/dev-cert.mjs`, porque hay `openssl` y no hay `mkcert`. Pero `e2e/support/settings.mjs:69-72` fija los orígenes HTTP, y el frontend lleva el origen de la API fijado al construir (`nuxt.config.ts:7`). Haría falta una segunda compilación del frontend con `NUXT_PUBLIC_API_ORIGIN=https://localhost:3443` y `ignoreHTTPSErrors` en Playwright. El coste es moderado, y es la única forma automática de probar `__Host-session` con `Secure`.
  - **Cierre con 1008:** basta una prueba del servidor en `apps/backend/test/realtime.test.ts`. No cambia el flujo.
  - **PWA en el móvil:** sigue siendo a mano. La emulación de dispositivos de Playwright no pulsa "Instalar" (ADR-016 N6), y lo automatizable ya lo cubre `aplicacion-instalable.spec.ts`.
- **Impacto:** si se hace como se propone, las pull requests no se alargan y lo nuevo corre aparte. Cuesta de media jornada a una jornada, sobre todo por el modo HTTPS.
- **Relación:** ADR-014, sección 13; ADR-013 H9; ADR-016 N6; ADR-004.
- **Clasificación:** ya anotado como pendiente.

### CI-10. El despliegue separado impone condiciones a la futura entrega continua

- **Prioridad:** baja mientras el alojamiento siga aplazado. Pasará a ser alta en cuanto se escriba el ADR de alojamiento, porque algunas de estas condiciones descartan opciones habituales de los proveedores.
- **Evidencia:**
  - La cookie es solo del host de la API, con `SameSite=Lax` (`apps/backend/src/modules/auth/session-cookie.ts:29,64`).
  - La API admite un único origen exacto en CORS (`app.setup.ts:58`), en CSRF (`app.setup.ts:68`) y en el handshake del WebSocket (`realtime-handshake.ts:32`).
  - El origen de la API "queda fijado al construir" (`apps/frontend/nuxt.config.ts:7,53-57`), y el canal deriva de él `ws`/`wss` (`realtime-client.ts:118-121`).
  - `HOST` vale `localhost` por defecto (`config.ts`, `HOST: …default('localhost')`).
  - Las migraciones se aplican con una orden aparte (`apps/backend/package.json:14`); el servidor no las aplica al arrancar (`main.ts`).
  - No hay ni etiquetas ni versiones publicadas (`git tag -l` vacío), y todos los paquetes son `0.0.0` y privados (ADR-012 S1).
- **Condiciones para el ADR de alojamiento y la entrega continua:**
  1. **Nada de entornos de vista previa en los dominios gratuitos del proveedor.** Con la cookie y el origen único, un frontend de vista previa en `*.proveedor.app` es otro sitio para el navegador (escenario 2 de `docs/auditoria/comparacion-autenticacion.md:118-125`), y además la API lo rechazaría por su origen. Si se quieren vistas previas, tienen que ir bajo el dominio propio y con una API propia. Lo más simple es no tenerlas.
  2. **Una compilación del frontend por entorno.** La que hace hoy el CI lleva `http://localhost:3000` dentro. Conviene que el futuro flujo de entrega compile con `NUXT_PUBLIC_API_ORIGIN` del entorno y que falle si en producción ese origen no es `https://` o apunta a `localhost`. Es una comprobación de una línea en `nuxt.config.ts` o en el propio flujo.
  3. **El backend como artefacto inmutable,** para un contenedor o un proceso persistente (`despliegue-y-requisitos.md`, 5a): `pnpm deploy --filter @gameboard/backend --prod` produce una carpeta con sus dependencias y los paquetes del espacio de trabajo. No pude comprobar qué opciones exige `pnpm deploy` en pnpm 12. `HOST` tendrá que ser `0.0.0.0` dentro de un contenedor.
  4. **Las migraciones como paso previo al arranque,** con `node dist/database/migrate.js` y una sola instancia (ADR-007 B6). Para cumplir el objetivo de menos de 1 minuto de corte (`despliegue-y-requisitos.md:119`), cada migración debe ser compatible con la versión anterior del servidor mientras arranca la nueva.
  5. **Una etiqueta por cada versión desplegada,** por ejemplo una por hito fusionado. Así se sabe a qué commit volver. No hace falta ninguna herramienta.
  6. **Lo que no pude comprobar:** si, detrás del proxy del proveedor, Express necesita `trust proxy`. Para la cookie no hace falta, porque la sesión es propia y escribe `Secure` sin mirar `req.secure`. Sí hará falta si los límites de frecuencia del Hito 7 se basan en la IP.
- **Impacto:** evita elegir un alojamiento cuyo modelo de vistas previas o de construcción choque con decisiones ya aceptadas. Ahora no cuesta nada: son notas para el ADR.
- **Relación:**
  - ADR-004, condiciones 5.2 a 5.5, y ADR-012 S13: cookie, CORS y orígenes.
  - ADR-005: "las dos aplicaciones se construyen y se despliegan por separado".
  - ADR-006: archivos estáticos.
  - ADR-007 B6 y B7: una instancia.
  - `docs/auditoria/despliegue-y-requisitos.md`, 5a, 5e y 5f.
- **Clasificación:** recomendación nueva (para cuando se retome la decisión aplazada).

### CI-11. La documentación da el Hito 6 por "en revisión" y exagera lo que cubre `pnpm check`

- **Prioridad:** baja. No afecta al flujo, pero el README es la primera fuente para quien llega.
- **Evidencia:**
  - `README.md:5` dice "El **Hito 6** … está en revisión".
  - `planning/backlog-mvp.md:139` dice "Construido el 2026-11-19, en revisión en la PR #8".
  - Pero la PR #8 ya está fusionada (`d7719b5`, "Merge pull request #8").
  - `README.md:58` dice que `pnpm check` es "Todo lo que se comprueba en cada pull request", pero `package.json:18` no incluye las pruebas en navegador, que también corren en cada pull request (`ci.yml:71-115`).
- **Propuesta:** dar el Hito 6 por fusionado en los dos sitios. En el README, añadir "salvo las pruebas en navegador, que se ejecutan con `pnpm test:e2e`".
- **Impacto:** documentación fiel. Son dos líneas.
- **Relación:** ADR-017 (Hito 6) y ADR-012 S23.
- **Clasificación:** incoherencia entre documentación y código.

---

## 3. Lo que revisé y no propongo cambiar ahora

| Asunto | Por qué no |
|---|---|
| Que el CI distinga qué parte cambió, como anticipa ADR-005 (sección 4, "Negativas") | De las 28 ejecuciones, 14 tienen como último commit uno que empieza por `docs:`, y las 6 que comprobé solo tocan `docs/`, `planning/` o `README.md`. Pero en `pull_request` el filtro de rutas mira el diff entero de la pull request, y casi todas mezclan código y documentación, así que el ahorro sería pequeño. Además, una comprobación obligatoria saltada por un filtro deja la pull request bloqueada (CI-1). `contracts/` no se podría excluir nunca, porque las pruebas validan contra `contracts/01-rest-api.yaml`. Es una consecuencia anotada en el ADR y no una decisión, así que no lo clasifico como incoherencia |
| Herramienta de orquestación (Turborepo, Nx) | ADR-012 S3 la deja para cuando las compilaciones sean lentas, y la compilación entera tarda unos 9 s |
| Reutilizar la compilación entre los dos trabajos | Se repite la instalación y la compilación (unos 15 s); pasar artefactos de un trabajo a otro costaría parecido y obligaría a ejecutarlos en serie |
| Paralelizar las pruebas del servidor | Hoy son el paso más largo del trabajo `check` (56 s, en serie por compartir base de datos, `apps/backend/vitest.config.ts:9`). Si crecen mucho, la salida es una base de datos por trabajador; hoy no compensa |
| Versiones que avanzan solas: `ubuntu-latest` (ya en 26.04), `postgres:18`, Node `26` en `.nvmrc` | Es lo que aprueban ADR-012 S10 y S16 ("la línea 26", "PostgreSQL 18"), y `engines` pone el suelo en 26.13 (`package.json:7`). `pnpm` sí está fijado de forma exacta. Fijar más supondría mantenimiento sin beneficio claro mientras no haya despliegue |
| Tiempos límite | 15 minutos por trabajo es razonable con duraciones de unos 2 minutos, una vez resuelto CI-2. Playwright tiene 60 s por prueba y 10 s por espera, y los servidores de prueba tienen su propio plazo de arranque (`playwright.config.ts:26-27,58`) |
| Gestión de variables de entorno | `.env.example` solo en el backend, con todas las variables documentadas, como pide S21. El frontend tiene una sola variable de construcción, documentada en `nuxt.config.ts:7`. El CI no usa secretos y las credenciales de PostgreSQL son de un contenedor efímero |
