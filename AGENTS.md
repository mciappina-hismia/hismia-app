# AGENTS.md — Guía de contribución para Hismia

> Esta guía aplica a colaboradores humanos y agentes AI que operen sobre este repositorio. La documentación conceptual del producto vive en `/doc` y **no se duplica aquí**: este archivo explica **cómo trabajar** en el repo.

## 1. Antes de empezar

### 1.1 Leer primero (en este orden)

1. [`doc/README.md`](doc/README.md) — alcance del MVP, roles, accesos, bloqueos.
2. [`doc/ARQUITECTURA/ARQUITECTURA.md`](doc/ARQUITECTURA/ARQUITECTURA.md) — vocabulario, responsabilidades, hexagonal + DDD.
3. [`doc/TECNOLOGIAS/TECNOLOGIAS.md`](doc/TECNOLOGIAS/TECNOLOGIAS.md) — herramientas mencionadas, qué **no** está implementado.
4. [`doc/DESIGN/DESIGN.md`](doc/DESIGN/DESIGN.md) — tokens de diseño y matriz WCAG.

Si la tarea contradice algo de esos documentos, el documento gana. Si la tarea requiere cambiarlo, abrir primero una propuesta en `doc/` antes de tocar código.

### 1.2 Reglas no negociables (clínicas y de seguridad)

Las reglas conceptuales viven en [`doc/README.md`](doc/README.md) y [`doc/ARQUITECTURA/ARQUITECTURA.md`](doc/ARQUITECTURA/ARQUITECTURA.md). Resumidas para el trabajo en repo:

- **Autenticación ≠ autorización.** Re-verificar paciente, profesional, recurso, operación, vigencia del grant y autoría en cada llamada — no confiar en estados cacheados de UI ni en el frontend.
- **Datos clínicos = out-of-scope hasta habilitación.** Esta beta autoriza al usuario a subir PDFs propios; **no** autoriza a conectar servicios externos, migrar, desplegar ni abrir el sistema a datos reales sin aprobación humana.
- **No subir datos clínicos reales al repo** (binarios, fixtures, logs). Si un test necesita algo realista, usar sintéticos.

## 2. Estructura del repositorio

```
.
├── api/             Backend NestJS (TypeScript)
├── front/           Frontend Next.js + React (TypeScript)
├── doc/             Documentación conceptual viva
│   ├── README.md
│   ├── ARQUITECTURA/
│   ├── DESIGN/
│   └── TECNOLOGIAS/
├── icon/            Recursos gráficos
├── odd/             Tareas del flujo Organic Driven Development (ODD)
│   └── tasks/       Planes por feature
└── .atl/            Registro de skills del proyecto
```

- **`apps/api/` y `apps/front/`** se desarrollan como módulos independientes; nada en `apps/front/` accede directo a datos clínicos sin pasar por el backend.
- **`doc/`** es la fuente de verdad conceptual. Cambios al producto se documentan **primero** ahí.
- **`odd/tasks/`** guarda una nota por feature mientras dura el trabajo; al cerrar se conserva como evidencia.

## 3. Flujo de trabajo

### 3.1 Ramas

- Rama principal de desarrollo: **`develop`**.
- Rama estable: **`main`** (solo merges autorizados).
- **No** crear ramas de larga vida sin motivo. Para una tarea, trabajar directamente sobre `develop` o crear una rama con prefijo por feature (`feat/<nombre>`, `fix/<nombre>`, `docs/<nombre>`) y mergear con PR.
- **No pushear directo a `main`.** Toda promoción a `main` requiere PR revisado.

### 3.2 Conventional Commits (obligatorio)

Formato: `<tipo>(<alcance>): <descripción corta en imperativo>`

