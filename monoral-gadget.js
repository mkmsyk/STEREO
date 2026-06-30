/**
 * MONORAL GADGET - Virtual 2D Gameboy Console Emulator
 * Manages the screen canvas, keyboard events, Web Audio context, and localStorage DB.
 * Dynamic cartridge insertion: MonoralConsole.insertCartridge("game.js")
 * Power switch control: MonoralConsole.setPower(true/false)
 * Provides abstracted device APIs (screen, input, audio, db) to the cartridge.
 */

const MonoralConsole = (function() {
  let isPowered = false;
  let currentCartridge = null;
  
  let canvas = null;
  let ctx = null;
  let dotPattern = null;

  // GB実機風パレット (最明から最暗)
  const PALETTE = [
    '#9bbc0f', // 0: 最も明るい緑 (背景)
    '#8bac0f', // 1: 明るい緑
    '#306230', // 2: 暗い緑
    '#0f380f'  // 3: 最も暗い緑 (文字・影・壁線)
  ];

  // キーボードマップ
  const keyMap = {
    'ArrowLeft': 'left', 'KeyA': 'left', 'a': 'left', 'KeyQ': 'left', 'q': 'left',
    'ArrowRight': 'right', 'KeyD': 'right', 'd': 'right', 'KeyE': 'right', 'e': 'right',
    'ArrowUp': 'up', 'KeyW': 'up', 'w': 'up',
    'ArrowDown': 'down', 'KeyS': 'down', 's': 'down',
    ' ': 'a', 'KeyK': 'a', 'k': 'a',
    'ShiftLeft': 'b', 'ShiftRight': 'b', 'KeyL': 'b', 'l': 'b',
    'Enter': 'start'
  };

  // 1. 入力デバイス
  const inputDevice = {
    _states: { left: false, right: false, up: false, down: false, a: false, b: false, start: false },
    _prevStates: { left: false, right: false, up: false, down: false, a: false, b: false, start: false },
    update: function() {
      for (let k in this._states) {
        this._prevStates[k] = this._states[k];
      }
    },
    btnp: function(btn) {
      return this._states[btn] && !this._prevStates[btn];
    }
  };

  // キー監視の登録
  window.addEventListener('keydown', function(e) {
    const btn = keyMap[e.key] || keyMap[e.code];
    if (btn) { inputDevice._states[btn] = true; e.preventDefault(); }
  });

  window.addEventListener('keyup', function(e) {
    const btn = keyMap[e.key] || keyMap[e.code];
    if (btn) { inputDevice._states[btn] = false; e.preventDefault(); }
  });

  // 2. 音源デバイス
  let audioCtx = null;
  const audioDevice = {
    resume: function() {
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    },
    playTone: function(f, d, v, type) {
      try {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        audioDevice.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(f, audioCtx.currentTime);
        gain.gain.setValueAtTime(v, audioCtx.currentTime);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + d);
      } catch(e) {}
    }
  };

  // 3. ストレージセーブデバイス
  const dbDevice = {
    get: function(key) {
      return localStorage.getItem(key);
    },
    set: function(key, val) {
      localStorage.setItem(key, val);
    }
  };

  // 4. 描画デバイス (低レベル Canvas API 抽象化)
  const screenDevice = {
    ctx: null,
    dotPattern: null,
    
    clear: function(col) {
      ctx.fillStyle = PALETTE[col];
      ctx.fillRect(0, 0, 160, 144);
    },
    rect: function(x, y, w, h, col, fill) {
      ctx.strokeStyle = PALETTE[col];
      ctx.fillStyle = PALETTE[col];
      if (fill) {
        ctx.fillRect(x, y, w, h);
      } else {
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }
    },
    line: function(x1, y1, x2, y2, col) {
      ctx.strokeStyle = PALETTE[col];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    },
    text: function(txt, x, y, col, font, align) {
      ctx.fillStyle = PALETTE[col];
      ctx.font = font || "7px monospace";
      ctx.textAlign = align || "left";
      ctx.fillText(txt, x, y);
    },
    window: function(x, y, w, h) {
      ctx.fillStyle = PALETTE[0];
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = PALETTE[3];
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
    },
    drawSprite: function(name, x, y, scale) {
      if (!currentCartridge || !currentCartridge.getSpriteData) return;
      const data = currentCartridge.getSpriteData(name);
      if (!data) return;
      
      scale = scale || 1;
      const sh = data.length;
      const sw = data[0].length;
      
      for (let sy = 0; sy < sh; sy++) {
        for (let sx = 0; sx < sw; sx++) {
          const colVal = parseInt(data[sy][sx]);
          if (colVal !== 0) { // 0: 透明
            ctx.fillStyle = PALETTE[colVal];
            ctx.fillRect(x + sx * scale, y + sy * scale, scale, scale);
          }
        }
      }
    }
  };

  const runtimeDevices = {
    screen: screenDevice,
    input: inputDevice,
    audio: audioDevice,
    db: dbDevice
  };

  function initDotPattern() {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 2; pCanvas.height = 2;
    const pCtx = pCanvas.getContext('2d');
    pCtx.fillStyle = PALETTE[0]; pCtx.fillRect(0,0,2,2);
    pCtx.fillStyle = PALETTE[2]; pCtx.fillRect(0,0,1,1); pCtx.fillRect(1,1,1,1);
    dotPattern = ctx.createPattern(pCanvas, 'repeat');
    screenDevice.dotPattern = dotPattern;
    screenDevice.ctx = ctx; // カセット側でカスタムブレンド等を行えるようcontextも保持
  }

  // 仮想本体 (コンソール) API
  return {
    insertCartridge: function(scriptUrl) {
      return new Promise((resolve, reject) => {
        currentCartridge = null;
        const oldScript = document.getElementById('cartridge-script');
        if (oldScript) oldScript.remove();

        const script = document.createElement('script');
        script.id = 'cartridge-script';
        // キャッシュ回避
        script.src = scriptUrl + "?t=" + Date.now();
        script.onload = () => {
          if (window.GBGame) {
            currentCartridge = window.GBGame;
            console.log(`[MONORAL GADGET] Cartridge inserted: ${scriptUrl}`);
            resolve(currentCartridge);
          } else {
            reject(new Error("Cartridge script loaded, but GBGame is not defined."));
          }
        };
        script.onerror = (e) => reject(e);
        document.head.appendChild(script);
      });
    },
    setPower: function(power) {
      isPowered = power;
      const led = document.getElementById('power-led');
      if (led) {
        if (isPowered) led.classList.add('active');
        else led.classList.remove('active');
      }

      if (isPowered) {
        if (!canvas) {
          canvas = document.getElementById('virtual-screen');
          ctx = canvas.getContext('2d');
          initDotPattern();
        }
        if (currentCartridge) {
          currentCartridge.init(runtimeDevices);
          currentCartridge.setPower(true);
        }
      } else {
        if (currentCartridge) {
          currentCartridge.setPower(false);
        }
        if (ctx) {
          ctx.fillStyle = PALETTE[0];
          ctx.fillRect(0, 0, 160, 144);
        }
      }
    },
    getPower: function() {
      return isPowered;
    },
    reset: function() {
      if (currentCartridge && isPowered) {
        currentCartridge.reset();
      }
    },
    // GADGET自身のデバイスオブジェクト
    runtime: runtimeDevices
  };
})();
