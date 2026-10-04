# Private profile onboarding persistence

`POST /profiles/onboarding` uses the existing confirmed-email AuthGuard and only
`user.sub`. The server validates strict shared profile variants against today's
UTC calendar date, additionally requiring a ten-character canonical birth date.
Patient adulthood follows the March-1 non-leap anniversary rule. A valid same-type
retry returns the original persisted profile; onboarding never edits a profile.
The response contains only variant fields and persisted timestamps, not identity
context, database details, verification state or account privileges.

## Connection and migration boundary

Pin Prisma CLI and client to 6.19.0. `prisma-client-js` supports this CommonJS API.
The backend lazily constructs its client from an explicit `DATABASE_URL`.
Missing/invalid configuration or storage failure returns sanitized HTTP 503;
health and auth do not require database configuration at startup.

Use a **separate migration owner** connection, never runtime credentials, to apply
`migrations/20260717000000_profiles/migration.sql`. This SQL requires database
ownership, schema creation and role creation authority. It creates the dedicated
NOLOGIN `hismia_profile_runtime` group; an existing group name is an error, not a
role to silently reuse. Keep schema/table ownership with the migration owner.
Provision a separate LOGIN credential with NOSUPERUSER, NOBYPASSRLS, NOCREATEDB,
NOCREATEROLE, NOREPLICATION, only membership in `hismia_profile_runtime`, and no
ownership or other grants/memberships. Supply that restricted credential to the
API through secure backend configuration; never send it to clients.

The SQL scopes revocations to the new private schema/type/table and grants CONNECT
to the new runtime group. It preserves existing database and `public` schema grants.
PostgreSQL PUBLIC privileges are inherited and cannot be denied per individual
role: existing CONNECT/TEMP and any public-schema CREATE rights remain effective.
This migration does not promise no temporary tables or no DDL outside
`profile_private`; the fresh-cluster tests explicitly acknowledge inherited TEMP.
**Inspect the actual target's effective grants, ownership, role memberships and
existing privileged functions, and provision a least-privilege LOGIN before any
remote readiness claim or separately authorized application.** Any required
changes to existing grants need separate approval; do not alter other roles or
shared schema permissions implicitly. No browser or Data API roles receive grants. Do not use ambient `DATABASE_URL` for migration commands,
`prisma db push`, or automatic migration at API boot. Local proof uses a fresh
dedicated database, not a shared or existing database. The parent recorded the
T3 profile schema/RLS migration and separate `hismia_api` role migration as applied
on authorized `hismia-dev` (`zfpnjsbxrgbcehmefozb`). Catalog checks confirmed
`hismia_api` remains NOLOGIN with only `hismia_profile_runtime` membership.
Credential provisioning and restricted backend connectivity proof remain pending;
local PostgreSQL behavior tests are not remote functional/race proof.

## Human-only private runtime setup

Run from the canonical repository root in a **private, unrecorded terminal**, not
chat, an agent tool, terminal capture or screen sharing. A TTY check cannot detect
recording software. No helper preparation, live check or API start has been run as
part of this source change. No account/profile data is seeded or inserted.

1. Generate the real restricted credential locally (human only):

   ```sh
   env -i PATH="$PATH" HOME="$HOME" node apps/api/scripts/private-runtime.mjs prepare
   ```

   Requires TTY stdin/stdout and trusted, owned, non-group/world-writable canonical
   checkout parents. It exclusively creates owner-only `0600` files
   `apps/api/.env.runtime.local` (only DATABASE_URL) and
   `apps/api/.env.runtime.provision.sql` (SCRAM verifier-based SQL). Both are already
   Git-ignored. Never print, commit, paste into chat or expose either file: **the
   verifier is also a credential**. No existing file is overwritten, no symlink is
   followed, and nothing is chmodded or deleted. `FAIL PREPARE_PARTIAL` means at
   least one target may exist, including incomplete content; stop and inspect
   privately. There is no automatic cleanup or retry/rotation workflow.

