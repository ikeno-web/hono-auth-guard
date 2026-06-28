# Public API / Interface Design: hono-auth-guard

> Phase 2 成果物。ライブラリのため画面設計の代わりにPublic API Surface設計を行う。

---

## 1. Module Structure

| モジュールパス | エクスポート | 目的 | Tree-shake対象 |
|---|---|---|---|
| `hono-auth-guard` | `jwtGuard`, `apiKeyGuard`, `compose`, `either`, `AuthError` | メインエントリ。コアGuardと合成関数 | -- |
| `hono-auth-guard/jwt` | `jwtGuard`, `JwtGuardOptions`, `JwtPayload` | JWT検証Guard単体 | Yes |
| `hono-auth-guard/api-key` | `apiKeyGuard`, `ApiKeyGuardOptions` | APIキー認証Guard単体 | Yes |
| `hono-auth-guard/oauth` | `oauthGuard`, `OAuthGuardOptions`, `OAuthProvider` | OAuthトークン検証Guard（Should: v1.x） | Yes |
| `hono-auth-guard/testing` | `createMockAuth`, `createMockContext`, `createTestToken` | テスト用モックヘルパー | Yes |

**設計原則**:
- 個別モジュールからのインポートで未使用Guardがバンドルに含まれないこと（Tree-shaking）
- メインエントリは利便性のため全コアGuardを再エクスポート
- `hono-auth-guard/oauth` はShould機能（F-08, F-09）のためv1.x以降で提供
- 各モジュールは副作用なし（`"sideEffects": false` in package.json）

---

## 2. Public API Signatures (TypeScript)

### 2.1 共通型

```typescript
// ========================================
// hono-auth-guard (common types)
// ========================================

/** 認証済みコンテキストに設定される情報 */
interface AuthInfo<T = Record<string, unknown>> {
  /** 認証方式 */
  type: 'jwt' | 'api-key' | 'oauth'
  /** サブジェクト（JWTのsub / APIキーの識別子） */
  subject: string
  /** 認証方式固有のクレーム/メタデータ */
  claims: T
}

/** RFC 7807 準拠エラーレスポンス */
interface ProblemDetail {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
}

/** Guardが投げるエラー型 */
class AuthError extends Error {
  readonly status: number
  readonly problemDetail: ProblemDetail

  constructor(status: number, detail: ProblemDetail)
  /** Hono Response オブジェクトに変換 */
  toResponse(): Response
}

/** 認証結果のカスタムバリデーション関数 */
type ClaimValidator<T = Record<string, unknown>> = (claims: T) => boolean | Promise<boolean>

/** Honoコンテキストの型拡張 */
declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthInfo
  }
}
```

### 2.2 JwtGuard

```typescript
// ========================================
// hono-auth-guard/jwt
// ========================================
import type { MiddlewareHandler } from 'hono'

type Algorithm = 'HS256' | 'RS256'

interface JwtGuardOptions<TClaims = Record<string, unknown>> {
  /** 検証に使用する秘密鍵（HS256）または公開鍵（RS256） */
  secret: string | CryptoKey

  /** 許可するアルゴリズム。デフォルト: ['HS256']
   *  明示指定により alg substitution attack を防止 */
  algorithms?: Algorithm[]

  /** Authorization ヘッダーのプレフィクス。デフォルト: 'Bearer' */
  headerPrefix?: string

  /** トークン取得元のカスタムヘッダー名。指定時は Authorization ヘッダーの代わりに使用 */
  headerName?: string

  /** 許可する issuer（iss クレーム）。指定時に不一致なら拒否 */
  issuer?: string | string[]

  /** 許可する audience（aud クレーム）。指定時に不一致なら拒否 */
  audience?: string | string[]

  /** クロックスキュー許容秒数。デフォルト: 0 */
  clockTolerance?: number

  /** カスタムクレームバリデーション（F-07）。
   *  false を返すと 403 Forbidden */
  validateClaims?: ClaimValidator<TClaims>

  /** 認証成功時コールバック（Could: F-15） */
  onSuccess?: (claims: TClaims) => void | Promise<void>

  /** 認証失敗時コールバック（Could: F-15） */
  onFailure?: (error: AuthError) => void | Promise<void>
}

/** JWT検証ガードミドルウェアを生成する */
function jwtGuard<TClaims = Record<string, unknown>>(
  options: JwtGuardOptions<TClaims>
): MiddlewareHandler
```

