# ADR-004: Autenticación con sesión de servidor y cookie, sobre subdominios de un mismo dominio

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-14 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Cierra** | Pendiente P3 (autenticación) y hallazgo C-03 (`/auth/refresh`) |
| **Depende de** | ADR-001 (NestJS) y ADR-003 (WebSocket nativo) |
| **Relacionados** | ADR-006 (renderizado del frontend), ADR-008 (alcance del MVP) |

## 1. Contexto

- Clientes solo en navegador, con intención de que el frontend funcione como PWA.
- REST y WebSocket en el mismo backend. El WebSocket debe autenticarse en el handshake (ADR-003).
- La identidad nunca se toma de un `playerId` enviado por el cliente (`docs/02`; `contracts/02`).
- `contracts/01` § Seguridad pide no exponer refresh tokens en JSON y evaluar cookies HttpOnly con CSRF.
- Habrá partidas por turnos que duran días, así que la sesión debe ser duradera.
- Suspender una cuenta debe tener efecto inmediato (`users.status`).
- **El frontend y el backend se alojarán por separado.** Para las cookies lo determinante es que compartan dominio registrable, no dónde se aloje cada uno.
- El análisis completo, con las dos adendas sobre alojamiento separado y PWA, está en `docs/auditoria/comparacion-autenticacion.md`.

## 2. Decisión

1. La autenticación usa una **sesión guardada en el servidor**, identificada por un valor opaco que viaja en una **cookie**.
2. El frontend y la API se publican en **subdominios de un mismo dominio propio**, cada uno en su alojamiento.

## 3. Alternativas consideradas

| Alternativa | Por qué no se eligió |
|---|---|
| Tokens con dominios no relacionados | El refresh token no podría ir en cookie y quedaría accesible desde JavaScript. El WebSocket necesitaría un ticket de un solo uso. La revocación inmediata exige estado en el servidor igualmente |
| JWT con refresh token rotatorio en cookie | Complica la revocación y la autenticación del WebSocket, y para sesiones de días acaba necesitando estado en el servidor |
| Identidad delegada en un proveedor externo | Añade una dependencia externa y sigue necesitando una sesión local. Puede incorporarse después como método de acceso adicional |
| Aplazar la decisión de dominios | Habría dejado abierta parte del diseño del WebSocket |

## 4. Consecuencias

**Positivas**
- La cookie viaja en el handshake del WebSocket: la conexión se rechaza antes de abrirse si no es válida, sin credenciales en la URL.
- Revocación inmediata, incluido el cierre de las conexiones abiertas.
- Ninguna credencial accesible desde JavaScript.
- Sesiones largas sin ciclo de refresco.
- La protección CSRF de NestJS cubre REST sin dependencias nuevas.
- Compatible con el frontend como PWA.

**Negativas**
- Exige un dominio propio y un subdominio por servicio.
- Las peticiones del frontend a la API son entre orígenes distintos: hacen falta CORS con credenciales y orígenes de confianza.
- Una consulta de sesión por petición.
- Menos cómodo si más adelante hay clientes que no sean navegadores.

**Riesgos y mitigaciones**

| Riesgo | Mitigación |
|---|---|
| Petición entre sitios que aprovecha la cookie | SameSite, protección CSRF de NestJS con el frontend como origen de confianza (5.3) |
| Conexión WebSocket abierta desde otro sitio | Lista explícita de orígenes en el handshake (5.5). La protección CSRF de NestJS no cubre el handshake |
| Conexión abierta que sobrevive a la revocación | Cierre de conexiones al revocar y revalidación periódica (5.8) |
| Fuga de la tabla de sesiones | Se guarda solo el hash del identificador (5.1) |
| Safari limita la cookie a 7 días con alojamientos distintos | La renovación deslizante la refresca en cada visita. A comprobar con una prueba real en el primer despliegue |
| Clientes futuros que no sean navegadores | El mismo valor opaco podría aceptarse en una cabecera, con un ticket de un solo uso para el WebSocket, sin retirar las sesiones |

## 5. Condiciones

Aceptadas el 2026-11-14 junto con la decisión principal.

| # | Condición | Motivo |
|---|---|---|
| 5.1 | Identificador de sesión aleatorio de alta entropía; en la base de datos se guarda solo su hash | Una fuga de la tabla no permite suplantar sesiones |
| 5.2 | Cookie HttpOnly, Secure y SameSite=Lax | Reduce la exposición a XSS y a peticiones entre sitios |
| 5.3 | Protección CSRF de NestJS activada, con el origen del frontend declarado como origen de confianza | Las peticiones del frontend dejan de ser del mismo origen |
| 5.4 | CORS en la API limitado al origen exacto del frontend, con credenciales permitidas | Necesario para que el navegador envíe la cookie entre subdominios |
| 5.5 | Lista explícita de orígenes permitidos en el handshake del WebSocket | La protección CSRF de NestJS no revisa el handshake |
| 5.6 | Renovación deslizante con tope absoluto. Valores iniciales: 30 días de inactividad y 90 días de tope | Compatible con partidas por turnos de varios días. Valores revisables |
| 5.7 | Identificador nuevo en cada inicio de sesión; el cierre de sesión invalida la sesión en el servidor | Evita la fijación de sesión |
| 5.8 | Al revocar o caducar una sesión se cierran sus conexiones WebSocket; las conexiones largas revalidan la sesión de forma periódica | Sin esto una conexión abierta sobreviviría a la revocación |
| 5.9 | Contraseñas con Argon2id, usando el soporte incorporado de Node.js si está estable en la versión elegida | Evita una dependencia nativa. Hay que confirmar su estado en Node.js 26. **Confirmado el 2026-11-16:** está estable y se usa (ADR-012, decisión S15) |

**Quedan fuera de este ADR:**
- Alcance de la cookie. Como el frontend se renderiza en el navegador (ADR-006), su servidor no necesita recibirla. La propuesta era ligarla únicamente al host de la API, que es el alcance más restringido. **Confirmada el 2026-11-16** (ADR-012, decisión S13).
- Implementar la gestión de sesiones dentro del módulo `auth` o apoyarse en una librería. Se decide al iniciar el Hito 1; la opción preferente es la implementación propia, dado que el alcance es una tabla y una cookie. **Decidido el 2026-11-16:** implementación propia (ADR-012, decisión S12).
- Verificación de email, recuperación de contraseña y acceso con cuentas externas: ver ADR-008.
- Límites de frecuencia en inicio de sesión y registro: se definen en el contrato de la API.

## 6. Cambios que implica en los contratos

| Documento | Cambio |
|---|---|
| `contracts/01-rest-api.md` | Retirar `POST /auth/refresh`. Documentar la política de cookie, CORS y CSRF |
| `contracts/02-realtime.md` | Retirar el mensaje `AUTHENTICATE`; el rechazo ocurre en el handshake. Añadir un código de cierre para sesión caducada o revocada |
| `docs/03-dominio-datos.md` | Añadir una tabla de sesiones de autenticación |
| `docs/01-vision-alcance.md` | Reflejar que la PWA instalable forma parte del MVP (ADR-008) |

## 7. Referencias

- `docs/auditoria/comparacion-autenticacion.md`, con las fuentes consultadas el 2026-11-14.
- `contracts/01-rest-api.md` § Seguridad.
- `contracts/02-realtime.md` § Seguridad y § Semántica a fijar.
- Protección CSRF de NestJS: https://docs.nestjs.com/security/csrf
- Gateways de NestJS: https://docs.nestjs.com/websockets/gateways
