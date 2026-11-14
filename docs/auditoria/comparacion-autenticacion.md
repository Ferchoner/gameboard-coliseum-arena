# D4. Autenticación: comparación actualizada

> **Documento histórico de análisis.** Se conserva como registro del razonamiento previo a la decisión. No se mantiene al día. La decisión vigente está en [ADR-004](../adr/0004-autenticacion-sesion-cookie.md).

**Paso 4 del plan de cierre.** Depende de D1 (NestJS) y D3 (WebSocket nativo), ambas aprobadas.
**Estado:** decidido el 2026-11-14 a favor de la sesión de servidor con cookie, con frontend y API en subdominios de un mismo dominio. Lo que sigue es el análisis previo a la decisión, incluidas las adendas que lo corrigieron.
**Datos verificados el 2026-11-14** en la documentación oficial de NestJS y de Node.js (fuentes al final).

**Alcance de esta decisión.** Aquí se elige el mecanismo de sesión para REST y WebSocket. La verificación de email, la recuperación de contraseña y el acceso con cuentas externas son cuestiones de alcance y se deciden en el Paso 6.

---

## 1. Qué condiciona la decisión

| Condición | Origen |
|---|---|
| Clientes solo en navegador; sin aplicaciones nativas en el horizonte inmediato | `docs/01` § No objetivos |
| REST y WebSocket en el mismo backend | ADR-001, ADR-003 |
| La identidad nunca se toma de un `playerId` enviado por el cliente | `docs/02`; `contracts/02` § Seguridad |
| El WebSocket se autentica en el handshake | ADR-003, condición 5.4 |
| No exponer refresh tokens en JSON; evaluar cookies HttpOnly y CSRF | `contracts/01` § Seguridad |
| Modalidad por turnos con un tiempo total por jugador de 12, 24 o 36 horas (tentativo): la sesión debe durar días | Requisito del 2026-11-14 |
| Suspender una cuenta debe tener efecto inmediato | `docs/03` (`users.status`); módulo `admin` |

## 2. Datos verificados que afectan al análisis

1. **NestJS trae protección CSRF propia desde la versión 12.1.** No usa tokens: comprueba las cabeceras `Sec-Fetch-Site` y `Origin` que envía el navegador. No requiere paquetes adicionales ni cambios en el cliente.
2. **Esa protección no cubre el WebSocket.** Nunca comprueba las peticiones `GET`, y el handshake de un WebSocket es una petición `GET`. La validación del origen en el handshake hay que hacerla de forma explícita.
3. **NestJS 12.1 también incorpora cabeceras de seguridad** sin paquetes adicionales.
4. **Node.js incluye Argon2 en su módulo de criptografía** desde la versión 24.7. En la documentación de la 24 figuraba como candidato a estable; hay que confirmar su estado en Node.js 26 antes de fijar la política de contraseñas.
5. **La API WebSocket de los navegadores no permite enviar cabeceras de autorización.** Con tokens, la credencial tendría que viajar en la URL o en un primer mensaje, después de abrir la conexión.

## 3. Opciones

### Opción A. Sesión de servidor con identificador opaco en cookie

La sesión se guarda en PostgreSQL. El navegador recibe solo un identificador aleatorio en una cookie HttpOnly, Secure y SameSite.

| Ventajas | Desventajas |
|---|---|
| El navegador envía la cookie en el handshake del WebSocket: la conexión se autentica antes de abrirse, sin token en la URL ni mensaje adicional | Requiere protección CSRF en REST y validación explícita del origen en el handshake WebSocket |
| Revocación inmediata al cerrar sesión o suspender una cuenta, incluido el cierre de sus conexiones abiertas | Frontend y API deben servirse bajo el mismo sitio |
| Ninguna credencial accesible desde JavaScript | Una consulta de sesión por petición, despreciable a esta escala |
| Sesiones largas con renovación deslizante, sin ciclo de refresco. Encaja con partidas por turnos que duran días | Menos cómodo si más adelante hubiera clientes nativos o de terceros |
| La protección CSRF de NestJS cubre REST sin dependencias nuevas | |
| `/auth/refresh` desaparece y se cierra el hallazgo C-03 | |