### 2.3 ApiKeyGuard

```typescript
// ========================================
// hono-auth-guard/api-key
// ========================================
import type { MiddlewareHandler } from 'hono'

interface ApiKeyGuardOptions {
  /** APIキーの取得元ヘッダー名。デフォルト: 'X-API-Key' */
  headerName?: string

  /** 有効なAPIキーのリスト（静的）。validate と排他 */
  keys?: string[]

  /** APIキーの動的バリデーション関数。keys と排他。
   *  KV/D1等の外部ストアから検証する場合に使用。
   *  識別子文字列を返すとそれがsubjectになる。falseで拒否 */
  validate?: (key: string) => string | false | Promise<string | false>

  /** 認証成功時コールバック */
  onSuccess?: (subject: string) => void | Promise<void>

  /** 認証失敗時コールバック */
  onFailure?: (error: AuthError) => void | Promise<void>
}

/** APIキー認証ガードミドルウェアを生成する */
function apiKeyGuard(options: ApiKeyGuardOptions): MiddlewareHandler
```

### 2.4 OAuthGuard (Should: v1.x)

```typescript
// ========================================
// hono-auth-guard/oauth (Should: v1.x)
// ========================================
import type { MiddlewareHandler } from 'hono'

type OAuthProvider = 'google' | 'github'

interface OAuthGuardOptions<TClaims = Record<string, unknown>> {
  /** OAuthプロバイダ */
  provider: OAuthProvider

  /** プロバイダ固有の設定 */
  clientId?: string

  /** 要求するスコープ（トークンに含まれているか検証） */
  requiredScopes?: string[]

  /** カスタムクレームバリデーション */
  validateClaims?: ClaimValidator<TClaims>

  /** JWKSキャッシュTTL秒数（F-10）。デフォルト: 3600 */
  jwksCacheTtl?: number

  /** 認証成功時コールバック */
  onSuccess?: (claims: TClaims) => void | Promise<void>

  /** 認証失敗時コールバック */
  onFailure?: (error: AuthError) => void | Promise<void>
}

/** OAuthトークン検証ガードミドルウェアを生成する */
function oauthGuard<TClaims = Record<string, unknown>>(
  options: OAuthGuardOptions<TClaims>
): MiddlewareHandler
```

### 2.5 Guard合成関数

```typescript
// ========================================
// hono-auth-guard (composition)
// ========================================
import type { MiddlewareHandler } from 'hono'

/** AND合成 — 全Guardが成功する必要がある。
 *  最初に失敗したGuardのエラーを返す */
function compose(...guards: MiddlewareHandler[]): MiddlewareHandler

/** OR合成 — いずれか1つのGuardが成功すればよい。
 *  全て失敗した場合は最初のGuardのエラーを返す */
function either(...guards: MiddlewareHandler[]): MiddlewareHandler
```

### 2.6 テストヘルパー

```typescript
// ========================================
// hono-auth-guard/testing
// ========================================
import type { Context } from 'hono'

interface MockAuthOptions<TClaims = Record<string, unknown>> {
  type?: 'jwt' | 'api-key' | 'oauth'
  subject?: string
  claims?: TClaims
}

/** テスト用の認証情報オブジェクトを生成する */
function createMockAuth<TClaims = Record<string, unknown>>(
  options?: MockAuthOptions<TClaims>
): AuthInfo<TClaims>

/** 認証情報が設定済みのモックHonoコンテキストを生成する */
function createMockContext<TClaims = Record<string, unknown>>(
  options?: MockAuthOptions<TClaims>
): Context

/** テスト用のJWTトークン文字列を生成する（HS256固定） */
function createTestToken(
  payload: Record<string, unknown>,
  secret: string,
  options?: { expiresIn?: number }
): Promise<string>
```

---

## 3. Middleware Composition API

