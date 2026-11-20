# Guía del despliegue local

Cómo probar la plataforma en tu equipo como si estuviera publicada: con un dominio propio en lugar de `localhost` y, si quieres, con personas que entran desde otras redes. Las decisiones están en [ADR-021](adr/0021-despliegue-local-con-dominio.md). Todo es gratis.

Las órdenes son de **PowerShell** en Windows. En Linux y macOS funcionan las mismas órdenes de `pnpm`; lo que cambia es cómo se edita el archivo `hosts` (`/etc/hosts`, con `sudo`).

Antes, lo de siempre (ver el [README](../README.md#cómo-ejecutarlo-en-local)):

```powershell
pnpm install
pnpm db:up
```

---

## 1. Qué orden usar

| Quiero | Orden | Dirección |
|---|---|---|
| Programar, con recarga al guardar | `pnpm dev` o `pnpm dev:https` | `http://localhost:3001` o `https://localhost:3444` |
| Lo mismo, con dominio | `pnpm dev:https --dominio` | `https://app.boardgame-coliseum.test:3444` |
| Probar lo que se publicaría | `pnpm local --https --dominio` | `https://app.boardgame-coliseum.test:3444` |
| Que entren personas desde otras redes | `pnpm local` con un túnel (sección 3) | `https://boardgame-coliseum.<tu-red>.ts.net` |

`pnpm local` construye todo, aplica las migraciones y arranca la API compilada y el frontend como archivos estáticos, sin los servidores de desarrollo. Tarda más en arrancar y no se recarga al guardar. Sin opciones usa `localhost` por HTTP; `--https` y `--dominio` funcionan como en `pnpm dev`.

Ctrl+C lo detiene todo.

---

## 2. El dominio `boardgame-coliseum.test` en tu equipo

El frontend queda en `app.boardgame-coliseum.test` y la API en `api.boardgame-coliseum.test`. Son dos nombres del mismo sitio, como `app.` y `api.` de un dominio real, así que la cookie de sesión se comporta igual que en producción. `.test` está reservado para pruebas: nunca será un dominio de verdad.

Solo funciona en el equipo donde hagas estos pasos.

### 2.1. Apuntar los nombres a tu equipo (una vez)

Abre PowerShell **como administrador** (clic derecho en PowerShell, "Ejecutar como administrador") y ejecuta:

```powershell
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
Add-Content -Path $hosts -Value "`r`n127.0.0.1 app.boardgame-coliseum.test api.boardgame-coliseum.test`r`n::1 app.boardgame-coliseum.test api.boardgame-coliseum.test"
ipconfig /flushdns
```

Van las dos líneas, IPv4 e IPv6, porque Windows puede responder primero con `::1` por `localhost`.

Para comprobarlo, en una ventana normal:

```powershell
Get-Content "$env:SystemRoot\System32\drivers\etc\hosts" | Select-String boardgame-coliseum
```

Si el antivirus avisa de un cambio en `hosts`, es por esto: permítelo.

### 2.2. Certificado para los nombres (una vez)

Con [mkcert](https://github.com/FiloSottile/mkcert) el navegador confía en el certificado y no hay avisos:

```powershell
winget install FiloSottile.mkcert
mkcert -install
pnpm dev:cert --dominio --force
```

Cierra y vuelve a abrir PowerShell después de instalar mkcert, para que encuentre la orden. `--force` sustituye el certificado que tuvieras, que solo valía para `localhost`; el nuevo vale para los dos.

Sin mkcert, `pnpm dev:cert --dominio --force` lo crea con openssl, y hay que aceptar el aviso del navegador una vez en `https://api.boardgame-coliseum.test:3443/health` y otra en `https://app.boardgame-coliseum.test:3444`.

Si el certificado no vale para los nombres, `pnpm dev:https --dominio` y `pnpm local --https --dominio` se detienen y dicen cómo crearlo de nuevo.

### 2.3. Arrancar

```powershell
pnpm local --https --dominio     # lo que se publicaría
pnpm dev:https --dominio         # para programar
```

Abre `https://app.boardgame-coliseum.test:3444`.

### 2.4. Quitarlo

Borra las dos líneas de `boardgame-coliseum` del archivo `hosts` (PowerShell como administrador):

```powershell
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
(Get-Content $hosts) | Where-Object { $_ -notmatch 'boardgame-coliseum\.test' } | Set-Content $hosts
ipconfig /flushdns
```

---

## 3. Personas desde otras redes, con Tailscale Funnel

[Tailscale Funnel](https://tailscale.com/kb/1223/funnel) publica la aplicación en internet desde tu equipo, con un nombre `boardgame-coliseum.<tu-red>.ts.net` y un certificado válido. Quien prueba no instala nada: abre el enlace. No hay que abrir puertos en el router, y funciona aunque tu proveedor comparta tu dirección pública con otros clientes.

| Público | En tu equipo |
|---|---|
| `https://boardgame-coliseum.<tu-red>.ts.net` | El frontend, en `http://127.0.0.1:3001` |
| `https://boardgame-coliseum.<tu-red>.ts.net:8443` | La API, en `http://127.0.0.1:3000` |

**Antes de empezar, ten en cuenta:**

- Mientras el túnel esté encendido, **cualquiera con el enlace puede entrar y registrarse**. Enciéndelo solo mientras pruebas y apágalo al terminar (sección 3.4).
- Tu equipo tiene que estar encendido, sin suspenderse, y con la base de datos en marcha.
- El correo sigue simulado. Si alguien olvida su contraseña, el enlace queda en `apps/backend/var/mail/` y tienes que pasárselo tú.
- Tailscale tiene un límite de ancho de banda que no publica. Para unas pocas personas jugando no debería notarse.

### 3.1. Instalar y preparar Tailscale (una vez)

```powershell
winget install tailscale.tailscale
```

Abre Tailscale desde el menú de inicio e inicia sesión. El plan Personal es gratis.

Después, en PowerShell:

```powershell
tailscale set --hostname=boardgame-coliseum
```

Así tu equipo se llama `boardgame-coliseum` dentro de Tailscale y la dirección empieza por ese nombre. En la [lista de equipos](https://login.tailscale.com/admin/machines) comprueba que el nombre quedó cambiado; si no, usa "Edit machine name" y desmarca "Auto-generate from OS hostname".

Activa los certificados en la [página de DNS](https://login.tailscale.com/admin/dns): si MagicDNS no está activado, actívalo, y en "HTTPS Certificates" elige "Enable HTTPS". Tailscale avisa de que los nombres de los equipos quedan en un registro público de certificados: por eso conviene haber cambiado antes el nombre a `boardgame-coliseum`.

### 3.2. Arrancar la aplicación con la dirección pública

En una ventana de PowerShell, desde la carpeta del repositorio:

```powershell
$nombre = (tailscale status --json | ConvertFrom-Json).Self.DNSName.TrimEnd('.')
$env:LOCAL_FRONTEND_ORIGIN = "https://$nombre"
$env:LOCAL_API_ORIGIN = "https://${nombre}:8443"
pnpm local
```

`pnpm local` construye el frontend apuntando a la API pública y arranca los dos servidores por HTTP en `127.0.0.1`. El HTTPS lo pone Tailscale. Las variables solo valen en esa ventana.

### 3.3. Encender el túnel

En **otra** ventana de PowerShell:

```powershell
tailscale funnel --bg --https=443 http://127.0.0.1:3001
tailscale funnel --bg --https=8443 http://127.0.0.1:3000
tailscale funnel status
```

`tailscale funnel status` muestra las dos direcciones públicas. Comparte la primera, `https://boardgame-coliseum.<tu-red>.ts.net`. La primera vez puede tardar uno o dos minutos en responder, mientras Tailscale obtiene el certificado.

Para comprobarlo desde fuera, abre la dirección en el teléfono con los datos móviles, sin el wifi de casa.

### 3.4. Apagarlo al terminar

```powershell
tailscale funnel reset
```

Y Ctrl+C en la ventana de `pnpm local`. Con `--bg`, el túnel sigue encendido aunque cierres la ventana o reinicies el equipo, hasta que lo apagues con `reset`.

### 3.5. Si algo falla

| Síntoma | Qué mirar |
|---|---|
| La página no carga | `tailscale funnel status` debe mostrar las dos direcciones, y `pnpm local` debe estar en marcha |
| La página carga pero no se puede entrar ni registrarse | Las dos variables deben coincidir exactamente con las direcciones de `tailscale funnel status`, sin barra al final. Vuelve a arrancar `pnpm local` en la misma ventana donde las definiste |
| Se entra, pero las salas no se actualizan solas | Es el canal de tiempo real (WebSocket). Avísanos: es lo único que no se ha podido probar con Tailscale de verdad |
| `pnpm local` dice que el origen no es válido | Tiene que empezar por `https://` y no llevar ruta |

---

## 4. Dar el rol de administrador

Igual que siempre, con la aplicación construida (`pnpm local` ya construye):

```powershell
pnpm admin:role <usuario> ADMIN
```

Los detalles están en la [guía de administración](guia-administracion.md).

## 5. Volver a las pruebas en navegador

El frontend construido lleva dentro la dirección de la API. Después de usar `pnpm local` con un dominio o un túnel, vuelve a construir antes de las pruebas:

```powershell
pnpm build
pnpm test:e2e
```
