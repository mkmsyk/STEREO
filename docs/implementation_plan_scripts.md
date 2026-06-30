# 開発支援スクリプトの追加とルール組み込み計画

MONORALおよびSTEREOの開発時に、AI（Antigravity）がコード検証や雛形生成を自動化することで、トークン消費（特にファイル全体の読み込みや冗長なログ出力）を削減し、同時に設計原則（サンドボックス化、3D-2D境界維持など）を強力に担保するための支援スクリプトを作成・導入します。

## User Review Required

> [!IMPORTANT]
> - 本計画により、両リポジトリに `scripts/` ディレクトリが追加され、Node.jsベースの検証スクリプトが配置されます。
> - STEREOプロジェクトにこれまで存在しなかった `package.json` を新規追加し、スクリプト実行のハブとします。
> - `AGENTS.md` (プロジェクトルール) に、AIが実装時にこれらのスクリプトを強制的に使用するルールを追記します。

## Proposed Changes

### MONORAL プロジェクト

---

#### [NEW] [verify-sandbox.js](file:///c:/Users/mkmsy/Repositories/MONORAL/scripts/verify-sandbox.js)
カセット（Cartridge）のソースコードにおける以下の制限を静的に検証するスクリプト。
- 直接的な DOM / Window アクセス（`document.*`, `window.addEventListener` など）の禁止（※ `AudioContext` などの一部ホワイトリストを除く）。
- `fetch`, `XMLHttpRequest`, `WebSocket` などのネットワークアクセスの禁止。
- `localStorage` 等への直接アクセスの禁止（抽象 `storage` API を経由すること）。
- `cartridge.json`（またはマニフェスト）に定義されていない仮想デバイスポート（`ports`）へのアクセスの警告。

#### [NEW] [generate-cartridge.js](file:///c:/Users/mkmsy/Repositories/MONORAL/scripts/generate-cartridge.js)
カセットの雛形を生成するスクリプト。
- `--name=my-game` のような引数を受け取り、指定ディレクトリに最小限 of `cartridge.json`, `game.js`, `index.html`, `style.css` を自動生成する。
- AIが大量 of ボイラープレートコードを `write_to_file` で出力するトークン消費を削減する。

#### [MODIFY] [package.json](file:///c:/Users/mkmsy/Repositories/MONORAL/package.json)
- `scripts` に `verify` と `gen:cartridge` を追加する。
- 必要に応じて、静的解析を容易にするための最小限のパッケージ依存関係（`acorn` 等）を `devDependencies` に追加するか、標準モジュールのみでパース/正規表現検索を行う軽量スクリプトとして実装する（トークン節約のため、極力 npm 依存を減らし標準の `fs` や正規表現スキャンで高速かつシンプルに実装）。

#### [MODIFY] [.agents/AGENTS.md](file:///c:/Users/mkmsy/Repositories/MONORAL/.agents/AGENTS.md)
- AIの動作ルールとして、カセット作成時やコード修正時に `npm run verify` を実行し、ルール違反がないかを確認することを義務付けるルールを追記する。

---

### STEREO プロジェクト

---

#### [NEW] [package.json](file:///c:/Users/mkmsy/Repositories/STEREO/package.json)
STEREOプロジェクトに `package.json` を新規追加し、開発用スクリプトを動かせる環境を構築する。

#### [NEW] [check-engine-compat.js](file:///c:/Users/mkmsy/Repositories/STEREO/scripts/check-engine-compat.js)
- STEREO側で動作するゲームコード（`game.js`）が、STEREOのエミュレータ（`app.js`, `stereo.js`）で実装されている ENGINEv4 API（`pos`, `gps`, `grid` など）の仕様と乖離していないかを検証する。
- STEREO（3D）とMONORAL（2D）の境界が壊れるような不正なインポートや依存（例えば2D側の具象DOMロジックがSTEREO of コアに漏れ出していないか）がないか、ディレクトリ間の静的インポートチェックを行う。

#### [MODIFY] [.agents/AGENTS.md](file:///c:/Users/mkmsy/Repositories/STEREO/.agents/AGENTS.md)
- AIの動作ルールとして、コード検証時に `npm run verify` の実行を義務付けるルールを追記する。

---

### 共通ドキュメントの配置

#### [NEW] [implementation_plan_scripts.md](file:///c:/Users/mkmsy/Repositories/MONORAL/docs/implementation_plan_scripts.md)
#### [NEW] [implementation_plan_scripts.md](file:///c:/Users/mkmsy/Repositories/STEREO/docs/implementation_plan_scripts.md)
- 本実装計画書のコピーを両プロジェクトの `docs/` に配置し、リポジトリにコミット可能にする。

## Verification Plan

### Automated Tests
1. MONORAL側で `npm run verify` を実行し、既存 of `gb-demo/game.js` の検証結果を確認する。
2. 意図的に `document.getElementById` や `fetch` を仕込んだダミーファイルをテストスキャンし、正しくエラーを検知できるか確認する。
3. `npm run gen:cartridge --name=test-game` を実行し、雛形が正しく生成されることを確認する。
4. STEREO側で `npm run verify` を実行し、APIの適合性や依存境界のチェックが動作することを確認する。

### Manual Verification
- 生成された各ファイルの配置および `AGENTS.md` のルールの正しさを確認。
