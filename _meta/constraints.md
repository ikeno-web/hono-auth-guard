# 禁止事項・制約リスト

## 技術的制約
- [必須] Web Crypto API のみ使用（Node.js crypto禁止 — Workers互換性）
- [必須] Workers CPU制限（10ms free / 50ms paid）内で動作
- [必須] TypeScript strict mode
- [禁止] Node.js専用API（fs, path, crypto等）
- [禁止] 外部依存は最小限（hono peer dependency のみ許容）

## 設計的制約
- [必須] Hono Middleware パターン準拠
- [必須] Tree-shaking可能なモジュール構成
- [禁止] グローバル状態・副作用

## OSSとしての制約
- [必須] README.md は英語
- [必須] MIT License
- [必須] テストカバレッジ 90%以上
- [必須] npm publish 可能な状態
