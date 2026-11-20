# ADR-021: Despliegue local con dominio y acceso desde otras redes

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-19 (hora de Ciudad de México) |
| **Decidida por** | Fernando Hernandez Argueta |
| **Amplía** | [ADR-012](0012-decisiones-de-arranque.md), decisión S14 (entorno local con dos orígenes) |
| **Depende de** | ADR-004 (sesión con cookie en el host de la API), ADR-006 (frontend estático), ADR-017 (correo simulado) y la decisión del 2026-11-14 de alojar frontend y API por separado |
| **Revisado sobre** | `main` en `968c9e7` |

Las decisiones de este ADR se llaman **DL1 a DL7**. No toca el Hito 7: el alojamiento en servidores sigue aplazado y sus preguntas (G1 a G5) siguen abiertas.

---

## 1. Contexto

Quien decide quiere probar la plataforma en su PC con Windows de forma más parecida a un despliegue real: con un nombre de dominio en lugar de `localhost` y, además, con personas que entren **desde otras redes**, no solo desde la de su casa. No hay presupuesto, así que todo tiene que ser gratis.

El código ya lo permitía en lo esencial: la API toma su origen y el del frontend de la configuración (CORS, CSRF, origen del WebSocket, enlace de recuperación), y la cookie de sesión vive en el host de la API, sin `Domain` y con `SameSite=Lax`. Faltaba poder elegir los nombres al arrancar, un certificado que los incluyera y una forma de arrancar lo construido en lugar de los servidores de desarrollo.

### La condición que no se puede romper

