function apiOrigin(value) {
  const raw = value ?? 'http://127.0.0.1:3001';
  if (raw !== raw.trim() || raw.includes('\\') || /[\u0000-\u001f\u007f]/.test(raw))
    throw new Error('Invalid HISMIA_API_ORIGIN');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Invalid HISMIA_API_ORIGIN');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    (parsed.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    ![parsed.origin, `${parsed.origin}/`].includes(raw)
  )
    throw new Error('Invalid HISMIA_API_ORIGIN');
  return parsed.origin;
}

// Evaluated only by Next on the server. No user-controlled destination or catchall rewrite.
const origin = apiOrigin(process.env.HISMIA_API_ORIGIN);
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/hismia/auth/me', destination: `${origin}/auth/me` },
      { source: '/api/hismia/profiles/onboarding', destination: `${origin}/profiles/onboarding` },
    ];
  },
};
export default nextConfig;
