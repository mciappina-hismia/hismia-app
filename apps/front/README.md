# Autenticación frontend y onboarding de creación

A human administrator must enable email confirmation for email/password signup in Supabase Auth and allowlist the exact same-origin callback `https://<your-app-origin>/auth/confirm`. Configure only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as public browser settings in the private deployment environment. No provider setting is changed by this code.

The Next server uses `HISMIA_API_ORIGIN` (not `NEXT_PUBLIC_`) for **only** `/api/hismia/auth/me` and `/api/hismia/profiles/onboarding`; the browser calls those fixed same-origin paths. Set the variable to a canonical HTTPS origin without credentials, path, query or fragment. HTTP is accepted only for the exact loopback hosts `localhost`, `127.0.0.1`, and `[::1]` for local development; when unset it defaults to `http://127.0.0.1:3001`. Configure a trusted HTTPS API destination for deployments. No arbitrary proxy routes or permissive CORS are added. Never put secrets in the origin URL.

Signup requests confirmation for all three account types. A validated account-type preference in sessionStorage is an untrusted UI hint, not a role or persisted profile. An unexpected signup session is signed out locally and treated as a configuration failure: the provider must enforce email confirmation. The callback exchanges PKCE once in the same browser, then checks confirmed identity; an expired link or different browser requires sign-in. Browser SDK session persistence is not HttpOnly and its lifetime is provider-defined.

Recuperación de contraseña: `/auth/recover` solicita el email; el destino allowlistado debe ser `https://<your-app-origin>/auth/reset-password`. El módulo `src/lib/auth/recovery.ts` coordina un intercambio PKCE explícito y único por visita montada; captura código y, si existe, identificador de flujo antes de limpiar la URL. El append experimental del identificador está deshabilitado para preservar allowlists exactas; sin identificador, iniciar otro flujo PKCE puede reemplazar el verifier anterior. Sólo admite el formulario cuando el SDK devuelve una sesión con procedencia local `redirectType: recovery`, no por una sesión persistida cualquiera. Hay que abrir el enlace en el navegador que lo solicitó; almacenamiento perdido, callback fallido o recarga tras limpiar la URL requieren otro enlace. El cambio se valida en Supabase; después se cierra explícitamente la sesión local y se vuelve a login. Un fallo de cierre no se presenta como fallo del cambio ya realizado. No concede autorización clínica ni garantiza revocación global. Tests con SDK real y transporte sintético no prueban entrega de email ni configuración real del proveedor.

Onboarding first checks the confirmed user with Supabase Auth `getUser`, obtains an access token using `getSession` solely for transport, then checks the API's authoritative `/auth/me` before showing a form. The confirmed user, SDK session user and API subject must match; signout or a different signed-in account invalidates the form. Before each create request the client rechecks confirmed identity and the API subject and obtains a fresh transport token; a same-user token refresh leaves the draft intact. These UI checks do not replace server authorization or revoke an HTTP request already sent. Profile creation uses the shared Zod contract, but the API validates again and owns the subject. Repeating a create with the same account type can return the already persisted profile; this is **not** an edit. Type conflicts and unavailable services require resolution/retry, not a fabricated profile. There is no T5 read/edit UI, no seeded runtime identity, and no clinical authorization implied by confirmation or this form. Strict backend TLS connectivity and live integration remain unverified.

Diagnóstico de perfiles: los resultados internos distinguen validación, autenticación, conflicto, transporte, fallo transitorio, JSON malformado, contrato incompatible y error inesperado. La configuración ausente se presenta por separado antes de iniciar el flujo. La UI conserva mensajes seguros en español y no revela existencia de cuentas ni texto del proveedor; varios diagnósticos pueden compartir intencionalmente el mismo mensaje público. Sólo se conservan categorías y estados HTTP, nunca tokens, cuerpos, mensajes crudos ni logs nuevos. El contrato compartido sigue siendo la autoridad de validación; esta clasificación no añade reglas de dominio ni cambia el contrato HTTP.

