-- Apply with a separate migration owner on an explicitly approved database.
-- Role collision deliberately fails: never inherit an existing role's privileges.
CREATE ROLE hismia_profile_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA profile_private;
REVOKE ALL ON SCHEMA profile_private FROM PUBLIC;
-- Preserve existing database/public-schema grants, including inherited PUBLIC rights.
DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hismia_profile_runtime', current_database());
END $$;
CREATE TYPE profile_private."AccountType" AS ENUM ('patient', 'professional', 'institution');
REVOKE ALL ON TYPE profile_private."AccountType" FROM PUBLIC;
CREATE TABLE profile_private.profiles (
  subject TEXT PRIMARY KEY CHECK (subject ~ '[^[:space:]]'),
  "accountType" profile_private."AccountType" NOT NULL,
  "displayName" TEXT,
  "birthDate" DATE,
  gender TEXT,
  "residenceLocality" TEXT,
  specialty TEXT,
  "practiceLocality" TEXT,
  name TEXT,
  type TEXT,
  location TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT profile_variant CHECK (
    ("accountType" = 'patient'
      AND "displayName" IS NOT NULL AND "birthDate" IS NOT NULL
      AND "residenceLocality" IS NOT NULL
      AND specialty IS NULL AND "practiceLocality" IS NULL
      AND name IS NULL AND type IS NULL AND location IS NULL)
    OR ("accountType" = 'professional'
      AND "displayName" IS NOT NULL AND specialty IS NOT NULL AND "practiceLocality" IS NOT NULL
      AND "birthDate" IS NULL AND gender IS NULL AND "residenceLocality" IS NULL
      AND name IS NULL AND type IS NULL AND location IS NULL)
    OR ("accountType" = 'institution'
      AND name IS NOT NULL AND type IS NOT NULL AND location IS NOT NULL
      AND "displayName" IS NULL AND "birthDate" IS NULL AND gender IS NULL
      AND "residenceLocality" IS NULL AND specialty IS NULL AND "practiceLocality" IS NULL)
  ),
  CONSTRAINT profile_nonblank CHECK (
    ("displayName" IS NULL OR "displayName" ~ '[^[:space:]]')
    AND ("residenceLocality" IS NULL OR "residenceLocality" ~ '[^[:space:]]')
    AND (specialty IS NULL OR specialty ~ '[^[:space:]]')
    AND ("practiceLocality" IS NULL OR "practiceLocality" ~ '[^[:space:]]')
    AND (name IS NULL OR name ~ '[^[:space:]]')
    AND (type IS NULL OR type ~ '[^[:space:]]')
    AND (location IS NULL OR location ~ '[^[:space:]]')
  ),
  CONSTRAINT profile_gender CHECK (gender IS NULL OR gender IN
    ('mujer', 'varón', 'no binario', 'otra identidad', 'prefiero no informar')),
  CONSTRAINT profile_birth_date CHECK ("birthDate" IS NULL OR
    ("birthDate" >= DATE '0001-01-01' AND "birthDate" <= DATE '9999-12-31'))
);
REVOKE ALL ON TABLE profile_private.profiles FROM PUBLIC;
GRANT USAGE ON SCHEMA profile_private TO hismia_profile_runtime;
GRANT USAGE ON TYPE profile_private."AccountType" TO hismia_profile_runtime;
GRANT SELECT, INSERT ON TABLE profile_private.profiles TO hismia_profile_runtime;
ALTER TABLE profile_private.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_private.profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY own_profile_select ON profile_private.profiles FOR SELECT
  TO hismia_profile_runtime
  USING (subject = NULLIF(current_setting('hismia.subject', true), ''));
CREATE POLICY own_profile_insert ON profile_private.profiles FOR INSERT
  TO hismia_profile_runtime
  WITH CHECK (subject = NULLIF(current_setting('hismia.subject', true), ''));
