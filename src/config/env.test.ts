/**
 * Tests for API base URL validation and fallback semantics (#335)
 *
 * Verifies that:
 *   - development and test environments silently fall back to localhost:2333
 *     when NEXT_PUBLIC_API_BASE_URL is not set.
 *   - production throws a clear, actionable error when the URL is absent or
 *     not a valid HTTP/HTTPS URL.
 *   - an explicitly configured URL is used as-is in every environment.
 *   - env.API_BASE_URL is the single source of truth (no independent fallback
 *     duplicate in api.ts).
 *
 * NODE_ENV is frozen to 'test' by Vitest and cannot be changed at runtime.
 * validateEnv() and validateApiBaseUrl() therefore accept an optional nodeEnv
 * parameter that the tests use to exercise each environment path without
 * mutating the process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers — manage NEXT_PUBLIC_API_BASE_URL across tests
// ---------------------------------------------------------------------------

const ORIGINAL_API_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

function setApiUrl(url: string | undefined) {
  if (url !== undefined) {
    process.env.NEXT_PUBLIC_API_BASE_URL = url;
  } else {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  }
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  setApiUrl(ORIGINAL_API_URL);
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// validateEnv — environment-aware required-var check
// ---------------------------------------------------------------------------

describe('validateEnv — environment-aware required-var check', () => {
  it('does not throw in development when NEXT_PUBLIC_API_BASE_URL is absent', async () => {
    setApiUrl(undefined);
    const { validateEnv } = await import('./env');
    expect(() => validateEnv('development')).not.toThrow();
  });

  it('does not throw in test when NEXT_PUBLIC_API_BASE_URL is absent', async () => {
    setApiUrl(undefined);
    const { validateEnv } = await import('./env');
    expect(() => validateEnv('test')).not.toThrow();
  });

  it('throws in production when NEXT_PUBLIC_API_BASE_URL is absent', async () => {
    setApiUrl(undefined);
    const { validateEnv } = await import('./env');
    expect(() => validateEnv('production')).toThrow(/NEXT_PUBLIC_API_BASE_URL/);
  });

  it('error message references .env.local', async () => {
    setApiUrl(undefined);
    const { validateEnv } = await import('./env');
    expect(() => validateEnv('production')).toThrow(/\.env\.local/);
  });

  it('does not throw in production when NEXT_PUBLIC_API_BASE_URL is set', async () => {
    setApiUrl('https://api.example.com');
    const { validateEnv } = await import('./env');
    expect(() => validateEnv('production')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateApiBaseUrl — URL format and presence validation
// ---------------------------------------------------------------------------

describe('validateApiBaseUrl — development/test: localhost fallback is silent', () => {
  it('does not throw in development when env var is absent (localhost fallback)', async () => {
    setApiUrl(undefined);
    const { validateApiBaseUrl } = await import('./env');
    // Pass the fallback URL and development nodeEnv directly
    expect(() => validateApiBaseUrl('http://localhost:2333', 'development')).not.toThrow();
  });

  it('does not throw in test when env var is absent (localhost fallback)', async () => {
    setApiUrl(undefined);
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('http://localhost:2333', 'test')).not.toThrow();
  });

  it('does not throw in development when a valid http URL is explicitly configured', async () => {
    setApiUrl('http://localhost:4000');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('http://localhost:4000', 'development')).not.toThrow();
  });
});

describe('validateApiBaseUrl — production: missing URL is fatal', () => {
  it('throws when URL is empty string', async () => {
    setApiUrl(undefined);
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('', 'production')).toThrow(/NEXT_PUBLIC_API_BASE_URL is not set/);
  });

  it('error message references docs/TROUBLESHOOTING.md', async () => {
    setApiUrl(undefined);
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('', 'production')).toThrow(/docs\/TROUBLESHOOTING\.md/);
  });

  it('does not throw when a valid https URL is configured', async () => {
    setApiUrl('https://api.example.com');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('https://api.example.com', 'production')).not.toThrow();
  });

  it('does not throw when a valid http URL is configured', async () => {
    setApiUrl('http://internal-api.corp.example');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('http://internal-api.corp.example', 'production')).not.toThrow();
  });
});

describe('validateApiBaseUrl — invalid URL format rejected in any environment', () => {
  it('throws for a non-http/https protocol (ftp) in development', async () => {
    setApiUrl('ftp://bad-protocol.example.com');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('ftp://bad-protocol.example.com', 'development'))
      .toThrow(/not a valid HTTP or HTTPS URL/);
  });

  it('throws for a non-http/https protocol (ftp) in production', async () => {
    setApiUrl('ftp://bad-protocol.example.com');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('ftp://bad-protocol.example.com', 'production'))
      .toThrow(/not a valid HTTP or HTTPS URL/);
  });

  it('throws for a totally malformed URL in test', async () => {
    setApiUrl('not-a-url-at-all');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('not-a-url-at-all', 'test'))
      .toThrow(/not a valid HTTP or HTTPS URL/);
  });

  it('throws for a ws:// URL in development', async () => {
    setApiUrl('ws://bad');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('ws://bad', 'development'))
      .toThrow(/not a valid HTTP or HTTPS URL/);
  });

  it('error message includes the offending URL value', async () => {
    setApiUrl('ftp://bad.example.com');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('ftp://bad.example.com', 'development'))
      .toThrow(/ftp:\/\/bad\.example\.com/);
  });

  it('error message references docs/TROUBLESHOOTING.md', async () => {
    setApiUrl('ws://bad');
    const { validateApiBaseUrl } = await import('./env');
    expect(() => validateApiBaseUrl('ws://bad', 'development'))
      .toThrow(/docs\/TROUBLESHOOTING\.md/);
  });
});

// ---------------------------------------------------------------------------
// env.API_BASE_URL — resolveApiBaseUrl fallback semantics
// (NODE_ENV is frozen to 'test' in Vitest; only the test-mode fallback path
//  can be verified via module re-import. The production path is covered by
//  validateApiBaseUrl tests above which pass '' for the production scenario.)
// ---------------------------------------------------------------------------

describe('env.API_BASE_URL — fallback in test environment', () => {
  it('uses the configured URL when NEXT_PUBLIC_API_BASE_URL is set', async () => {
    setApiUrl('http://my-backend:4000');
    const { env } = await import('./env');
    expect(env.API_BASE_URL).toBe('http://my-backend:4000');
  });

  it('falls back to localhost:2333 in test when env var is absent', async () => {
    setApiUrl(undefined);
    const { env } = await import('./env');
    expect(env.API_BASE_URL).toBe('http://localhost:2333');
  });
});

// ---------------------------------------------------------------------------
// env object — shape invariants (frozen to test environment in Vitest)
// ---------------------------------------------------------------------------

describe('env object — shape invariants', () => {
  it('IS_TEST is true since Vitest always runs with NODE_ENV=test', async () => {
    setApiUrl(undefined);
    const { env } = await import('./env');
    expect(env.IS_TEST).toBe(true);
    expect(env.IS_PRODUCTION).toBe(false);
    expect(env.IS_DEVELOPMENT).toBe(false);
  });

  it('NODE_ENV reflects the actual process.env.NODE_ENV value', async () => {
    setApiUrl(undefined);
    const { env } = await import('./env');
    expect(env.NODE_ENV).toBe(process.env.NODE_ENV);
  });
});