Tipos frecuentes en este repo: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`.

Ejemplos reales del repo:

```
docs(TECNOLOGIAS): expand technology descriptions and add metrics and encryption guidelines
chore(git): update .gitignore to track local ODD tasks and refine versioning notes
feat(icon): add HisMia logo image file
```

**Commits atómicos:** cada commit representa **una unidad de cambio coherente y verificable**. Un commit atómico:

- Tiene un único propósito (una feature, un fix, un refactor, una corrección de docs). Mezclar cosas no relacionadas en un mismo commit es una falla.
- Deja el repo en un estado ejecutable. Si el commit es de código, los tests deben estar verdes antes de cerrar el commit. Si es de docs, no debe romper enlaces, anclas ni formato.
- Incluye su evidencia: tests, fixtures, migraciones, snippets de docs, ajustes de configuración que la unidad necesita para ser revisada y revertida de forma independiente.
- Es revertible de un solo `git revert`. Si revertir el commit deja el repo roto, no era atómico.
- **No** mezcla refactor con feature. Si tocás una regla de negocio y de paso “aprovechás” para renombrar, son dos commits.
- **No** mezcla formato con lógica. Un cambio de prettier en archivos no tocados por la unidad va en un commit `style` aparte.
- **No** amontilla WIP. Si una unidad requiere varios pasos, son varios commits, cada uno con su paso coherente, no un dump al cerrar.

**Relación con PRs:** un PR puede contener uno o varios commits atómicos. El PR revisa la unidad de producto; los commits revisan la historia. Ambos tienen que ser coherentes.

### 3.3 Hooks locales

Los hooks viven en `.husky/` y se activan automáticamente al ejecutar
`pnpm install`, porque el script `prepare` del root package.json corre
`husky`, que setea `core.hooksPath` a `.husky/_/`. No reemplazan CI
ni garantizan seguridad: son la puerta local más cercana al commit y
un complemento, no un sustituto, de la revisión humana.

- **`pre-commit`**: corre `pnpm exec lint-staged`, cuya configuración
  path-aware vive en `.lintstagedrc.cjs`. Formatea los archivos staged
  con Prettier y aplica `eslint --fix --max-warnings=0` por paquete
  (`apps/front` usa su propio ESLint 9 via
  `pnpm --filter @hismia/front exec eslint`; `apps/api` y `packages/*`
  usan el flat config del root via `pnpm exec eslint`). Los
  `*.{js,mjs,cjs}` y `*.{json,md}` pasan solo por Prettier porque el
  ESLint del root es TypeScript-only e ignora esas extensiones.
- **`commit-msg`**: corre `pnpm exec commitlint --edit "$1"`, con la
  config en `commitlint.config.cjs` que extiende
  `@commitlint/config-conventional`. Enforce el formato
  Conventional Commits detallado en §3.2.
- **`pre-push`**: corre `pnpm -r run lint`, que ejecuta ESLint en los
  cuatro paquetes del monorepo (`apps/api`, `apps/front`,
  `packages/types`, `packages/validation`). Toma ~4s en este repo.

Para saltarse un hook puntualmente: `git commit --no-verify` o
`git push --no-verify`. **No** commitear esos bypasses al repo: si un
hook molesta, se arregla en su configuración, no se desactiva por
defecto. Si los hooks parecen no correr en un clone nuevo, verificar
que `git config core.hooksPath` devuelva `.husky/_/`.

- Respetar **ESLint** y **Prettier** (configuración pendiente de alinear con TypeScript).

### 3.4 Pull Requests

- PR = una unidad coherente. Si excede ~400 líneas de código authored, abrir PRs encadenados (`stacked-to-main` o `feature-branch-chain`); ver skills `work-unit-commits` y `chained-pr`.
- Describir **qué** y **por qué**, enlazar a la tarea ODD correspondiente.
- **No mergear sin revisión.** Para áreas sensibles (autorización, auth, pagos, seguridad, migraciones, contratos públicos) correr las 4R (`review-risk`, `review-resilience`, `review-readability`, `review-reliability`).

### 3.5 Setup local del API

Para arrancar `apps/api` localmente:

1. `node apps/api/scripts/dev-setup.mjs prepare` (una vez; requiere TTY).
   Crea `apps/api/.env.runtime.local` con el `DATABASE_URL` y
   `apps/api/.env.runtime.provision.sql` con el SQL de provisioning, ambos
   `0o600`. **No** imprimir, commitear ni pegar ninguno en chat: el
   verifier es una credencial.
2. Ejecutar el SQL del paso 1 en el editor SQL privado del dashboard
   de Supabase autorizado (`hismia-dev` / `zfpnjsbxrgbcehmefozb`).
3. `node apps/api/scripts/dev-setup.mjs configure-ca --ack-ca-config
/ruta/absoluta/al/ca.crt` (una vez; tras `prepare`). Pinea el CA
   estricto de Supabase en el archivo privado.
4. `pnpm --filter @hismia/api dev` (cada vez). Arranca el API; el
   `AppConfigModule` valida el archivo privado (URL canonical,
   fingerprint del CA, conectividad de DB read-only) en su
   `OnModuleInit`. Si algo falla, throw → exit 1.

Los archivos `.env.runtime.*` están en `.gitignore` (`/apps/api/...`).
A diferencia del helper anterior (`private-runtime.mjs`, eliminado),
Nest arranca con el `process.env` completo del operador: variables
benignas como `NODE_OPTIONS=--no-deprecation` ya no rompen el flujo.

## 4. Trabajo con agentes AI

### 4.1 Lectura obligatoria antes de actuar

Todo agente AI (humano asistido o autónomo) debe leer:

1. Este `AGENTS.md`.
2. `doc/README.md` + `doc/ARQUITECTURA/ARQUITECTURA.md`.
3. La tarea en `odd/tasks/<feature>.md` cuando exista.
4. El skill registry en `.atl/skill-registry.md` para resolver skills específicas.

### 4.2 Organic Driven Development (ODD) es el flujo por defecto

Para cada solicitud:

1. **Autorizar.** Cambios sin intención explícita → solo lectura, una pregunta de aclaración si hay duda.
2. **Explorar.** Leer código y requisitos existentes antes de proponer.
3. **Resolver incertidumbre.** Investigar opcional solo para incertidumbre nombrada; una pregunta enfocada al usuario para decisión real; como máximo un challenge de premisa de alto impacto.
4. **Clasificar.** Trabajo sustancial = ≥2 pasos de implementación significativos o progreso que valga recuperar. Trabajo pequeño y entendido sigue pequeño.
5. **Tracking.** Para implementación sustancial, crear `odd/tasks/<feature>.md` antes del primer write.
6. **Implementar tarea por tarea.** Commit por unidad de trabajo, con tests y docs junto al comportamiento. Mensaje Conventional Commit. Registrar evidencia en el documento de la feature.
7. **Cerrar.** Reportar resultado verificado, fallos y siguiente paso.

### 4.3 Triggers de delegación (ODD)

Cuando se cumple cualquiera de estos, delegar en lugar de continuar inline:

- **Mapping:** evidencia excede el batch inline (3 llamadas, ~10k tokens) o requiere >5 lookups secuenciales → un explorador read-only devuelve ≤2k tokens con evidencia `path:line`.
- **Write:** 2+ archivos no triviales → un escritor único.
- **Preparación:** lectura que prepara un write + investigación amplia → delegar junto al write.
- **Verificación:** comandos de tests, builds o instalaciones → un verificador dedicado; el output del parent se limita a `--stat`, conteos, tails.
- **Backstop de contexto:** alrededor de 150k tokens de contexto del parent, pausar y delegar la próxima unidad.

### 4.4 Test-first cuando aplica

El proyecto usa **Vitest** como runner principal (unitarias + integración) y **`node:test`** cuando se necesita un runner nativo sin dependencias. La estrategia oficial es **RED → GREEN → REFACTOR** y es **obligatoria cuando aplica**; está respaldada por un skill interno. Ver detalle, excepciones y convenciones en [§5.6 Tests](#56-tests).

- Documentación pasiva, runners no disponibles o RED no significativo → explicar la excepción y correr verificación funcional/estructural proporcional.
- Presencia de tests no implica aplicabilidad. No inventar evidencia RED/GREEN.

### 4.5 Memoria persistente

- Usar memoria del proyecto para decisiones, hallazgos no obvios, bugs, convenciones.
- Al cerrar sesión, dejar `session summary` con Goal / Instructions / Discoveries / Accomplished / Next Steps / Relevant Files.
- No usar memoria del proyecto para datos clínicos ni para contenido reproducible desde el código.

### 4.6 Memoria del repositorio (`.atl/`)

- `.atl/skill-registry.md` indexa skills por trigger y ruta. Resolver **una vez por sesión** y cachear.
- Pasar `SKILL.md` paths exactos a sub-agentes, no resúmenes.
- Si la skill cambia, actualizar el registry.

## 5. Convenciones de código

### 5.0 Principios de escalabilidad

El MVP se construye asumiendo que **mañana va a escalar** — más usuarios, más datos, más desarrolladores, más features. Las decisiones de arquitectura y código del MVP deben ser compatibles con ese crecimiento, **aunque no implementen hoy toda la infraestructura para soportarlo**. Si una decisión temprana obliga a reescritura cuando llegue el crecimiento, está mal tomada.

**Eje 1 — Tráfico y datos (escala runtime):**

- **Backend stateless** desde el día 1: ninguna sesión ni estado de aplicación en memoria del proceso. Estado solo en persistencia. Esto habilita escalar horizontalmente con réplicas detrás de un balanceador sin sticky sessions.
- **Separación read/write desde el diseño del esquema**, aunque en MVP convivan: cada ruta de acceso tiene claro si lee o escribe. Listar historias es read; cargar PDF es write. Esto permite sumar réplicas de lectura, cache y CDN sin tocar código de negocio cuando llegue el momento.
- **Paginación obligatoria** en toda lista (historias, PDFs, notas, recordatorios, estadísticas institucionales). Límite máximo por request (ej. 100) más cursor estable. **Nunca** `SELECT *` sin paginar en una ruta que devuelva listas.
- **Límites por tabla definidos desde el schema** (índices por clave de búsqueda, FKs explícitas, constraints de unicidad donde corresponda). No posponer índices "para cuando crezca": añadir un índice a una tabla con 100k filas en producción es caro; añadirlo con 100 filas es gratis.
- **Cache solo cuando se justifique con un patrón de acceso real.** No añadir Redis el día 1 sin medir; el sobrecoste de invalidación mata más MVPs que la latencia. Si una ruta es lenta, medir antes de cachear.
- **Auth flow:** Supabase Auth emite el access token (JWT firmado). El backend solo verifica la firma contra el JWKS público de Supabase; nunca ve la contraseña ni la deriva. El frontend guarda el refresh token con seguridad del navegador.

**Eje 2 — Equipo y features (escala organizacional):**

- **Monorepo** desde el inicio (`apps/api`, `apps/front`, `packages/types`, `packages/validation`). Un solo `git log`, una sola CI, contratos tipados compartidos entre frontend y backend sin duplicar.
- **Contratos estables entre módulos desde el día 1.** Cambiar la forma de un DTO o un endpoint debería requerir actualizar tipos en `packages/types` y la versión del contrato; no se reescribe en silencio. Esto se valida con tests de contrato (ver `doc/DESIGN/DESIGN.md` Task 0.36).
- **Límites de bounded context respetados en la estructura de carpetas.** El MVP tiene pocos contextos (auth, records, institutions, admin) pero cada uno vive en su propia carpeta con su entrada (controller/UI) y su caso de uso; cruzar límites "porque es más fácil" es deuda que se paga cara cuando hay 10 personas tocando el código.
- **Tests de contrato entre módulos** — no mocks entre bounded contexts, sino verificación de que los tipos y respuestas cumplen el contrato compartido.
- **CI por área, no monolítica.** Un PR que toca `apps/api/records` no debe ejecutar la suite de `apps/api/admin`. Las áreas escalan en paralelo; las CI también.
- **Onboarding legible.** Un desarrollador nuevo (o un agente AI) debe poder entender qué toca y qué no tocando un solo módulo sin leer todo el repo. Documentar límites de cada contexto en su README interno cuando crezca.

**Lo que esta sección NO exige:**

- No exige microservicios. **Hexagonal + monorepo alcanza** para los próximos órdenes de magnitud. Microservicios se introducen solo cuando hay una razón concreta (equipo separado, deploy independiente, tecnología distinta por servicio).
- No exige Kubernetes, multi-región ni cero downtime. Eso se diseña cuando se justifique.
- No exige sobre-ingeniería. Si una decisión del MVP es incompatible con escala 1000x pero se reescribe en una semana cuando llegue, es aceptable. Lo que **no** es aceptable es una decisión que exige reescritura de meses o migración de datos.

**Cómo se aplica:** antes de aprobar un PR que toque arquitectura o código nuevo, revisar si respeta estos principios. Si un tradeoff los viola (ej. "para MVP uso sesiones en memoria"), documentarlo en la tarea ODD con la fecha en que se reescribe y el criterio que lo gatilla.

### 5.1 TypeScript

End-to-end TS (NestJS + Next.js). Tipos expresan contratos; **no** validan datos externos ni permisos por sí solos. Validar formas de datos en límites (HTTP, persistencia) con **Zod**; validar en el cliente no autoriza.

La **política objetivo de `tsconfig.json`** (flags estrictos, buenas prácticas, origen de tipos) vive en [`doc/CONFIG/tsconfig-target.md`](doc/CONFIG/tsconfig-target.md). Aplicar al pie de la letra cuando se cree el config; toda desviación requiere justificación documentada.

### 5.2 Backend (NestJS)

- Responsabilidades separadas (hexagonal + SRP): controller no interpreta autorización; caso de uso aplica reglas; repositorio no decide permisos.
- **HTTP adapter: Fastify** vía `@nestjs/platform-fastify` (no Express). Más rápido, soporte nativo de JSON schema, mejor manejo de streams para PDFs.
- **Helmet** vía `@fastify/helmet` aplica cabeceras HTTP de seguridad; no sustituye autenticación ni autorización por recurso.
- **Rate-limit** vía `@fastify/rate-limit`: 100 req/min/IP por defecto en todos los endpoints, con override más estricto en `/login` y `/signup` (anti brute-force, configurable por env). Aplicado como hook global de Fastify en `main.ts`.
- **Auth: Supabase Auth delegado.** El backend no maneja contraseñas ni hash. El frontend autentica contra Supabase Auth y envía el access token; el backend lo verifica contra el JWKS público de Supabase usando `jose`. Verificar un token no autoriza una historia clínica: el backend aplica las suyas propias sobre paciente, recurso, operación, vigencia y autoría.
- **jose** para verificación JWT/JWKS contra el JWKS de Supabase; verificar el token **no** autoriza la historia clínica.
- **node:crypto** (AES-256-GCM) candidato para cifrado de contenido cuando se implemente el backend; sigue siendo conceptual en este repo.

**Estructura por endpoint / bounded context:** cada endpoint vive en una carpeta bajo `apps/api/src/<bounded-context>/`. Cuando un endpoint expone lógica de negocio, esa carpeta contiene este set mínimo de archivos (los nombres pueden sumar prefijos o sufijos según el contexto, p. ej. `patients.signup.controller.ts` si hace falta):

| Archivo                                                            | Responsabilidad                                                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `<endpoint>.types.ts`                                              | Tipos TypeScript del contrato del endpoint (request, response, errores).                     |
| `<endpoint>.service.ts` o `<bounded-context>.service.ts`           | Lógica de negocio. Aggregate checks, orquestación de repositorios, reglas de autorización.   |
| `<endpoint>.controller.ts`                                         | Solo rutea HTTP al service. No calcula nada.                                                 |
| `<endpoint>.controller.test.ts`                                    | Tests unitarios del controller (mockean el service; verifican routing y delegación).         |
| `<endpoint>.service.test.ts` o `<bounded-context>.service.test.ts` | Tests del service con cada dependencia inyectada (DB, Auth, Storage, Sentry, etc.) mockeada. |
| `<endpoint>.routes.test.ts`                                        | Tests e2e de las rutas reales con supertest contra la app Fastify.                           |

Cuando el endpoint es trivial (ej. `/health` sin más que uptime), el `*.service.ts` igual existe: la separación service/controller es la regla, no la excepción. Si el endpoint no tiene service, se está saltando la convención.

### 5.3 Frontend (Next.js)

- **Next.js** = marco de aplicaciones web basado en React para las interfaces. Estrategia de renderizado, sesiones y versionado **no** decididos aún.
- **React Hook Form + @hookform/resolvers** para formularios; integrar con Zod como esquema.
- **Zustand** para estado de UI; no es autoridad sobre permisos.
- **Tailwind CSS v4 + shadcn/ui** (pendiente de inicializar en `apps/front/`); los tokens viven en `doc/DESIGN/DESIGN.md` como única fuente y aún no se exportan a `tailwind.config.*`. `next-themes` y `apps/front/src/app/globals.css` también están pendientes.

### 5.4 Persistencia

- **Supabase** como backend gestionado: PostgREST, Auth, Realtime, Storage, Functions, hosting son decisiones pendientes.
- **Supabase Auth** gestiona cuentas; **no** autoriza historias clínicas.
- **Prisma** modela y consulta; **no** propaga grants ni garantiza RLS. Verificar RLS por ruta de acceso.

### 5.5 Calidad y automatización

- **ESLint** + **Prettier** + **Husky** = calidad y formato local. No son CI ni garantías de seguridad.
- **CI/CD** pendiente de proveedor; despliegue continuo **no** habilitado; publicar requiere aprobación humana.

### 5.6 Tests

**Estrategia oficial:** RED → GREEN → REFACTOR es la práctica y **no es opcional cuando aplica**. Está respaldada por un skill interno del proyecto. Cada cambio de comportamiento pasa por estas tres fases en orden:

- **RED:** escribir un test que falla porque la funcionalidad todavía no existe o no se verifica. No es válido "implementar primero y agregar tests después"; el test que falla **es** el requisito ejecutable.
- **GREEN:** implementar el cambio mínimo para que el test pase, sin añadir nada extra. Cualquier feature adicional se cubre con su propio ciclo RED → GREEN.
- **REFACTOR:** limpiar la implementación manteniendo los tests en verde, sin agregar comportamiento nuevo. Si el refactor descubre un caso faltante, vuelve a RED con un nuevo test, no se cuela en este paso.

**Stack de tests del proyecto:**

- **[Vitest](https://vitest.dev/)** para unitarias e integración. Es el runner principal en `api/` y `front/`. Aprovecha la configuración de Vite/tsconfig, soporta ESM nativo, TypeScript sin paso extra de compilación y watch mode rápido.
- **[Node test runner](https://nodejs.org/api/test.html)** (`node:test`) cuando se necesite un runner nativo sin dependencias, especialmente para scripts de soporte, utilidades de tooling o módulos que no deban arrastrar Vitest como dependencia.
- Ambos comparten el ciclo RED → GREEN → REFACTOR; el framework es ortogonal al método.

**Cuándo aplicar test-first por defecto (RED → GREEN → REFACTOR):**

- Cambio de comportamiento con test determinístico aplicable y resultado esperado claro.
- Lógica con reglas del negocio: vigencia y revocación de grants, autoría de notas, autorización por recurso, validación de Zod, casos de uso del backend.
- Integraciones con límites claros: adaptadores HTTP, persistencia, verificación de JWT.
- Refactors que toquen reglas críticas: cubrir primero con tests que describan el comportamiento actual, luego refactorizar con red de seguridad.

**Cuándo NO aplicar test-first (justificar y usar verificación proporcional):**

- Documentación pasiva (Markdown, comentarios, tokens de diseño).
- Cambio puramente declarativo sin efecto runtime (renames, mover archivos, ajustar imports).
- Glue code trivial que solo delega a una librería probada por su mantenedor.
- Cuando el runner todavía no está configurado en el módulo tocado: explicar la excepción en la tarea ODD y diferir el test a una unidad de trabajo inmediata.

**Rúbrica mínima de unidad cerrada.** Toda unidad de trabajo (commit) cierra con, como mínimo:

- **Ruta de código tocada** (path:line) y **ruta de test** que cubre el comportamiento nuevo o modificado.
- **Evidencia RED → GREEN → REFACTOR** observada (comando exacto y resultado), o justificación explícita de la excepción.
- **Evidencia integrada** cuando se trate de autorización, persistencia, JWT o contratos públicos: un test contra la app real (supertest o equivalente) y, si aplica, contra la base restringida con la política esperada.
- **Doc tocada** (path:line) si hay cambio conceptual, de contrato o de política visible.
- **Riesgo residual y criterio de rollback** nombrados en la tarea ODD.

Si falta cualquiera de estos campos, el commit **no** está listo para cerrar y debe reabrirse con un nuevo RED que cubra el hueco.

**Convenciones de la suite:**

- **Archivos:** la convención canónica en todo el monorepo es `*.test.ts`, co-localizado con el código o en `__tests__/` por módulo; mismo criterio en `apps/api/`, `apps/front/` y `packages/`. La tabla de endpoints de §5.2 ya referencia esta convención.
- **Datos clínicos:** **nunca** en fixtures. Usar datos sintéticos, factories y anonimización. Las historias clínicas reales son out-of-scope hasta habilitación explícita.
- **Mocks:** solo en límites (HTTP, persistencia, tiempo). No mockear la lógica que se está probando.
- **Cobertura:** no es criterio de aceptación; sí lo es la presencia de tests sobre las reglas críticas (autorización, grants, autoría, validación).
- **A11y:** axe-core en CI se delega a Task 16.163; contract tests a Task 0.36 (ver `doc/DESIGN/DESIGN.md`).
- **Evidencia:** registrar en la tarea ODD el comando ejecutado (`pnpm vitest run`, `node --test`) y su resultado; nunca inventar RED/GREEN.

**Política de errores y diagnosabilidad.** Prohibido catch-alls que aplasten clases de error a un único tipo genérico (`unavailable`, `generic`, `internal`). Cada bounded context mapea sus errores a una jerarquía explícita (`ValidationError`, `ConflictError`, `NotFoundError`, `TransientError`) y los traduce a HTTP con códigos por contexto. Los repositorios propagan la clase original; el servicio decide la traducción. **No** se loguean JWT, payloads crudos, contraseñas ni identificadores clínicos.

**Relación con la entrega:** cada unidad de trabajo (commit) cierra con tests y docs junto al comportamiento. La verificación proporcional es siempre obligatoria; la ausencia de tests aplicables se documenta, no se omite.

## 6. Observabilidad y métricas

- El admin de Hismia expone **métricas técnicas operativas** (no KPIs clínicos). Implementación:
  - **[Supabase Metrics API](https://supabase.com/docs/guides/observability/metrics)** — endpoint Prometheus con ~200 series técnicas.
  - **[Grafana](https://grafana.com/docs/grafana/latest/)** — capa de visualización apoyada en [`supabase-grafana`](https://github.com/supabase/supabase-grafana).
  - **[Supabase Studio Reports](https://supabase.com/docs/guides/observability/reports)** — complemento para inspección ad-hoc.
- **No** exponer datos clínicos ni historias individuales en paneles externos.
- Métricas de producto (consultas cargadas por profesional, historias activas, frecuencia de accesos): **no implementadas**; si se requieren, definirlas aparte y aplicar autorización por rol.

## 7. Lo que **no** hacer

Reglas operativas del repo (las reglas conceptuales viven en `/doc`):

- ❌ Crear ramas de larga vida sin motivo; no pushear directo a `main`.
- ❌ Duplicar documentación conceptual de `/doc` en código o en otros Markdown.
- ❌ Inventar evidencia de tests, RED/GREEN, builds o verificaciones.
- ❌ Borrar o sobreescribir memoria del proyecto sin conservar el original.
- ❌ Subir datos clínicos reales al repo (binarios, fixtures, logs).

## 8. Cómo pedir ayuda

- **Concepto o alcance:** abrir issue con enlace a `doc/`.
- **Implementación:** crear `odd/tasks/<feature>.md` con objetivo, problema, alcance, criterios de aceptación y tareas.
- **Bug o incidente:** reproducir primero, documentar el flujo, abrir issue con evidencia mínima.
- **Revisión:** usar las 4R (`review-risk`, `review-resilience`, `review-readability`, `review-reliability`) según el área tocada.

---

> Esta guía es operativa: cambia con el proyecto. Si encuentra algo que contradice `doc/`, gane el documento conceptual y abra un PR para alinear este archivo.
