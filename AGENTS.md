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

- **`api/` y `front/`** se desarrollan como módulos independientes; nada en `front/` accede directo a datos clínicos sin pasar por el backend.
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

### 3.3 Hooks locales

- **Husky** puede correr lint/format antes de commit o push. No reemplaza CI ni garantiza seguridad.
- Respetar **ESLint** y **Prettier** (configuración pendiente de alinear con TypeScript).

### 3.4 Pull Requests

- PR = una unidad coherente. Si excede ~400 líneas de código authored, abrir PRs encadenados (`stacked-to-main` o `feature-branch-chain`); ver skills `work-unit-commits` y `chained-pr`.
- Describir **qué** y **por qué**, enlazar a la tarea ODD correspondiente.
- **No mergear sin revisión.** Para áreas sensibles (autorización, auth, pagos, seguridad, migraciones, contratos públicos) correr las 4R (`review-risk`, `review-resilience`, `review-readability`, `review-reliability`).

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

### 5.1 TypeScript

End-to-end TS (NestJS + Next.js). Tipos expresan contratos; **no** validan datos externos ni permisos por sí solos. Validar formas de datos en límites (HTTP, persistencia) con **Zod**; validar en el cliente no autoriza.

La **política objetivo de `tsconfig.json`** (flags estrictos, buenas prácticas, origen de tipos) vive en [`doc/CONFIG/tsconfig-target.md`](doc/CONFIG/tsconfig-target.md). Aplicar al pie de la letra cuando se cree el config; toda desviación requiere justificación documentada.

### 5.2 Backend (NestJS)

- Responsabilidades separadas (hexagonal + SRP): controller no interpreta autorización; caso de uso aplica reglas; repositorio no decide permisos.
- **Helmet** aplica cabeceras HTTP de seguridad; no sustituye autenticación ni autorización por recurso.
- **jose** para JWT/JWS/JWE/JWK/JWKS si se requiere verificación local; verificar el token **no** autoriza la historia clínica.
- **node:crypto** (AES-256-GCM) candidato para cifrado de contenido cuando se implemente el backend; sigue siendo conceptual en este repo.

### 5.3 Frontend (Next.js)

- **Next.js** = marco de aplicaciones web basado en React para las interfaces. Estrategia de renderizado, sesiones y versionado **no** decididos aún.
- **React Hook Form + @hookform/resolvers** para formularios; integrar con Zod como esquema.
- **Zustand** para estado de UI; no es autoridad sobre permisos.
- **Tailwind CSS v4 + shadcn/ui** (cuando se inicialice el frontend); los tokens viven en `doc/DESIGN/DESIGN.md` como fuente única.

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

**Convenciones de la suite:**

- **Archivos:** `*.test.ts` co-localizado con el código o en `__tests__/` por módulo; mismo criterio en `api/` y `front/`.
- **Datos clínicos:** **nunca** en fixtures. Usar datos sintéticos, factories y anonimización. Las historias clínicas reales son out-of-scope hasta habilitación explícita.
- **Mocks:** solo en límites (HTTP, persistencia, tiempo). No mockear la lógica que se está probando.
- **Cobertura:** no es criterio de aceptación; sí lo es la presencia de tests sobre las reglas críticas (autorización, grants, autoría, validación).
- **A11y:** axe-core en CI se delega a Task 16.163; contract tests a Task 0.36 (ver `doc/DESIGN/DESIGN.md`).
- **Evidencia:** registrar en la tarea ODD el comando ejecutado (`pnpm vitest run`, `node --test`) y su resultado; nunca inventar RED/GREEN.

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