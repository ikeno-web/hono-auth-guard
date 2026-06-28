# コードレビュー結果

## レビュー対象
- レビュー日: 2026-06-28
- レビュアー: Reviewer Agent (Phase 6-R セキュリティ重点)
- 対象: src/ 全16ファイル、test/ 全5ファイル
- テスト実行結果: **92テスト全PASS**
- カバレッジ: Stmts 100% / Branch 92.41% / Funcs 100% / Lines 100%

## チェック項目
- [x] API設計(screen_flow.md)との一致
- [x] constraints.md違反がないか
- [x] セキュリティ（タイミング攻撃、入力検証）
- [x] 命名規則の一貫性
- [x] テストの網羅性
- [x] パフォーマンス懸念

---

## 指摘事項

### [Critical] C-01: `timingSafeEqual` のダミー比較が長さ情報を漏洩する

- **ファイル**: `D:/アプリ開発/hono-auth-guard/src/api-key/guard.ts` L95-110
- **内容**: `timingSafeEqual` 関数の長さ不一致時ダミーループに2つの問題がある:
  1. `dummy |= a.charCodeAt(i) ^ a.charCodeAt(i)` は自身とのXOR（常に0）であり、JIT最適化でループ自体が除去される可能性が高い
  2. ループ回数が `a.length`（サーバー側キー長）固定のため、攻撃者の入力長との差でサーバー側キー長が推測可能
  3. `return dummy !== dummy` は常に `false` だがコードの意図が不明瞭
- **攻撃シナリオ**: 攻撃者が異なる長さの候補キーを送信し、応答時間の差分からサーバー保持キーの長さを特定 → 正しい長さの候補でブルートフォース
- **推奨修正**: 両値をHMAC-SHA256でハッシュしてから固定長ハッシュ値をバイト比較する方式に切り替える:
  ```typescript
  async function timingSafeEqual(a: string, b: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.generateKey(
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const [macA, macB] = await Promise.all([
      crypto.subtle.sign('HMAC', key, encoder.encode(a)),
      crypto.subtle.sign('HMAC', key, encoder.encode(b)),
    ]);
    const bytesA = new Uint8Array(macA);
    const bytesB = new Uint8Array(macB);
    let result = 0;
    for (let i = 0; i < bytesA.length; i++) {
      result |= bytesA[i]! ^ bytesB[i]!;
    }
    return result === 0;
  }
  ```
  これにより長さの差異もハッシュに吸収され、比較は常にSHA-256の32バイト固定長で行われる。`timingSafeFind` と `apiKeyGuard` も `async` 対応が必要。

---

### [Critical] C-02: `oauthGuard` が認証なしで全リクエストを通過させる

- **ファイル**: `D:/アプリ開発/hono-auth-guard/src/oauth/guard.ts` L20-27
- **内容**: `oauthGuard` は `// TODO: Should (v1.x)` コメント付きで `await next()` をそのまま呼ぶのみ。`hono-auth-guard/oauth` パスからインポート可能なため、ユーザーが誤って使用すると**全リクエストが認証バイパスされる**。
- **推奨修正**: fail-closed にする:
  ```typescript
  export function oauthGuard<TClaims = Record<string, unknown>>(
    _options: OAuthGuardOptions<TClaims>,
  ): MiddlewareHandler {
    throw new Error(
      'oauthGuard is not yet implemented. It is planned for v1.x.'
    );
  }
  ```

---

### [High] H-01: HS256の鍵を毎リクエストごとに `importKey` している

- **ファイル**: `D:/アプリ開発/hono-auth-guard/src/jwt/guard.ts` L216-225
- **内容**: `verifySignature` 内で `typeof secret === "string"` の場合、毎リクエスト `crypto.subtle.importKey` を実行。`importKey` は非同期かつCPUコストが高く、Cloudflare Workers の CPU制限（free: 10ms / paid: 50ms）下でボトルネックになりうる。constraints.md の「Workers CPU制限内で動作」に抵触するリスク。
- **推奨修正**: `jwtGuard` クロージャ内で一度だけ鍵をインポートしてキャッシュする:
  ```typescript
  export function jwtGuard<TClaims>(options: JwtGuardOptions<TClaims>): MiddlewareHandler {
    let cachedKey: CryptoKey | null = null;
    // ...
    return async (c, next) => {
      // ...
      const key = typeof options.secret === 'string'
        ? (cachedKey ??= await crypto.subtle.importKey(...))
        : options.secret;
      // ...
    };
  }
  ```