2. Open the private provisioning SQL locally in a private editor (including its
   clipboard/history/backups), and execute it only in the authorized **hismia-dev /
   zfpnjsbxrgbcehmefozb** Supabase dashboard SQL editor, outside all agent/browser
   capture. No postgres administrator password or password reset is needed. The
   transaction guards the existing restricted role/membership/private privileges
   and forced RLS, then changes **only `hismia_api` password and LOGIN**. It rejects
   missing/unexpected or already-enabled roles rather than rotating them. Do not
   provision concurrently with another operator. Clear the SQL editor and private
   clipboard/history before authorizing any browser observation; dashboard query
   history itself contains sensitive verifier material. Confirm completion without
   sharing contents.
3. For the official Supabase Root2021 public CA only, after independent source
   verification, run exactly once from a private terminal with a clean environment:

   ```sh
   env -i PATH="$PATH" HOME="$HOME" node apps/api/scripts/private-runtime.mjs configure-ca --ack-ca-config /Users/mauroociappina/Downloads/prod-ca-2021.crt
   ```

   This is an explicitly acknowledged local config update, **not** a password
   rotation, SQL provisioning, network operation, or retry authorization. It
   requires the canonical absolute regular owner-controlled certificate, rejects
   symlinks, private-key material, malformed/multiple certificates and any
   fingerprint other than
   `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
   The helper reads the existing owner-only config privately, constructs only
   the canonical percent-encoded absolute `sslcert` parameter while preserving
   the credential, fixed host/database/options, `sslmode=require` and
   `sslaccept=strict`. It creates a same-directory exclusive owner-only staging
   file, fsyncs, rechecks the original and CA, renames over the exact config and
   syncs the directory. It never creates a credential backup or changes the
   provisioning SQL. On `FAIL CONFIG`, stop; a failure after rename may have
   applied the update despite the failure label. Recovery is a private human
   decision, not automatic re-preparation or rollback. To reverse deliberately,
   an authorized operator must privately re-establish an independently verified
   strict-CA configuration; removing `sslcert` is not an approved TLS fallback.
   Portable same-UID filesystem races cannot be fully eliminated.

4. Only after configuration, independent verification and the separately
   authorized **single** remote-read-only check (no automatic retry):

   ```sh
   env -i PATH="$PATH" HOME="$HOME" node apps/api/scripts/private-runtime.mjs check --ack-remote-read-only
   ```

   This reads only the exact private runtime config, validates ownership, regular
   file, single link, mode and canonical URL before network, and uses installed
   Prisma 6.19.0 with `log: []`. It refuses generated Prisma dotenv paths before
   importing the client. The bounded read-only transaction checks database/user,
   role attributes/membership/ownership, private effective grants, FORCE/ENABLE
   RLS, absent/empty subject and a bounded EXISTS visibility query (no rows printed).
   It always attempts disconnect. Failures emit only fixed stage labels:
   `FAIL CLIENT` (construction/import), `FAIL TRANSACTION_P1000`,
   `_P1001`, `_P1002`, `_P1003`, `_P1011`, `_P1017`, `_P2024`, or `_P2028`
   (fixed allowlisted Prisma code for a pre-callback transaction rejection),
   `FAIL TRANSACTION_UNKNOWN` (any other pre-callback rejection),
   `FAIL READ_ONLY` (transaction
   setup), `FAIL CATALOG`, `FAIL VISIBILITY`, or `FAIL DISCONNECT` (overrides
   any earlier failure). These labels are diagnostic stages, not raw errors or
   proof of a specific root cause. `PASS CHECK` occurs only after all assertions
   and disconnect succeed; it is restricted Prisma connectivity/catalog/no-context
   proof, **not full HTTP
   flow, onboarding, remote race proof or deployment readiness**.

5. Optionally start **only the API**, after the operator privately supplies the
   existing real Supabase auth environment (`SUPABASE_PROJECT_URL`,
   `SUPABASE_ANON_KEY`, `SUPABASE_JWKS_URL`, `SUPABASE_ISSUER`,
   `SUPABASE_AUDIENCE`), without printing it or changing auth credentials:

   ```sh
   node apps/api/scripts/private-runtime.mjs start --ack-api-listener
   ```

   This passes the private URL only in the allowlisted child environment to fixed
   `pnpm --filter @hismia/api dev`, never root recursive dev or frontend. No URL is
   in argv; no migration is run. Child stdin/stdout/stderr are suppressed because
   arbitrary framework errors may contain credentials. The helper waits for exit
   and reports only `PASS API_EXIT` or failure, never readiness from spawn.
   The unchanged API listener binds **0.0.0.0**, not loopback: use a trusted network
   and appropriate host firewall. Stop through the private terminal and verify
   process shutdown separately. This helper is not a daemon/process supervisor.

The fixed Session pooler endpoint is
`aws-0-sa-east-1.pooler.supabase.com:5432`, database `postgres`, transport username
`hismia_api.zfpnjsbxrgbcehmefozb`, actual database role `hismia_api`.
Prisma 6 uses `sslmode=require&sslaccept=strict`, a pool of two, and five-second
connect/pool timeouts. No TLS bypass or privileged postgres template is accepted.
The config parser permits exactly one canonical unquoted DATABASE_URL line, not
shell evaluation, extra keys or URL options. Inherited DB/PG/Prisma, Node injection,
TLS override and diagnostic environments are rejected; unrelated keys are not
forwarded to the child. Start requires an otherwise clean operator environment.

Use a trusted checkout, dependencies and PATH, with no concurrent same-user file
mutation: portable Node path checks cannot defeat a hostile same-UID process
racing parent-directory replacements. Files remain local sensitive credentials;
Git-ignore is not encryption or protection from backups or other same-user tools.
Keep the disposable local database harness below separate: **never point it at
Supabase**. Helper tests use fixed nonsecret values and fake IO/client/children,
not real private files, application data or remote services.

## Local synthetic Prisma TLS diagnostic (T3L1)

After source review, run from the repository root with installed dependencies and OpenSSL:

```sh
env -i PATH="$PATH" HOME=/dev/null node apps/api/scripts/prisma-tls-local.mjs --ack-local-synthetic
```

This creates a fresh, owner-only retained directory under
`apps/api/node_modules/.cache/prisma-tls/` containing synthetic CA/private keys,
CSR, certificate and configuration. Do not commit its contents; no automatic
cleanup or trust-store import occurs. It binds only numeric loopback on an
ephemeral port, responds to a PostgreSQL SSLRequest and sends a fixed synthetic
authentication rejection after TLS startup; it never requests a password or
executes SQL. Output is finite JSON with case labels, TLS/startup counts, owned-listener
close acknowledgement and allowlisted error codes, not raw exception text.
Failures emit only a finite stage label (environment, client resolution,
generated source, metadata, artifact directory, certificate generation, listener,
control, client, disconnect or owned close); the 60-second owned-process watchdog
emits `WATCHDOG_TIMEOUT` and exits nonzero. Stage labels locate an attempt, not
its underlying cause. Stop on setup failure or timeout.
The synthetic server leaf includes IP `127.0.0.1` SAN and `serverAuth` EKU.
Node control has its own listener and bounded graceful TLS close: `controlTls`
counts its server handshake separately from each fresh Prisma listener's `tls`
and `startup` counts. Node authorization alone does not establish server-side
handshake completion; a Prisma startup count is stronger native-path evidence.
The Node control and Prisma correct/wrong/missing CA comparisons diagnose local
engine TLS behavior only; a handshake is **not** successful database authentication,
a query, remote trust-chain proof or runtime readiness. This does not authorize
another remote credential or database retry.

## Isolation and concurrency

`profile_private.profiles` is one scalar table with TEXT subject primary key,
closed enum category, DATE birth date and persisted timestamps. CHECK constraints
explicitly require variant fields (NULL must not bypass a check), prohibit other
variant fields, reject blank text and restrict gender to `mujer`, `varón`,
`no binario`, `otra identidad`, `prefiero no informar`. No speculative Auth FK,
clinical data, teams, admin or verified flags exist.

Explicit runtime grants are CONNECT, private schema/type USAGE, SELECT and INSERT;
existing PUBLIC privileges remain inherited. No private-schema CREATE or profile
UPDATE/DELETE/TRUNCATE rights are granted. ENABLE and
FORCE RLS restrict SELECT USING and INSERT WITH CHECK to a nonempty transaction
context. Prisma does **not** inherit `auth.uid()` from Supabase JWTs. The backend
sets `hismia.subject` through parameterized `set_config(..., true)` inside the same
READ COMMITTED transaction, inserts with `ON CONFLICT(subject) DO NOTHING`, then
uses a **separate SELECT statement** so its new snapshot sees a committed winner.
The unique key arbitrates races; no select-before-create or overwrite upsert is
used. The service compares the winner's type and returns HTTP 409 for a conflict.
Rollback releases a contender to insert its own profile. No UPDATE/DELETE policy
or grant is present.

This context is a **trusted backend boundary**, not a defense against compromised
runtime DB credentials: holders can set arbitrary context. RLS protects against
missing context and accidental cross-subject queries, not a hostile credential
holder. Database roles are not account privileges.

## Checks without a database

Use cleared environments, synthetic auth settings and no `.env` files. Commands
run from the repository root:

- `pnpm --filter @hismia/api exec prisma validate --schema prisma/schema.prisma`
- `pnpm --filter @hismia/api exec prisma generate --schema prisma/schema.prisma`
- `pnpm --filter @hismia/api exec vitest run src/profiles`
- `pnpm --filter @hismia/api test`
- Package builds, API lint and scoped formatting checks.

For Prisma validate/generate, explicitly set a synthetic unreachable URL, such as
`DATABASE_URL=postgresql://synthetic:synthetic@localhost:1/synthetic` in `env -i`.
These commands do not migrate or connect. Default API tests include only `src`;
repository tests mock the transaction boundary, while route tests override
persistence. They are not actual PostgreSQL/RLS proof.

