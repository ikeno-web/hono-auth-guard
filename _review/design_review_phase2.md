# API設計レビュー結果

## レビュー対象
- ファイル: `_design/screen_flow.md`
- レビュー日: 2026-06-28
- レビュアー: Reviewer Agent

## チェック項目
- [x] 全MUSTユーザーストーリーがマトリクスでカバーされている
- [x] APIに行き止まりがない（初期化→使用→破棄の完全なライフサイクル）
- [x] エラーケースが定義されている
- [x] 型安全性が確保されている
- [x] 命名規則が一貫している
- [x] requirements.mdの非機能要件と整合している

## 詳細評価

### 1. MUSTユーザーストーリーカバレッジ

全MUST機能（F-01〜F-07, F-16）が明確にAPIにマッピングされている。

| MUST US | カバー状況 | 備考 |
|---|---|---|
| US-01 (JWT HS256) | OK | `jwtGuard({ secret, algorithms: ['HS256'] })` |
| US-02 (JWT RS256) | OK | `jwtGuard({ secret: CryptoKey, algorithms: ['RS256'] })` |
| US-03 (APIキー) | OK | `apiKeyGuard({ keys / validate })` |
| US-04 (ルート切替) | OK | `compose()` / `either()` |
| US-05 (RFC 7807) | OK | `AuthError` / `ProblemDetail` |
| US-06 (型安全クレーム) | OK | `AuthInfo<T>` / `c.get('auth')` |
| US-12 (テストヘルパー) | OK | `createMockAuth()` / `createMockContext()` / `createTestToken()` |

### 2. ライフサイクル完全性

- **初期化**: Guard生成は `jwtGuard(options)` / `apiKeyGuard(options)` で完結。Honoの `app.use()` にそのまま渡せる設計で行き止まりなし
- **使用**: `c.get('auth')` で認証情報を取得。型拡張 `ContextVariableMap` により型安全
- **破棄**: ミドルウェアはステートレスのため明示的な破棄不要。設計として妥当

ライフサイクルに問題なし。

### 3. エラーケース

RFC 7807準拠のエラー種別が11種定義されており、網羅的。

- 認証ヘッダー欠落（401）
- トークン不正（401）
- 期限切れ（401）
- アルゴリズム不一致（401）— alg substitution attack対策
- issuer / audience 不一致（401）
- APIキー不正 / 欠落（401）
- クレームバリデーション失敗（403）— 認可エラーの適切な分離
- 内部エラー（500）— JWKS取得失敗等

`AuthError` クラスが `toResponse()` メソッドを持ち、Honoの `app.onError()` でカスタマイズ可能な設計も良い。

### 4. 型安全性

- `AuthInfo<T>` のジェネリクスにより、カスタムクレームの型推論が機能する
- `JwtGuardOptions<TClaims>` → `validateClaims: ClaimValidator<TClaims>` の型伝播が適切
- `ContextVariableMap` の型拡張で `c.get('auth')` の戻り値が型付き

ただし、`c.get('auth')` の戻り値型は `AuthInfo` (ジェネリクスなし = `AuthInfo<Record<string, unknown>>`) となり、Guard定義時の `<TClaims>` がハンドラー側には伝播しない点は制約として認識しておく必要がある。Example 5 のコメントでもこの点に触れており、設計上の妥当なトレードオフとして許容する。

### 5. 命名規則

- 関数: camelCase — `jwtGuard`, `apiKeyGuard`, `compose`, `either`, `createMockAuth` — 一貫
- 型/クラス: PascalCase — `AuthInfo`, `JwtGuardOptions`, `ProblemDetail`, `AuthError` — 一貫
- モジュールパス: kebab-case — `hono-auth-guard/jwt`, `hono-auth-guard/api-key` — npm慣例に準拠

命名に揺れなし。

### 6. 非機能要件との整合

| NFR | 設計での対応 | 判定 |
|---|---|---|
| JWT HS256 < 1ms | Web Crypto API使用（実装依存だが設計に阻害要因なし） | OK |
| バンドル < 5KB (コア) | Tree-shaking可能なモジュール分割、`sideEffects: false` | OK |
| Hono v4.x 互換 | `MiddlewareHandler` 型を使用 | OK |
| タイミング攻撃耐性 | 設計で明示なし（実装段階の責務） | OK (実装で対応) |
| `alg: none` 拒否 | `algorithms` オプションで明示指定を強制 | OK |
| テストカバレッジ 90% | テストヘルパーモジュール提供、テストファイル構成は実装段階 | OK |

## 指摘事項

### [INFO-01] `apiKeyGuard` の `keys` と `validate` の排他制御

`ApiKeyGuardOptions` で `keys` と `validate` が「排他」と記述されているが、TypeScript の型レベルでは両方指定可能。Discriminated Union またはオーバーロードで型レベルの排他制御を検討する価値はある。ただし、ランタイムバリデーションでエラーにすれば実用上は問題ないため、実装段階で判断してよい。

**重要度**: 低（設計意図は明確、実装時対応可）

### [INFO-02] `either()` の全失敗時エラー選択

`either()` で全Guard失敗時に「最初のGuardのエラーを返す」とあるが、最後のGuardのエラーのほうがデバッグに有用な場合もある。これは設計判断として記録しておくべき。

**重要度**: 低（どちらの選択も合理的、ドキュメントで明示済み）

### [INFO-03] CORS OPTIONSリクエストスキップ（F-17）の実装方針

Should機能のF-17（CORS互換性）について、Guard内部でOPTIONSリクエストを自動スキップするとマトリクスに記載されている。これが暗黙的に行われる場合、セキュリティ上の混乱を招く可能性がある。明示的なオプション（`skipPreflight: boolean`）の提供を推奨する。

**重要度**: 低（Should機能であり、実装時に検討すれば十分）

## 判定

**PASS**

設計品質は高い。全MUSTユーザーストーリーがAPIに対応し、エラー種別は網羅的、型安全性も確保されている。Tree-shaking対応のモジュール分割、テストヘルパーの同梱、RFC 7807準拠のエラーフォーマットなど、OSSライブラリとしての実用性も十分に考慮されている。指摘事項は全て低重要度のINFOレベルであり、Phase 3以降で対応可能。