Synthetic checks: from `apps/front`, run the installed `vitest run`, `tsc --noEmit --incremental false`, and `eslint src --max-warnings=0` binaries only after checking that no private environment file will be auto-loaded. Run `node --test apps/front/next.config.test.mjs apps/front/scripts/lint-policy.test.mjs` from the repository root for isolated synthetic server-config and lint-policy imports; `next lint` is intentionally not used (deprecated, broken under the locked `eslint-config-next`). `pnpm run check` chains these runners. Real authentication, API, and database verification require separately authorized service access.

## Verificación integrada local y mediciones de laboratorio

El harness `scripts/verify-critical-flows.mjs` construye una copia pública aislada y
verifica el frontend real con HTTP sintético. **La implementación y los tests del
harness no son evidencia de ejecución de producción**: el verificador dedicado
debe ejecutar el comando siguiente y conservar el JSON resultante antes de aceptar
T5. No se configura ni se conecta un API o Supabase real.

### Invocación del verificador

Desde `apps/front`, con Node 22.22.3, Playwright 1.60.0, Chrome del sistema y axe
local ya instalados en este laboratorio. Las rutas siguientes son tooling público autorizado; no instalar
ni usar perfiles, credenciales, `storageState`, `.env` o servicios existentes.
Los dos puertos explícitos deben estar disponibles y ser distintos.

```bash
SAFE_HOME=$(mktemp -d)
NODE=/Users/mauroociappina/.nvm/versions/node/v22.22.3/bin/node
PLAYWRIGHT=/Users/mauroociappina/.nvm/versions/node/v22.22.3/lib/node_modules/playwright/index.mjs
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
AXE=/Users/mauroociappina/Desktop/intento2/node_modules/.pnpm/axe-core@4.13.0/node_modules/axe-core/axe.js
env -i HOME="$SAFE_HOME" XDG_CONFIG_HOME="$SAFE_HOME" \
  PATH="$(dirname "$NODE"):/usr/bin:/bin" NEXT_TELEMETRY_DISABLED=1 \
  "$NODE" scripts/verify-critical-flows.mjs \
  --playwright-module "$PLAYWRIGHT" --chrome "$CHROME" --axe "$AXE" \
  --dependency-root /Users/mauroociappina/Desktop/intento2 \
  --next-port 32111 --stub-port 32112 --samples 3 --as-of 2026-01-01
```

| Opción                       | Contrato                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `--playwright-module`        | Archivo absoluto del Playwright instalado, terminado en `/playwright/index.mjs`.                           |
| `--chrome`                   | Ejecutable absoluto de Chrome del sistema, terminado en `/Google Chrome.app/Contents/MacOS/Google Chrome`. |
| `--axe`                      | Archivo público absoluto instalado, terminado en `/axe-core/axe.js`.                                       |
| `--next-port`, `--stub-port` | Puertos enteros 1024–65535, distintos; sólo `127.0.0.1`.                                                   |
| `--samples`                  | 3–10 pares de navegaciones por ruta; por defecto 3.                                                        |
| `--as-of`                    | Día calendario sintético del API; por defecto `2026-01-01`. La UI conserva su reloj real.                  |

`--dependency-root` concede acceso explícito sólo al tooling público instalado.
Para este worktree enlazado es obligatorio el root autorizado mostrado arriba:
los cuatro `node_modules` deben resolver exactamente a las áreas correspondientes
de ese root canonicalizado. `.pnpm` y sus directorios raíz deben ser físicos,
sin redirecciones; cada paquete externo debe permanecer en ese store con sufijo
de paquete esperado. El mismo store autorizado limita los CLIs Next/TypeScript.
Sin opción, se conserva el layout físico del source; no se infiere confianza
siguiendo enlaces. `@hismia/types` y `@hismia/validation` siempre apuntan a scratch,
nunca a dist original. Errores de dependencias se reportan como
`dependency-store-untrusted`, `dependency-missing` o
`dependency-target-outside-store`, sin rutas ni mensajes crudos.