### 3.1 単一Guard

```typescript
import { Hono } from 'hono'
import { jwtGuard } from 'hono-auth-guard/jwt'

const app = new Hono()

// 特定パス以下にJWT認証を適用
app.use('/api/*', jwtGuard({ secret: env.JWT_SECRET }))

app.get('/api/me', (c) => {
  const auth = c.get('auth')  // AuthInfo<Record<string, unknown>>
  return c.json({ userId: auth.subject })
})
```

### 3.2 AND合成（compose）

全Guardを通過する必要がある場合。例: JWT認証 + カスタムクレームによるロールチェック。

```typescript
import { jwtGuard } from 'hono-auth-guard/jwt'
import { compose } from 'hono-auth-guard'

// JWT検証 かつ admin ロールであること
app.use('/admin/*', compose(
  jwtGuard({ secret: env.JWT_SECRET }),
  jwtGuard({
    secret: env.JWT_SECRET,
    validateClaims: (claims) => claims.role === 'admin',
  })
))
```

> **注**: `compose` は任意の Hono MiddlewareHandler を受け付けるため、サードパーティのミドルウェアとも合成可能。

### 3.3 OR合成（either）

いずれか1つの認証方式で通過できる場合。例: JWT または APIキー。

```typescript
import { jwtGuard } from 'hono-auth-guard/jwt'
import { apiKeyGuard } from 'hono-auth-guard/api-key'
import { either } from 'hono-auth-guard'

// JWTトークン または APIキーのどちらかで認証
app.use('/api/*', either(
  jwtGuard({ secret: env.JWT_SECRET }),
  apiKeyGuard({ keys: env.VALID_API_KEYS.split(',') })
))
```

### 3.4 ルート分岐パターン

```typescript
// 公開エンドポイント — Guard なし
app.get('/health', (c) => c.json({ status: 'ok' }))

// ユーザーAPI — JWT認証
app.use('/api/*', jwtGuard({ secret: env.JWT_SECRET }))

// 管理API — JWT + admin ロール
app.use('/admin/*', compose(
  jwtGuard({ secret: env.JWT_SECRET }),
  jwtGuard({
    secret: env.JWT_SECRET,
    validateClaims: (claims) => claims.role === 'admin',
  })
))

// Webhook — APIキー認証
app.use('/webhook/*', apiKeyGuard({
  validate: async (key) => {
    const record = await env.API_KEYS.get(key)
    return record ? JSON.parse(record).clientId : false
  }
}))
```

---

## 4. Error Response Format (RFC 7807)

全GuardはRFC 7807（Problem Details for HTTP APIs）準拠のJSONレスポンスを返す（F-06）。

### 4.1 レスポンス形式

```json
{
  "type": "https://hono-auth-guard.dev/errors/token-expired",
  "title": "Token Expired",
  "status": 401,
  "detail": "The provided JWT has expired at 2026-06-28T12:00:00Z",
  "instance": "/api/users/123"
}
```

Content-Type: `application/problem+json`

### 4.2 エラー種別一覧

| type (suffix) | title | status | 発生条件 |
|---|---|---|---|
| `/missing-token` | Missing Authentication | 401 | Authorization ヘッダーなし |
| `/invalid-token` | Invalid Token | 401 | JWT署名検証失敗 / 不正形式 |
| `/token-expired` | Token Expired | 401 | exp クレーム超過 |
| `/algorithm-mismatch` | Algorithm Mismatch | 401 | alg substitution attack 検知 |
| `/issuer-mismatch` | Issuer Mismatch | 401 | iss クレーム不一致 |
| `/audience-mismatch` | Audience Mismatch | 401 | aud クレーム不一致 |
| `/invalid-api-key` | Invalid API Key | 401 | APIキー検証失敗 |
| `/missing-api-key` | Missing API Key | 401 | APIキーヘッダーなし |
| `/claim-validation-failed` | Forbidden | 403 | validateClaims が false を返した |
| `/oauth-verification-failed` | OAuth Verification Failed | 401 | OAuthトークン検証失敗 |
| `/internal-error` | Internal Authentication Error | 500 | JWKS取得失敗等の内部エラー |