---

### [Medium] M-01: `either` で全Guard無応答時にフォールバックエラーがない

- **ファイル**: `D:/アプリ開発/hono-auth-guard/src/compose.ts` L56-82
- **内容**: 全Guardが `next()` を呼ばず（`succeeded = false`）かつ throw もしない場合、`firstError` が `undefined` のまま関数終了。Hono に何もレスポンスが返されない。現在の `jwtGuard` / `apiKeyGuard` は全て throw で拒否するためこのパスには到達しないが、サードパーティ Guard との合成時に顕在化する。
- **推奨修正**: ループ終了後にフォールバックを追加:
  ```typescript
  if (firstError !== undefined) {
    throw firstError;
  }
  throw new AuthError(401, {
    type: `${ERROR_TYPE_BASE}/missing-token`,
    title: 'Missing Authentication',
    status: 401,
    detail: 'No authentication guard succeeded.',
  });
  ```

---

### [Medium] M-02: API設計との不一致 — `createMockContext` が同期→非同期

- **ファイル**: `D:/アプリ開発/hono-auth-guard/src/testing/helpers.ts` L33-35
- **内容**: screen_flow.md (2.6節) では戻り値型 `Context`（同期）だが、実装は `Promise<Context>`。内部で `testApp.fetch()` を await するため非同期が正しいが、設計書と乖離。screen_flow.md の Example 4 (L478) でも同期呼び出しで記載されており利用者が混乱する。
- **推奨**: screen_flow.md を `Promise<Context>` に更新する。

---

### [Medium] M-03: メインエントリのエクスポート差異

- **ファイル**: `D:/アプリ開発/hono-auth-guard/src/index.ts`
- **内容**: screen_flow.md (1節) のメインエントリ定義と実際のエクスポートに差異あり:
  - 実装では `JwtPayload` と `Algorithm` 型をメインからエクスポートしているが screen_flow.md の表には記載なし
  - OAuth 関連型はメインからエクスポートされていない（Should スコープのため意図的か）
- **推奨**: screen_flow.md の Module Structure 表を実装に合わせて更新する。

---

### [Medium] M-04: エラーレスポンスの `detail` にトークン有効期限を開示

- **ファイル**: `D:/アプリ開発/hono-auth-guard/src/jwt/guard.ts` L139
- **内容**: `tokenExpired` エラーで `new Date(payload.exp * 1000).toISOString()` をレスポンスの `detail` に含めている。攻撃者にトークン構造やサーバー時刻との差異情報を与える可能性がある。screen_flow.md (4.1節) のサンプルレスポンスにも有効期限が含まれているため設計意図かもしれないが、セキュリティ上は不要な情報。
- **推奨**: デフォルトでは「The provided JWT has expired.」のみを返し、exp 日時の開示はデバッグオプションとして提供する。

---

### [Low] L-01: 静的キー比較時の `subject` が固定値 `"api-key-user"`

- **ファイル**: `D:/アプリ開発/hono-auth-guard/src/api-key/guard.ts` L56
- **内容**: `keys` 配列認証時、どのキーがマッチしたか区別できない。screen_flow.md では「APIキーの識別子」と記載。`validate` 使用時との非対称性がある。
- **推奨**: v1.x enhancement候補として `keys` をオブジェクト配列に拡張するか、ドキュメントで制限を明記。

---

### [Low] L-02: `compose()` / `either()` に空配列を渡した場合の挙動

- **ファイル**: `D:/アプリ開発/hono-auth-guard/src/compose.ts` L23, L56
- **内容**: `compose()` は空配列で即座に `next()` を呼び（全リクエスト通過）、`either()` はレスポンスなしで終了。
- **推奨**: 空配列で `throw new Error('compose/either requires at least one guard')` をスローする。

---

### [Low] L-03: テスト未カバー — `validateClaims` / コールバック例外スロー時

