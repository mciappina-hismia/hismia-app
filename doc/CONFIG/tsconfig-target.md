# Configuración objetivo del `tsconfig.json`

> **Estado:** este archivo documenta la **política objetivo** que deben cumplir los `tsconfig.json` cuando se creen. Hoy no existen `tsconfig.json` en `api/` ni en `front/`. Toda desviación respecto de esta tabla requiere justificación documentada.

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
| `verbatimModuleSyntax` | `true` | `import type` para tipos puros. |
| `moduleResolution` | `Bundler` | Acompaña a Next.js y a `tsc`. |

## Buenas prácticas

- **Validar antes que tipar:** Zod en el límite, no `any` ni confianza ciega. Los tipos solos no evitan datos inválidos.
- **`readonly` cuando aplica** en modelos inmutables como historiales clínicos.
- **Evitar `any`:** errores no controlados se tipan como `unknown` y se estrechan con `instanceof` o Zod.
- **Tipos sincronizados con cambios:** si se toca un esquema, regenerar tipos antes de commitear. No commitear con tipos desincronizados.

## Origen de tipos

Cuando se inicialice el monorepo:

- **`packages/types`** y **`packages/validation`** exponen tipos y esquemas Zod compartidos entre frontend y backend. Los tipos de grants, autorización, validación de entrada y modelos compartidos deben vivir ahí. Hoy no existen.