### Opción B. JWT de acceso de vida corta más refresh token rotatorio en cookie

| Ventajas | Desventajas |
|---|---|
| Verificación sin consultar la base de datos | La revocación exige listas de bloqueo o vidas muy cortas |
| Estándar y cómodo para clientes nativos o varios servicios | La rotación con detección de reutilización obliga a guardar estado igualmente |
| | El token de acceso tendría que viajar en la URL del WebSocket, donde queda en registros, o en un primer mensaje, lo que choca con autenticar en el handshake |
| | El token puede caducar durante una conexión larga y hay que renovarlo dentro de ella |
| | Para sesiones de días hacen falta refresh tokens de larga duración, que son sesiones de servidor con otro nombre |

### Opción C. Identidad delegada en un proveedor externo

| Ventajas | Desventajas |
|---|---|
| Sin almacenamiento de contraseñas | Dependencia externa y posible coste |
| Acceso con cuentas existentes y MFA | Sigue haciendo falta una sesión local y resolver el WebSocket, es decir, la opción A o la B |
| | El modelo de datos actual asume `password_hash` |
| | Excesivo para el MVP |

## 4. Recomendación

**[RECOMENDACIÓN] Opción A, sesión de servidor con cookie.**

1. **Resuelve el WebSocket de la forma que pide el ADR-003.** La cookie viaja en el handshake y la conexión se rechaza antes de abrirse si no es válida.
2. **Revocación inmediata**, necesaria para la suspensión de cuentas.
3. **Encaja con la modalidad de plazos largos.** Una sesión de semanas con renovación deslizante es directa. Con la opción B habría que construir lo mismo sobre refresh tokens.
4. **Menos piezas y menos dependencias.** NestJS 12 ya cubre CSRF en REST y las cabeceras de seguridad.
5. **No cierra puertas.** La opción C puede añadirse después como método de acceso adicional, y unos tokens para otros clientes también, sin retirar las sesiones.

**Condiciones que propongo dejar en el ADR-004:**

| # | Condición | Motivo |
|---|---|---|
| 1 | Identificador de sesión aleatorio de alta entropía; en la base de datos se guarda solo su hash | Una fuga de la tabla no permite suplantar sesiones |
| 2 | Cookie HttpOnly, Secure, SameSite=Lax y ligada al host | Reduce la exposición a XSS y a peticiones entre sitios |
| 3 | Protección CSRF de NestJS activada para REST | Sin dependencias nuevas |
| 4 | Validación explícita de `Origin` en el handshake WebSocket | La protección CSRF de NestJS no cubre el handshake |
| 5 | Renovación deslizante con un tope absoluto. Valores iniciales propuestos: 30 días de inactividad y 90 días de tope | Compatible con partidas por turnos que duran días. Los valores son revisables |
| 6 | Identificador nuevo en cada inicio de sesión; el cierre de sesión invalida la sesión en el servidor | Evita la fijación de sesión |
| 7 | Al revocar o caducar una sesión se cierran sus conexiones WebSocket; las conexiones largas revalidan la sesión de forma periódica | Sin esto una conexión abierta sobreviviría a la revocación |
| 8 | Contraseñas con Argon2id, usando el soporte incorporado de Node.js si está estable en la versión elegida | Evita una dependencia nativa |
| 9 | Frontend y API bajo el mismo origen mediante un proxy inverso | Elimina CORS y simplifica las cookies. Se concreta en el Paso 5 |

**Queda como subdecisión abierta:** implementar la gestión de sesiones dentro del módulo `auth` o apoyarse en una librería. El alcance es pequeño (una tabla y una cookie), así que me inclino por lo primero, pero prefiero decidirlo al redactar el ADR con las opciones verificadas.

