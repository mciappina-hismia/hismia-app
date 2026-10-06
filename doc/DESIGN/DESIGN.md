# Diseño de Interfaz - Hismia

> Paletas de color, tipografía y guías de uso para la interfaz de usuario de Hismia.

## Paciente — modo claro (por defecto)

### Rol: Paciente

| Concepto                | Hex       | Uso / Comentario                                              |
| ----------------------- | --------- | ------------------------------------------------------------- |
| Fondo                   | `#fbfefd` | Fondo general de la aplicación                                |
| Tarjetas / Blancos      | `#ffffff` | Fondos de tarjetas, modales, inputs                           |
| Primario (turquesa)     | `#1e8d80` | Botones primarios, enlaces activos                            |
| Primario fuerte (hover) | `#00615a` | Estado hover/press de botones primarios                       |
| Primario suave (fondos) | `#ddf7f0` | Fondos secundarios, barras, tarjetas destacadas               |
| Texto sobre primario    | `#fafffd` | Texto (íconos, letras) sobre fondos primarios                 |
| Secundario (fondo)      | `#e5f6f0` | Fondos de elementos menos prominentes                         |
| Secundario (texto)      | `#12403c` | Texto sobre fondos secundarios                                |
| Acento (fondo)          | `#caf2e7` | Badges, chips, indicadores menores                            |
| Acento (texto)          | `#003f3b` | Texto sobre fondos de acento                                  |
| Texto principal         | `#0c2422` | Texto cuerpo, párrafos, lectura larga                         |
| Texto apagado / ayudas  | `#5b6d6d` | Placeholder, texto de ayuda, labels deshabilitados            |
| Títulos (azul marino)   | `#15456f` | Encabezados H1-H6, títulos de sección                         |
| Bordes                  | `#dce7e5` | Bordes de tarjetas, inputs, contenedores                      |
| Bordes de inputs        | `#c6dad7` | Bordes específicos de campos de entrada                       |
| Fondo de inputs         | `#f5fcfa` | Fondo interno de inputs                                       |
| Foco (anillo)           | `#1e8d80` | Anillo de foco en elementos interactivos (igual que primario) |

### Rol: Profesional (área pro, azul marino como base)

| Concepto           | Hex       | Uso / Comentario                                                  |
| ------------------ | --------- | ----------------------------------------------------------------- |
| Primario           | `#15456f` | Azul marino, usado como color primario en la interfaz profesional |
| Primario fuerte    | `#023259` | Estado hover/press                                                |
| Primario suave     | `#e4f0fd` | Fondos suaves, barras laterales                                   |
| Secundario (fondo) | `#ddf7f0` | Mismo que secundario suave de paciente                            |
| Secundario (texto) | `#00544e` | Texto sobre fondos secundarios profesionales                      |
| Bordes             | `#d3e0ec` | Bordes en interfaz profesional                                    |
| Barra lateral      | `#f3faff` | Fondo de barra lateral en modo profesional                        |

### Colores de estado (idénticos para ambos roles)

| Estado            | Hex       | Fondo suave (opcional) | Uso                                          |
| ----------------- | --------- | ---------------------- | -------------------------------------------- |
| Éxito             | `#31a773` |                        | Indicadores de éxito, validación positiva    |
| Advertencia       | `#e8ab3e` |                        | Alertas no críticas, avisos                  |
| Emergencia / rojo | `#cf3f4c` | `#ffedeb`              | Errores críticos, estados de falla           |
| Rosa embarazo     | `#ea808f` |                        | Seguimiento de embarazo, eventos específicos |

### Gráficos

Se utilizan las siguientes paletas en orden para series de datos:

- `#1e8d80` (turquesa primario)
- `#4fad83` (verde suave)
- `#57b1d4` (azul claro)
- `#e8ab3e` (amarillo advertencia)
- `#9372c8` (lila)

### Marca

- Logo: `#09396a` (His) y `#32c0b4` (Me)
- Estos valores se repiten en textos del home y otros elementos de marca.

## Paletas alternativas (Accesibilidad → Tema de color)

Seleccionables desde el menú de accesibilidad. Cada palette define un **tono fuerte** y un **fondo suave**.

