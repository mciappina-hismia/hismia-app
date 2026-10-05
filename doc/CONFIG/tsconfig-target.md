# Configuración objetivo del `tsconfig.json`

> **Estado:** esta política aplica a los configs existentes `tsconfig.base.json`, `apps/api/tsconfig.json` y `apps/front/tsconfig.json`. Toda desviación respecto de esta tabla requiere justificación documentada.

## Política estricta

| Opción | Valor | Por qué |
|---|---|---|
| `strict` | `true` | Habilita la familia de reglas estrictas. |
| `noUncheckedIndexedAccess` | `true` | Obliga a comprobar `undefined` al indexar. |
| `exactOptionalPropertyTypes` | `true` | Distingue `prop?: T` de `prop: T \| undefined`. |
| `noImplicitOverride` | `true` | Obliga a usar `override` en subclases. |
| `noImplicitReturns` | `true` | Evita retornos implícitos `undefined`. |
| `useUnknownInCatchVariables` | `true` | `catch (e)` es `unknown`, no `any`. |
| `noUnusedLocals` / `noUnusedParameters` | `true` | No permite código muerto. |
| `verbatimModuleSyntax` | `true` | `import type` para tipos puros; excepción de API justificada abajo. |
| `moduleResolution` | `Bundler` (web/compartidos), `NodeNext` (API) | Resolver según el consumidor y la emisión, no por usar `tsc`. |

## Propuesta acotada: API sin bundler

La API ejecuta la salida de `tsc` directamente en Node. Usar el par
`module: NodeNext` / `moduleResolution: NodeNext` en `apps/api/tsconfig.json`
evita el alias legado `Node` → `Node10` y respeta los `exports` públicos.
Frontend y base compartida conservan `ESNext` / `Bundler`; no trasladarles
la política de ejecución del servidor.

- **CommonJS por paquete:** ni el paquete raíz ni el de API declaran
  `type: module`; los archivos `.ts` de API siguen emitiendo CommonJS con
  imports relativos sin extensión. NodeNext no es una migración a ESM.
- **Excepciones existentes de Nest:** `verbatimModuleSyntax: false` permite
  transformar imports/exports a CommonJS; `experimentalDecorators: true` y
  `emitDecoratorMetadata: true` conservan decoradores y metadatos de inyección.
  Las reglas estrictas de la tabla siguen aplicándose sin relajación.
- **Preservar:** target ES2022, interop, `src`/`dist`, declaraciones y mapas.
  No añadir `ignoreDeprecations`: TypeScript instalado 5.9.3 no reproduce el
  aviso de TS6/editor y rechaza el valor `6.0`.
- **Límite de compatibilidad:** NodeNext modela `require(esm)` moderno para
  el import estático existente de `jose`; Node16 no es la alternativa.
  La comprobación local usa Node 22.22.3, no acredita todos los runtimes.
  El engine raíz `>=20.0.0` frente al mínimo moderno de `jose` y los paquetes
  compartidos con salida ESM sin marcador explícito son brechas preexistentes.
  No modificar auth, engines ni formatos compartidos en esta unidad.

Verificar la configuración heredada, emisión CommonJS/decoradores, exports
reales y conservación de `import()` con `node --test apps/api/tsconfig.test.mjs`;
no usar aliases de Vitest ni iniciar la aplicación.

## Buenas prácticas

- **Validar antes que tipar:** Zod en el límite, no `any` ni confianza ciega. Los tipos solos no evitan datos inválidos.
- **`readonly` cuando aplica** en modelos inmutables como historiales clínicos.
- **Evitar `any`:** errores no controlados se tipan como `unknown` y se estrechan con `instanceof` o Zod.
- **Tipos sincronizados con cambios:** si se toca un esquema, regenerar tipos antes de commitear. No commitear con tipos desincronizados.

## Origen de tipos

Cuando se inicialice el monorepo:

- **`packages/types`** y **`packages/validation`** exponen tipos y esquemas Zod compartidos entre frontend y backend. Los tipos de grants, autorización, validación de entrada y modelos compartidos deben vivir ahí. Hoy no existen.