**Consecuencias sobre los contratos si la apruebas.** No las aplico sin tu autorización y se harían en el Paso 10:
- `POST /auth/refresh` desaparecería de `contracts/01`.
- Se añadiría una tabla de sesiones de autenticación a `docs/03`.
- El mensaje `AUTHENTICATE` de `contracts/02` dejaría de ser necesario; el rechazo ocurriría en el handshake.
- Haría falta un código de cierre para sesión caducada o revocada.

**Dónde es más débil esta recomendación.** Si prevés clientes nativos o de terceros a corto plazo, la opción B evita añadir tokens más adelante. No veo ese escenario en la documentación actual.

**Coste de reversión:** medio. Añadir tokens después es posible sin retirar las sesiones.

## 5. Fuentes

- Protección CSRF de NestJS: https://docs.nestjs.com/security/csrf
- Cabeceras de seguridad de NestJS 12.1: https://safeguard.sh/resources/blog/nestjs-usesecurityheaders-vs-helmet
- Novedades de NestJS 12: https://infoq.com/news/2026/10/nestjs-12-observability
- Gateways de NestJS, autenticación en el handshake: https://docs.nestjs.com/websockets/gateways
- Documentación de `crypto` de Node.js 24.8: https://r2.nodejs.org/docs/v24.8.0/api/crypto.json

---

## 6. Adenda del 2026-11-14: frontend y backend alojados por separado

Después de preparar esta comparación indicaste que el backend y el frontend no estarán alojados juntos. **Esto sí afecta a la decisión**, y sustituye la condición 9 de la sección 4 (mismo origen mediante proxy inverso), que ya no aplica.

### Lo que importa no es el alojamiento, sino el dominio

Para las cookies, el navegador no mira dónde está alojado cada servicio. Mira si las dos direcciones pertenecen al **mismo dominio registrable**.

| Escenario | Ejemplo | ¿Funciona la sesión con cookie? |
|---|---|---|
| **1. Alojamientos distintos, subdominios de un mismo dominio propio** | `app.tudominio.com` y `api.tudominio.com` | **Sí.** El navegador los trata como el mismo sitio y envía la cookie tanto en las peticiones REST como en el handshake del WebSocket |
| **2. Alojamientos distintos, dominios no relacionados** | Las direcciones gratuitas que da cada proveedor de hosting | **No de forma fiable.** La cookie pasa a ser de terceros. Safari y Firefox las bloquean o las aíslan, y Chrome las bloquea en modo incógnito |

Detalle importante del escenario 2: las direcciones gratuitas de los proveedores de hosting se consideran sitios distintos aunque compartan terminación, y un refresh token guardado en cookie sufre el mismo bloqueo. Es decir, la opción B tal como estaba descrita tampoco funcionaría ahí sin cambios.

### Opciones revisadas

**Opción A1. Sesión con cookie, con frontend y API en subdominios de un mismo dominio propio.**
Mantiene todas las ventajas de la opción A. Ajustes necesarios respecto a lo propuesto:
- CORS configurado en la API para el origen exacto del frontend, con credenciales permitidas.
- El origen del frontend declarado como origen de confianza en la protección CSRF de NestJS, porque las peticiones dejan de ser del mismo origen.
- Lista explícita de orígenes permitidos en el handshake del WebSocket.
- Requisito de despliegue: un dominio propio y un subdominio para cada servicio. Cualquier proveedor de hosting admite dominios personalizados.

**Opción B1. Tokens, válida también con dominios no relacionados.**
- Token de acceso de vida corta enviado en cabecera.
- El refresh token no puede ir en cookie en ese escenario, así que tendría que guardarse en el almacenamiento del navegador, accesible desde JavaScript. Es el punto más débil: un fallo de XSS permitiría robarlo.
- El WebSocket se autenticaría con un ticket de un solo uso y vida de segundos, pedido por REST justo antes de conectar y enviado en la URL del handshake. Así se sigue autenticando en el handshake sin exponer una credencial duradera.
- La revocación inmediata exige comprobar el estado de la sesión en el servidor, con lo que se pierde la principal ventaja de los tokens.