## Separate real PostgreSQL proof

Only an actor explicitly authorized to create/start/stop the disposable cluster
may execute:

```sh
env -i PATH="$PATH" HOME="$HOME" node apps/api/prisma/run-local-database-tests.mjs
```

The harness uses installed PostgreSQL 18 tools at
`/opt/homebrew/opt/postgresql@18/bin`, never Homebrew's default cluster, an existing
database or a service manager. It records a unique fresh root under
`apps/api/node_modules/.cache/pg/<8-hex-id>`, rejects symlink parents
and existing targets, and creates private directories. TCP is disabled and the
Unix socket stays in that root. **The absolute socket filename must fit the
platform's Unix-socket limit** (the harness conservatively enforces <104 bytes).
The short `pg` output directory fits the current canonical checkout without moving
the repository or using external sockets. Other overlong checkout paths still
fail closed before PostgreSQL startup; never use TCP or a remote fallback.

Bootstrap trust is confined to the private local socket during fresh role setup,
then replaced with SCRAM authentication before owner migration/runtime tests.
Passwords are randomly generated synthetic test values, passed only to children,
not logged or written to source. The owner applies the exact migration; behavior
tests connect only as restricted runtime. The owner test client is confined to
catalog/schema/role assertions. Explicit test URLs are validated against the
recorded root/socket/role/database; no ambient PG/DATABASE environment or dotenv
fallback is used. The standalone Vitest config never silently skips missing proof.

The harness waits for foreground children, handles SIGINT/SIGTERM by terminating
only recorded child processes, then stops only the exact recorded data directory
with `pg_ctl` in `finally`. It reports stop evidence or an exact PID/data-directory
blocker if stop cannot be established. **No files or directories are deleted**:
ignored synthetic database/log artifacts are retained with their output path for
optional human cleanup later. Unit/build-only implementation actors must not run
this harness. Database checks remain pending until the authorized actor observes
them passing and observes exact cluster stop evidence.