### 4.3 エラーハンドリングのカスタマイズ

```typescript
import { AuthError } from 'hono-auth-guard'

// デフォルトのエラーレスポンスを上書きしたい場合
app.onError((err, c) => {
  if (err instanceof AuthError) {
    // カスタムログ
    console.error(`Auth failed: ${err.problemDetail.type}`)
    // デフォルトのRFC 7807レスポンスを返す
    return err.toResponse()
  }
  return c.text('Internal Server Error', 500)
})
```

---

## 5. Usage Examples

### Example 1: 基本的なJWT認証API（US-01, F-01）

```typescript
import { Hono } from 'hono'
import { jwtGuard } from 'hono-auth-guard/jwt'

type Env = { Bindings: { JWT_SECRET: string } }
const app = new Hono<Env>()

app.use('/api/*', (c, next) => {
  const guard = jwtGuard({ secret: c.env.JWT_SECRET })
  return guard(c, next)
})

app.get('/api/profile', (c) => {
  const auth = c.get('auth')
  return c.json({
    userId: auth.subject,
    email: auth.claims.email,
  })
})

export default app
```

### Example 2: RS256 + issuer/audience 検証（US-02, F-02）

```typescript
import { jwtGuard } from 'hono-auth-guard/jwt'

const publicKey = await crypto.subtle.importKey(
  'jwk',
  JSON.parse(env.RS256_PUBLIC_KEY_JWK),
  { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
  false,
  ['verify']
)

app.use('/api/*', jwtGuard({
  secret: publicKey,
  algorithms: ['RS256'],
  issuer: 'https://auth.example.com',
  audience: 'my-api',
  clockTolerance: 30,
}))
```

### Example 3: APIキー認証 + KV動的検証（US-03, F-03）

```typescript
import { apiKeyGuard } from 'hono-auth-guard/api-key'

app.use('/webhook/*', apiKeyGuard({
  headerName: 'X-API-Key',
  validate: async (key) => {
    // Cloudflare KV からキーを検証
    const record = await c.env.API_KEYS_KV.get(key)
    if (!record) return false
    const { clientId } = JSON.parse(record)
    return clientId  // subject として設定される
  },
}))

app.post('/webhook/stripe', (c) => {
  const auth = c.get('auth')
  console.log(`Webhook from client: ${auth.subject}`)
  // ...
})
```

### Example 4: JWT or APIKey（OR合成）+ テスト（US-04, US-12, F-04, F-16）

```typescript
import { either } from 'hono-auth-guard'
import { jwtGuard } from 'hono-auth-guard/jwt'
import { apiKeyGuard } from 'hono-auth-guard/api-key'
import { createMockContext, createTestToken } from 'hono-auth-guard/testing'

// --- プロダクションコード ---
app.use('/api/*', either(
  jwtGuard({ secret: env.JWT_SECRET }),
  apiKeyGuard({ keys: ['key-1', 'key-2'] })
))

app.get('/api/data', (c) => {
  const auth = c.get('auth')
  return c.json({ type: auth.type, subject: auth.subject })
})

// --- テストコード ---
import { describe, it, expect } from 'vitest'

describe('GET /api/data', () => {
  it('returns user info with mock auth', async () => {
    const ctx = createMockContext({
      type: 'jwt',
      subject: 'user-123',
      claims: { role: 'admin' },
    })
    // ハンドラーを直接テスト（Guard をスキップ）
    const auth = ctx.get('auth')
    expect(auth.subject).toBe('user-123')
  })

  it('generates a test JWT', async () => {
    const token = await createTestToken(
      { sub: 'user-456', role: 'user' },
      'test-secret',
      { expiresIn: 3600 }
    )
    // token を Authorization ヘッダーにセットしてリクエスト
    const res = await app.request('/api/data', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
  })
})
```

### Example 5: カスタムクレームバリデーション + 型安全（US-06, F-05, F-07）

