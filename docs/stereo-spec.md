# STEREO 3D仮想ゲームエンジン仕様書 (stereo-spec.md)

> 作成日: 2026-06-29  
> ステータス: ドラフト (将来ロードマップ)

本文書は、WebGL (Three.js 等) を最大限に活用した 3D 専用仮想ゲームエンジン **STEREO** のシステム・アーキテクチャおよび機能要件について定義します。

---

## 1. 目的とビジョン

MONORAL (2Dエンジン) の親ホスト環境として機能する、WebGL 上の 3D 仮想空間エンジンを提供します。
ブラウザ単体で「3Dのゲームセンター空間（STEREO）」を起動し、その中に置かれた3D筐体のモニター上で「2Dレトロゲーム（MONORAL）」をネストして動かすという、多重入れ子型ゲームセンターの実現を目的とします。

---

## 2. システム・アーキテクチャ

```text
Host Browser (HTML5)
  └── STEREO Runtime (3D WebGL VM)
        ├── 3D Scene / Voxel Mesh (Three.js)
        ├── OrbitControls / Raycaster (Input)
        └── MONORAL Monitor (Texture Screen)
              └── MONORAL Runtime (2D Canvas VM)
```

### 2.1 STEREO Runtime
* **VM仕様**: EngineScript (Lua) を解釈し、3D 空間モデル、マテリアル、カメラ、入力を制御する。
* **WebGL レンダラー**: Three.js 等を内包し、仮想ディスプレイへ 3D 描画を出力する。
* **多重接続ゲート (Monitor Adapter)**:
  * 3D空間内の特定メッシュ（モニター面）のテクスチャソースとして、下位の 2D ゲーム（MONORAL）の CanvasTexture を動的更新・バインドする。

---

## 3. 提供 API (EngineScript 3D 拡張)

STEREO は、ENGINEv4 / Unity 互換の以下の API を WebGL/JS 側でエミュレートして提供します。

### 3.1 3D空間・位置 (`pos`, `gps`)
* `pos.new(x, y, z)`: 3D 座標オブジェクトの生成。
* `gps.is_occupied(pos)`: 指定座標のオブジェクト占有判定。

### 3.2 データベースクエリ (`db`)
* `db.query(sql)`: インメモリSQLite または WebAssembly版 SQLite を介した SQL 参照。

### 3.3 3D UI / ウィンドウ (`ui`)
* `ui.panel_create(options)`: HTML5/CSS 側に動的に 2D/3D オーバーレイ UI パネルを生成する。

---

## 4. 互換境界と能力検証

* 3D物理やアセットシステムなど、Web環境側でサポートできない高級機能に対しては、カートリッジマニフェストの `capabilities` 検証によって、安全に起動を拒否（Fail-Loud）する。