La cookie `SameSite=Lax` solo viaja en las llamadas del frontend a la API si los dos nombres son del **mismo sitio**, es decir, del mismo dominio registrable según la [lista pública de sufijos](https://publicsuffix.org/). Se comprobó en la lista el 2026-11-19:

| Nombres | ¿El sufijo está en la lista? | ¿Mismo sitio? |
|---|---|---|
| `app.boardgame-coliseum.test` y `api.boardgame-coliseum.test` | `.test` no | **Sí**, el sitio es `boardgame-coliseum.test` |
| `app.localhost` y `api.localhost` | `.localhost` no | **No**: el sitio de cada uno es el nombre entero (lo que ya decía S14) |
| `abc.trycloudflare.com` y `xyz.trycloudflare.com` | `trycloudflare.com` **sí** | **No** |
| Dos nombres de `ngrok-free.app` | `ngrok-free.app` **sí** | **No** |
| `boardgame-coliseum.<red>.ts.net` en dos puertos | `ts.net` sí | Sí: es el mismo nombre |
| `app.boardgame-coliseum.eu.org` y `api.boardgame-coliseum.eu.org` | `eu.org` sí | Sí, el sitio es `boardgame-coliseum.eu.org` |

La propuesta completa, con las alternativas descartadas, está en `propuestas/despliegue-local/despliegue-local-con-dominio.md` de la carpeta del proyecto.

## 2. Decisiones

Aceptadas el 2026-11-19 a las 22:45 (hora de Ciudad de México), con la opción "Recomendado y autorizo el código". El nombre del dominio lo eligió quien decide unos minutos antes.

| Decisión | Resumen |
|---|---|
| DL1 | Dominio de pruebas `.test` en el archivo `hosts`, con `app.` para el frontend y `api.` para la API, manteniendo los puertos |
| DL2 | El dominio es `boardgame-coliseum.test`, y se pide con `--dominio` |
| DL3 | El certificado local incluye los nombres del dominio, y el arranque comprueba que valga para ellos |
| DL4 | Modo de despliegue local, `pnpm local`, con lo construido y `NODE_ENV=development` |
| DL5 | Otras redes: Tailscale Funnel, con orígenes públicos en `LOCAL_FRONTEND_ORIGIN` y `LOCAL_API_ORIGIN` |
| DL6 | Más adelante: túnel de Cloudflare con un dominio gratuito, para tener dos nombres reales |
| DL7 | Opciones descartadas |

### DL1. Dominio `.test` en el archivo `hosts`

`.test` está reservado para pruebas (RFC 2606 y RFC 6761): nunca será un dominio real y el navegador no le da ningún trato especial, al contrario que `localhost`, que siempre cuenta como contexto seguro. Los dos nombres apuntan a la máquina en el archivo `hosts`, en IPv4 y en IPv6, porque Windows puede resolver `localhost` primero a `::1` y los servidores escuchan en `localhost`.

Los puertos se mantienen (3443 y 3444 en HTTPS, 3000 y 3001 en HTTP). El navegador ignora el puerto para las cookies y para decidir si dos nombres son del mismo sitio, así que se prueba lo mismo que en producción. Servir sin puerto, en el 443, exigiría un proxy que reparta por nombre (herramienta nueva) o una dirección de bucle local para cada nombre. No compensa.

Solo vale en el equipo que tiene esas líneas en `hosts`. Un teléfono no puede editarlo.

### DL2. `boardgame-coliseum.test` y la opción `--dominio`

`pnpm dev`, `pnpm dev:https`, `pnpm dev:cert` y `pnpm local` aceptan `--dominio`, que toma `boardgame-coliseum.test`, y `--dominio=<nombre>`, que toma otro. También vale la variable `DEV_DOMAIN`. Sin ninguna de las dos, todo sigue como hasta ahora, con `localhost`.

### DL3. Certificado con los nombres del dominio

`pnpm dev:cert --dominio` crea el certificado para `localhost`, `api.<dominio>`, `app.<dominio>`, `127.0.0.1` y `::1`, con mkcert si está instalado y si no con openssl. Al arrancar en HTTPS, `pnpm dev:https` y `pnpm local --https` comprueban que el certificado valga para los dos nombres. Si no, se detienen y dicen cómo crearlo de nuevo, en lugar de dejar el fallo para un aviso del navegador.

### DL4. Despliegue local: `pnpm local`

Arranca lo que se publicaría: construye todo con `pnpm build`, con el frontend apuntando al origen de la API; aplica las migraciones; y levanta la API compilada (`node dist/main.js`, sin vigilar cambios) y el frontend generado como archivos estáticos. El servidor de archivos estáticos es el que ya usaban las pruebas en navegador, que pasa a `scripts/serve-frontend.mjs` y lo usan los dos.

| Orden | API | Frontend |
|---|---|---|
| `pnpm local` | `http://localhost:3000` | `http://localhost:3001` |
| `pnpm local --https` | `https://localhost:3443` | `https://localhost:3444` |
| `pnpm local --https --dominio` | `https://api.boardgame-coliseum.test:3443` | `https://app.boardgame-coliseum.test:3444` |

La API corre con `NODE_ENV=development`. `production` exige hoy un correo real, porque el simulado está prohibido en producción (ADR-017), y activa la cabecera HSTS, que el navegador recordaría para el dominio de pruebas.

El frontend construido lleva dentro el origen de la API. Después de `pnpm local`, `pnpm test:e2e` necesita volver a construir con `pnpm build`, como ya decía su instrucción.

### DL5. Otras redes: Tailscale Funnel

Tailscale Funnel publica en internet un servicio del equipo con un nombre `boardgame-coliseum.<red>.ts.net` y un certificado válido que pone Tailscale. Quien prueba no instala nada: abre el enlace. Es gratis, funciona aunque el proveedor comparta la dirección pública entre clientes (CGNAT, frecuente en México) y no obliga a abrir puertos en el router. Datos tomados de la documentación de Tailscale el 2026-11-19:

- Solo puede usar los puertos públicos **443, 8443 y 10000**, y solo reenvía a `http://127.0.0.1`.
- Está disponible en todos los planes. El plan Personal es gratuito para hasta 6 personas.
- Tiene un límite de ancho de banda que no se publica, y está en beta.

Cómo se usa aquí:

| Público | Reenvía a |
|---|---|
| `https://boardgame-coliseum.<red>.ts.net` (443) | El frontend construido, en `http://127.0.0.1:3001` |
| `https://boardgame-coliseum.<red>.ts.net:8443` | La API, en `http://127.0.0.1:3000` |

`pnpm local` toma los orígenes públicos de `LOCAL_FRONTEND_ORIGIN` y `LOCAL_API_ORIGIN`. Van juntas, tienen que ser HTTPS y no se combinan con `--https` ni `--dominio`, porque el HTTPS y el nombre los pone el túnel. Con ellas, la API y el frontend escuchan por HTTP en `127.0.0.1` y la cookie lleva `Secure` y `__Host-`, porque el navegador ve HTTPS (la configuración ya permitía `SESSION_COOKIE_SECURE=true` sin certificado propio).

**Diferencia con producción, aceptada solo para pruebas.** El frontend y la API comparten nombre y cambia solo el puerto. Siguen siendo dos orígenes del mismo sitio, pero no se prueban dos nombres distintos; eso lo cubre DL1 en el equipo. Como las cookies no distinguen puertos, el navegador también envía la cookie de sesión al servidor de archivos estáticos, que la ignora. No cambia la decisión del 2026-11-14 de alojar frontend y API por separado.

**Riesgos.** Mientras el túnel está encendido, cualquiera con el enlace llega a la aplicación y puede registrarse, y la API todavía no tiene límites de frecuencia por dirección. El túnel se enciende solo durante las sesiones de prueba. El correo sigue simulado: los enlaces de recuperación quedan en `apps/backend/var/mail/` del equipo. El equipo tiene que seguir encendido mientras se prueba.

Tailscale se instala solo en el equipo de quien decide. No es una dependencia del repositorio.

### DL6. Más adelante: túnel de Cloudflare con un dominio gratuito

Para probar desde fuera con dos nombres reales (`app.` y `api.`), el siguiente paso es un túnel de Cloudflare (`cloudflared`, gratis) con un dominio gratuito como `boardgame-coliseum.eu.org`. `eu.org` aprueba los dominios a mano y puede tardar días o semanas. Ese montaje sirve después para el piloto en el equipo de quien decide. No se construye ahora: se decidirá cuando haya dominio. [A VERIFICAR entonces que Cloudflare acepte el dominio elegido.]

### DL7. Descartadas

- **`.localhost`:** `app.localhost` y `api.localhost` son sitios distintos (S14). Con un nivel más (`app.x.localhost`) sí serían el mismo, pero el navegador trata `localhost` como contexto seguro y oculta fallos que saldrían en un dominio real.
- **`.local`:** es para mDNS; Windows solo anuncia el nombre del propio equipo y la resolución es lenta.
- **`.dev` y `.app`:** son dominios reales con HTTPS obligatorio precargado en los navegadores.
- **Túneles rápidos de Cloudflare y ngrok gratis:** cada nombre es un sitio distinto (tabla de la sección 1), así que la sesión no funcionaría con dos túneles. ngrok gratis, además, da un solo nombre y muestra una página de aviso.
- **DuckDNS abriendo puertos:** el CGNAT lo impide a menudo, expone el equipo directamente y el certificado necesita otra herramienta.
- **Un `.com` de pago:** fuera mientras no haya presupuesto.

## 3. Lo que resultó al construir

- **El servidor de desarrollo del frontend necesita conocer el nombre, pero solo para la recarga en caliente.** Se probó sin cambios: con Nuxt 4.6, `https://app.boardgame-coliseum.test:3444` sirve las páginas y los módulos de `/_nuxt/`, pero Vite rechaza la conexión de la recarga en caliente que llega con ese nombre, y el navegador intenta en vano `wss://localhost:5173`. Por eso `pnpm dev` pasa el nombre en `DEV_ALLOWED_HOST` y `nuxt.config.ts` lo añade a `allowedHosts` de Vite. Con eso, la recarga en caliente conecta. No afecta a `pnpm local`, que no usa el servidor de desarrollo.
- **El servidor de archivos estáticos ya no se cae con una dirección mal escrita.** Antes, una ruta con un escape `%` inválido lanzaba una excepción que detenía el proceso. Ahora responde 404. Importa porque, con el túnel, el servidor queda expuesto a internet.
- **Comprobado en Linux, en la nube, el 2026-11-20:** `pnpm local --https --dominio` y `pnpm dev:https --dominio`, con Chromium, registro, sesión, creación de sala y canal de tiempo real (`wss://api.boardgame-coliseum.test:3443/realtime`); la cookie quedó como `__Host-session` en `api.boardgame-coliseum.test`, `Secure` y `Lax`. El modo con túnel se probó con un túnel simulado que termina TLS en 443 y 8443 y reenvía a `127.0.0.1`: registro, sesión, sala y canal de tiempo real funcionaron.
- **Por verificar en el equipo de quien decide:** el archivo `hosts` en Windows y el WebSocket a través de Tailscale Funnel de verdad, que su documentación no menciona.

## 4. Consecuencias

- Órdenes nuevas o ampliadas: `pnpm local`, y `--dominio` en `pnpm dev`, `pnpm dev:https` y `pnpm dev:cert`. La guía, con las órdenes de PowerShell, está en [`docs/guia-despliegue-local.md`](../guia-despliegue-local.md).
- Archivos nuevos en `scripts/`: `dev-hosts.mjs` (nombres y comprobación del certificado), `dev-process.mjs` (procesos compartidos por `dev.mjs` y `local.mjs`), `local.mjs` y `serve-frontend.mjs`.
- Ninguna dependencia nueva. Las pruebas en navegador de GitHub siguen con `localhost`.