| Palette     | Tono fuerte | Fondo suave |
| ----------- | ----------- | ----------- |
| Rosa        | `#902558`   | `#ffe9f2`   |
| Celeste     | `#0195ca`   | `#e0f7ff`   |
| Violeta     | `#7e5acc`   | `#f3e8ff`   |
| Azul fuerte | `#2858cd`   | `#d0e4ff`   |

> **Aceptación antes del release:** las paletas alternativas se certifican contra WCAG 2.1 AA/AAA en la sección `## Matriz de contraste WCAG (light)` de este mismo documento. Cualquier par por debajo de AA está listado en la sub-sección `### Gaps WCAG AA documentados` con su tratamiento.

## Alto contraste (si se activa)

| Concepto   | Hex       |
| ---------- | --------- |
| Fondo      | `#ffffff` |
| Texto      | `#090909` |
| Primario   | `#01345e` |
| Bordes     | `#4d5660` |
| Emergencia | `#a9000c` |

## Paleta dark (V1, sin toggle UI)

> **Estado V1**: la **paleta dark está documentada** (decisión CTO 2026-09-18, [`phase-01-decisions.md`](./plans/implementation/phase-01-decisions.md) §Decisión #2) y la matriz WCAG light queda certificada arriba. La **integración en runtime** (bloque `.dark` en `apps/front/src/app/globals.css`, `ThemeProvider` con `next-themes`, export de tokens a `tailwind.config.*`) está **pendiente de implementación**; no hay `apps/front/src/app/globals.css` ni `next-themes` en `apps/front/package.json` todavía. No afirmar implementación hasta que esos archivos existan.
>
> Toggle UI NO expuesto en release V1 (forward-compatibilidad de tokens sin requerir switch de UI; toggle UI opcional V2).

### Tokens dark (24)

| Token                    | Hex       | Uso                             |
| ------------------------ | --------- | ------------------------------- |
| `--color-bg`             | `#0c1115` | Fondo general                   |
| `--color-card`           | `#161b22` | Tarjetas / modales              |
| `--color-input`          | `#0e1318` | Fondo de inputs                 |
| `--color-sidebar`        | `#0a0e12` | Barra lateral                   |
| `--color-border`         | `#2d333b` | Bordes                          |
| `--color-input-border`   | `#373e47` | Bordes de inputs                |
| `--color-fg`             | `#e6edf3` | Texto principal                 |
| `--color-muted`          | `#8b949e` | Texto apagado                   |
| `--color-heading`        | `#79c0ff` | Títulos (azul claro)            |
| `--color-primary`        | `#58c5b0` | Turquesa claro (botón primario) |
| `--color-primary-strong` | `#7ad6c4` | Hover/press primario            |
| `--color-primary-soft`   | `#0e2a26` | Fondo suave turquesa            |
| `--color-primary-text`   | `#0a0e12` | Texto sobre primario            |
| `--color-secondary`      | `#1a2520` | Fondo secundario                |
| `--color-secondary-text` | `#b4e3d8` | Texto secundario                |
| `--color-accent`         | `#1f3833` | Fondo acento                    |
| `--color-accent-text`    | `#a3dccd` | Texto acento                    |
| `--color-success`        | `#3fb950` | Éxito                           |
| `--color-warning`        | `#d29922` | Advertencia                     |
| `--color-danger`         | `#f85149` | Emergencia                      |
| `--color-danger-soft`    | `#2d1416` | Fondo suave emergencia          |
| `--color-pregnancy`      | `#e87b8e` | Rosa embarazo                   |
| `--color-brand-his`      | `#79c0ff` | Logo His (= heading)            |
| `--color-brand-me`       | `#7ee8da` | Logo Me                         |

> **Método**: luminancia relativa WCAG 2.1 (sRGB → lineal con gamma 2.4). Ratios validados para texto "normal" (< 18pt o < 14pt bold) y "large" (≥ 18pt o ≥ 14pt bold).

## Tipografía

- **Familia**: Plus Jakarta Sans
- **Uso**: Título, cuerpo, etiquetas, inputs, etc.

## Mecanismo de tokens elegido

Tras evaluar las opciones (Tailwind CSS v4 vs. CSS variables) y considerando que el proyecto adoptará **Tailwind CSS v4** y **shadcn/ui** cuando se implemente el frontend, se decidió:

- **`docs/design.md` es la única fuente de verdad de los tokens de diseño.**
- Los valores definidos en este documento se mantienen acá y, cuando exista frontend, se exportarán a la configuración de Tailwind del build bajo la sección `theme.extend.colors`.
- De esta forma, las clases de utilidad de Tailwind (`bg-primary`, `text-primary-text`, `hover:bg-primary-strong`, etc.) estarán disponibles en todo el proyecto sin necesidad de CSS variables adicionales.
- Cualquier cambio debe reflejarse primero en este documento y luego en la configuración de Tailwind cuando exista.

### Cómo generar el archivo de configuración cuando se implemente el frontend

> **No existe `tailwind.config.{js,ts}` en este repo todavía**. Este archivo se crea cuando se inicializa el frontend.

Pasos a seguir cuando se llegue a ese punto:

1. Inicializar el proyecto frontend con el framework elegido.
2. Instalar Tailwind CSS siguiendo la guía oficial de la versión adoptada.
3. Crear `tailwind.config.{js,ts}` en la raíz del frontend.
4. Copiar los valores de las secciones "Paciente — modo claro", "Profesional", "Colores de estado", "Gráficos", "Marca", "Paletas alternativas" y "Alto contraste" de este documento a `theme.extend.colors` del config.
5. Verificar contraste WCAG y nombres semánticos antes de mergear.
6. Mantener este documento sincronizado ante cualquier cambio de tokens.

> **Importante**: `docs/design.md` es la única fuente de verdad de los tokens. Cuando exista configuración de Tailwind, mantener ambos sincronizados al modificar un valor de color.

## Matriz de contraste WCAG (light)

> **Modo único vigente en V1**: este documento certifica la paleta light only. La paleta dark es **out-of-scope** aquí y se documenta dentro de **Task 0.34** (`docs/plans/task.md` + `phase-01-monorepo.md`).
>
> **Método**: luminancia relativa WCAG 2.1 (sRGB → lineal con gamma 2.4). Ratios calculados para texto **normal** (< 18pt o < 14pt bold) y **large** (≥ 18pt o ≥ 14pt bold). Bordes UI decorativos bajo WCAG 1.4.11 (Non-text Contrast) requieren 3:1 sólo cuando son el único indicador visual — los pares listados como `UI` aquí son decorativos. **Trazabilidad**: cualquier cambio futuro de tokens debe revalidar la matriz o este certificado se invalida.

### Texto (jerarquía)

| Par                                        | FG        | BG        | Tamaño | Ratio   | AA  | AAA |
| ------------------------------------------ | --------- | --------- | ------ | ------- | --- | --- |
| Texto principal cuerpo sobre fondo general | `#0c2422` | `#fbfefd` | normal | 16.03:1 | ✅  | ✅  |
| Texto principal cuerpo sobre tarjeta       | `#0c2422` | `#ffffff` | normal | 16.27:1 | ✅  | ✅  |
| Texto principal cuerpo sobre input         | `#0c2422` | `#f5fcfa` | normal | 15.64:1 | ✅  | ✅  |
| Texto apagado/ayudas sobre fondo general   | `#5b6d6d` | `#fbfefd` | normal | 5.37:1  | ✅  | ⚠️  |
| Texto apagado/ayudas sobre tarjeta         | `#5b6d6d` | `#ffffff` | normal | 5.45:1  | ✅  | ⚠️  |
| Títulos (H1-H6) sobre fondo general        | `#15456f` | `#fbfefd` | large  | 9.80:1  | ✅  | ✅  |
| Títulos (H1-H6) sobre tarjeta              | `#15456f` | `#ffffff` | large  | 9.94:1  | ✅  | ✅  |
| Texto secundario sobre fondo secundario    | `#12403c` | `#e5f6f0` | normal | 10.29:1 | ✅  | ✅  |
| Texto acento sobre fondo acento            | `#003f3b` | `#caf2e7` | normal | 9.79:1  | ✅  | ✅  |

### Primario / Interactivo (botones, foco)

| Par                                                 | FG        | BG        | Tamaño | Ratio   | AA  | AAA |
| --------------------------------------------------- | --------- | --------- | ------ | ------- | --- | --- |
| Primario turquesa (botón) sobre fondo general       | `#1e8d80` | `#fbfefd` | normal | 4.00:1  | ❌  | ❌  |
| Texto sobre primario (botón primario)               | `#fafffd` | `#1e8d80` | large  | 4.02:1  | ✅  | ⚠️  |
| Texto sobre primario fuerte (hover)                 | `#fafffd` | `#00615a` | large  | 7.27:1  | ✅  | ✅  |
| Primario fuerte profesional sobre fondo claro       | `#023259` | `#f3faff` | normal | 12.43:1 | ✅  | ✅  |
| Texto secundario profesional sobre fondo secundario | `#00544e` | `#ddf7f0` | normal | 7.84:1  | ✅  | ✅  |
| Anillo de foco sobre fondo general                  | `#1e8d80` | `#fbfefd` | UI     | 4.00:1  | ⚠️  | ❌  |

### Estados (semánticos)

| Par                                | FG        | BG        | Tamaño | Ratio  | AA  | AAA |
| ---------------------------------- | --------- | --------- | ------ | ------ | --- | --- |
| Éxito sobre fondo blanco           | `#31a773` | `#ffffff` | normal | 3.04:1 | ❌  | ❌  |
| Advertencia sobre blanco           | `#e8ab3e` | `#ffffff` | normal | 2.03:1 | ❌  | ❌  |
| Emergencia sobre fondo blanco      | `#cf3f4c` | `#ffffff` | normal | 4.70:1 | ✅  | ⚠️  |
| Emergencia texto sobre fondo suave | `#cf3f4c` | `#ffedeb` | normal | 4.15:1 | ❌  | ❌  |
| Rosa embarazo sobre fondo blanco   | `#ea808f` | `#ffffff` | normal | 2.63:1 | ❌  | ❌  |

### Marca y logos

| Par                         | FG        | BG        | Tamaño | Ratio   | AA  | AAA |
| --------------------------- | --------- | --------- | ------ | ------- | --- | --- |
| Logo His sobre fondo blanco | `#09396a` | `#ffffff` | large  | 11.63:1 | ✅  | ✅  |
| Logo Me sobre fondo blanco  | `#32c0b4` | `#ffffff` | large  | 2.25:1  | ❌  | ❌  |

### Paletas alternativas (accesibilidad)

| Par                                     | FG        | BG        | Tamaño | Ratio  | AA  | AAA |
| --------------------------------------- | --------- | --------- | ------ | ------ | --- | --- |
| Rosa (tono fuerte / fondo suave)        | `#902558` | `#ffe9f2` | normal | 7.02:1 | ✅  | ✅  |
| Celeste (tono fuerte / fondo suave)     | `#0195ca` | `#e0f7ff` | normal | 3.07:1 | ❌  | ❌  |
| Violeta (tono fuerte / fondo suave)     | `#7e5acc` | `#f3e8ff` | normal | 4.22:1 | ❌  | ❌  |
| Azul fuerte (tono fuerte / fondo suave) | `#2858cd` | `#d0e4ff` | normal | 4.82:1 | ✅  | ⚠️  |

### Alto contraste (si se activa)

| Par                    | FG        | BG        | Tamaño | Ratio   | AA  | AAA |
| ---------------------- | --------- | --------- | ------ | ------- | --- | --- |
| Texto sobre fondo      | `#090909` | `#ffffff` | normal | 19.91:1 | ✅  | ✅  |
| Emergencia sobre fondo | `#a9000c` | `#ffffff` | normal | 7.80:1  | ✅  | ✅  |
| Primario sobre fondo   | `#01345e` | `#ffffff` | normal | 12.70:1 | ✅  | ✅  |

### Bordes (decorativos)

| Par                                       | FG        | BG        | Tipo | Ratio  | Notas                                                                                  |
| ----------------------------------------- | --------- | --------- | ---- | ------ | -------------------------------------------------------------------------------------- |
| Bordes generales (tarjetas, contenedores) | `#dce7e5` | `#ffffff` | UI   | 1.26:1 | Decorativo; exento WCAG 1.4.11 (no es único indicador; se refuerza con anillo de foco) |
| Bordes de inputs                          | `#c6dad7` | `#f5fcfa` | UI   | 1.40:1 | Decorativo; se refuerza con anillo de foco `#1e8d80`                                   |

### Gaps WCAG AA documentados

> Estos pares **no pasan AA** con la paleta actual. Un ícono + texto evita depender sólo del color (SC 1.4.1), pero **no corrige contraste insuficiente** (SC 1.4.3). Para texto normal se exige al menos 4.5:1; para íconos informativos se verifica por separado SC 1.4.11. En autenticación y onboarding light se reutiliza texto secundario fuerte `#12403c` para éxito sobre tarjeta blanca (más de 10:1), y primario fuerte `#00615a` para botones con texto `#fafffd` (más de 7:1). El indicador de éxito `#31a773` conserva su valor, pero no se usa para texto normal sobre blanco. Estas verificaciones de pares no certifican toda la UI; teclado, lector de pantalla y navegador requieren evidencia adicional.

| #   | Par                                                                           | Ratio  | AA  | AAA | Tratamiento propuesto                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------- | ------ | --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Primario turquesa `#1e8d80` sobre fondo general                               | 4.00:1 | ❌  | ❌  | Solo UI decorativo (botón con texto blanco encima, no como color de texto sobre fondo). El texto sobre primario usa `#fafffd` (4.02:1 large → AA ✅). Restricción a documentar en Guía de uso. |
| G2  | Éxito `#31a773` sobre blanco                                                  | 3.04:1 | ❌  | ❌  | Texto de éxito en `#12403c` sobre blanco; reservar `#31a773` para indicadores con contraste no textual verificado. Ícono + texto no exime SC 1.4.3.                                            |
| G3  | Advertencia `#e8ab3e` sobre blanco                                            | 2.03:1 | ❌  | ❌  | Texto en un tono fuerte con >=4.5:1 sobre su fondo; ícono + texto no corrige el contraste de este par.                                                                                         |
| G4  | Emergencia `#cf3f4c` sobre fondo suave `#ffedeb`                              | 4.15:1 | ❌  | ❌  | Usar texto blanco sobre emergencia sólido (4.70:1 AA ✅) en lugar del fondo suave `#ffedeb`. Documentar restricción.                                                                           |
| G5  | Rosa embarazo `#ea808f` sobre blanco                                          | 2.63:1 | ❌  | ❌  | No usar como texto normal; acompañar con texto fuerte y verificar por separado los indicadores informativos.                                                                                   |
| G6  | Logo Me `#32c0b4` sobre blanco                                                | 2.25:1 | ❌  | ❌  | Logo decorativo: WCAG exime logos que no transmiten información funcional. Solo se usa en marca (home), no como UI element informativo.                                                        |
| G7  | Paletas alternativas Celeste (3.07:1) y Violeta (4.22:1) sobre su fondo suave | —      | ❌  | ❌  | Solo como tono fuerte de badge/UI, no como color de texto. Documentar restricción.                                                                                                             |

### Veredicto global light (V1)

- ✅ **Texto principal + títulos + colores semánticos fuertes** (secundario, acento, primario fuerte, logo His) → **AAA consistente** (9.8:1 a 16.3:1).
- ⚠️ **Texto apagado + emergencia sobre blanco + paleta Rosa** → AA pero no AAA (5.4:1, 4.7:1, 7.0:1 respectivamente). Aceptable V1 con monitoreo; upgrade a AAA es nice-to-have.
- ❌ **7 gaps AA** listados arriba → SC 1.4.1 (ícono + texto) no resuelve SC 1.4.3. Reutilizar tonos fuertes para texto y verificar cada par real antes de afirmar conformidad.
- 📋 **Cerrado en Task 0.34** ([PR #351](https://github.com/Hismia-gh/hismia-architecture/pull/351)): tokens semánticos implementados con `next-themes` + bloque `.dark` en `apps/web/src/app/globals.css`. Ver `## Paleta dark (V1, sin toggle UI)` y `## Matriz de contraste WCAG (dark)` arriba/abajo.

## Matriz de contraste WCAG (dark)

> **Aplicación**: tokens del bloque `.dark` en `apps/web/src/app/globals.css` cuando `next-themes` aplica `class="dark"` al `<html>`. Sin toggle UI en V1 (forward-compatibilidad).
>
> **Comparación con light**: la paleta dark **resuelve 4 gaps AA** de la paleta light (G1 Primario, G2 Éxito, G3 Advertencia, G6 Logo Me). Ver tabla "Gaps WCAG AA resueltos" al final.

### Tabla de pares (dark)

| Par                                       | FG        | BG        | Tamaño | Ratio   | AA     | AAA |
| ----------------------------------------- | --------- | --------- | ------ | ------- | ------ | --- |
| Texto principal sobre fondo general       | `#e6edf3` | `#0c1115` | normal | 16.06:1 | ✅     | ✅  |
| Texto principal sobre tarjeta             | `#e6edf3` | `#161b22` | normal | 14.64:1 | ✅     | ✅  |
| Texto principal sobre input               | `#e6edf3` | `#0e1318` | normal | 15.80:1 | ✅     | ✅  |
| Texto apagado/ayudas sobre fondo          | `#8b949e` | `#0c1115` | normal | 6.17:1  | ✅     | ⚠️  |
| Texto apagado/ayudas sobre tarjeta        | `#8b949e` | `#161b22` | normal | 5.62:1  | ✅     | ⚠️  |
| Títulos (H1-H6) sobre fondo               | `#79c0ff` | `#0c1115` | large  | 9.76:1  | ✅     | ✅  |
| Títulos (H1-H6) sobre tarjeta             | `#79c0ff` | `#161b22` | large  | 8.89:1  | ✅     | ✅  |
| Primario (turquesa claro) sobre fondo     | `#58c5b0` | `#0c1115` | normal | 9.06:1  | ✅     | ✅  |
| Primario fuerte sobre fondo               | `#7ad6c4` | `#0c1115` | normal | 11.06:1 | ✅     | ✅  |
| Texto sobre primario (botón)              | `#0a0e12` | `#58c5b0` | large  | 9.25:1  | ✅     | ✅  |
| Texto sobre primario fuerte (hover)       | `#0a0e12` | `#7ad6c4` | large  | 11.29:1 | ✅     | ✅  |
| Texto secundario sobre fondo secundario   | `#b4e3d8` | `#1a2520` | normal | 11.22:1 | ✅     | ✅  |
| Texto acento sobre fondo acento           | `#a3dccd` | `#1f3833` | normal | 8.18:1  | ✅     | ✅  |
| Heading (azul claro) sobre fondo          | `#79c0ff` | `#0c1115` | large  | 9.76:1  | ✅     | ✅  |
| Éxito sobre fondo                         | `#3fb950` | `#161b22` | normal | 6.81:1  | ✅     | ⚠️  |
| Advertencia sobre fondo                   | `#d29922` | `#161b22` | normal | 6.85:1  | ✅     | ⚠️  |
| Emergencia sobre fondo                    | `#f85149` | `#161b22` | normal | 5.16:1  | ✅     | ⚠️  |
| Emergencia texto sobre fondo suave dark   | `#f85149` | `#2d1416` | normal | 5.12:1  | ✅     | ⚠️  |
| Rosa embarazo sobre fondo                 | `#e87b8e` | `#0c1115` | normal | 6.92:1  | ✅     | ⚠️  |
| Logo His sobre fondo                      | `#79c0ff` | `#0c1115` | large  | 9.76:1  | ✅     | ✅  |
| Logo Me sobre fondo                       | `#7ee8da` | `#0c1115` | large  | 13.05:1 | ✅     | ✅  |
| Bordes sobre fondo (decorativo)           | `#2d333b` | `#0c1115` | UI     | 1.49:1  | exento | ❌  |
| Bordes de inputs sobre input (decorativo) | `#373e47` | `#0e1318` | UI     | 1.73:1  | exento | ❌  |

### Gaps WCAG AA resueltos (light → dark)

| Par                           | Light ratio    | Dark ratio | Δ      | Gap resuelto |
| ----------------------------- | -------------- | ---------- | ------ | ------------ |
| Primario turquesa sobre fondo | 4.00:1 ❌      | 9.06:1 ✅  | +5.06  | **G1**       |
| Texto sobre primario (botón)  | 4.02:1 (large) | 9.25:1 ✅  | +5.23  | mejorado     |
| Éxito sobre fondo             | 3.04:1 ❌      | 6.81:1 ✅  | +3.77  | **G2**       |
| Advertencia sobre fondo       | 2.03:1 ❌      | 6.85:1 ✅  | +4.82  | **G3**       |
| Logo Me sobre fondo           | 2.25:1 ❌      | 13.05:1 ✅ | +10.80 | **G6**       |

### Veredicto global dark (V1)

- ✅ **Texto principal + títulos + colores semánticos fuertes** → **AAA consistente** (8.2:1 a 16.1:1).
- ⚠️ **Texto apagado + estados semánticos** (éxito/advertencia/emergencia/rosa) → **AA pero no AAA** (5.1:1 a 6.9:1). Aceptable V1 con monitoreo.
- ✅ **Cero gaps AA en dark** (5 de los 7 gaps light resueltos en dark; G4 y G5 dependen de uso, no de paleta).
- 📋 **Bordes decorativos exentos** (WCAG 1.4.11, igual que light).

> **Trazabilidad**: cualquier cambio futuro de tokens en `.dark` debe revalidar la matriz. Cambios sin revalidar invalidan este certificado.

## Breakpoints responsive (Task 0.36)

Tokens previstos en `apps/front/src/app/globals.css` (`@theme`) cuando se inicialice Tailwind v4 CSS-first. No hay `tailwind.config.*` todavía; la sección queda como **pendiente de implementación** hasta que `apps/front/src/app/globals.css` exista.

| Segmento    | Viewport       | Clase Tailwind         | Token                           |
| ----------- | -------------- | ---------------------- | ------------------------------- |
| **Mobile**  | `<640px`       | (default, sin prefijo) | por debajo de `--breakpoint-sm` |
| **Tablet**  | `640px–1023px` | `sm:` … below `lg:`    | `--breakpoint-sm` (40rem)       |
| **Desktop** | `≥1024px`      | `lg:` y superiores     | `--breakpoint-lg` (64rem)       |

Ejemplo: `class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"` — 1 columna en mobile, 2 en tablet, 3 en desktop.

## Touch targets (accesibilidad)

- **Mínimo**: 44×44 CSS px en controles interactivos primarios (botones, icon buttons, toggles).
- **Token**: `--spacing-touch: 2.75rem` (44px) en `@theme`.
- **Implementación V1**: `@hismia/ui` `Button` debe usar `min-h-touch` / `size-touch` en todas las variantes de tamaño. Pendiente hasta que `@hismia/ui` exista en `packages/`.
- **Referencia**: WCAG 2.5.5 Target Size (Enhanced); Apple Human Interface Guidelines.
- **Tests**: contract tests Task 0.36; axe en CI se delega a Task 16.163.

## Guía de uso

1. **Primario y secundario**: Use el primario para acciones principales y el secundario para fondos de menor énfasis.
2. **Texto sobre fondos**: Siempre verifique contraste según WCAG AA/AAA. Los valores provistos han sido revisados para contraste mínimo.
3. **Estados**: Los colores de estado deben usarse solo para su significado semántico (éxito, advertencia, error, embarazo).
4. **Borde y foco**: El borde de inputs y el anillo de foco deben mantener consistencia para accesibilidad.
5. **Modos de rol**: Cambie la paleta primaria según el rol del usuario (paciente vs profesional) manteniendo los colores de estado y neutros.
6. **Paletas alternativas**: Ofrezca al menos cuatro opciones adicionales para usuarios con necesidades de contraste o preferencias personales.
7. **Alto contraste**: Active automáticamente cuando el sistema solicite contraste aumentado o mediante toggle de accesibilidad.
