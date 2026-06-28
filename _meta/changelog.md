# Changelog

## 2026-06-28 — Phase 2: Public API / Interface Design

Designer Agent による API Surface 設計を `_design/screen_flow.md` に出力。

### 成果物
- モジュール構成（5モジュール: main, jwt, api-key, oauth, testing）
- 全Guard/ヘルパーのTypeScript型シグネチャ
- Guard合成API（`compose` / `either`）
- RFC 7807エラーレスポンス形式（11エラー種別）
- 5つの利用例（基本JWT, RS256, APIキー+KV, OR合成+テスト, 型安全クレーム）
- API x ユーザーストーリー トレーサビリティマトリクス（US-01〜US-14全件マッピング）

### 設計判断
- `AuthInfo<T>` ジェネリクスで型安全なカスタムクレームを実現（F-05, F-07）
- `ApiKeyGuardOptions.validate` は `string | false` を返す設計（識別子をsubjectに自動設定）
- `AuthError` クラスに `toResponse()` メソッドを持たせRFC 7807変換を一元化
- `onSuccess` / `onFailure` コールバックをオプション型に含めることでF-15（Could）への拡張パスを確保
- OAuthGuard は Should 扱いでシグネチャのみ定義（実装はv1.x）

---

## 2026-06-28 — Phase 1-R レビュー指摘対応 (Rev.1)

Reviewer Agent による Phase 1-R FAIL 判定（4件の指摘）を全件修正。

### 指摘1: 孤立ユーザーストーリー（US-11, US-12）の解消
- F-16「テスト用モックヘルパー」を **MUST** に追加（関連: US-12）
- F-17「CORS互換性（preflightスキップ）」を **SHOULD** に追加（関連: US-11）
- 全ユーザーストーリー（US-01〜US-14）がMoSCoW機能にマッピングされていることを確認

### 指摘2: 「Guard」用語の一貫使用
- アプリ概要にGuardの定義を追加（`JwtGuard`, `ApiKeyGuard` の具体例付き）
- 機能名をGuard命名に統一: F-01〜F-03（JwtGuard/ApiKeyGuard）、F-04（Guard合成）、F-08〜F-09（OAuthGuard）、F-13（RoleGuard）
- ユーザーストーリー US-03, US-04, US-07, US-11 の記述をGuard用語に更新
- 用語集のGuard定義を拡充（Middlewareとの関係、具体的な関数名例を追記）

### 指摘3: ライセンス記載
- 非機能要件 5.6 に「MIT License」を追加

### 指摘4: F-07 vs F-11 の境界明確化
- F-07 の説明を「述語関数ベース: `(claims) => boolean`、コアGuardに組み込みの簡易バリデーション」と具体化
- F-11 の説明を「F-07の拡張、Zodスキーマによる型安全バリデーション + 型推論、`zod` はオプショナル peer dependency」と具体化
- 両者の役割分担を機能説明文中に明記

### 自己チェック更新
- 4件の指摘に対応するチェック項目を追加し、全項目PASSを確認
