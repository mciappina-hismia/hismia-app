# Tecnologías mencionadas para Hismia

Estas descripciones presentan propósitos generales, no prueban que cada integración esté operativa ni deciden versiones, despliegue o configuración. El alcance está en [README.md](../README.md), incluido el estado acotado de la unidad 2, y los límites conceptuales en [ARQUITECTURA.md](../ARQUITECTURA/ARQUITECTURA.md). Se consultaron referencias de Husky, ESLint y Prettier para estas descripciones; ello no verifica las demás integraciones.

## Aplicación y lenguaje

- **[NestJS](https://docs.nestjs.com/):** marco para organizar aplicaciones de servidor, entradas HTTP y servicios. En este proyecto corre sobre **Fastify** (no Express) vía `@nestjs/platform-fastify`. Su estructura no reemplaza las reglas de autorización por recurso.
- **[Next.js](https://nextjs.org/docs):** marco de aplicaciones web basado en React para las interfaces. Para el flujo de autenticación de la unidad 2 se eligió cliente Supabase Auth PKCE sólo en navegador, con persistencia/renovación de sesión gestionada por el SDK en el navegador. Es una decisión acotada: no establece una estrategia universal de renderizado, SSR de autenticación ni cookies HttpOnly; la sesión tampoco autoriza recursos clínicos.
- **[React Hook Form](https://react-hook-form.com/) + [@hookform/resolvers](https://github.com/react-hook-form/resolvers):** librería de formularios para React con renderizado mínimo por campo y soporte nativo de validación HTML. `@hookform/resolvers` integra esquemas externos (Zod, Yup, Joi, Valibot) para validar el formulario en el cliente y/o en el servidor. Validar en el cliente no otorga autorización ni reemplaza los controles del servidor.
- **[TypeScript](https://www.typescriptlang.org/docs/):** lenguaje con tipado estático para expresar contratos en código; los tipos no validan por sí solos datos externos ni permisos.
- **[Fastify](https://fastify.dev/) + [@nestjs/platform-fastify](https://docs.nestjs.com/techniques/performance):** HTTP adapter de NestJS en este proyecto. Más rápido que Express, validación JSON schema nativa, mejor manejo de streams para PDFs. **[@fastify/helmet](https://github.com/fastify/fastify-helmet)** aplica cabeceras de seguridad (CSP, HSTS, X-Frame-Options, Referrer-Policy). Endurece respuestas HTTP; no aplica autenticación, autorización por recurso ni controles clínicos.
- **[@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit):** limitador de requests global por defecto (100 req/min/IP configurable por env), con override más estricto en `/login` y `/signup` para mitigar brute-force. Aplicado como hook global en `main.ts`.
- **[jose](https://github.com/panva/jose):** módulo JavaScript para JWT, JWS, JWE, JWK y JWKS, portable a Node, navegadores, Cloudflare Workers, Deno y Bun. Útil para verificar tokens y conjuntos de claves remotos; verificar un token no autoriza una historia clínica: propietario, grant, alcance, vigencia y autoría requieren verificaciones separadas.


## Observabilidad y métricas (selección conceptual)

El admin de Hismia expone métricas técnicas operativas del backend, no KPIs clínicos. Se compone de los dos elementos siguientes:

- **[Supabase Metrics API](https://supabase.com/docs/guides/observability/metrics):** endpoint compatible con Prometheus que expone unas 200 series técnicas (CPU, IO, WAL, conexiones, queries, réplicas de lectura) cada 60 s. El proyecto Hismia lo consume vía scrape autenticado con la service role key; no es un panel embebido sino un origen de datos.
- **[Grafana](https://grafana.com/docs/grafana/latest/):** plataforma de observabilidad que renderiza series temporales. Hismia usa Grafana como capa de visualización para el admin, apollada en la [plantilla oficial `supabase-grafana`](https://github.com/supabase/supabase-grafana) (~200 paneles técnicos: CPU, IO, WAL, conexiones, queries). Puede autoalojarse o usarse Grafana Cloud; no hay lock-in con un proveedor único.
- **[Supabase Studio Reports](https://supabase.com/docs/guides/observability/reports):** informes incorporados en Studio (CPU, IO, WAL, conexiones, consultas) complementarios a Grafana para inspección rápida ad-hoc, no son el admin de Hismia.

Lo que esta sección **no** afirma:

- No expone datos clínicos ni historias individuales; los paneles muestran series técnicas agregadas.
- No hay métricas de producto (consultas cargadas por profesional, historias activas, frecuencia de accesos) implementadas todavía; si se requieren, deben definirse aparte, agregarse y renderizarse con autorización por rol.
- No se ha seleccionado proveedor de Grafana ni habilitado despliegue automático; publicar sigue requiriendo aprobación humana.


## Cifrado de datos sensibles (selección conceptual)

**[node:crypto](https://nodejs.org/api/crypto.html)** es un módulo integrado en Node.js, no un paquete npm que haya que instalar. Es candidato para cifrado autenticado **AES-256-GCM** en un futuro servidor; esta selección no implica seguridad implementada ni un backend ejecutable.

- **Parámetros:** clave de 256 bits, nonce aleatorio de 96 bits que debe ser único por clave y etiqueta de autenticación de 128 bits. La implementación deberá evitar reutilizar nonces; si falla la autenticación, debe rechazar el dato sin entregar texto plano.
- **Persistencia:** guardar texto cifrado, versión del formato/clave, nonce y etiqueta; los componentes binarios requieren `bytea` o un equivalente adecuado. El esquema y las migraciones siguen pendientes. Representar datos como binarios no los cifra.
- **Claves:** mantenerlas fuera de la base de datos y del código fuente mediante un gestor de secretos o KMS. Definir versionado y rotación de claves; no registrar texto plano ni claves en logs.
- **Contraseñas:** su hashing corresponde a Supabase Auth, no a este cifrado de contenido. No se propone un hash arbitrario de 126 bytes: hashing y cifrado tienen propósitos distintos.

Siguen pendientes la clasificación de datos, la autorización de acceso y el alcance del cifrado en copias de respaldo y PDF. El cifrado no reemplaza controles de permisos ni resuelve por sí solo esos límites.

## Identidad, datos y estado

- **[Supabase](https://supabase.com/docs):** plataforma que ofrece servicios de backend; su mención no implica elegir almacenamiento de archivos, tiempo real, funciones, alojamiento ni acceso directo del navegador a datos clínicos.
- **[Supabase Auth](https://supabase.com/docs/guides/auth):** gestiona autenticación e identidad de cuenta. **El backend de Hismia delega Auth a Supabase**: no maneja contraseñas ni hash. El frontend autentica contra Supabase Auth y envía el access token (JWT); el backend lo verifica contra el JWKS público de Supabase usando `jose`. Autenticarse no autoriza una historia clínica: propietario, grant, alcance, vigencia y autoría requieren verificaciones separadas en el backend de Hismia.
- **[Prisma](https://www.prisma.io/docs):** herramienta para modelar y consultar datos persistentes. Persistir o leer mediante Prisma no propaga automáticamente grants de usuario ni garantiza la aplicación de políticas RLS; las fronteras efectivas de autorización deben comprobarse para cada ruta de acceso. La fuente de persistencia de la unidad 2 existe, pero puede aceptar una URL de conexión insegura: no constituye una arquitectura TLS estricta aceptada ni prueba conexión integrada.

### Criterio de aceptación: TLS estricto en conexiones a la base de datos

La mera presencia de una capa TLS no cumple la política de Hismia. El estado real de la unidad 2 sólo se considera **aceptado** cuando **todos** los puntos siguientes se cumplen y quedan registrados como evidencia en la tarea ODD:

- **`sslmode=require`** presente en la URL de conexión rechazada por el helper `apps/api/scripts/private-runtime.mjs` (ver `runtimeUrl` y `parseConfig`). Aceptar este modo es el mínimo; nunca se acepta `sslmode=disable` ni `sslmode=prefer`.
- **`sslaccept=strict`** activado: el cliente verifica la cadena de certificación completa y rechaza certificados que no anclen al pin del proyecto.
- **CA pinneada** en el helper (`CA_PIN` en `apps/api/scripts/private-runtime.mjs`) y comparada por fingerprint SHA-256 del certificado del servidor en cada conexión; la diferencia entre el fingerprint certificado y la fecha de validez actual es detectada por `validateCa`.
- **Prisma** honra los flags anteriores sin degradarlos. La inicialización del cliente no debe pasar por variables de entorno que anulen `sslmode`, `sslaccept` ni el `sslcert`.
- **Test integrado** ejecutado contra la DB restringida del perfil privado: el helper emite `PASS CHECK` y la app inicia el listener; un test que conecta sin TLS o con TLS laxo debe **fallar** (no-warning, no-skip).
- **Renovación documentada** del CA pin: ante cambio de certificado, se actualiza `CA_PIN` y se reejecuta la prueba integrada; el commit incluye la nota de rotación.

Cualquier desvío (helper que acepta `sslmode=disable`, pruebas saltadas con `--ignore-tls`, URL sin `sslcert`, Prisma reconfigurado sin verificar) invalida la aceptación de T3, aunque el código compile y los tests sintéticos pasen.
- **[Zustand](https://zustand.docs.pmnd.rs/):** gestiona estado de interfaz en el cliente; ese estado no constituye autoridad sobre permisos.

## Validación, presentación y pruebas

- **[Zod](https://zod.dev/):** describe y valida formas de datos en límites apropiados; validar datos en el cliente no otorga autorización y no reemplaza controles de servidor.
- **[Tailwind CSS](https://tailwindcss.com/docs):** utilidades para estilos de interfaz. La adopción de Tailwind v4 en `apps/front/` (junto con `shadcn/ui` y la exportación de tokens desde [`doc/DESIGN/DESIGN.md`](../DESIGN/DESIGN.md)) está **pendiente de inicialización**; no hay `tailwind.config.*` ni `apps/front/src/app/globals.css` todavía. `next-themes` y `@hismia/ui` también están pendientes.
- **[shadcn/ui](https://ui.shadcn.com/docs):** componentes y patrones de interfaz; su presencia no define accesibilidad ni comportamientos específicos del producto.
- **[Vitest](https://vitest.dev/):** runner principal para tests unitarios y de integración. Aprovecha la configuración de Vite/tsconfig, soporta ESM nativo y TypeScript sin paso extra de compilación. La estrategia RED → GREEN → REFACTOR se aplica sobre Vitest; ver [AGENTS.md](../AGENTS.md) §5.6.
- **[Node test runner](https://nodejs.org/api/test.html) (`node:test`):** runner nativo para scripts de soporte y utilidades de tooling que no requieran arrastrar Vitest como dependencia.

## Calidad y automatización

- **[Husky](https://typicode.github.io/husky/):** gestiona hooks locales de Git que pueden ejecutar lint o pruebas antes de un commit o push; no sustituye CI ni garantiza seguridad.
- **CI/CD:** práctica de automatización: integración continua (CI) ejecuta comprobaciones al integrar cambios; entrega continua prepara versiones validadas para publicación con aprobación humana, mientras despliegue continuo las publica automáticamente sólo si se elige expresamente. No se ha seleccionado proveedor ni activado despliegue automático; publicar sigue requiriendo aprobación humana y estas prácticas no habilitan datos clínicos reales.
- **[ESLint](https://eslint.org/docs/latest/):** análisis estático para detectar patrones problemáticos según reglas configurables; su soporte y configuración para TypeScript están pendientes y no sustituye pruebas ni controles de seguridad. El plan de pre-commit con Husky (incluido `lint-staged`) está documentado pero no se ha completado; el `.husky/pre-commit` actual cae a `pnpm lint` cuando `lint-staged` no está configurado.
- **[Prettier](https://prettier.io/docs/):** mantiene un formato consistente, a diferencia de las reglas de calidad de código de ESLint; no verifica comportamiento ni seguridad.

## Límite de integración

La interfaz comunica intenciones, la identidad autenticada identifica a quien actúa y las reglas del servidor determinan si esa persona puede operar sobre un recurso particular. La capa de persistencia conserva datos, sin convertir al cliente, al formulario o al ORM en autoridad clínica. Fuera de la decisión acotada de autenticación de la unidad 2, las decisiones de alojamiento, renderizado, servicios adicionales de Supabase y contratos de integración permanecen pendientes.