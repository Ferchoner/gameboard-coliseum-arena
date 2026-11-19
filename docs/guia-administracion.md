# Guía de administración

La administración del MVP se hace solo por la API, sin páginas (ADR-008, punto 15; [ADR-017](adr/0017-decisiones-del-hito-6.md), U2). Esta guía explica cómo dar el rol de administrador y cómo usar cada operación con `curl`. El contrato completo de cada operación está en [`contracts/01-rest-api.yaml`](../contracts/01-rest-api.yaml), con la etiqueta "Administración".

Los ejemplos usan el entorno local en HTTP (`pnpm dev`): la API en `http://localhost:3000` y el frontend en `http://localhost:3001`. En HTTPS (`pnpm dev:https`) las direcciones son `https://localhost:3443` y `https://localhost:3444`. Si el certificado lo creó `openssl` y no `mkcert`, `curl` necesita además la opción `-k`.

---

## 1. Dar o quitar el rol de administrador

El rol no se concede por la API (API, decisión A5). Se concede con una orden de consola que cambia la base de datos (ADR-017, U3):

```sh
pnpm build                          # la orden usa el backend compilado
pnpm admin:role <usuario> ADMIN     # concede el rol
pnpm admin:role <usuario> USER      # lo retira
```

- La cuenta tiene que existir: se crea antes desde la página de registro.
- Usa la base de datos de `DATABASE_URL`, tomada de `apps/backend/.env` o del entorno. Si no hay ninguna, usa la de `pnpm dev`.
- No hace falta parar el servidor: el rol se lee en cada petición, así que vale desde la siguiente. Quitarlo también surte efecto en la siguiente petición.
- Si la cuenta ya tenía ese rol, no cambia nada y lo dice.

## 2. Iniciar sesión con `curl`

La API identifica a quien llama por la cookie de sesión, como en el navegador (ADR-004). `curl` la guarda en un archivo con `-c` y la envía con `-b`.

La cabecera `Origin` no hace falta: la protección contra peticiones falsificadas rechaza las que un navegador envía desde otro origen, y `curl` no es un navegador. Los ejemplos la envían igual, con el origen del frontend, para que las peticiones sean como las de la aplicación. Si se envía otra, la respuesta es `403 ORIGIN_NOT_ALLOWED`.

Para no repetir las opciones, conviene definir una función en la terminal:

```sh
API=http://localhost:3000/api/v1
ORIGIN=http://localhost:3001

api() {
  curl -sS -b sesion.txt -c sesion.txt -H "Origin: $ORIGIN" -H 'Content-Type: application/json' "$@"
}

# Inicia sesión y guarda la cookie en sesion.txt.
api -X POST "$API/auth/login" -d '{"username":"admin","password":"tu-contraseña"}'
```

La respuesta es la cuenta, con `"role":"ADMIN"`. Al terminar se cierra la sesión y se borra el archivo, que da acceso a la cuenta mientras la sesión dure:

```sh
api -X POST "$API/auth/logout"
rm sesion.txt
```

### En Windows, con PowerShell

Las órdenes de arriba son de una terminal de Linux o macOS (bash o zsh). En PowerShell no funcionan tal cual: `API=...` no define una variable, y `api() { ... }` no define una función. Lo equivalente en PowerShell, sin `curl`:

```powershell
$API = 'http://localhost:3000/api/v1'
$ORIGIN = 'http://localhost:3001'
$sesion = New-Object Microsoft.PowerShell.Commands.WebRequestSession

function api($Method, $Path, $Body) {
  $params = @{
    Method      = $Method
    Uri         = "$API/$Path"
    WebSession  = $sesion
    Headers     = @{ Origin = $ORIGIN }
    ContentType = 'application/json'
  }
  if ($Body) { $params.Body = ConvertTo-Json $Body -Compress }
  Invoke-RestMethod @params
}

# Inicia sesión. La cookie queda en $sesion mientras la ventana siga abierta.
api POST auth/login @{ username = 'admin'; password = 'tu-contraseña' }
```

