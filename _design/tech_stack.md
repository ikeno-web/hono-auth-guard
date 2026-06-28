# 技術選定: hono-auth-guard

## 1. 言語・ランタイム

### TypeScript 5.x（strict mode）
- **選定理由**:
  - 要件 NFR 5.5「TypeScript strict mode 完全対応」を直接充足
  - IntelliSense でカスタムクレームの型補完を実現するには TypeScript のジェネリクス・Mapped Types が必須（US-06）
  - Hono 自体が TypeScript-first であり、型推論チェーンを活かした Guard 合成（F-04）に不可欠
- **バージョン方針**: `tsconfig.json` で `"strict": true`, `"exactOptionalPropertyTypes": true` を有効化。TS 5.0+ の `const` type parameters を Guard の型推論に活用

### Cloudflare Workers（V8 Isolate）
- **選定理由**:
  - 本ライブラリの唯一の対象ランタイム（要件セクション6「Node.js / Deno / Bun 互換はスコープ外」）
  - V8 Isolate のコールドスタート < 5ms がミドルウェアの性能要件（HS256: 1ms, RS256: 5ms）と整合
  - Web Crypto API がネイティブ提供されるため外部暗号ライブラリ不要（制約「Node.js crypto 禁止」）
- **却下した代替案**:
  - Node.js: `crypto` モジュール依存が発生し Workers 互換性が崩れる。制約で明示禁止
  - Deno / Bun: Web Crypto API は使えるが、Hono の Workers 最適化パスが使えず性能保証が困難。スコープ外と明記済み

---

## 2. フレームワーク

### Hono 4.x（peer dependency）
- **選定理由**:
  - 制約「Hono Middleware パターン準拠」「hono peer dependency のみ許容」を直接充足
  - Hono の `MiddlewareHandler` 型・`Context` 型を利用して `c.get('auth')` の型安全コンテキスト（F-05）を実現
  - Guard 合成（F-04）は Hono の middleware chaining パターンをそのまま活用
- **peer dependency として宣言する理由**:
  - 利用者のプロジェクトが管理する Hono バージョンに追従し、バージョン競合を回避
  - `peerDependencies: { "hono": "^4.0.0" }` で指定
- **却下した代替案**:
  - itty-router: 型安全性が弱く、ミドルウェアパターンが Hono ほど成熟していない
  - 独自ルーター: ライブラリの責務を超える。認証ガードに専念すべき

---

## 3. 暗号処理

### Web Crypto API（`crypto.subtle`）
- **選定理由**:
  - 制約「Web Crypto API のみ使用」を直接充足
  - Workers ランタイムにネイティブ搭載。外部依存ゼロを維持
  - `crypto.subtle.verify()` で HMAC-SHA256 / RSASSA-PKCS1-v1_5 署名検証（F-01, F-02）
  - `crypto.subtle.importKey()` で JWK → CryptoKey 変換（F-10 JWKS 対応）
  - タイミング攻撃耐性のある比較は `crypto.subtle.verify()` の戻り値判定で暗黙的に保証（NFR 5.4）
- **却下した代替案**:
  - jose (npm): 高品質だが外部依存が発生し、制約「外部依存ゼロ」に違反。バンドルサイズ増加（50KB+）で NFR 5.2 の 10KB 上限も超過
  - jsonwebtoken: Node.js `crypto` 依存。Workers 非互換。制約違反
  - @tsndr/cloudflare-worker-jwt: 機能不足（RS256 未対応の版あり）。依存追加も不要

---

## 4. ビルド

### tsup
- **選定理由**:
  - ESM + CJS デュアル出力をゼロコンフィグで実現。Tree-shaking 可能な ESM が Workers バンドラーと相性良好（制約「Tree-shaking 可能なモジュール構成」）
  - esbuild ベースで高速ビルド（< 1秒）
  - `dts: true` で `.d.ts` 自動生成。型定義ファイルの手書き不要
  - `splitting: true` でコード分割対応。Guard ごとの独立 import を可能にし、未使用 Guard のバンドル除外を保証
- **出力構成**:
  ```
  dist/
  ├── index.mjs       # ESM (Workers primary)
  ├── index.js         # CJS (Node.js互換 — テスト環境用)
  └── index.d.ts       # 型定義
  ```
- **却下した代替案**:
  - esbuild 直接: tsup が esbuild をラップしており、DTS 生成・デュアル出力の設定が簡潔
  - rollup: 設定が冗長。OSSライブラリとしては tsup の方がメンテナンスコスト低
  - tsc のみ: バンドル最適化なし。Tree-shaking 用の ESM 出力に追加設定が必要
  - unbuild: Nuxt エコシステム寄り。Workers ライブラリとの親和性で tsup が優位

---

## 5. テスト

### Vitest + Miniflare
- **選定理由**:
  - Vitest: ESM ネイティブ対応、TypeScript 統合、高速実行。`vi.mock()` で Web Crypto API のスタブ化が容易
  - Miniflare: Cloudflare Workers のローカルシミュレータ。`crypto.subtle` を含む Workers API を忠実に再現し、CI 環境でもデプロイなしでテスト可能
  - Vitest + Miniflare の `workerd` プール統合（`@cloudflare/vitest-pool-workers`）で、実際の Workers ランタイム上でテスト実行可能
  - NFR 5.5「テストカバレッジ 90% 以上」を `vitest --coverage` (v8 provider) で計測・CI ゲート化
