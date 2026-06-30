/**
 * MONORAL 2D Game Engine (Game Boy style: 160x144, 4-colors monochrome)
 * Powered by Wasmoon (WebAssembly Lua VM) with Dynamic 2D Cartridge Selection, Bootloader & Web Audio API
 */

const GBGame = (function() {
  const canvas = document.getElementById('virtual-screen');
  const ctx = canvas.getContext('2d');

  // ゲームボーイ実機風カラーパレット
  const PALETTE = [
    { r: 155, g: 188, b: 15 },  // COLOR_0: 最も明るい緑 (背景)
    { r: 139, g: 172, b: 15 },  // COLOR_1: 明るい緑
    { r: 48,  g: 98,  b: 48 },  // COLOR_2: 暗い緑
    { r: 15,  g: 56,  b: 15 }   // COLOR_3: 最も暗い緑 (文字やアウトライン)
  ];

  const WIDTH = 160;
  const HEIGHT = 144;

  // 1. ゼロコピー描画バッファ (RGBA) の確保
  const pixelBuffer = new Uint8Array(WIDTH * HEIGHT * 4);
  const imgData = new ImageData(new Uint8ClampedArray(pixelBuffer.buffer), WIDTH, HEIGHT);

  // 2. 仮想キー入力の管理
  const inputs = {
    left: false, right: false, up: false, down: false,
    a: false, b: false, start: false, select: false
  };
  const prevInputs = { ...inputs };

  let lua = null;
  let isLoaded = false;
  let powerOn = false;              // 電源スイッチのオンオフ
  let insertedCartridge = null;     // 初期状態は空（カセット未挿入状態）
  let powerError = false;           // カセット交換警告エラー状態

  // A. Web Audio API によるレトロサウンドシステム (AudioManager)
  const AudioManager = {
    ctx: null,
    
    init: function() {
      if (this.ctx) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    },
    
    resume: function() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    },
    
    // 実機「ピコーン」ブート音の再現
    playBoot: function() {
      this.resume();
      if (!this.ctx) return;
      
      const now = this.ctx.currentTime;
      
      // 1音目: 660Hz (極短)
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'square';
      osc1.frequency.setValueAtTime(660, now);
      gain1.gain.setValueAtTime(0.04, now);
      gain1.gain.exponentialRampToValueAtTime(0.005, now + 0.05);
      
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.05);
      
      // 2音目: 1320Hz (少し長い)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(1320, now + 0.06);
      gain2.gain.setValueAtTime(0.04, now + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + 0.06);
      osc2.stop(now + 0.5);
    },

    // カセット未挿入/エラー時の「ブッ」という極短の警告音
    playError: function() {
      this.resume();
      if (!this.ctx) return;
      
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.12);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    },

    // カセットを挿入した時のガチャッという物理的接触SE
    playInsert: function() {
      this.resume();
      if (!this.ctx) return;
      
      const now = this.ctx.currentTime;
      
      // 1音目: 低いカサカサしたノコギリ波
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(150, now);
      gain1.gain.setValueAtTime(0.06, now);
      gain1.gain.linearRampToValueAtTime(0.001, now + 0.07);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.07);

      // 2音目: カチッという三角波のラッチ音
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(500, now + 0.04);
      gain2.gain.setValueAtTime(0.05, now + 0.04);
      gain2.gain.linearRampToValueAtTime(0.001, now + 0.12);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + 0.04);
      osc2.stop(now + 0.12);
    },

    // Lua VM から直接呼び出す効果音 (PSGエミュレーション)
    playTone: function(freq, duration, volume, type) {
      this.resume();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);
      
      const vol = Math.max(0, Math.min(0.2, volume !== undefined ? volume : 0.05));
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now);
      osc.stop(now + duration);
    }
  };

  // B. ゲームボーイ風ブートアニメーションの状態
  const bootState = {
    active: false,
    t: 0,
    logoY: -20,
    soundPlayed: false,
    duration: 2.2 // 全体で 2.2 秒の起動画面
  };

  function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
  }

  // ブート画面の描画 (isJumbled が true であれば文字化けロゴと挿入案内を描画)
  function drawBootScreen(logoY, isJumbled) {
    ctx.fillStyle = '#9bbc0f'; // COLOR_0 (明るい緑)
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.save();
    
    // 文字の描画スタイル（実機風）
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px monospace';
    
    // 文字枠の影 (COLOR_3: 最も暗い緑)
    ctx.strokeStyle = '#0f380f';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    
    const text = isJumbled ? '■■■■■■■' : 'MONORAL';
    ctx.strokeText(text, WIDTH / 2, logoY);
    
    // 文字の内側 (背景色で抜く)
    ctx.fillStyle = '#9bbc0f';
    ctx.fillText(text, WIDTH / 2, logoY);
    
    // 文字化けしていない場合のみ商標マーク ®
    if (!isJumbled) {
      ctx.fillStyle = '#0f380f';
      ctx.font = '6px monospace';
      ctx.fillText('®', WIDTH / 2 + 38, logoY - 7);
    }
    
    ctx.restore();

    // 画面下部の境界線と「NESTED ENGINE」のテキスト
    if (logoY >= 56) {
      ctx.fillStyle = '#0f380f';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      
      if (isJumbled) {
        ctx.fillText('INSERT CARTRIDGE', WIDTH / 2, 98);
      } else {
        ctx.fillText('NESTED ENGINE', WIDTH / 2, 98);
      }
      
      ctx.strokeStyle = '#0f380f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(32, 105);
      ctx.lineTo(128, 105);
      ctx.stroke();
    }
  }

  // ロード進捗表示 (ブート完了前はログ記録のみにし、アニメーションを妨害しない)
  function updateProgress(percent, text, isError = false) {
    if (!powerOn) {
      clearScreenBlack();
      return;
    }

    if (isError) {
      ctx.fillStyle = '#9bbc0f';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      
      ctx.fillStyle = '#b91c1c'; // エラー赤
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BOOT EXCEPTION', WIDTH / 2, 45);
      
      ctx.fillStyle = '#0f380f';
      ctx.font = '7px monospace';
      
      const words = text.split(' ');
      let line = '';
      let y = 65;
      for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        if (metrics.width > WIDTH - 16 && n > 0) {
          ctx.fillText(line, WIDTH / 2, y);
          line = words[n] + ' ';
          y += 9;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, WIDTH / 2, y);
      
      // エラー「ブー」音
      AudioManager.playError();
      return;
    }

    // 裏でのロード状況を開発コンソールに記録
    console.log(`[MONORAL Boot Loader] ${percent}%: ${text}`);
  }

  // 画面を消灯 (電源オフ時の液晶パネルの反射緑)
  function clearScreenBlack() {
    ctx.fillStyle = '#839c16'; // 消灯状態の液晶のオリーブグリーン
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // 通電中のカセット交換に対する警告ダイアログ
  function triggerPowerError() {
    AudioManager.playError(); // 一瞬の「ブッ」音
    
    const dialog = document.getElementById('error-dialog');
    if (dialog) {
      dialog.style.display = 'flex';
      setTimeout(() => {
        dialog.classList.add('active');
      }, 10);

      const closeBtn = document.getElementById('error-dialog-close');
      if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.dataset.bound = "true";
        closeBtn.addEventListener('click', () => {
          clearPowerError();
        });
      }
    }
  }

  function clearPowerError() {
    const dialog = document.getElementById('error-dialog');
    if (dialog && dialog.classList.contains('active')) {
      dialog.classList.remove('active');
      setTimeout(() => {
        dialog.style.display = 'none';
      }, 220);
    }
  }

  // 3. Wasmoon Lua VM の初期化とロード
  async function initLua() {
    isLoaded = false;
    if (!powerOn || !insertedCartridge) return;

    try {
      updateProgress(10, 'WASM VM LOAD');
      if (!window.wasmoon || !window.wasmoon.LuaFactory) {
        throw new Error('Wasmoon UMD script not loaded in head. Check CDN connection.');
      }
      const { LuaFactory } = window.wasmoon;
      const factory = new LuaFactory('https://cdn.jsdelivr.net/npm/wasmoon@1.15.0/dist/glue.wasm');

      updateProgress(35, 'LUA CORE CREATE');
      lua = await factory.createEngine();

      updateProgress(60, 'BIND DEVICE API');
      
      // ゼロコピーバッファのセット
      lua.global.set('pixelBuffer', pixelBuffer);
      lua.global.set('SCREEN_WIDTH', WIDTH);
      lua.global.set('SCREEN_HEIGHT', HEIGHT);

      // screen 描画 API
      lua.global.set('screen', {
        clear: (colorIdx) => {
          const c = PALETTE[colorIdx] || PALETTE[0];
          for (let i = 0; i < pixelBuffer.length; i += 4) {
            pixelBuffer[i] = c.r;
            pixelBuffer[i + 1] = c.g;
            pixelBuffer[i + 2] = c.b;
            pixelBuffer[i + 3] = 255;
          }
        },
        rect: (x, y, w, h, colorIdx, fill) => {
          const c = PALETTE[colorIdx] || PALETTE[3];
          const startX = Math.max(0, Math.floor(x));
          const endX = Math.min(WIDTH, Math.floor(x + w));
          const startY = Math.max(0, Math.floor(y));
          const endY = Math.min(HEIGHT, Math.floor(y + h));

          const shouldFill = fill !== false;

          if (shouldFill) {
            for (let py = startY; py < endY; py++) {
              for (let px = startX; px < endX; px++) {
                const idx = (py * WIDTH + px) * 4;
                pixelBuffer[idx] = c.r;
                pixelBuffer[idx + 1] = c.g;
                pixelBuffer[idx + 2] = c.b;
                pixelBuffer[idx + 3] = 255;
              }
            }
          } else {
            // 枠線のみ
            for (let px = startX; px < endX; px++) {
              if (startY >= 0 && startY < HEIGHT) {
                const idx = (startY * WIDTH + px) * 4;
                pixelBuffer[idx] = c.r; pixelBuffer[idx + 1] = c.g; pixelBuffer[idx + 2] = c.b; pixelBuffer[idx + 3] = 255;
              }
              const bottomY = endY - 1;
              if (bottomY >= 0 && bottomY < HEIGHT) {
                const idx = (bottomY * WIDTH + px) * 4;
                pixelBuffer[idx] = c.r; pixelBuffer[idx + 1] = c.g; pixelBuffer[idx + 2] = c.b; pixelBuffer[idx + 3] = 255;
              }
            }
            for (let py = startY; py < endY; py++) {
              if (startX >= 0 && startX < WIDTH) {
                const idx = (py * WIDTH + startX) * 4;
                pixelBuffer[idx] = c.r; pixelBuffer[idx + 1] = c.g; pixelBuffer[idx + 2] = c.b; pixelBuffer[idx + 3] = 255;
              }
              const rightX = endX - 1;
              if (rightX >= 0 && rightX < WIDTH) {
                const idx = (py * WIDTH + rightX) * 4;
                pixelBuffer[idx] = c.r; pixelBuffer[idx + 1] = c.g; pixelBuffer[idx + 2] = c.b; pixelBuffer[idx + 3] = 255;
              }
            }
          }
        }
      });

      // input API
      lua.global.set('input', {
        btn: (name) => {
          const val = !!inputs[name];
          if (val) console.log(`[Lua API] btn('${name}') = true`);
          return val;
        },
        btnp: (name) => {
          const val = !!inputs[name] && !prevInputs[name];
          if (val) console.log(`[Lua API] btnp('${name}') = true`);
          return val;
        }
      });

      // audio API (Lua 側からの効果音呼び出し)
      lua.global.set('audio', {
        play: (freq, duration, volume, type) => {
          AudioManager.playTone(freq, duration, volume, type);
        }
      });

      // storage API (セーブデータIDをカセットごとに分岐)
      lua.global.set('storage', {
        read: (key, defaultValue) => {
          const saveKey = 'MONORAL_GB_' + insertedCartridge.toUpperCase() + '_SAVE';
          const save = JSON.parse(localStorage.getItem(saveKey) || '{}');
          return save[key] !== undefined ? save[key] : defaultValue;
        },
        write: (key, value) => {
          const saveKey = 'MONORAL_GB_' + insertedCartridge.toUpperCase() + '_SAVE';
          const save = JSON.parse(localStorage.getItem(saveKey) || '{}');
          save[key] = value;
          localStorage.setItem(saveKey, JSON.stringify(save));
        }
      });

      updateProgress(80, 'LOAD CARTRIDGE');
      const luaFile = {
        'meteor': 'game.lua',
        'paint': 'paint.lua',
        'clock': 'clock.lua'
      }[insertedCartridge] || 'game.lua';

      const response = await fetch(luaFile + '?v=' + Date.now());
      if (!response.ok) {
        throw new Error(`${luaFile} fetch failed (HTTP ${response.status})`);
      }
      const luaCode = await response.text();
      await lua.doString(luaCode);

      updateProgress(95, 'INIT LUA CALL');
    } catch (err) {
      console.error('Wasmoon initialization failed:', err);
      updateProgress(0, `BOOT ERR: ${err.message || err}`, true);
    }
  }

  // 4. 60FPS 定量ループ
  let lastTime = 0;
  const fpsInterval = 1000 / 60;
  let lastGameTime = 0;

  async function tick(timestamp) {
    requestAnimationFrame(tick);

    if (!timestamp) timestamp = performance.now();
    const elapsed = timestamp - lastTime;
    
    // アニメーション用の dt 計算
    if (lastGameTime === 0) lastGameTime = timestamp;
    const dt = (timestamp - lastGameTime) / 1000;
    lastGameTime = timestamp;

    if (elapsed >= fpsInterval) {
      lastTime = timestamp - (elapsed % fpsInterval);

      // 電源が入っていない場合は消灯
      if (!powerOn) {
        clearScreenBlack();
        return;
      }

      // A. 電源ON ＆ ブートアニメーション実行中
      if (powerOn && !isLoaded) {
        if (bootState.active) {
          bootState.t += dt;
          
          // 1.0秒かけてロゴが Y=-20 から Y=56 へ降下
          const progress = Math.min(1.0, bootState.t / 1.0);
          bootState.logoY = lerp(-20, 56, progress);
          
          const isJumbled = (insertedCartridge === null);
          
          // 中央に達した瞬間に音を再生
          if (bootState.logoY >= 56 && !bootState.soundPlayed) {
            if (isJumbled) {
              AudioManager.playError(); // 文字化け時は「ブー」警告音
            } else {
              AudioManager.playBoot();  // 正常時は「ピコーン」
            }
            bootState.soundPlayed = true;
          }
          
          // 画面にブートロゴを描画 (カセット未挿入なら文字化け)
          drawBootScreen(bootState.logoY, isJumbled);
          
          // カセットが挿さっており、2.2秒以上経過し、かつ Lua VM ロードが完了していればゲーム起動へ遷移
          if (!isJumbled && bootState.t >= 2.2 && lua) {
            try {
              const initFn = lua.global.get('init');
              if (initFn) {
                await initFn();
              }
              isLoaded = true;
              bootState.active = false;
            } catch (err) {
              console.error('Lua init failed:', err);
              updateProgress(0, `BOOT ERR: ${err.message || err}`, true);
            }
          }
        }
        return;
      }

      // B. 電源ON、ロード完了後 (Lua カートリッジの実行)
      if (isLoaded && lua) {
        // Lua update & draw 呼び出し
        const updateFn = lua.global.get('update');
        if (updateFn) await updateFn(fpsInterval / 1000);

        const drawFn = lua.global.get('draw');
        if (drawFn) await drawFn();

        // ゼロコピーピクセルバッファ投影
        ctx.putImageData(imgData, 0, 0);

        // 前フレームの入力を保存（Luaの更新実行後に保存）
        for (const k in inputs) {
          prevInputs[k] = inputs[k];
        }

        // カートリッジ別のテキストオーバーレイ描画
        const luaState = lua.global.get('state');
        const luaScore = lua.global.get('score');
        const luaHiScore = lua.global.get('hi_score');
        const luaTitleY = lua.global.get('title_y');
        const luaFlashTimer = lua.global.get('flash_timer');

        ctx.fillStyle = '#0f380f'; // COLOR_3
        ctx.font = '8px monospace';

        if (insertedCartridge === 'meteor') {
          if (luaState === 'TITLE') {
            ctx.textAlign = 'center';
            ctx.font = 'bold 15px monospace';
            ctx.fillText('MONORAL', WIDTH / 2, luaTitleY || 35);
            ctx.font = '8px monospace';
            ctx.fillText('Lua VM Cartridge', WIDTH / 2, (luaTitleY || 35) + 12);
            if (luaFlashTimer < 30) ctx.fillText('PRESS START BUTTON', WIDTH / 2, 90);
            ctx.fillText(`HI-SCORE: ${String(luaHiScore || 0).padStart(6, '0')}`, WIDTH / 2, 125);
          } else if (luaState === 'PLAYING') {
            ctx.textAlign = 'left';
            ctx.fillText(`SCORE: ${String(luaScore || 0).padStart(6, '0')}`, 8, 14);
            ctx.textAlign = 'right';
            ctx.fillText(`HI: ${String(luaHiScore || 0).padStart(6, '0')}`, WIDTH - 8, 14);
          } else if (luaState === 'GAMEOVER') {
            ctx.textAlign = 'center';
            ctx.font = 'bold 13px monospace';
            ctx.fillText('GAME OVER', WIDTH / 2, 52);
            ctx.font = '8px monospace';
            ctx.fillText(`SCORE: ${String(luaScore || 0).padStart(6, '0')}`, WIDTH / 2, 72);
            ctx.fillText(`HI-SCORE: ${String(luaHiScore || 0).padStart(6, '0')}`, WIDTH / 2, 84);
            if (luaFlashTimer < 30) ctx.fillText('A BUTTON TO RETRY', WIDTH / 2, 115);
          }
        } else if (insertedCartridge === 'paint') {
          if (luaState === 'TITLE') {
            ctx.textAlign = 'center';
            ctx.font = 'bold 15px monospace';
            ctx.fillText('LUA PAINT', WIDTH / 2, luaTitleY || 35);
            ctx.font = '8px monospace';
            ctx.fillText('Dot Art Creator', WIDTH / 2, (luaTitleY || 35) + 12);
            if (luaFlashTimer < 30) ctx.fillText('PRESS START BUTTON', WIDTH / 2, 90);
          } else if (luaState === 'PLAYING') {
            ctx.textAlign = 'center';
            ctx.fillText('A:DRAW  B:ERASE  START:MENU', WIDTH / 2, 14);
          }
        } else if (insertedCartridge === 'clock') {
          let luaTimer = 0;
          let luaRecord = 9.99;
          if (lua && isLoaded) {
            try {
              luaTimer = lua.global.get('timer') || 0;
              luaRecord = lua.global.get('record') || 9.99;
            } catch(e) {}
          }
          
          if (luaState === 'TITLE') {
            ctx.textAlign = 'center';
            ctx.font = 'bold 15px monospace';
            ctx.fillText('10s CHALLENGE', WIDTH / 2, luaTitleY || 35);
            ctx.font = '8px monospace';
            ctx.fillText('Stop at Just 10.00s!', WIDTH / 2, (luaTitleY || 35) + 12);
            if (luaFlashTimer < 30) ctx.fillText('PRESS START BUTTON', WIDTH / 2, 90);
          } else if (luaState === 'PLAYING') {
            ctx.textAlign = 'center';
            ctx.font = 'bold 20px monospace';
            ctx.fillText(luaTimer.toFixed(2) + 's', WIDTH / 2, 65);
            
            ctx.font = '8px monospace';
            ctx.fillText('A BUTTON: STOP!', WIDTH / 2, 83);
            ctx.fillText('AIM FOR 10.00 SECONDS', WIDTH / 2, 98);
          } else if (luaState === 'STOPPED') {
            const diff = luaTimer - 10.00;
            const diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(2) + 's';
            
            ctx.textAlign = 'center';
            ctx.font = 'bold 20px monospace';
            ctx.fillText(luaTimer.toFixed(2) + 's', WIDTH / 2, 55);
            
            ctx.font = 'bold 10px monospace';
            ctx.fillText('DIFF: ' + diffStr, WIDTH / 2, 72);
            
            ctx.font = '8px monospace';
            if (Math.abs(diff) < 0.05) {
              ctx.fillText('★ PERFECT !!! ★', WIDTH / 2, 85);
            } else {
              ctx.fillText('BEST DIFF: ' + luaRecord.toFixed(2) + 's', WIDTH / 2, 85);
            }
            
            ctx.fillText('B BUTTON: RETRY', WIDTH / 2, 105);
          }
        }
      }
    }
  }

  function shutDownLua() {
    isLoaded = false;
    if (lua) {
      try {
        lua.global.close();
      } catch (e) {
        console.warn('Lua VM shutdown warning:', e);
      }
      lua = null;
    }
  }

  return {
    init: function() {
      ctx.imageSmoothingEnabled = false;
      ctx.mozImageSmoothingEnabled = false;
      ctx.webkitImageSmoothingEnabled = false;
      ctx.msImageSmoothingEnabled = false;

      lastTime = performance.now();
      lastGameTime = performance.now();
      tick();
    },
    
    inputs: inputs,
    
    // 外部からのオーディオ初期化バインド用
    audio: AudioManager,

    setPower: function(on) {
      if (powerOn === on) return;
      powerOn = on;
      console.log('3D Console Power:', powerOn ? 'ON' : 'OFF');

      if (powerOn) {
        // ブート状態の初期化
        bootState.active = true;
        bootState.t = 0;
        bootState.logoY = -20;
        bootState.soundPlayed = false;
        
        // カセットが入っていれば LuaVM ロード、入っていなければ待機
        if (insertedCartridge) {
          initLua();
        }
      } else {
        bootState.active = false;
        shutDownLua();
        clearPowerError(); // 電源OFF時に警告をクリアして消灯画面に戻す
      }
    },

    getPower: function() {
      return powerOn;
    },

    triggerPowerError: triggerPowerError,
    clearPowerError: clearPowerError,
    getPowerError: function() {
      return powerError;
    },

    // 2D UIからの仮想カートリッジ挿入
    insertCartridge: function(cartId) {
      if (insertedCartridge === cartId) return;
      insertedCartridge = cartId;
      console.log('Cartridge Inserted (2D UI):', insertedCartridge);

      if (powerOn) {
        shutDownLua();
        // カセット挿入物理SEを再生！
        AudioManager.playInsert();
        
        // 自動的に正しいカセットによるリブートアニメーションを再走
        bootState.active = true;
        bootState.t = 0;
        bootState.logoY = -20;
        bootState.soundPlayed = false;
        
        initLua();
      }
    },

    getInsertedCartridge: function() {
      return insertedCartridge;
    },

    reset: function() {
      if (powerOn && insertedCartridge) {
        shutDownLua();
        // リセット時もブートシーケンスを走らせる
        bootState.active = true;
        bootState.t = 0;
        bootState.logoY = -20;
        bootState.soundPlayed = false;
        initLua();
      }
    }
  };
})();
