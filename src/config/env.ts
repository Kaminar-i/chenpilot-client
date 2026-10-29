// Environment configuration for ChenPilot client

const _isDev  = process.env.NODE_ENV === 'development';
const _isTest = process.env.NODE_ENV === 'test';

/**
 * Resolve the API base URL with environment-aware fallback semantics.
 *
 * - Development / test: silently fall back to http://localhost:2333 so the
 *   dev server starts without a .env.local file.
 * - Production: return the raw env var value (possibly undefined/empty) so
 *   callers — and validateApiBaseUrl() — can detect misconfiguration
 *   rather than silently sending production traffic to localhost.
 */
function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return configured;
  if (_isDev || _isTest) return 'http://localhost:2333';
  // Production with no URL set: return empty string so validateApiBaseUrl
  // throws a clear error instead of silently hitting localhost.
  return '';
}

export const env = {
  // API Configuration
  API_BASE_URL: resolveApiBaseUrl(),

  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',

  // Application Configuration
  APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'ChenPilot',
  APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK || '',

  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_TEST: process.env.NODE_ENV === 'test',
} as const;

/**
 * Validate that required environment variables are present.
 *
 * In development and test the check is skipped — the localhost fallback in
 * resolveApiBaseUrl() is intentional and keeps the dev server startable
 * without a .env.local file. In production every variable in the required
 * list must be explicitly set.
 *
 * @param nodeEnv - Override NODE_ENV for testing. Defaults to process.env.NODE_ENV.
 */
export const validateEnv = (nodeEnv = process.env.NODE_ENV) => {
  if (nodeEnv !== 'production') return;

  const required = [
    'NEXT_PUBLIC_API_BASE_URL',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    const missingKeys = missing.join(', ');
    throw new Error(
      `[Env Config Error] Missing required environment variable(s): ${missingKeys}.\n` +
      `Please create or update your '.env.local' file in the project root with valid settings (e.g. NEXT_PUBLIC_API_BASE_URL=http://localhost:2333).\n` +
      `For help troubleshooting environment configuration, see docs/TROUBLESHOOTING.md.`
    );
  }
};

/**
 * Validate that API_BASE_URL is a well-formed HTTP or HTTPS URL.
 *
 * Called automatically at server startup (see bottom of this file).
 * May also be called from the API client to surface misconfiguration early.
 *
 * In development and test the check is skipped when the value equals the
 * localhost fallback, so a missing .env.local never blocks the dev server.
 * In production any missing or non-HTTP(S) value is a fatal startup error.
 *
 * An explicitly configured URL that uses a non-HTTP(S) protocol is rejected
 * in every environment, including development and test.
 *
 * @param url     - URL to validate. Defaults to env.API_BASE_URL.
 * @param nodeEnv - Override NODE_ENV for testing. Defaults to process.env.NODE_ENV.
 *
 * @throws {Error} When the URL is absent in production, or not a valid
 *   HTTP/HTTPS URL in any environment where an explicit value was configured.
 */
export const validateApiBaseUrl = (
  url    = env.API_BASE_URL,
  nodeEnv = process.env.NODE_ENV,
) => {
  const isProd = nodeEnv === 'production';
  const isDevOrTest = !isProd;

  // Dev/test with the automatic localhost fallback — skip validation entirely.
  if (isDevOrTest && url === 'http://localhost:2333' && !process.env.NEXT_PUBLIC_API_BASE_URL) {
    return;
  }

  if (!url) {
    throw new Error(
      `[Env Config Error] NEXT_PUBLIC_API_BASE_URL is not set.\n` +
      `In production every deployment must set this variable to the backend API origin.\n` +
      `For help troubleshooting environment configuration, see docs/TROUBLESHOOTING.md.`
    );
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('invalid protocol');
    }
  } catch {
    throw new Error(
      `[Env Config Error] NEXT_PUBLIC_API_BASE_URL is not a valid HTTP or HTTPS URL: "${url}".\n` +
      `Expected a value such as https://api.example.com or http://localhost:2333.\n` +
      `For help troubleshooting environment configuration, see docs/TROUBLESHOOTING.md.`
    );
  }
};

// Initialize environment validation at server startup.
// Both checks run only on the server (typeof window === 'undefined') so they
// never fire in the browser bundle.
if (typeof window === 'undefined') {
  validateEnv();
  validateApiBaseUrl();
}

/**
 * Returns the Horizon proxy base URL.
 *
 * `window.location.origin` is only available in the browser, so it cannot be
 * read at module-initialisation time (the `env` object is frozen once the
 * module is imported). This function defers the read to the call site so it
 * always reflects the real origin in the browser and safely falls back to the
 * relative path `/horizon` during server-side rendering or in restricted
 * environments (e.g. WebViews that expose no `window`).
 *
 * @returns Absolute Horizon proxy URL in the browser; relative path on the server.
 */
export function getHorizonProxyUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/horizon`;
  }
  return '/horizon';
}