```typescript
import { jwtGuard } from 'hono-auth-guard/jwt'

// カスタムクレーム型を定義
interface MyTokenClaims {
  role: 'admin' | 'user' | 'viewer'
  org_id: string
  permissions: string[]
}

app.use('/api/*', jwtGuard<MyTokenClaims>({
  secret: env.JWT_SECRET,
  validateClaims: (claims) => {
    // claims は MyTokenClaims として型推論される
    return claims.org_id === 'org-abc' && claims.role !== 'viewer'
  },
}))

app.get('/api/org-data', (c) => {
  // auth.claims は Record<string, unknown> だが、
  // Guard のジェネリクスにより型情報はオプション定義時に活用される
  const auth = c.get('auth')
  return c.json({ subject: auth.subject })
})
```

---

## 6. API x User Story Traceability Matrix

| User Story | 関連機能 | 対応API / 型 | MoSCoW |
|---|---|---|---|
| US-01: JWT(HS256)検証 | F-01 | `jwtGuard({ secret, algorithms: ['HS256'] })` | Must |
| US-02: JWT(RS256)検証 | F-02 | `jwtGuard({ secret: CryptoKey, algorithms: ['RS256'] })` | Must |
| US-03: APIキー認証 | F-03 | `apiKeyGuard({ headerName, keys/validate })` | Must |
| US-04: ルートごとの認証切替 | F-04 | `compose()`, `either()`, `app.use(path, guard)` | Must |
| US-05: RFC 7807エラー | F-06 | `AuthError`, `ProblemDetail`, `err.toResponse()` | Must |
| US-06: 型安全クレーム取得 | F-05, F-07 | `c.get('auth')`: `AuthInfo<T>`, `validateClaims` | Must |
| US-07: RBAC宣言的記述 | F-13 | `validateClaims` で簡易対応 / RoleGuard は Could | Could |
| US-08: Google OAuthトークン検証 | F-08 | `oauthGuard({ provider: 'google' })` | Should |
| US-09: GitHub OAuthトークン検証 | F-09 | `oauthGuard({ provider: 'github' })` | Should |
| US-10: JWKS自動取得/キャッシュ | F-10 | `OAuthGuardOptions.jwksCacheTtl` | Should |
| US-11: CORS互換性 | F-17 | Guard内部でOPTIONSリクエストを自動スキップ | Should |
| US-12: テストモックヘルパー | F-16 | `createMockAuth()`, `createMockContext()`, `createTestToken()` | Must |
| US-13: レートリミティング統合 | F-12 | `compose()` でサードパーティRL middlewareと合成 | Could |
| US-14: 認証イベントフック | F-15 | `onSuccess` / `onFailure` コールバック | Could |

### カバレッジ確認

- **Must (F-01〜F-07, F-16)**: US-01, US-02, US-03, US-04, US-05, US-06, US-12 -- 全て対応API/型あり
- **Should (F-08〜F-11, F-17)**: US-08, US-09, US-10, US-11 -- OAuthGuard と CORS スキップで対応
- **Could (F-12〜F-15)**: US-07, US-13, US-14 -- compose + validateClaims + コールバックで対応方針明確
- **漏れなし**: 全14ユーザーストーリーがいずれかのAPI/型にマッピング済み

---

## 自己チェック

- [x] 全MUST機能（F-01〜F-07, F-16）に対応するAPI surfaceが定義されている
- [x] 内部型がpublic APIにリークしていない（Web Crypto内部処理、JWT解析中間型は非公開）
- [x] 命名規約の一貫性: camelCase関数（`jwtGuard`, `apiKeyGuard`, `compose`, `either`, `createMockAuth`）、PascalCase型（`AuthInfo`, `JwtGuardOptions`, `ProblemDetail`, `AuthError`）
- [x] Hono MiddlewareHandler の戻り値型を採用し、Honoエコシステムとの互換性を維持
- [x] ジェネリクス `<TClaims>` により型安全なカスタムクレームを実現（F-05, F-07）
- [x] RFC 7807のエラー種別がセキュリティ要件（alg:none拒否、期限切れ拒否、algorithm substitution拒否）をカバー
- [x] Tree-shaking可能なモジュール分割（個別インポートパス）
- [x] テストヘルパー（`hono-auth-guard/testing`）がUS-12を満たすユーティリティを提供
