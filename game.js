/**
  * MONORAL 2D Game Engine (Game Boy style: 160x144, 4-colors monochrome)
  * Refactored to align with ENGINEv4 EngineScript Specs
  */

const GBGame = (function() {
  const canvas = document.getElementById('virtual-screen');
  const ctx = canvas.getContext('2d');
  
  // パレット定義 (GB実機風)
  const PALETTE = [
    '#9bbc0f', // 0: 最も明るい緑 (背景)
    '#8bac0f', // 1: 明るい緑
    '#306230', // 2: 暗い緑
    '#0f380f'  // 3: 最も暗い緑 (文字・影)
  ];

  // 解像度
  const WIDTH = 160;
  const HEIGHT = 144;

  // ゲーム状態
  let state = 'TITLE'; // 'TITLE', 'PLAYING', 'GAMEOVER', 'CLEAR'
  
  // ==========================================
  // EngineScript 互換 API バインディング群
  // ==========================================

  // 1. 入力 API (input)
  const input = {
    _states: {
      left: false,
      right: false,
      up: false,
      down: false,
      a: false,
      b: false,
      start: false,
      select: false
    },
    _prevStates: {
      left: false, right: false, up: false, down: false, a: false, b: false, start: false, select: false
    },
    btn: function(button) {
      return !!this._states[button];
    },
    btnp: function(button) {
      return !!this._states[button] && !this._prevStates[button];
    },
    btnr: function(button) {
      return !this._states[button] && !!this._prevStates[button];
    },
    _updatePrev: function() {
      for (let k in this._states) {
        this._prevStates[k] = this._states[k];
      }
    }
  };

  // 2. セーブ API (storage)
  const storage = {
    write: function(key, value) {
      try {
        localStorage.setItem(`monoral_save_${key}`, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    read: function(key, defaultValue) {
      try {
        const val = localStorage.getItem(`monoral_save_${key}`);
        return val !== null ? JSON.parse(val) : (defaultValue !== undefined ? defaultValue : null);
      } catch (e) {
        return defaultValue !== undefined ? defaultValue : null;
      }
    },
    delete: function(key) {
      try {
        localStorage.removeItem(`monoral_save_${key}`);
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  // 3. 描画 API (screen)
  const screen = {
    clear: function(colorIndex) {
      ctx.fillStyle = PALETTE[colorIndex] || PALETTE[0];
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    },
    rect: function(x, y, w, h, colorIndex, fill) {
      ctx.fillStyle = PALETTE[colorIndex] || PALETTE[3];
      ctx.strokeStyle = PALETTE[colorIndex] || PALETTE[3];
      if (fill) {
        ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
      } else {
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, w - 1, h - 1);
      }
    },
    circle: function(x, y, r, colorIndex, fill) {
      ctx.fillStyle = PALETTE[colorIndex] || PALETTE[3];
      ctx.strokeStyle = PALETTE[colorIndex] || PALETTE[3];
      ctx.beginPath();
      ctx.arc(Math.floor(x), Math.floor(y), r, 0, Math.PI * 2);
      if (fill) {
        ctx.fill();
      } else {
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    },
    line: function(x1, y1, x2, y2, colorIndex) {
      ctx.strokeStyle = PALETTE[colorIndex] || PALETTE[3];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.floor(x1) + 0.5, Math.floor(y1) + 0.5);
      ctx.lineTo(Math.floor(x2) + 0.5, Math.floor(y2) + 0.5);
      ctx.stroke();
    },
    sprite: function(spriteType, x, y, size = 8) {
      ctx.fillStyle = PALETTE[3];
      if (spriteType === 'player') {
        const pattern = [
          [0,0,1,1,1,1,0,0],
          [0,1,0,0,0,0,1,0],
          [1,0,1,0,0,1,0,1],
          [1,0,0,0,0,0,0,1],
          [1,0,1,0,0,1,0,1],
          [1,0,0,1,1,0,0,1],
          [0,1,0,0,0,0,1,0],
          [0,0,1,1,1,1,0,0]
        ];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            if (pattern[r][c] === 1) {
              ctx.fillRect(Math.floor(x) + c, Math.floor(y) + r, 1, 1);
            }
          }
        }
      } 
      else if (spriteType === 'stone') {
        ctx.fillRect(Math.floor(x), Math.floor(y), size, size);
        ctx.fillStyle = PALETTE[1];
        ctx.fillRect(Math.floor(x) + 1, Math.floor(y) + 1, size - 2, size - 2);
      }
    },
    text: function(str, x, y, colorIndex, font = "8px monospace", align = "center") {
      ctx.fillStyle = PALETTE[colorIndex] || PALETTE[3];
      ctx.font = font;
      ctx.textAlign = align;
      ctx.fillText(str, x, y);
    }
  };

  // 4. ライフサイクル・ホスト連携 API (one_screen)
  const one_screen = {
    _score: 0,
    notify_score: function(score) {
      this._score = score;
    },
    exit_game: function() {
      if (typeof window.togglePower === 'function') {
        window.togglePower();
      }
    }
  };

  // ==========================================
  // ゲームロジック用変数・データ
  // ==========================================

  // プレイヤー情報
  const player = {
    x: WIDTH / 2 - 4,
    y: HEIGHT - 20,
    w: 8,
    h: 8,
    vx: 0,
    vy: 0,
    speed: 1.5,
    isGrounded: true,
    jumpPower: -3.5,
    gravity: 0.2
  };

  // 障害物 (隕石 / 敵弾)
  let objects = [];
  let score = 0;
  let highscore = 0;
  let gameTime = 0;
  let flashTimer = 0;
  let titleScrollY = -30;
  let demoTimer = 0;

  // 初期化
  function init() {
    state = 'TITLE';
    player.x = WIDTH / 2 - 4;
    player.y = HEIGHT - 20;
    player.vx = 0;
    player.vy = 0;
    objects = [];
    score = 0;
    gameTime = 0;
    titleScrollY = -30;
    one_screen.notify_score(score);

    // ハイスコアのロード (storage API)
    highscore = storage.read('hi_score', 0);

    // アンチエイリアスを無効にしてドット絵テイストを維持
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
  }

  // ゲーム開始
  function startGame() {
    state = 'PLAYING';
    player.x = WIDTH / 2 - 4;
    player.y = HEIGHT - 20;
    player.vx = 0;
    player.vy = 0;
    objects = [];
    score = 0;
    gameTime = 0;
    one_screen.notify_score(score);
  }

  // 障害物生成
  function spawnObject() {
    const size = Math.random() > 0.5 ? 6 : 4;
    objects.push({
      x: Math.random() * (WIDTH - size),
      y: -10,
      w: size,
      h: size,
      vy: 1.0 + Math.random() * 1.5 + (gameTime / 1000) * 0.1, // 時間経過で速度アップ
      type: 'falling'
    });
  }

  // 更新処理
  function update(dt) {
    flashTimer = (flashTimer + 1) % 60;
    
    if (state === 'TITLE') {
      // ロゴのバウンド落下
      if (titleScrollY < 25) {
        titleScrollY += 1.5;
      }
      demoTimer += 0.05;
      
      // スタートボタン (input API)
      if (input.btnp('start') || input.btnp('a')) {
        startGame();
        input._states.start = false;
        input._states.a = false;
      }
    } 
    else if (state === 'PLAYING') {
      gameTime += 1;
      
      // スコア加算
      if (gameTime % 10 === 0) {
        score += 1;
        one_screen.notify_score(score);
      }

      // 移動制御 (input API)
      if (input.btn('left')) player.vx = -player.speed;
      else if (input.btn('right')) player.vx = player.speed;
      else player.vx = 0;

      // ジャンプ (input API)
      if ((input.btn('a') || input.btn('up')) && player.isGrounded) {
        player.vy = player.jumpPower;
        player.isGrounded = false;
        input._states.a = false;
      }

      // 物理演算 (重力と床判定)
      player.x += player.vx;
      player.vy += player.gravity;
      player.y += player.vy;

      if (player.x < 4) player.x = 4;
      if (player.x > WIDTH - player.w - 4) player.x = WIDTH - player.w - 4;

      if (player.y >= HEIGHT - 20) {
        player.y = HEIGHT - 20;
        player.vy = 0;
        player.isGrounded = true;
      }

      // 障害物の生成
      if (Math.random() < 0.04 + (gameTime / 2000) * 0.02) {
        spawnObject();
      }

      // 障害物の移動とコリジョン
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        obj.y += obj.vy;

        // 画面外削除
        if (obj.y > HEIGHT) {
          objects.splice(i, 1);
          continue;
        }

        // コリジョン判定 (矩形交差)
        if (
          player.x < obj.x + obj.w &&
          player.x + player.w > obj.x &&
          player.y < obj.y + obj.h &&
          player.y + player.h > obj.y
        ) {
          // 被弾 -> ゲームオーバー
          state = 'GAMEOVER';
          if (score > highscore) {
            highscore = score;
            // ハイスコアの保存 (storage API)
            storage.write('hi_score', highscore);
          }
          break;
        }
      }
    } 
    else if (state === 'GAMEOVER') {
      // リトライ (input API)
      if (input.btnp('start') || input.btnp('a')) {
        init();
        input._states.start = false;
        input._states.a = false;
      }
    }

    // 前フレーム入力状態の記録
    input._updatePrev();
  }

  // 描画処理 (パレットベースの screen API 経由に統一)
  function draw() {
    // 画面クリア (0: 背景ライトグリーン)
    screen.clear(0);

    // ドット絵フレーム風の飾り枠
    screen.rect(2, 2, WIDTH - 4, HEIGHT - 4, 3, false);

    if (state === 'TITLE') {
      // タイトルテキスト「MONORAL」 (3: 暗い緑)
      screen.text("MONORAL", WIDTH / 2, titleScrollY, 3, "bold 16px monospace", "center");
      screen.text("Engine v4 Bridge", WIDTH / 2, titleScrollY + 12, 3, "8px monospace", "center");

      // PRESS START (点滅)
      if (flashTimer < 30) {
        screen.text("PRESS START BUTTON", WIDTH / 2, 90, 3, "8px monospace", "center");
      }

      // デモキャラクターの描画
      const demox = WIDTH / 2 + Math.sin(demoTimer) * 40 - 4;
      screen.sprite('player', demox, HEIGHT - 30);

      // ハイスコア表示
      screen.text(`HI-SCORE: ${String(highscore).padStart(6, '0')}`, WIDTH / 2, 125, 3, "8px monospace", "center");
    } 
    
    else if (state === 'PLAYING') {
      // 地面の描画 (2: 暗い緑)
      screen.rect(2, HEIGHT - 12, WIDTH - 4, 10, 2, true);
      screen.rect(2, HEIGHT - 12, WIDTH - 4, 1, 3, true);

      // プレイヤーの描画
      screen.sprite('player', player.x, player.y);

      // 障害物の描画
      for (const obj of objects) {
        screen.sprite('stone', obj.x, obj.y, obj.w);
      }

      // スコアの描画
      screen.text(`SCORE: ${String(score).padStart(6, '0')}`, 8, 14, 3, "8px monospace", "left");
      
      // 移動案内
      screen.text(`LV: ${Math.floor(gameTime / 300) + 1}`, WIDTH - 8, 14, 3, "8px monospace", "right");
    } 
    
    else if (state === 'GAMEOVER') {
      screen.text("GAME OVER", WIDTH / 2, 50, 3, "bold 14px monospace", "center");
      screen.text(`SCORE: ${String(score).padStart(6, '0')}`, WIDTH / 2, 75, 3, "8px monospace", "center");
      screen.text(`HI-SCORE: ${String(highscore).padStart(6, '0')}`, WIDTH / 2, 88, 3, "8px monospace", "center");

      if (flashTimer < 30) {
        screen.text("A BUTTON TO RETRY", WIDTH / 2, 115, 3, "8px monospace", "center");
      }
    }
  }

  // ループ関数
  let isPowered = false;
  function loop() {
    if (!isPowered) return;
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // 外部インターフェース
  return {
    init: function() {
      isPowered = true;
      init();
      loop();
    },
    inputs: input._states,
    getState: function() { return state; },
    getScore: function() { return score; },
    getPower: function() { return isPowered; },
    setPower: function(power) {
      isPowered = power;
      if (isPowered) {
        loop();
      } else {
        screen.clear(0);
      }
    },
    getInsertedCartridge: function() {
      return window.currentInsertedCartridgeId || null;
    },
    insertCartridge: function(cartId) {
      window.currentInsertedCartridgeId = cartId;
    },
    triggerPowerError: function() {
      alert("WARNING: Turn off power before ejecting/inserting cartridge!");
    },
    audio: {
      playTone: function(f, d, v, type) {
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = type || 'sine';
          osc.frequency.setValueAtTime(f, audioCtx.currentTime);
          gain.gain.setValueAtTime(v, audioCtx.currentTime);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + d);
        } catch(e) {}
      },
      resume: function() {}
    },
    reset: function() { init(); }
  };
})();