Requiere POSIX, el mismo Node que ejecuta el CLI y `lsof` en `/usr/sbin/lsof` o
`/usr/bin/lsof`. La disponibilidad de un puerto no acredita ownership: readiness
exige el listener IPv4 del hijo exacto antes y después de HTTP 200.
El comando devuelve JSON y exit 0 sólo si pasan los checks funcionales y el cierre;
un fallo o dependencia ausente devuelve exit no cero, sin mensajes crudos del SDK,
Playwright ni del proveedor. Guarda `critical-flows-summary.json` **únicamente en
el scratch**, con fase, digest SHA-256 del código público copiado, métricas,
checks y recibos de cierre. No crea resultados en el repositorio. No borra scratch,
fixtures ni archivos del operador; un fallo de escritura del informe también falla
el comando.

### Qué verifica y qué sustituye

- Copia allowlistada de fuente/config pública, sin `.env*`, metadata, runtime
  privado, caches o builds previos. Reutiliza dependencias instaladas de pnpm;
  `@hismia/types` y `@hismia/validation` resuelven a paquetes compilados **en scratch**.
- Compila ambos paquetes antes de Next y fija `HISMIA_API_ORIGIN` durante el build.
  Importa el schema del dist recién compilado, nunca del dist original. Luego inicia
  API sintético y Next production, ambos loopback. No usa `next dev`.
- Peticiones directas al Next real verifican GET/POST, bearer, JSON y estados
  200/201/400/401/404/405/409/415 de los dos rewrites; una ruta ajena no debe llegar
  al fixture. No se interceptan esos requests para simular un rewrite exitoso.
- Chrome se lanza headless nuevo, sin contexto persistente ni sesiones previas.
  Cada contexto bloquea service workers y descargas. Antes de navegar se instala
  routing HTTP deny-by-default y bloqueo de todos los WebSockets. Sólo continúa
  el origen Next exacto; `https://auth.synthetic.test` se cumple localmente con
  semántica SDK, incluyendo challenge/verifier PKCE, intercambio, update y logout.
- UI/cliente/validator y SDK son reales. Escenarios previstos: signup/confirmación,
  login rechazado y exitoso, tres perfiles, errores asociados y foco, edad inválida,
  cambio de variante, conflicto, duplicate submit, recuperación, rechazo de sesión
  ordinaria como recovery y signout entre tabs con respuesta de perfil atrasada.
  El HTTP de persistencia se puede demorar, pero sigue pasando por el rewrite real.
  El cambio de cuenta y otras carreras conservan además la suite integrada de 17
  tests; no se afirma que todas estén cubiertas en navegador.

### Método de medición

| Medida                | Método y límites                                                                                                                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build                 | Tiempo monotónico de compilación de paquetes + Next; recibos separados con duración de cada hijo. No mide instalaciones.                                                                                                                                                                  |
| JS/CSS                | Assets únicos referenciados por HTML inicial de seis rutas; bytes raw, gzip y Brotli calculados offline. Shared = presente en más de una ruta probada; totales por ruta separados. No es todo el grafo lazy ni bytes efectivamente transferidos.                                          |
| Muestras              | Al menos 3 pares por ruta: cinco rutas anónimas mantienen `fresh-context`/`repeat-context`; onboarding usa contexto autenticado preparado y primera/repetida navegación medida. Browser, OS y caches del servidor no se enfrían; routing deshabilita HTTP cache en todas las condiciones. |
| Condiciones           | Viewport 1280×800, locale es-AR, zona UTC, sin throttling CPU o red. Next loopback y auth HTTPS cumplido localmente, sin latencia de proveedor.                                                                                                                                           |
| FCP/LCP/CLS           | Observers instalados antes del código de aplicación, buffered; ventana fija de 1.000 ms después de load. LCP es el último candidato observado antes de interacción, no un LCP final de ciclo de vida. CLS usa máximo de ventanas de sesión de 5 s, gap 1 s, excluyendo recent input.      |
| Respuesta/interacción | responseStart y TTFB del Navigation Timing; Tab hasta dos frames, con overhead del driver. Es latencia de laboratorio, **no INP de campo**.                                                                                                                                               |
| Ausentes              | Valor null y nombre en `unavailable`, nunca cero inventado. Sin presupuestos de performance previos a la línea base.                                                                                                                                                                      |