- **テスト戦略**:
  - ユニットテスト: Guard 関数の入出力検証（純粋関数部分）
  - 統合テスト: Miniflare 上で Hono アプリを起動し、HTTP リクエスト → Guard → ハンドラーのE2Eフロー検証
  - セキュリティテスト: `alg: none` 攻撃、期限切れトークン、アルゴリズムすり替え（NFR 5.4）
- **却下した代替案**:
  - Jest: ESM 対応が不完全。CJS 変換が必要で Workers コードとの相性が悪い
  - mocha: TypeScript 統合が弱く、カバレッジ計測に追加ツールが必要

---

## 6. リント・フォーマット

### Biome
- **選定理由**:
  - ESLint + Prettier を1ツールで代替。Rust 実装で 10-20 倍高速
  - CI 実行時間を短縮し、OSS コントリビューターの DX 向上
  - `biome.json` 1ファイルで lint + format ルールを統合管理
  - TypeScript strict mode との組み合わせで型安全性 + コード品質を二重保証
- **却下した代替案**:
  - ESLint + Prettier: 2ツールの設定・依存管理が煩雑。実行速度が遅い
  - deno lint: Deno エコシステム専用。npm パッケージとの統合が不自然

---

## 7. CI / CD

### GitHub Actions
- **選定理由**:
  - OSS の標準 CI プラットフォーム。コミュニティの期待に合致
  - npm publish の自動化（`npm publish --provenance` で SLSA provenance 付き公開）
  - ワークフロー構成:
    - **PR**: lint → type-check → test (Miniflare) → coverage gate (90%)
    - **main push**: lint → test → build → size check (< 10KB gzip)
    - **tag push (v*)**: build → npm publish → GitHub Release
- **却下した代替案**:
  - GitLab CI: GitHub ホスティング前提のため不採用
  - CircleCI: OSS 無料枠の制限が GitHub Actions より厳しい

---

## 8. パッケージ公開

### npm（semantic versioning）
- **選定理由**:
  - Hono エコシステムの標準配布チャネル
  - `semver` に厳密に従い、breaking change は major bump
  - `package.json` の `exports` フィールドで ESM/CJS の条件付きエクスポートを定義
- **パッケージ構成**:
  ```json
  {
    "name": "hono-auth-guard",
    "type": "module",
    "exports": {
      ".": {
        "import": "./dist/index.mjs",
        "require": "./dist/index.js",
        "types": "./dist/index.d.ts"
      },
      "./testing": {
        "import": "./dist/testing.mjs",
        "types": "./dist/testing.d.ts"
      }
    },
    "peerDependencies": {
      "hono": "^4.0.0"
    }
  }
  ```
- **サブパス `./testing`**: テスト用モックヘルパー（F-16）を別エントリポイントで提供。本番バンドルに含まれない

---

## 9. ドキュメント

### TypeDoc + README
- **選定理由**:
  - TypeDoc: JSDoc/TSDoc コメントから API リファレンスを自動生成。GitHub Pages にデプロイ
  - README.md: クイックスタート + 各 Guard の使用例。OSS の第一印象を決める最重要ドキュメント
  - 制約「README.md は英語」を遵守
- **却下した代替案**:
  - Docusaurus: ライブラリ規模に対してオーバーエンジニアリング。README + TypeDoc で十分
  - VitePress: 同上

---

## 10. 依存関係サマリ

| 区分 | パッケージ | バージョン | 種別 |
|------|-----------|-----------|------|
| Runtime | hono | ^4.0.0 | peerDependency |
| Runtime | (Web Crypto API) | — | ランタイム組込み |
| Build | tsup | ^8.0.0 | devDependency |
| Build | typescript | ^5.4.0 | devDependency |
| Test | vitest | ^2.0.0 | devDependency |
| Test | @cloudflare/vitest-pool-workers | ^0.5.0 | devDependency |
| Test | miniflare | ^3.0.0 | devDependency |
| Lint | @biomejs/biome | ^1.9.0 | devDependency |
| Doc | typedoc | ^0.26.0 | devDependency |

**外部 runtime dependency: ゼロ**（制約「外部依存は最小限」充足）

---

## 11. 開発環境セットアップ

```bash
# 前提: Node.js 20+ / npm 10+
git clone https://github.com/<org>/hono-auth-guard.git
cd hono-auth-guard
npm install

# 開発
npm run dev          # tsup --watch
npm run lint         # biome check
npm run lint:fix     # biome check --write
npm run typecheck    # tsc --noEmit
npm run test         # vitest (Miniflare pool)
npm run test:cov     # vitest --coverage
npm run build        # tsup (ESM + CJS + DTS)
npm run docs         # typedoc

# サイズチェック（CI でも実行）
npm run size         # gzip -c dist/index.mjs | wc -c  → < 10240
```

### 推奨エディタ
- VS Code + Biome 拡張機能（`biomejs.biome`）
- TypeScript 5.x がワークスペース版として自動利用される設定（`.vscode/settings.json`）

---

## セルフチェック

- [x] 全技術選定に要件・制約との紐付けがあるか
- [x] 却下した代替案とその理由が記載されているか
- [x] 外部 runtime dependency がゼロであるか（制約充足）
- [x] Web Crypto API のみ使用しているか（Node.js crypto 禁止）
- [x] TypeScript strict mode が明示されているか
- [x] バンドルサイズ目標（< 10KB gzip）が達成可能な構成か
- [x] テストカバレッジ目標（90%）の計測手段があるか
- [x] MIT License が明記されているか（npm package.json で指定）
- [x] 開発環境セットアップ手順があるか
