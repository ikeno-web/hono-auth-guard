# hono-auth-guard

[![npm version](https://img.shields.io/npm/v/hono-auth-guard.svg)](https://www.npmjs.com/package/hono-auth-guard)
[![CI](https://github.com/ikeno-web/hono-auth-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/ikeno-web/hono-auth-guard/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/ikeno-web/hono-auth-guard/branch/main/graph/badge.svg)](https://codecov.io/gh/ikeno-web/hono-auth-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/hono-auth-guard)](https://bundlephobia.com/package/hono-auth-guard)

**Type-safe, zero-dependency auth middleware for [Hono](https://hono.dev) + Cloudflare Workers.**

Drop-in JWT verification, API key authentication, and OAuth token validation -- all built on Web Crypto API with no external runtime dependencies.

```
npm install hono-auth-guard
```

---

## Why hono-auth-guard?

- **Zero runtime dependencies** -- only `hono` as a peer dependency
- **Built for Workers** -- uses Web Crypto API natively, no Node.js polyfills
- **Type-safe** -- generic claims with full IntelliSense support
- **Tree-shakeable** -- import only what you need (`/jwt`, `/api-key`, `/oauth`)
- **Tiny** -- under 10KB gzipped (core)
- **RFC 7807 errors** -- standards-compliant problem detail responses
- **Composable** -- `compose()` (AND) and `either()` (OR) guard combinators

---

## Quick Start

### JWT Authentication

```typescript
import { Hono } from 'hono'
import { jwtGuard } from 'hono-auth-guard/jwt'

type Env = { Bindings: { JWT_SECRET: string } }
const app = new Hono<Env>()

app.use('/api/*', (c, next) => {
  const guard = jwtGuard({ secret: c.env.JWT_SECRET })
  return guard(c, next)
})

app.get('/api/me', (c) => {
  const auth = c.get('auth')  // fully typed AuthInfo
  return c.json({ userId: auth.subject })
})

export default app
```

### API Key Authentication

```typescript
import { apiKeyGuard } from 'hono-auth-guard/api-key'

app.use('/webhook/*', apiKeyGuard({
  headerName: 'X-API-Key',
  validate: async (key) => {
    const record = await env.API_KEYS_KV.get(key)
    return record ? JSON.parse(record).clientId : false
  },
}))
```

### Multiple Auth Methods (OR)

Accept either JWT or API key:

```typescript
import { either } from 'hono-auth-guard'
import { jwtGuard } from 'hono-auth-guard/jwt'
import { apiKeyGuard } from 'hono-auth-guard/api-key'

app.use('/api/*', either(
  jwtGuard({ secret: env.JWT_SECRET }),
  apiKeyGuard({ keys: env.API_KEYS.split(',') })
))
```

### Guard Composition (AND)

Require JWT **and** admin role:

```typescript
import { compose } from 'hono-auth-guard'
import { jwtGuard } from 'hono-auth-guard/jwt'

app.use('/admin/*', compose(
  jwtGuard({ secret: env.JWT_SECRET }),
  jwtGuard({
    secret: env.JWT_SECRET,
    validateClaims: (claims) => claims.role === 'admin',
  })
))
```

---

## API Overview

### Guards

| Guard | Import Path | Description |
|-------|-------------|-------------|
| `jwtGuard()` | `hono-auth-guard/jwt` | JWT verification (HS256 / RS256) |
| `apiKeyGuard()` | `hono-auth-guard/api-key` | API key header authentication |
| `oauthGuard()` | `hono-auth-guard/oauth` | OAuth provider token validation |

### Composition

| Function | Description |
|----------|-------------|
| `compose(...guards)` | AND -- all guards must pass |
| `either(...guards)` | OR -- any one guard must pass |

### Errors

All guards return [RFC 7807](https://www.rfc-editor.org/rfc/rfc7807) Problem Detail responses:

```json
{
  "type": "https://hono-auth-guard.dev/errors/token-expired",
  "title": "Token Expired",
  "status": 401,
  "detail": "The provided JWT has expired at 2026-06-28T12:00:00Z"
}
```

Catch and customize with `AuthError`:

```typescript
import { AuthError } from 'hono-auth-guard'

app.onError((err, c) => {
  if (err instanceof AuthError) {
    console.error(`Auth failed: ${err.problemDetail.type}`)
    return err.toResponse()
  }
  return c.text('Internal Server Error', 500)
})
```

### Testing Helpers

```typescript
import { createMockAuth, createMockContext, createTestToken } from 'hono-auth-guard/testing'

// Mock auth for handler unit tests
const auth = createMockAuth({ type: 'jwt', subject: 'user-123' })

// Mock Hono context with auth pre-set
const ctx = createMockContext({ subject: 'user-123', claims: { role: 'admin' } })

// Generate a real HS256 JWT for integration tests
const token = await createTestToken({ sub: 'user-456' }, 'secret', { expiresIn: 3600 })
```

---

## Type-Safe Custom Claims

```typescript
interface MyClaims {
  role: 'admin' | 'user'
  org_id: string
}

app.use('/api/*', jwtGuard<MyClaims>({
  secret: env.JWT_SECRET,
  validateClaims: (claims) => {
    // `claims` is typed as MyClaims
    return claims.role === 'admin' && claims.org_id === 'org-abc'
  },
}))
```

---

## Security

- Algorithm substitution attack prevention (explicit `algorithms` allowlist)
- `alg: none` rejection
- Timing-safe comparison via Web Crypto API
- Expired token rejection with configurable clock tolerance
- No external dependencies = minimal attack surface

---

## Requirements

- **Runtime**: Cloudflare Workers (V8 Isolate)
- **Framework**: Hono v4+
- **Node.js**: 20+ (development only)

---

## Development

```bash
git clone https://github.com/ikeno-web/hono-auth-guard.git
cd hono-auth-guard
npm install

npm run dev          # watch mode
npm run lint         # biome check
npm run typecheck    # tsc --noEmit
npm run test         # vitest (Workers pool)
npm run test:cov     # with coverage
npm run build        # ESM + CJS + DTS
```

---

## License

[MIT](./LICENSE) -- ikeno-web
