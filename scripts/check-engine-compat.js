const fs = require('fs');
const path = require('path');

console.log("==> [STEREO Verify] Checking ENGINEv4 Compat & 3D-2D Boundary...");

const stereoAppPath = path.resolve(process.cwd(), 'app.js');
const stereoJsPath = path.resolve(process.cwd(), 'stereo.js');
const gameJsPath = path.resolve(process.cwd(), 'game.js'); // MONORALからコピーされた、または配置されている game.js

let errors = [];

// 1. 3D-2D境界のチェック (多重入れ子境界の維持)
if (fs.existsSync(gameJsPath)) {
  console.log(`   Analyzing game code (2D Cartridge): ${gameJsPath}`);
  const gameCode = fs.readFileSync(gameJsPath, 'utf-8');
  const gameLines = gameCode.split(/\r?\n/);
  
  gameLines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    
    // 2Dゲーム側が 3Dエンジン(Three.js)のオブジェクトを直接参照していないか
    if (/\bTHREE\b/.test(line)) {
      errors.push({
        file: 'game.js',
        line: lineNum,
        content: trimmed,
        message: "2D game code (Cartridge) must not reference Three.js (THREE). Keep 3D engine isolated.",
        level: "ERROR"
      });
    }
    
    // 2Dゲーム側が OrbitControls などの 3DUI コンポーネントを参照していないか
    if (/\bOrbitControls\b/.test(line) || /\bcontrols\b/.test(line) && !trimmed.includes('controls:') && !trimmed.includes('control')) {
      // 誤検知を防ぐため、単純な controls という変数名以外の 3D OrbitControls をチェック
      if (/\bcontrols\./.test(line)) {
        errors.push({
          file: 'game.js',
          line: lineNum,
          content: trimmed,
          message: "2D game code must not touch 3D OrbitControls.",
          level: "ERROR"
        });
      }
    }
  });

  // STEREOホスト（app.js）と連携するための必須API（getInsertedCartridge等）が定義されているか検証
  const requiredApis = ['init', 'getInsertedCartridge', 'insertCartridge', 'getPower', 'setPower', 'reset', 'audio'];
  requiredApis.forEach(api => {
    // 簡易的な文字列・正規表現チェックでAPIの存在をアサート
    const regex = new RegExp('\\b' + api + '\\b\\s*:');
    if (!regex.test(gameCode)) {
      errors.push({
        file: 'game.js',
        line: 1,
        content: `Missing API: ${api}`,
        message: `2D demo game.js must export '${api}' API for STEREO host compatibility. DO NOT remove it!`,
        level: "ERROR"
      });
    }
  });
} else {
  console.log("   [INFO] game.js not found in STEREO directory. Skipping cartridge-side check.");
}

// 2. ホスト側 (app.js / stereo.js) の結合度チェック
if (fs.existsSync(stereoAppPath)) {
  console.log(`   Analyzing 3D Host App: ${stereoAppPath}`);
  const appCode = fs.readFileSync(stereoAppPath, 'utf-8');
  const appLines = appCode.split(/\r?\n/);
  
  appLines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    
    // 3Dホスト側が2Dゲームの内部変数 (player.vx, objects, highscore 等) に直接アクセスしていないか。
    // アクセスは GBGame.getPower(), GBGame.getInsertedCartridge() などの公開API経由であるべき。
    const forbiddenPatterns = [
      { pattern: /\bGBGame\.(player|objects|score|highscore|state)\b/, name: "Internal game variables" }
    ];
    
    forbiddenPatterns.forEach(rule => {
      if (rule.pattern.test(line)) {
        errors.push({
          file: 'app.js',
          line: lineNum,
          content: trimmed,
          message: `3D Host must not access 2D game internals directly (${rule.name}). Use HostAdapter/Bridge API.`,
          level: "ERROR"
        });
      }
    });
  });
}

// 結果の出力
console.log("\n==> [STEREO Verify] Report:");
const errorCount = errors.filter(e => e.level === "ERROR").length;

if (errors.length === 0) {
  console.log("   [OK] No boundary or compatibility violations detected. Architecture nesting is clean.");
  process.exit(0);
} else {
  errors.forEach(err => {
    console.log(`   [ERR] ${err.file}:${err.line}: "${err.content}" -> ${err.message}`);
  });
  console.log(`\n   Summary: ${errorCount} errors found.`);
  process.exit(1);
}
