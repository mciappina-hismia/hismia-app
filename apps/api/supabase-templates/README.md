# Supabase email templates

HTML templates for Supabase Auth emails, hand-built to match the visual
language in [`doc/DESIGN/DESIGN.md`](../../../doc/DESIGN/DESIGN.md).

## Source of truth

`doc/DESIGN/DESIGN.md` is the single source of truth for colors,
typography, and spacing. The templates use the light palette only
(patient mode default). Tokens used inline:

| Token                    | Hex       | Used for                |
| ------------------------ | --------- | ----------------------- |
| `--color-bg`             | `#fbfefd` | body background         |
| `--color-card`           | `#ffffff` | card background         |
| `--color-primary`        | `#1e8d80` | eyebrow / accent text   |
| `--color-primary-strong` | `#00615a` | button background       |
| `--color-primary-text`   | `#fafffd` | button text             |
| `--color-fg`             | `#0c2422` | body text               |
| `--color-muted`          | `#5b6d6d` | helper text, fine print |
| `--color-heading`        | `#15456f` | h1, link fallback       |
| `--color-border`         | `#dce7e5` | card border, divider    |

The dark palette and alternative palettes (Rosa, Celeste, Violeta,
Azul fuerte) are documented in DESIGN.md but not applied to email
templates yet — most clients render email against a white background
regardless of the receiver's UI theme.

## Files

- `confirmation.html` — signup confirmation email.
- `password_recovery.html` — TBD (use the same shell; replace the
  h1, body copy, and `{{ .ConfirmationURL }}` → `{{ .ConfirmationURL }}`
  variable name — Supabase reuses the same URL field for password
  recovery).
- `email_change.html` — TBD.
- `magic_link.html` — TBD.

## Applying the templates to the Supabase dashboard

You must be logged into the Hismia Supabase project (`zfpnjsbxrgbcehmefozb`)
as a user with the `Owner` or `Admin` role.

1. Go to **Authentication → Email Templates**.
2. Select the template you want to customize (e.g. **Confirm signup**).
3. Replace the existing HTML body with the contents of the corresponding
   `*.html` file in this directory. Supabase expects the HTML only (no
   `<!doctype>`, no `<html>`, no `<body>`); the file is already structured
   that way.
4. Click **Save**.
5. Test by signing up a new user against the dev project
   (`hismia-dev`). The email should arrive with the new branding.

## Go-template variables available

Supabase substitutes these at send time:

- `{{ .ConfirmationURL }}` — the link the user clicks to confirm.
  Must be present in the body as an `<a href>`.
- `{{ .SiteURL }}` — the configured Site URL (used to build the
  "re-send confirmation" link).
- `{{ .Email }}` — the recipient's email address.
- `{{ .Token }}` — raw token (rarely needed in HTML; Supabase uses
  ConfirmationURL under the hood).

## Custom SMTP follow-up

These templates work on top of Supabase's default SMTP. A future
follow-up (see issue TBD) will move to a custom SMTP provider
(SendGrid / Resend / Amazon SES) so that:

- Templates are version-controlled alongside the rest of the code.
- Tests can run against a snapshot of the rendered HTML.
- Bounce / deliverability / DKIM are managed in one place.

That work is tracked separately and is not part of this PR.

## Constraints

- CSS is inline only. `<style>` in `<head>` is stripped by most
  clients (Gmail in particular).
- Remote font loading is unreliable; the templates request Plus
  Jakarta Sans with a `system-ui` fallback.
- Keep the max width at `560px`. Wider emails render poorly on
  narrow clients.
- Avoid background images. Many clients block them.
- Contrast ratios verified against `doc/DESIGN/DESIGN.md` §Matriz de
  contraste WCAG (light). White text on `#00615a` button bg is
  7.27:1, well past AA-large. Helper text on `#fbfefd` bg is 5.37:1,
  past AA-normal.