**Opción C1. Aprobar ahora solo el modelo de sesión y decidir el transporte de la credencial en el Paso 5.**
Se aprueba que la sesión se guarda en el servidor, es revocable y se identifica con un valor opaco. Si ese valor viaja en cookie o en cabecera se decide cuando se fijen los dominios. Deja abierta parte del diseño del WebSocket.

### Recomendación revisada

**[RECOMENDACIÓN] Opción A1.** Usar un dominio propio con un subdominio para el frontend y otro para la API conserva la opción más simple y segura, y no limita dónde se aloja cada servicio. Su coste es registrar un dominio y añadir tres ajustes de configuración.

Si no vas a poder usar un dominio común, la recomendación pasa a ser la B1, sabiendo que es más compleja y algo menos segura en el navegador.

**No cierra puertas.** Como en A1 la sesión es un valor opaco guardado en el servidor, más adelante ese mismo valor podría aceptarse también en una cabecera para clientes que no sean navegadores, junto con el ticket de WebSocket descrito en B1.

### Cuestión derivada para el Paso 5

Si Nuxt renderiza en el servidor páginas que requieren sesión, el servidor de Nuxt necesitaría recibir la cookie, lo que obliga a compartirla entre subdominios en lugar de ligarla al host de la API. Si las zonas autenticadas se renderizan solo en el navegador, la cookie puede quedar ligada a la API. Lo dejo anotado para la decisión de despliegue.

---

## 7. Adenda del 2026-11-14: compatibilidad con PWA

Preguntaste si tener alojamientos distintos bajo un mismo dominio funcionaría con el frontend como PWA.

**Sí, funciona, y no afecta a la recomendación.** Una PWA pertenece al origen del frontend: su manifiesto y su service worker viven ahí. La API es un recurso externo al que la aplicación llama, igual que en una web normal. Que esté alojada en otro proveedor es indiferente.

| Aspecto | Efecto con frontend y API en subdominios de un mismo dominio |
|---|---|
| Instalación y manifiesto | Sin efecto. Dependen solo del frontend |
| Service worker | Sin efecto. Gestiona la caché del frontend; las peticiones a la API siguen enviando la cookie |
| Sesión con cookie | Funciona igual dentro de la aplicación instalada |
| WebSocket | Funciona igual. El service worker no intercepta conexiones WebSocket |
| Notificaciones push | Las emite el backend a través del servicio de push del navegador; el alojamiento separado no influye |

**Tres matices a tener presentes:**

1. **Safari puede limitar la cookie de sesión a 7 días.** Según las fuentes consultadas, Safari recorta a 7 días las cookies fijadas por un servidor cuya dirección IP no se parece a la del sitio principal, que es justo lo que ocurre con alojamientos distintos. El efecto práctico es pequeño: la sesión se renueva en cada visita, así que solo tendría que volver a iniciar sesión quien pase más de 7 días sin entrar desde Safari. Guardar tokens en el almacenamiento del navegador no lo evita, porque Safari aplica un límite similar. Conviene comprobarlo con una prueba real en el Paso 5.
2. **En iPhone la aplicación instalada tiene su almacenamiento separado de Safari.** Desde iOS 17.2 las cookies de inicio de sesión se copian al instalar. En versiones anteriores habría que iniciar sesión una vez dentro de la aplicación instalada. Esto ocurre igual con cookies y con tokens.
3. **Ser PWA no implica jugar sin conexión.** El modelo es server-authoritative, así que sin conexión solo puede mostrarse la interfaz ya cargada, no jugarse.

**Relación con la modalidad por turnos.** En iPhone las notificaciones push web solo funcionan con la aplicación instalada (desde iOS 16.4). Si el aviso de "te toca jugar" se hace por push, la PWA deja de ser opcional para esos usuarios. Queda para el Paso 6, junto con el efecto R-4 de la auditoría.

**Fuentes:**
- Límite de 7 días de Safari para respuestas desde otra IP: https://stape.io/blog/safari-itp-update-limits-cookies-to-7-days-for-responses-from-3rd-party-ips
- Compatibilidad de PWA en iOS: https://firt.dev/notes/pwa-ios/
