# 決定事項ログ

## 2026-06-28 Phase 0
### [決定] プロジェクト基本方針
- **内容**: Cloudflare Workers + Hono向け軽量認証ミドルウェアをOSSとして開発
- **理由**: Workers + Hono でAPIを構築する開発者が増えているが、JWT/OAuth/API Keyを統合的に扱う軽量パッケージの決定版がない
- **代替案**: hono/bearer-auth（JWT only）、itty-router-extras（Hono非対応）
- **影響範囲**: 全設計・実装
- **決定者**: ユーザー

### [決定] ターゲット
- **内容**: Workers + Hono でAPI構築する開発者（英語圏中心）
- **決定者**: ユーザー

### [決定] スコープ外
- **内容**: セッション管理、DB実装、フロントエンドUI
- **決定者**: ユーザー

## 2026-06-28 Phase 2

### [決定] AuthInfoジェネリクス設計
- **内容**: `AuthInfo<TClaims>` にジェネリクスを導入し、`jwtGuard<TClaims>()` で型パラメータを渡す設計
- **理由**: `c.get('auth').claims` の型をユーザー定義のカスタムクレーム型で補完可能にするため（F-05, F-07）
- **代替案**: `as` キャストをユーザーに強制 / `unknown` のまま → DX低下のため不採用
- **決定者**: Designer Agent

### [決定] ApiKeyGuard validate関数の戻り値
- **内容**: `validate` は `string | false` を返す。`string` はクライアント識別子でありそのまま `AuthInfo.subject` に設定される
- **理由**: APIキーの「誰のキーか」をGuard内で解決し、後続ハンドラーで参照可能にするため
- **代替案**: `boolean` のみ返す → subject が不明になりUS-13(レートリミティング)等で不便
- **決定者**: Designer Agent

### [決定] エラーハンドリング方式
- **内容**: `AuthError` クラスが `toResponse()` を持ち、RFC 7807準拠の `Response` オブジェクトを返す。Guardはミドルウェア内で直接レスポンスを返す（throwではない）
- **理由**: Honoのミドルウェアパターンに沿い、`app.onError` でのカスタマイズも可能にするため
- **代替案**: 専用エラーハンドラーミドルウェアを必須にする → セットアップが煩雑になるため不採用
- **決定者**: Designer Agent

### [決定] モジュール分割方針
- **内容**: 5つのサブパスエクスポート（main, jwt, api-key, oauth, testing）
- **理由**: Tree-shaking によりJWTのみ使用時にAPIキーやOAuthのコードを含めないため（バンドルサイズ5KB未満目標）
- **代替案**: 単一エントリポイント → Tree-shakingがバンドラー依存になるため不採用
- **決定者**: Designer Agent
