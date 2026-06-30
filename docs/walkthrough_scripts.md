# 開発支援スクリプト追加 ＆ 動作検証完了報告 (Walkthrough)

MONORALおよびSTEREO開発において、AIのトークン消費量を削減し、かつ設計原則（サンドボックス制限・多重入れ子設計の維持）を強力に担保するための「自動検証」および「雛形自動生成」スクリプトを両プロジェクトへ導入し、ルール（`AGENTS.md`）へ組み込みました。

---

## 🛠️ 実施内容

### 1. MONORAL プロジェクト
* **新規作成**
  * [verify-sandbox.js](file:///c:/Users/mkmsy/Repositories/MONORAL/scripts/verify-sandbox.js): 2Dゲームコードが直接 DOM, ネットワーク, `localStorage` などに触れるサンドボックス違反がないかを静的スキャンするスクリプト。またマニフェスト（`cartridge.json`）との I/O ポート・機能整合性をチェック。
  * [generate-cartridge.js](file:///c:/Users/mkmsy/Repositories/MONORAL/scripts/generate-cartridge.js): `--name` に基づき、カセットの雛形ファイル群（`cartridge.json`, `game.js`, `index.html`, `style.css`）をワンコマンドで自動生成するスクリプト。
* **ファイル修正**
  * [package.json](file:///c:/Users/mkmsy/Repositories/MONORAL/package.json): `scripts` に `verify` と `gen:cartridge` コマンドを登録。
  * [.agents/AGENTS.md](file:///c:/Users/mkmsy/Repositories/MONORAL/.agents/AGENTS.md): 新規カセット作成時・コード修正時の検証において、AIにこれらのスクリプトの使用を義務付けるルールを追記。

### 2. STEREO プロジェクト
* **新規作成**
  * [package.json](file:///c:/Users/mkmsy/Repositories/STEREO/package.json): スクリプト実行管理のためにプロジェクトルートへ新規追加。
  * [check-engine-compat.js](file:///c:/Users/mkmsy/Repositories/STEREO/scripts/check-engine-compat.js): 3Dホスト（`app.js`）と2Dミニゲーム（`game.js`）の境界を侵す不正な参照を検出し、ENGINEv4 API への適合性を検証するスクリプト。
* **ファイル修正**
  * [.agents/AGENTS.md](file:///c:/Users/mkmsy/Repositories/STEREO/.agents/AGENTS.md): コード変更時・検証時に `npm run verify` の自動検証実行を義務付けるルールを追記。

---

## 🧪 動作確認 ＆ 検証結果

### 1. MONORAL 側の検証

#### A. サンドボックス検証 (`npm run verify`)
既存の `gb-demo/game.js` に対して検証スクリプトを実行し、意図的に仕込まれた（あるいはレガシーな）`localStorage` の直接操作を正しく検出することを確認しました。
```bash
$ npm run verify gb-demo/game.js

==> [Sandbox Verify] Analyzing file: gb-demo/game.js
==> [Sandbox Verify] Report for gb-demo/game.js:
   [WRN] Line 7: "const canvas = document.getElementById('virtual-screen');" -> [WARNING/LEGACY] Legacy canvas lookup in gb-demo. Cartridges must not do this.
   [ERR] Line 64: "localStorage.setItem..." -> Direct 'localStorage' is forbidden. Use storage API port.
   [ERR] Line 72: "const val = localStorage.getItem..." -> Direct 'localStorage' is forbidden. Use storage API port.
   [ERR] Line 80: "localStorage.removeItem..." -> Direct 'localStorage' is forbidden. Use storage API port.

   Summary: 3 errors, 1 warnings.
```
* **結果**: エラーを正常検出し、終了コード `1` で終了することを確認。

#### B. カセットの雛形自動生成 (`npm run gen:cartridge`)
コマンドを実行し、ファイルが一括生成されること、および生成されたファイルが正常にチェックを通過することを確認しました。
```bash
$ npm run gen:cartridge -- --name=my-test-game
==> [Generate Cartridge] Creating new cartridge: my-test-game
==> [Generate Cartridge] Done!

$ npm run verify cartridges/my-test-game/game.js
==> [Sandbox Verify] Report for cartridges/my-test-game/game.js:
   [OK] No sandbox violations detected.
```
* **結果**: 正常にファイルが自動生成され、ホワイトリスト（`window.CartridgeRuntime` 等）を通過して `[OK]` となることを確認。（※確認後のテスト用ディレクトリはクリーンアップ済み）

---

### 2. STEREO 側の検証

#### 多重入れ子境界チェック (`npm run verify`)
STEREO 側の検証を実行し、現在のコード構成（3Dと2Dの間の境界）がクリーンであることを確認しました。
```bash
$ npm run verify

==> [STEREO Verify] Checking ENGINEv4 Compat & 3D-2D Boundary...
   Analyzing game code (2D Cartridge): C:\Users\mkmsy\Repositories\STEREO\game.js
   Analyzing 3D Host App: C:\Users\mkmsy\Repositories\STEREO\app.js

==> [STEREO Verify] Report:
   [OK] No boundary or compatibility violations detected. Architecture nesting is clean.
```
* **結果**: 不正な依存がないクリーンな状態であることを正常に検出。

---

## 📈 トークン削減効果の推測
* **ファイル新規作成時**: AIが数百行のHTML/JS/CSSのボイラープレートを出力していたのが、コマンド1行（`npm run gen:cartridge`）の出力で済むようになり、**出力トークンを約 90% 削減**。
* **コード検証・デバッグ時**: AIが数百〜数千行のJSコードを手動で読んでDOMやネットワークなどの違反を探す必要がなくなり、検証コマンドの結果（エラー行のみ）を読むだけで済むようになるため、**入力トークンを約 80% 削減**。
