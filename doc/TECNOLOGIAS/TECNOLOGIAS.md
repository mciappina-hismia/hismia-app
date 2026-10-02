# Tecnologías mencionadas para Hismia

Estas descripciones presentan propósitos generales, no prueban que cada integración esté operativa ni deciden versiones, despliegue o configuración. El alcance está en [README.md](../README.md) y los límites conceptuales en [ARQUITECTURA.md](../ARQUITECTURA/ARQUITECTURA.md). Se consultaron referencias actuales de Husky, ESLint y Prettier para estas descripciones; las demás integraciones no se verificaron en esta tarea.

## Aplicación y lenguaje

- **[NestJS](https://docs.nestjs.com/):** marco para organizar aplicaciones de servidor, entradas HTTP y servicios. Su estructura no reemplaza las reglas de autorización por recurso.
- **[Next.js](https://nextjs.org/docs):** marco de aplicaciones web basado en React para las interfaces. Aquí no se elige una estrategia de renderizado ni de sesiones.
- **[TypeScript](https://www.typescriptlang.org/docs/):** lenguaje con tipado estático para expresar contratos en código; los tipos no validan por sí solos datos externos ni permisos.

## Identidad, datos y estado

- **[Supabase](https://supabase.com/docs):** plataforma que ofrece servicios de backend; su mención no implica elegir almacenamiento de archivos, tiempo real, funciones, alojamiento ni acceso directo del navegador a datos clínicos.
- **[Supabase Auth](https://supabase.com/docs/guides/auth):** gestiona autenticación e identidad de cuenta. Autenticarse no autoriza una historia clínica: propietario, grant, alcance, vigencia y autoría requieren verificaciones separadas.
- **[Prisma](https://www.prisma.io/docs):** herramienta para modelar y consultar datos persistentes. Persistir o leer mediante Prisma no propaga automáticamente grants de usuario ni garantiza la aplicación de políticas RLS; las fronteras efectivas de autorización deben comprobarse para cada ruta de acceso.
- **[Zustand](https://zustand.docs.pmnd.rs/):** gestiona estado de interfaz en el cliente; ese estado no constituye autoridad sobre permisos.

## Validación, presentación y pruebas

- **[Zod](https://zod.dev/):** describe y valida formas de datos en límites apropiados; validar datos en el cliente no otorga autorización y no reemplaza controles de servidor.
- **[Tailwind CSS](https://tailwindcss.com/docs):** utilidades para estilos de interfaz.
- **[shadcn/ui](https://ui.shadcn.com/docs):** componentes y patrones de interfaz; su presencia no define accesibilidad ni comportamientos específicos del producto.
- **[Jest](https://jestjs.io/docs/getting-started):** marco de pruebas automatizadas; la mención no acredita cobertura o pruebas ejecutadas.

## Calidad y automatización

- **[Husky](https://typicode.github.io/husky/):** gestiona hooks locales de Git que pueden ejecutar lint o pruebas antes de un commit o push; no sustituye CI ni garantiza seguridad.
- **CI/CD:** práctica de automatización: integración continua (CI) ejecuta comprobaciones al integrar cambios; entrega continua prepara versiones validadas para publicación con aprobación humana, mientras despliegue continuo las publica automáticamente sólo si se elige expresamente. No se ha seleccionado proveedor ni activado despliegue automático; publicar sigue requiriendo aprobación humana y estas prácticas no habilitan datos clínicos reales.
- **[ESLint](https://eslint.org/docs/latest/):** análisis estático para detectar patrones problemáticos según reglas configurables; su soporte y configuración para TypeScript están pendientes y no sustituye pruebas ni controles de seguridad.
- **[Prettier](https://prettier.io/docs/):** mantiene un formato consistente, a diferencia de las reglas de calidad de código de ESLint; no verifica comportamiento ni seguridad.

## Límite de integración

La interfaz comunica intenciones, la identidad autenticada identifica a quien actúa y las reglas del servidor determinan si esa persona puede operar sobre un recurso particular. La capa de persistencia conserva datos, sin convertir al cliente, al formulario o al ORM en autoridad clínica. Las decisiones de alojamiento, estrategia de renderizado, servicios adicionales de Supabase y contratos de integración permanecen pendientes.