- Cada orden lleva el método, la ruta sin `$API` y, si hace falta, el cuerpo como tabla de PowerShell: `api PUT admin/games/naval-battle/status @{ status = 'ACTIVE' }`.
- Para ver una respuesta completa, se añade `| ConvertTo-Json -Depth 10` al final.
- Una respuesta de error, como `409`, aparece como un error en rojo con el cuerpo de la respuesta, que dice el código.
- Al terminar, `api POST auth/logout`. No hay archivo que borrar: la cookie desaparece al cerrar la ventana.

El resto de la guía muestra las órdenes en bash. En PowerShell se escriben con esta función, como en los ejemplos de [el orden para activar un juego](#en-qué-orden-activar-un-juego-o-una-versión-nuevos).

Sin sesión, cualquier operación responde `401 UNAUTHENTICATED`. Con una sesión que no es de administrador, `403 FORBIDDEN`.

## 3. Cuentas

### Buscar cuentas

```sh
api "$API/admin/users"                         # todas, de la más reciente a la más antigua
api "$API/admin/users?username=ana"            # nombre de usuario que empieza por "ana"
api "$API/admin/users?email=ana@example.com"   # correo exacto
api "$API/admin/users?status=SUSPENDED"        # solo las suspendidas
api "$API/admin/users?limit=50"                # hasta 50 por página; por defecto, 20
```

Ni el nombre ni el correo distinguen mayúsculas (U17). Si hay más resultados, `nextCursor` trae el valor para pedir la página siguiente con `&cursor=<valor>`.

Cada cuenta lleva `userId`, que es el que piden las demás operaciones, y `playerId`, que es el que aparece en salas y partidas.

### Suspender y reactivar

```sh
api -X PUT "$API/admin/users/<userId>/status" -d '{"status":"SUSPENDED"}'
api -X PUT "$API/admin/users/<userId>/status" -d '{"status":"ACTIVE"}'
```

Al suspender, en el mismo momento (U4):

- Se cierran todas las sesiones de la cuenta y sus conexiones de tiempo real: su dueño sale de todas sus pestañas y, al intentar entrar, ve que la cuenta está suspendida.
- Sale de las salas en espera en las que estaba. Si era el anfitrión, la sala se cierra.
- Sus partidas en curso siguen sus reglas: en tiempo real empieza a correr su plazo de abandono, y por turnos, su reloj.
- Su perfil público y sus estadísticas dejan de mostrarse (U15). Su nombre sigue en las partidas pasadas.

Reactivar le devuelve el acceso. Las sesiones cerradas no vuelven: tiene que entrar de nuevo.

Nadie puede cambiar el estado de su propia cuenta (`409 CANNOT_CHANGE_OWN_STATUS`).

## 4. Salas y partidas

Los identificadores de salas y partidas se ven en la dirección de sus páginas: `/salas/<roomId>` y `/partidas/<matchId>`.

### Cerrar una sala

```sh
api -X POST "$API/admin/rooms/<roomId>/close"
```

Responde `204` sin cuerpo. Quien está en la sala ve que la cerró un administrador. Si tenía una partida en curso, se anula en el mismo momento. Si ya estaba cerrada, no cambia nada.

### Anular una partida

```sh
api -X POST "$API/admin/matches/<matchId>/abort"
```

Responde `204` sin cuerpo. Los jugadores ven que un administrador anuló la partida y que no cuenta para nadie: no tiene resultado y no suma en las estadísticas. La sala vuelve a la espera, o se cierra si es una sala por turnos sin revancha, igual que al terminar. Una partida ya anulada no cambia; una terminada no se puede anular (`409 MATCH_NOT_IN_PROGRESS`).

## 5. Catálogo de juegos

Un juego o una versión nuevos llegan con su motor, en una migración, y quedan **inactivos** (decisión del 2026-11-16, en [`planning/decisiones-y-pendientes.md`](../planning/decisiones-y-pendientes.md)). Se activan desde aquí, sin tocar la base de datos, después de desplegar el frontend que sabe mostrarlos (ver [el orden](#en-qué-orden-activar-un-juego-o-una-versión-nuevos) más abajo). Cómo se añade uno está en la [guía para añadir un juego](guia-nuevo-juego.md).

### Ver el catálogo completo

```sh
api "$API/admin/games"
```

Lista todos los juegos, activos o no, por su nombre corto, con sus versiones de la más nueva a la más antigua. Cada versión dice si está activa, si es la vigente y si el servidor tiene su motor (`engineRegistered`).

### Activar o desactivar un juego

```sh
api -X PUT "$API/admin/games/four-in-a-row/status" -d '{"status":"INACTIVE"}'
api -X PUT "$API/admin/games/four-in-a-row/status" -d '{"status":"ACTIVE"}'
```

Al desactivarlo (U5):

- Desaparece del catálogo y no se pueden crear salas suyas.
- Sus salas en espera se cierran en el mismo momento, y quien está en ellas ve que las cerró un administrador.
- Las salas con una partida en curso la terminan con normalidad y se cierran al acabar.

Un juego activo solo aparece en el catálogo si tiene una versión vigente activa con motor (U16).

### Activar o desactivar una versión

```sh
api -X PUT "$API/admin/games/<gameSlug>/versions/<version>/status" -d '{"status":"ACTIVE"}'
```

- No se puede activar una versión cuyo motor no está en el servidor (`409 ENGINE_NOT_REGISTERED`).
- No se puede desactivar la vigente (`409 GAME_VERSION_IS_CURRENT`): antes hay que elegir otra.

### Elegir la versión vigente

```sh
api -X PUT "$API/admin/games/<gameSlug>/current-version" -d '{"gameVersion":"<version>"}'
```

- Tiene que estar activa (`409 GAME_VERSION_NOT_ACTIVE`).
- Las partidas nuevas usan la vigente. Las que están en curso siguen con la suya hasta el final.
- Las salas en espera cuyas opciones (modalidad, tiempo, jugadores o configuración) no admite la versión nueva se cierran en el mismo momento (U5).

Para pasar a una versión nueva: activarla, hacerla vigente y, si se quiere, desactivar la anterior.

### En qué orden activar un juego o una versión nuevos

La aplicación solo ofrece los juegos que sabe mostrar, y elige el tablero por juego y versión mayor (ADR-018, decisiones Z5 y Z6). Para que nadie cree una sala que no se pueda jugar:

1. Desplegar el backend con el motor y la migración que da de alta el juego o la versión, inactivos.
2. Desplegar el frontend que sabe mostrarlo. Como se alojan por separado, puede ir antes o después del backend, pero siempre antes de activar.
3. Comprobar con `GET /admin/games` que el juego y la versión existen, inactivos, y que la versión tiene su motor (`engineRegistered` a `true`). Mientras el juego está inactivo no sale en la aplicación, así que todavía no se puede ver su tablero; eso ya lo comprobó la prueba en navegador del juego, que lo activa en su propia base de datos. *Corregido el 2026-11-19: este paso pedía ver el juego en el frontend antes de activarlo, lo que no es posible.*
4. Activar la versión y hacerla vigente. Si es un juego nuevo, activar después el juego. *Precisado el 2026-11-19 (ADR-019): un juego nuevo también tiene que hacer vigente su versión, porque entra sin versión vigente.*
5. Recargar la aplicación en el navegador: el juego aparece en la portada y en el formulario de crear sala. Crear una sala con él para comprobarlo.

Por ejemplo, para Batalla naval. En bash:

```sh
api "$API/admin/games"
api -X PUT "$API/admin/games/naval-battle/versions/1.0.0/status" -d '{"status":"ACTIVE"}'
api -X PUT "$API/admin/games/naval-battle/current-version" -d '{"gameVersion":"1.0.0"}'
api -X PUT "$API/admin/games/naval-battle/status" -d '{"status":"ACTIVE"}'
```

En PowerShell, con la función de la [sección 2](#en-windows-con-powershell):

```powershell
api GET admin/games | ConvertTo-Json -Depth 10
api PUT admin/games/naval-battle/versions/1.0.0/status @{ status = 'ACTIVE' }
api PUT admin/games/naval-battle/current-version @{ gameVersion = '1.0.0' }
api PUT admin/games/naval-battle/status @{ status = 'ACTIVE' }
```

### Si un juego no aparece

Un juego sale en la aplicación solo si se cumplen las cuatro condiciones de esta tabla (U16; ADR-018, Z5). Se revisan en orden:

| Qué mirar | Cómo se ve | Qué hacer |
| --- | --- | --- |
| El juego existe en la base de datos | En `GET /admin/games` no está, o activarlo responde `404` | Aplicar las migraciones. En local, parar `pnpm dev` y volver a arrancarlo después de bajar los cambios: al arrancar construye y aplica las migraciones pendientes. Si no se usa `pnpm dev`, `pnpm build` y después `pnpm db:migrate` |
| El servidor tiene su motor | `engineRegistered` es `false`, o activar la versión responde `409 ENGINE_NOT_REGISTERED` | Construir el backend con el código nuevo y reiniciarlo, igual que en la fila anterior |
| La versión está activa y es la vigente, y el juego está activo | En `GET /admin/games`, el juego o la versión siguen `INACTIVE`, o ninguna versión es la vigente | Seguir los pasos 4 y 5 del orden de arriba, en ese orden |
| El frontend sabe mostrarlo | La API lo lista en `GET /games`, pero la aplicación no lo ofrece, y la página de salas avisa de que hay un juego nuevo que esta versión aún no sabe mostrar | Recargar la página. Si sigue igual, construir y reiniciar el frontend con el código nuevo |

Quien tenga abierta una versión anterior de la aplicación ve un aviso que le pide recargar, y no puede entrar en salas de ese juego hasta hacerlo.

Para retirar un juego o volver a una versión anterior, el orden es el contrario: primero desactivar o elegir otra versión vigente, y después desplegar el frontend sin su tablero.

## 6. Registro de las acciones

Cada acción deja una línea en el registro de actividad del servidor que empieza por `Administración:`, con quién la hizo, qué hizo y sobre qué (U11). No se guardan en la base de datos: si se guardan y cuánto tiempo se decide en el Hito 7.

## 7. El correo simulado

En local no se envía correo de verdad (U6). Cada correo, como el enlace para recuperar la contraseña, se guarda como un archivo de texto en `apps/backend/var/mail/`, y el registro del servidor dice a quién iba y dónde quedó. La carpeta se puede cambiar con `MAIL_OUTBOX_DIR`. El servidor no arranca en producción con el correo simulado (U18).

## 8. Errores frecuentes

| Respuesta | Qué pasa |
|---|---|
| `401 UNAUTHENTICATED` | No hay sesión: falta `-b sesion.txt`, la sesión caducó o se inició en otra dirección (`localhost` y `127.0.0.1` son sitios distintos) |
| `403 FORBIDDEN` | La cuenta no tiene el rol de administrador. Ver el apartado 1 |
| `403 ORIGIN_NOT_ALLOWED` | La cabecera `Origin` no es la del frontend: en HTTPS es `https://localhost:3444` |
| `404 USER_NOT_FOUND`, `ROOM_NOT_FOUND`, `MATCH_NOT_FOUND`, `GAME_NOT_FOUND`, `GAME_VERSION_NOT_FOUND` | El identificador, el nombre corto o la versión no existen |
| `400 VALIDATION_ERROR` | El cuerpo o los parámetros no tienen la forma del contrato. `details.fields` dice cuáles |