- **ファイル**: `D:/アプリ開発/hono-auth-guard/test/jwt-guard.test.ts`
- **内容**: `validateClaims` が例外をスローした場合、`onSuccess` / `onFailure` が例外をスローした場合のテストがない。現状は500エラーになるが、意図した挙動か確認すべき。
- **推奨**: テストケースを追加。

---

### [Low] L-04: テスト未カバー — `either` / `compose` のネスト合成

- **ファイル**: `D:/アプリ開発/hono-auth-guard/test/compose.test.ts`
- **内容**: `compose(either(...), compose(...))` のようなネスト合成パターンのテストなし。
- **推奨**: ネスト合成テストを追加。

---

### [Low] L-05: テスト未カバー — `timingSafeEqual` / `timingSafeFind` のユニットテスト

- **ファイル**: `D:/アプリ開発/hono-auth-guard/test/api-key-guard.test.ts`
- **内容**: 内部関数のためエクスポートされていないが、C-01 の修正後にユニットテストを追加すべき。
- **推奨**: テスト用にエクスポートするか、結合テストで長さ違い/同長不一致/一致の全パターンをカバーする。

---

### [Info] I-01: JWT署名検証は `crypto.subtle.verify` 委譲 — タイミング安全

`src/jwt/guard.ts` L227 の `crypto.subtle.verify("HMAC", ...)` は Web Crypto API の内部 constant-time 比較。JWT 署名側のタイミング攻撃耐性は問題なし。

### [Info] I-02: `alg:none` 拒否は正しく実装

`src/jwt/guard.ts` L86: `header.alg.toLowerCase() === "none"` で大小文字問わず拒否。`alg` 未設定も `!header.alg` で捕捉。テストも `"none"` / `"NONE"` の2パターンをカバー。

### [Info] I-03: アルゴリズム置換攻撃防止は正しく実装

`algorithms` ホワイトリスト（デフォルト `['HS256']`）とヘッダー `alg` を照合。RS256 公開鍵に HS256 トークンを送る攻撃を正しくブロック。

### [Info] I-04: エラーレスポンスに秘密情報の漏洩なし

全エラーファクトリを精査。`detail` に秘密鍵・署名値・内部スタックトレースを含めていない。`internalAuthError` も汎用メッセージのみ。

### [Info] I-05: constraints.md 完全準拠

- Web Crypto API のみ使用（Node.js crypto 不使用）: **準拠**
- Hono Middleware パターン: **準拠**
- Tree-shaking 可能なモジュール構成: **準拠**
- グローバル状態・副作用なし: **準拠**（`ERROR_TYPE_BASE` 定数のみ）
- 外部依存最小限（hono peer dependency のみ）: **準拠**
- テストカバレッジ 90%以上: **準拠**（Stmts 100% / Branch 92.41%）

### [Info] I-06: 命名規則の一貫性 — 問題なし

- 関数: camelCase (`jwtGuard`, `apiKeyGuard`, `compose`, `either`, `createMockAuth`)
- 型/インタフェース: PascalCase (`AuthInfo`, `JwtGuardOptions`, `ProblemDetail`, `AuthError`)
- ファイル名: kebab-case (`guard.ts`, `types.ts`, `helpers.ts`)
- エラーファクトリ: camelCase 動詞句 (`missingToken`, `invalidToken`)
- screen_flow.md の命名規約と完全一致

### [Info] I-07: RFC 7807 準拠 — 正しく実装

全 `AuthError.toResponse()` が `application/problem+json` Content-Type で `type` / `title` / `status` / `detail` / `instance` を返す。エラー種別一覧は screen_flow.md (4.2節) と完全一致。

---

## サマリ

| 重大度 | 件数 | 指摘ID |
|---|---|---|
| Critical | 2 | C-01 (timingSafeEqual脆弱性), C-02 (oauthGuardパススルー) |
| High | 1 | H-01 (importKey毎リクエスト) |
| Medium | 4 | M-01〜M-04 |
| Low | 5 | L-01〜L-05 |
| Info | 7 | I-01〜I-07 (確認済み・問題なし) |

---

## 判定

**FAIL**

Critical 2件（C-01: タイミング攻撃脆弱性、C-02: oauthGuard 認証バイパス）の修正が必須。High 1件（H-01: importKey キャッシュ）も併せて修正を推奨。

修正後に再レビュー（Phase 6-R2）で PASS 見込み。
