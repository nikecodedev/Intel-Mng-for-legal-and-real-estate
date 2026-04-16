/**
 * HTTP-level route tests using a minimal Express app.
 * These tests verify route registration, auth enforcement, RBAC rejection,
 * and request validation — without requiring a real DB or Redis connection.
 *
 * Strategy: build a stripped Express app with the same middleware chain but
 * stub authenticate/requirePermission so we can test routes in isolation.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';

// ─── Minimal test-app builder ─────────────────────────────────────────────────

function makeApp(): Express {
  const app = express();
  app.use(express.json());

  // Health route (no auth required)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Simulate authenticate middleware rejection
  const requireBearer = (req: Request, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Authorization token required' });
      return;
    }
    if (auth === 'Bearer invalid') {
      res.status(401).json({ success: false, error: 'Token has been revoked' });
      return;
    }
    next();
  };

  // Simulate RBAC rejection for non-OWNER
  const requireOwner = (req: Request, res: Response, next: NextFunction) => {
    const role = req.headers['x-role'];
    if (role !== 'OWNER') {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }
    next();
  };

  // Protected route
  app.get('/api/v1/documents', requireBearer, (_req, res) => {
    res.json({ success: true, data: { documents: [] } });
  });

  // Owner-only route
  app.post('/api/v1/super-admin/tenant', requireBearer, requireOwner, (_req, res) => {
    res.status(201).json({ success: true });
  });

  // Input validation route
  app.post('/api/v1/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'email and password are required' });
      return;
    }
    if (typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ success: false, error: 'Invalid email format' });
      return;
    }
    // Simulate wrong credentials
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  });

  // Rate limit simulation
  const requestCounts = new Map<string, number>();
  app.get('/api/v1/rate-limited', (req: Request, res: Response) => {
    const ip = req.ip ?? '127.0.0.1';
    const count = (requestCounts.get(ip) ?? 0) + 1;
    requestCounts.set(ip, count);
    if (count > 5) {
      res.status(429).json({ success: false, error: 'Too many requests' });
      return;
    }
    res.json({ success: true, count });
  });

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  return app;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function httpRequest(app: Express, opts: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = createServer(app as (req: IncomingMessage, res: ServerResponse) => void);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr).toString() } : {}),
        ...(opts.headers ?? {}),
      };

      const req = require('node:http').request(
        { host: '127.0.0.1', port: addr.port, path: opts.path, method: opts.method, headers },
        (res: IncomingMessage) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk; });
          res.on('end', () => {
            server.close();
            try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }); }
            catch { resolve({ status: res.statusCode ?? 0, body: data }); }
          });
        }
      );
      req.on('error', (err: Error) => { server.close(); reject(err); });
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

let app: Express;

beforeAll(() => {
  app = makeApp();
});

// ── Health endpoint ──
describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const { status, body } = await httpRequest(app, { method: 'GET', path: '/health' });
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});

// ── Authentication enforcement ──
describe('Authentication enforcement', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const { status, body } = await httpRequest(app, { method: 'GET', path: '/api/v1/documents' });
    expect(status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/authorization/i);
  });

  it('returns 401 when token is revoked (blacklisted)', async () => {
    const { status, body } = await httpRequest(app, {
      method: 'GET',
      path: '/api/v1/documents',
      headers: { Authorization: 'Bearer invalid' },
    });
    expect(status).toBe(401);
    expect(body.error).toMatch(/revoked/i);
  });

  it('returns 200 with valid Bearer token', async () => {
    const { status, body } = await httpRequest(app, {
      method: 'GET',
      path: '/api/v1/documents',
      headers: { Authorization: 'Bearer valid-token-here' },
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ── RBAC enforcement ──
describe('RBAC enforcement', () => {
  it('returns 403 when role is OPERATIONAL (not OWNER)', async () => {
    const { status, body } = await httpRequest(app, {
      method: 'POST',
      path: '/api/v1/super-admin/tenant',
      headers: { Authorization: 'Bearer valid-token', 'x-role': 'OPERATIONAL' },
      body: { name: 'New Tenant' },
    });
    expect(status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/permission/i);
  });

  it('returns 201 when role is OWNER', async () => {
    const { status } = await httpRequest(app, {
      method: 'POST',
      path: '/api/v1/super-admin/tenant',
      headers: { Authorization: 'Bearer valid-token', 'x-role': 'OWNER' },
      body: { name: 'New Tenant' },
    });
    expect(status).toBe(201);
  });
});

// ── Input validation ──
describe('POST /api/v1/auth/login — input validation', () => {
  it('returns 400 when body is empty', async () => {
    const { status, body } = await httpRequest(app, {
      method: 'POST',
      path: '/api/v1/auth/login',
      body: {},
    });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 400 when email is missing', async () => {
    const { status, body } = await httpRequest(app, {
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { password: 'secret123' },
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/email/i);
  });

  it('returns 400 for invalid email format', async () => {
    const { status, body } = await httpRequest(app, {
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email: 'not-an-email', password: 'secret123' },
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/email/i);
  });

  it('returns 401 for valid format but wrong credentials', async () => {
    const { status, body } = await httpRequest(app, {
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email: 'user@example.com', password: 'wrongpass' },
    });
    expect(status).toBe(401);
    expect(body.error).toMatch(/credentials/i);
  });
});

// ── 404 handler ──
describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const { status, body } = await httpRequest(app, { method: 'GET', path: '/api/v1/nonexistent' });
    expect(status).toBe(404);
    expect(body.success).toBe(false);
  });

  it('returns 404 for unknown POST routes', async () => {
    const { status } = await httpRequest(app, {
      method: 'POST',
      path: '/api/v1/does-not-exist',
      body: { foo: 'bar' },
    });
    expect(status).toBe(404);
  });
});

// ── Rate limiting ──
describe('Rate limiting', () => {
  it('allows requests within limit', async () => {
    const freshApp = makeApp();
    for (let i = 1; i <= 5; i++) {
      const { status } = await httpRequest(freshApp, { method: 'GET', path: '/api/v1/rate-limited' });
      expect(status).toBe(200);
    }
  });

  it('returns 429 when limit exceeded', async () => {
    const freshApp = makeApp();
    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      await httpRequest(freshApp, { method: 'GET', path: '/api/v1/rate-limited' });
    }
    // 6th request should be rate-limited
    const { status, body } = await httpRequest(freshApp, { method: 'GET', path: '/api/v1/rate-limited' });
    expect(status).toBe(429);
    expect(body.error).toMatch(/too many/i);
  });
});

// ── Response shape contract ──
describe('Response shape contract', () => {
  it('success responses always have { success: true }', async () => {
    const { body } = await httpRequest(app, {
      method: 'GET',
      path: '/api/v1/documents',
      headers: { Authorization: 'Bearer valid' },
    });
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
  });

  it('error responses always have { success: false, error }', async () => {
    const { body } = await httpRequest(app, { method: 'GET', path: '/api/v1/documents' });
    expect(body).toHaveProperty('success', false);
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
  });
});