Las seis rutas son login, signup, confirmación, solicitud de recuperación, reset y
onboarding. Las cinco primeras rutas siguen usando contextos sin sesión. Sólo el
benchmark de perfil `/onboarding` autentica cada contexto nuevo de muestra con el
fixture existente de login real del SDK y HTTP sintético, **antes** de navegar para
medir. No escribe perfiles, siembra almacenamiento/sesiones, transfiere estado ni
reutiliza contextos de flujos funcionales. La preparación ya visita onboarding y
calienta contexto/sesión/assets; ninguna de sus dos condiciones es fría:

- `prepared-auth-context/first-measured-navigation`
- `prepared-auth-context/repeat-measured-navigation`

Ambas mediciones comparten únicamente la página/sesión de esa muestra preparada.
Cada navegación medida reinicia los observers del documento; no mezcla métricas de
login/preparación. Conserva la ventana y captura de FCP/LCP/CLS de 1.000 ms; **después**
de esa captura espera el botón visible Guardar perfil y los controles visibles y
habilitados antes de iniciar el timer de Tab. Esa readiness añade tiempo anterior a
la interacción, pero no redefine el origen de Navigation Timing ni extiende la
ventana de métricas. Se mantienen Tab, dos frames y la comprobación de foco, sin
forzar foco ni agregar sleeps. No es INP de campo.

Con tres muestras hay **30 navegaciones anónimas + 6 autenticadas preparadas**.
Agrupar por ruta y condición exacta: no combinar poblaciones de distinto estado de
auth/cache ni comparar rutas como si fueran una población uniforme. Conservar
muestras individuales; no mezclar las seis nuevas mediciones de onboarding con el
intento anterior fallido y anónimo. Es una corrección explícita de metodología,
no evidencia de un bug de producto ni restitución de una exigencia previa.

Axe se inyecta desde el archivo local y registra reglas fallidas/incompletas, no HTML
ni datos de campos. Se calculan contrastes de estilos renderizados con fondos simples
compuestos y se verifica foco/labels/descripciones de errores. Fondos con imagen,
opacidad de ancestros, controles deshabilitados y reglas incomplete necesitan revisión
manual; logos decorativos quedan fuera del chequeo manual de texto. No acredita
lector de pantalla, todos los viewports, todas las reglas WCAG ni certificación.

El browser tiene un deadline total de 300.000 ms desde launch hasta completar
flujos y muestras: cubre routing, red, axe, evaluate y cierres de contexto, además
de los timeouts individuales del driver. Chrome se posee mediante BrowserServer;
al vencer el deadline se invoca `kill`, no sólo se abandona un `Promise.race`.
Cada cierre/kill tiene un límite de 3.000 ms y todo fallo de cleanup falla el check.
Un launch tardío se termina sin reanudar navegación; si aún no hay handle al vencer,
el informe declara salida desconocida, nunca quiescencia inventada.
Los cierres se esperan en `finally` incluso ante fallo: contextos/Chrome por Playwright,
Next por su grupo POSIX y API por sus sockets propios. Recibos de Next conservan
pid/exit/signal/duración/quiescencia incluso al rechazar stop, sin outputs crudos.
Chrome registra close/kill y exitCode/signal del hijo propio de BrowserServer;
desconexión del driver sola no acredita salida ni quiescencia de descendientes. Dependencias y procesos se consideran confiables: esto no
contiene descendientes que escapen al grupo, no es sandbox ni firewall de egress del
sistema operativo. Un cierre forzado del proceso/OS puede impedir el `finally`.
No prueba emails reales, allowlists del proveedor, autorización/persistencia del
backend, TLS de DB, capacidad de producción ni operación con datos reales.
