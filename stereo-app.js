/**
 * STEREO / MONORAL - Simple Console Mockup (gb-demo)
 * Refactored using STEREO Base Components with fixes for cartridge position and boot sync
 */

(function() {
  let scene, camera, renderer, controls;
  let gbConsole;     // ゲームボーイ本体のグループ
  let screenMesh;    // 液晶画面メッシュ
  let screenTexture;
  let screenLight;   // 液晶裏のポイントライト

  // 3Dアニメーション用のオブジェクト参照
  let dpadGroup;
  let btnAMesh, btnBMesh;
  let btnStartMesh, btnSelectMesh;
  
  // スイッチ＆ランプ
  let powerSwitchMesh;
  let powerLEDMat;
  let powerClickArea; // 透明な電源クリック判定領域

  // 3Dカセットモデル（スロット用）
  let cartridge3D, cartMat, labelMat;

  // テーブル上の 3D カセット用の変数
  let tableCarts = [];
  let tableCartGroup;

  // 3Dオブジェクトの目標アニメーション状態 (Lerp 用)
  const animTargets = {
    dpadRotX: 0,
    dpadRotZ: 0,
    btnAY: 0.42,
    btnBY: 0.42,
    btnStartY: 0.41,
    btnSelectY: 0.41,
    switchX: -0.74  // 電源スイッチつまみのローカルX座標 (初期値 OFF)
  };

  let consolePickedUp = false; // 空中に浮かび上がって正面を向いているか

  // ゲームボーイ自体の起き上がり／浮遊制御用の目標座標＆回転
  const consoleTargets = {
    pos: new THREE.Vector3(0, 0.1, 0),
    rot: new THREE.Vector3(0, -Math.PI / 12, 0), // 横たわる状態の初期角度
    rotYAngle: -Math.PI / 12                    // 90度回転のベース角度
  };

  const animSpeed = 0.18; // 3Dボタン・スイッチのLerp速度
  let lastTimeSec = 0;   // 前フレーム of タイムスタンプ (秒)

  // ==========================================
  // STEREO コンポーネントのインスタンス群
  // ==========================================
  let pointerIsolator;
  let directionalRotator;
  let cartridgeSequencer;
  let powerLinker;
  let textureStreamer;

  // カセット選択状況に応じた3Dマテリアルカラー更新
  function updateCartridgeMaterials() {
    const cartId = GBGame.getInsertedCartridge();
    if (!cartMat || !labelMat) return;
    
    if (cartId === 'meteor') {
      cartMat.color.set(0x8a939f);  // レトログレー
      labelMat.color.set(0xeab308); // 黄色ラベル
    } else if (cartId === 'paint') {
      cartMat.color.set(0x991b1b);  // ワインレッド
      labelMat.color.set(0xf8fafc); // 白ラベル
    } else if (cartId === 'clock') {
      cartMat.color.set(0x1d4ed8);  // ロイヤルブルー
      labelMat.color.set(0x0f172a); // 黒ラベル
    }
  }

  // テーブル上のカセット表示・非表示を本体挿入状況と同期 (実在同期)
  function syncTableCartridges() {
    if (cartridgeSequencer && cartridgeSequencer.active) return;
    
    const activeCartId = GBGame.getInsertedCartridge();
    tableCarts.forEach(cart => {
      const cartId = cart.userData.cartId;
      cart.visible = (cartId !== activeCartId);
      if (cart.visible) {
        const pos = getDefaultTablePosition(cartId);
        cart.position.copy(pos);
        cart.quaternion.set(0, 0, 0, 1);
      }
    });
  }

  function getDefaultTablePosition(id) {
    const x = { meteor: -1.7, paint: 0.0, clock: 1.7 }[id] || 0;
    return new THREE.Vector3(x, 0.08, 3.4); // Z=3.4
  }

  // DOM要素
  const btnEject = document.getElementById('btn-eject');
  const btnPutback = document.getElementById('btn-putback');
  const activeUIPanel = document.getElementById('active-ui-panel');
  const instructionPanel = document.getElementById('instruction-panel');

  function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
  }

  // 初期セットアップ
  function init() {
    // 1. シーンとカメラ
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#07090e');

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 6.64, 10.98); 

    // 2. レンダラー
    const container = document.getElementById('canvas-container');
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 3. コントロール (OrbitControls)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // 地面潜り込み防止
    controls.minDistance = 1.8;
    controls.maxDistance = 12;
    controls.target.set(0, 1.8, 0);

    // 4. ライティング
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(6, 12, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.04;
    scene.add(dirLight);

    // 液晶画面バックライト風ポイントライト
    screenLight = new THREE.PointLight(0x9bbc0f, 0.5, 2.5);
    screenLight.position.set(0, 0.5, -0.6);
    scene.add(screenLight);

    // 5. 環境とモデル構築
    createEnvironment();
    createGameBoy();
    createTableCartridges(); // テーブル上のカセット構築

    // 6. 2D VM ゲームエンジン初期化 (MONORAL)
    GBGame.init();

    // ==========================================
    // STEREO コンポーネント初期化
    // ==========================================
    pointerIsolator = new PointerCollisionIsolator(controls, [gbConsole]);
    directionalRotator = new DirectionalRotator(gbConsole);
    
    // 交換シーケンサー
    cartridgeSequencer = new ObjectReplacementSequencer(directionalRotator);
    cartridgeSequencer.onStateChange = (state) => {
      if (state === 'ROTATE_BACK_START') {
        consoleTargets.rotYAngle += Math.PI; // 背面からさらに正面へ(+180度)
        const targetPos = new THREE.Vector3(0, 2.15, 0);
        
        directionalRotator.start(targetPos, Math.PI / 2, consoleTargets.rotYAngle, 0.45, () => {
          consoleTargets.rotYAngle = consoleTargets.rotYAngle % (Math.PI * 2);
          gbConsole.rotation.set(Math.PI / 2, consoleTargets.rotYAngle, 0, 'YXZ');
          gbConsole.quaternion.setFromEuler(gbConsole.rotation);
          
          cartridgeSequencer.transitionToNext();
        });
      } else if (state === 'IDLE') {
        syncTableCartridges();
      }
    };

    // 发光・電源マテリアル
    powerLinker = new PowerMaterialLinker(screenMesh.material, powerLEDMat, screenLight);
    powerLinker.setPower(GBGame.getPower());

    // テクスチャストリーマー
    const virtualCanvas = document.getElementById('virtual-screen');
    textureStreamer = new MonitorTextureStreamer(virtualCanvas, screenTexture);

    // 初期実在同期
    syncTableCartridges();

    // 7. イベントリスナー登録
    setupEvents();

    lastTimeSec = performance.now();
    animate(lastTimeSec);
  }

  // テーブルなどの構築
  function createEnvironment() {
    const tableGeo = new THREE.BoxGeometry(16, 0.2, 12);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x1f140e, 
      roughness: 0.65,
      metalness: 0.05
    });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.position.y = -0.1;
    table.receiveShadow = true;
    scene.add(table);

    const grid = new THREE.GridHelper(30, 30, 0x1e293b, 0x0f172a);
    grid.position.y = -0.19;
    scene.add(grid);
  }

  // テーブルの上に並ぶ3つのカセットモデルを構築
  function createTableCartridges() {
    tableCartGroup = new THREE.Group();
    tableCarts = [];

    const cartConfigs = [
      { id: 'meteor', color: 0x8a939f, labelColor: 0xeab308 },
      { id: 'paint', color: 0x991b1b, labelColor: 0xf8fafc },
      { id: 'clock', color: 0x1d4ed8, labelColor: 0x0f172a }
    ];

    cartConfigs.forEach(config => {
      const cart = new THREE.Group();
      cart.userData = { cartId: config.id };

      const cartMatTable = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.6 });
      const labelMatTable = new THREE.MeshStandardMaterial({ color: config.labelColor, roughness: 0.5 });

      const bodyGeo = new THREE.BoxGeometry(1.4, 0.16, 1.36);
      const bodyMesh = new THREE.Mesh(bodyGeo, cartMatTable);
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      cart.add(bodyMesh);

      const labelGeo = new THREE.PlaneGeometry(1.0, 0.8);
      const labelMesh = new THREE.Mesh(labelGeo, labelMatTable);
      labelMesh.rotation.x = -Math.PI / 2; 
      labelMesh.position.set(0, 0.081, -0.2); 
      cart.add(labelMesh);

      const pos = getDefaultTablePosition(config.id);
      cart.position.copy(pos);

      tableCarts.push(cart);
      tableCartGroup.add(cart);
    });

    scene.add(tableCartGroup);
  }

  // ゲームボーイ筐体のモデリング
  function createGameBoy() {
    gbConsole = new THREE.Group();
    gbConsole.position.copy(consoleTargets.pos);
    gbConsole.rotation.set(consoleTargets.rot.x, consoleTargets.rot.y, consoleTargets.rot.z);

    const plasticMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db, 
      roughness: 0.52,
      metalness: 0.08
    });

    const darkPlasticMat = new THREE.MeshStandardMaterial({
      color: 0x2e353f, 
      roughness: 0.6
    });

    const redButtonMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b, 
      roughness: 0.45
    });

    // A. 分割ボディ (カセットスロット彫り込み)
    const bodyFrontGeo = new THREE.BoxGeometry(2.4, 0.2, 4.0);
    const bodyFront = new THREE.Mesh(bodyFrontGeo, plasticMat);
    bodyFront.position.set(0, 0.3, 0);
    bodyFront.castShadow = true;
    bodyFront.receiveShadow = true;
    gbConsole.add(bodyFront);

    const bodyBackLowerGeo = new THREE.BoxGeometry(2.4, 0.2, 2.6);
    const bodyBackLower = new THREE.Mesh(bodyBackLowerGeo, plasticMat);
    bodyBackLower.position.set(0, 0.1, 0.7);
    bodyBackLower.castShadow = true;
    bodyBackLower.receiveShadow = true;
    gbConsole.add(bodyBackLower);

    const bodyBackLeftGeo = new THREE.BoxGeometry(0.45, 0.2, 1.4);
    const bodyBackLeft = new THREE.Mesh(bodyBackLeftGeo, plasticMat);
    bodyBackLeft.position.set(-0.975, 0.1, -1.3);
    bodyBackLeft.castShadow = true;
    bodyBackLeft.receiveShadow = true;
    gbConsole.add(bodyBackLeft);

    const bodyBackRightGeo = new THREE.BoxGeometry(0.45, 0.2, 1.4);
    const bodyBackRight = new THREE.Mesh(bodyBackRightGeo, plasticMat);
    bodyBackRight.position.set(0.975, 0.1, -1.3);
    bodyBackRight.castShadow = true;
    bodyBackRight.receiveShadow = true;
    gbConsole.add(bodyBackRight);

    // B. 画面まわり
    const screenFrameGeo = new THREE.BoxGeometry(2.0, 0.02, 1.8);
    const screenFrame = new THREE.Mesh(screenFrameGeo, darkPlasticMat);
    screenFrame.position.set(0, 0.401, -0.6);
    gbConsole.add(screenFrame);

    // 液晶画面 (仮想スクリーン)
    const virtualCanvas = document.getElementById('virtual-screen');
    screenTexture = new THREE.CanvasTexture(virtualCanvas);
    screenTexture.minFilter = THREE.NearestFilter;
    screenTexture.magFilter = THREE.NearestFilter;

    const screenGeo = new THREE.PlaneGeometry(1.5, 1.25);
    const screenMat = new THREE.MeshStandardMaterial({
      map: screenTexture,
      emissive: 0x9bbc0f,
      emissiveMap: screenTexture,
      emissiveIntensity: 0.15,
      roughness: 0.15,
      metalness: 0.1
    });
    screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.rotation.x = -Math.PI / 2;
    screenMesh.position.set(0, 0.415, -0.6);
    gbConsole.add(screenMesh);

    // C. ボタンと操作部
    dpadGroup = new THREE.Group();
    dpadGroup.position.set(-0.5, 0.41, 0.8);
    const dpadHGeo = new THREE.BoxGeometry(0.5, 0.08, 0.16);
    const dpadVGeo = new THREE.BoxGeometry(0.16, 0.08, 0.5);
    const dpadH = new THREE.Mesh(dpadHGeo, darkPlasticMat);
    const dpadV = new THREE.Mesh(dpadVGeo, darkPlasticMat);
    dpadGroup.add(dpadH);
    dpadGroup.add(dpadV);
    gbConsole.add(dpadGroup);

    const buttonGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16);
    btnAMesh = new THREE.Mesh(buttonGeo, redButtonMat);
    btnBMesh = new THREE.Mesh(buttonGeo, redButtonMat);
    btnAMesh.position.set(0.6, 0.42, 0.7);
    btnBMesh.position.set(0.3, 0.42, 0.95);
    gbConsole.add(btnAMesh);
    gbConsole.add(btnBMesh);

    const startSelectGeo = new THREE.BoxGeometry(0.08, 0.06, 0.28);
    btnStartMesh = new THREE.Mesh(startSelectGeo, darkPlasticMat);
    btnSelectMesh = new THREE.Mesh(startSelectGeo, darkPlasticMat);
    btnStartMesh.rotation.y = -Math.PI / 6;
    btnSelectMesh.rotation.y = -Math.PI / 6;
    btnStartMesh.position.set(0.2, 0.41, 1.6);
    btnSelectMesh.position.set(-0.2, 0.41, 1.6);
    gbConsole.add(btnStartMesh);
    gbConsole.add(btnSelectMesh);

    // D. 3D 電源スイッチ
    const switchBodyGeo = new THREE.BoxGeometry(0.18, 0.03, 0.1);
    const switchBody = new THREE.Mesh(switchBodyGeo, darkPlasticMat);
    switchBody.position.set(-0.7, 0.401, -1.8);
    gbConsole.add(switchBody);

    const switchKnobGeo = new THREE.BoxGeometry(0.06, 0.08, 0.06);
    powerSwitchMesh = new THREE.Mesh(switchKnobGeo, darkPlasticMat);
    powerSwitchMesh.position.set(animTargets.switchX, 0.43, -1.8);
    gbConsole.add(powerSwitchMesh);
    
    // 電源のクリック検出用透明領域
    const clickAreaGeo = new THREE.BoxGeometry(0.3, 0.2, 0.3);
    const clickAreaMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    powerClickArea = new THREE.Mesh(clickAreaGeo, clickAreaMat);
    powerClickArea.position.set(-0.7, 0.43, -1.8);
    gbConsole.add(powerClickArea);

    // E. パワーインジケータLED (液晶画面の左側)
    const ledGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8);
    powerLEDMat = new THREE.MeshStandardMaterial({
      color: 0x374151, // 初期消灯 (ダークグレー)
      emissive: 0x330000,
      emissiveIntensity: 0.1
    });
    const ledMesh = new THREE.Mesh(ledGeo, powerLEDMat);
    ledMesh.rotation.x = -Math.PI / 2;
    ledMesh.position.set(-0.85, 0.415, -0.6); // 画面左に配置
    gbConsole.add(ledMesh);

    // F. 背面カセットスロット（空中に浮かんでいる3Dカートリッジ）
    cartMat = new THREE.MeshStandardMaterial({ color: 0x8a939f, roughness: 0.6 });
    labelMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5 });
    
    cartridge3D = new THREE.Group();
    const cartBodyGeo = new THREE.BoxGeometry(1.4, 0.16, 1.36);
    const cartBody = new THREE.Mesh(cartBodyGeo, cartMat);
    cartBody.castShadow = true;
    cartBody.receiveShadow = true;
    cartridge3D.add(cartBody);

    const cartLabelGeo = new THREE.PlaneGeometry(1.0, 0.8);
    const cartLabel = new THREE.Mesh(cartLabelGeo, labelMat);
    cartLabel.position.set(0, 0.081, -0.2); 
    cartLabel.rotation.x = -Math.PI / 2;
    cartridge3D.add(cartLabel);

    cartridge3D.position.set(0, 0.1, -1.3); // 正しい配置位置に修正
    cartridge3D.rotation.z = Math.PI;       // 天地を維持しつつラベル面を背面に向ける (Z軸180度回転)
    cartridge3D.visible = false;            // 初期非表示
    gbConsole.add(cartridge3D);

    // 初期マテリアル色更新
    updateCartridgeMaterials();

    // 筐体へ全シャドウ適用
    gbConsole.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });

    scene.add(gbConsole);
  }

  // アニメーションループ (フレーム更新)
  function animate(timeMs) {
    requestAnimationFrame(animate);

    const dt = Math.min((timeMs - lastTimeSec) / 1000, 0.1); // 秒ベース、最大フレームドロップ制限
    lastTimeSec = timeMs;

    // 1. STEREO 補間アニメーション更新 (二重呼び出し防止)
    if (directionalRotator) {
      const seqActive = cartridgeSequencer && cartridgeSequencer.active;
      const seqIsRotating = seqActive && (cartridgeSequencer.state === 'ROTATE_GB' || cartridgeSequencer.state === 'ROTATE_BACK');
      if (!seqIsRotating) {
        directionalRotator.update(dt);
      }
    }

    if (cartridgeSequencer && cartridgeSequencer.active) {
      // カセット交換シーケンスの更新
      const W_A = new THREE.Vector3();
      const Q_gb = new THREE.Quaternion();

      cartridgeSequencer.update(dt, (state, ease) => {
        if (state === 'EJECT_SLIDE') {
          cartridge3D.visible = true;
          cartridge3D.position.z = lerp(-1.3, -2.7, ease);
          
          if (ease >= 1.0) {
            cartridge3D.visible = false;
            GBGame.insertCartridge(null); 
            
            const ejectCart = tableCarts.find(c => c.userData.cartId === cartridgeSequencer.ejectCartId);
            if (ejectCart) {
              ejectCart.visible = true;
              W_A.set(0, 0.1, -2.7).applyMatrix4(gbConsole.matrixWorld);
              ejectCart.position.copy(W_A);
              
              const Q_cart_local = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI));
              Q_gb.copy(gbConsole.quaternion).multiply(Q_cart_local);
              ejectCart.quaternion.copy(Q_gb);
            }
          }
        }
        else if (state === 'FLIGHT') {
          W_A.set(0, 0.1, -2.7).applyMatrix4(gbConsole.matrixWorld);
          
          const Q_cart_local = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI));
          Q_gb.copy(gbConsole.quaternion).multiply(Q_cart_local);
          const Q_table = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
          
          // 旧カセット: 地点A ➡ テーブル
          if (cartridgeSequencer.ejectCartId) {
            const ejectCart = tableCarts.find(c => c.userData.cartId === cartridgeSequencer.ejectCartId);
            if (ejectCart) {
              const tablePos = getDefaultTablePosition(cartridgeSequencer.ejectCartId);
              ejectCart.position.lerpVectors(W_A, tablePos, ease);
              ejectCart.quaternion.slerpQuaternions(Q_gb, Q_table, ease);
            }
          }
          
          // 新カセット: テーブル ➡ 地点A
          if (cartridgeSequencer.insertCartId) {
            const insertCart = tableCarts.find(c => c.userData.cartId === cartridgeSequencer.insertCartId);
            if (insertCart) {
              insertCart.visible = true;
              const tablePos = getDefaultTablePosition(cartridgeSequencer.insertCartId);
              insertCart.position.lerpVectors(tablePos, W_A, ease);
              insertCart.quaternion.slerpQuaternions(Q_table, Q_gb, ease);
            }
          }
          
          if (ease >= 1.0) {
            if (cartridgeSequencer.insertCartId) {
              const insertCart = tableCarts.find(c => c.userData.cartId === cartridgeSequencer.insertCartId);
              if (insertCart) insertCart.visible = false;
              
              GBGame.insertCartridge(cartridgeSequencer.insertCartId);
              updateCartridgeMaterials();
              cartridge3D.visible = true;
              cartridge3D.position.z = -2.7;
            } else {
              // EJECTのみ完了時は特に何もしない（sequencer側が自動でROTATE_BACKへ遷移する）
            }
          }
        }
        else if (state === 'INSERT_SLIDE') {
          cartridge3D.visible = true;
          cartridge3D.position.z = lerp(-2.7, -1.3, ease);
          
          if (ease >= 1.0) {
            cartridge3D.position.z = -1.3;
            GBGame.audio.playTone(600, 0.08, 0.05, 'sine'); // ガチャッ音
            syncTableCartridges();
          }
        }
      });
    }

    // 2. 電源ON・発光マテリアル連動の更新
    if (powerLinker) {
      powerLinker.update();
    }

    // 3. テクスチャストリーマーの更新
    if (textureStreamer) {
      textureStreamer.update(GBGame);
    }

    // 4. ボタンや十字キーの物理 Lerp
    if (dpadGroup) {
      dpadGroup.rotation.z += (animTargets.dpadRotZ - dpadGroup.rotation.z) * animSpeed;
      dpadGroup.rotation.x += (animTargets.dpadRotX - dpadGroup.rotation.x) * animSpeed;
    }
    if (btnAMesh) btnAMesh.position.y += (animTargets.btnAY - btnAMesh.position.y) * animSpeed;
    if (btnBMesh) btnBMesh.position.y += (animTargets.btnBY - btnBMesh.position.y) * animSpeed;
    if (btnStartMesh) btnStartMesh.position.y += (animTargets.btnStartY - btnStartMesh.position.y) * animSpeed;
    if (btnSelectMesh) btnSelectMesh.position.y += (animTargets.btnSelectY - btnSelectMesh.position.y) * animSpeed;
    if (powerSwitchMesh) powerSwitchMesh.position.x += (animTargets.switchX - powerSwitchMesh.position.x) * animSpeed;

    // 5. カメラとコントローラー更新
    if (controls) controls.update();
    renderer.render(scene, camera);
  }

  // イベントバインド
  function setupEvents() {

    function triggerCartridgeChange(cartId) {
      if (GBGame.getPower()) {
        GBGame.triggerPowerError();
        return;
      }
      if (cartridgeSequencer.active || directionalRotator.active) return;

      const oldCartId = GBGame.getInsertedCartridge();
      if (oldCartId === cartId) return;

      // 1. テーブルに伏せている状態なら起き上がらせる
      if (!consolePickedUp) {
        consolePickedUp = true;
        activeUIPanel.style.display = 'flex';
        instructionPanel.style.display = 'none';

        const targetPos = new THREE.Vector3(0, 2.15, 0);
        const targetRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          Math.PI / 2, 0, 0, 'YXZ'
        ));
        consoleTargets.pos.copy(targetPos);
        consoleTargets.rotYAngle = 0;

        // 起き上がり完了後に、背面交換をキック！
        directionalRotator.start(targetPos, Math.PI / 2, 0, 0.5, () => {
          GBGame.audio.resume(); // オーディオ再開
          consoleTargets.rotYAngle += Math.PI;
          cartridgeSequencer.start(oldCartId, cartId, targetPos, consoleTargets.rotYAngle);
        });
      } else {
        // 2. すでに起き上がっているなら、直接カセット交換
        GBGame.audio.resume(); // オーディオ再開
        consoleTargets.rotYAngle += Math.PI;
        cartridgeSequencer.start(oldCartId, cartId, consoleTargets.pos, consoleTargets.rotYAngle);
      }
    }

    // EJECTボタン
    btnEject.addEventListener('click', () => {
      if (GBGame.getPower()) {
        GBGame.triggerPowerError();
        return;
      }
      if (cartridgeSequencer.active || directionalRotator.active) return;
      
      const currentCartId = GBGame.getInsertedCartridge();
      if (currentCartId) {
        triggerCartridgeChange(null);
      }
    });

    // PUT BACKボタン
    btnPutback.addEventListener('click', () => {
      if (cartridgeSequencer.active || directionalRotator.active) return;
      putConsoleDown();
    });

    const domEl = renderer.domElement;

    // pointerdown
    domEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#crash-log') || e.target.closest('.error-dialog-overlay')) return;

      const rect = domEl.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      // 1. ポインター競合干渉ロックの判定
      pointerIsolator.handlePointerDown(e, camera, domEl);

      // 2. テーブル上の 3D カセットがタップされたか
      if (tableCartGroup && !cartridgeSequencer.active && !directionalRotator.active) {
        const intersectsCarts = raycaster.intersectObjects(tableCartGroup.children, true);
        if (intersectsCarts.length > 0) {
          let hitObj = intersectsCarts[0].object;
          while (hitObj && hitObj.parent && !hitObj.userData.cartId) {
            hitObj = hitObj.parent;
          }
          if (hitObj && hitObj.userData.cartId) {
            const cartId = hitObj.userData.cartId;
            triggerCartridgeChange(cartId);
            return;
          }
        }
      }

      // 起き上がり中のみボタン反応
      if (consolePickedUp && !directionalRotator.active && !cartridgeSequencer.active) {
        // 電源スイッチの判定
        if (powerClickArea) {
          const intersectsSwitch = raycaster.intersectObject(powerClickArea, true);
          if (intersectsSwitch.length > 0) {
            togglePower();
            return;
          }
        }

        // Aボタン
        if (btnAMesh && raycaster.intersectObject(btnAMesh, true).length > 0) {
          GBGame.inputs.a = true;
          animTargets.btnAY = 0.39; // 押し込み
          pointerIsolator.activePointers[e.pointerId] = { type: 'button', key: 'a' };
          return;
        }

        // Bボタン
        if (btnBMesh && raycaster.intersectObject(btnBMesh, true).length > 0) {
          GBGame.inputs.b = true;
          animTargets.btnBY = 0.39;
          pointerIsolator.activePointers[e.pointerId] = { type: 'button', key: 'b' };
          return;
        }

        // STARTボタン
        if (btnStartMesh && raycaster.intersectObject(btnStartMesh, true).length > 0) {
          GBGame.inputs.start = true;
          animTargets.btnStartY = 0.39;
          pointerIsolator.activePointers[e.pointerId] = { type: 'button', key: 'start' };
          return;
        }

        // SELECTボタン
        if (btnSelectMesh && raycaster.intersectObject(btnSelectMesh, true).length > 0) {
          GBGame.inputs.select = true;
          animTargets.btnSelectY = 0.39;
          pointerIsolator.activePointers[e.pointerId] = { type: 'button', key: 'select' };
          return;
        }

        // 十字キー (D-Pad)
        if (dpadGroup && raycaster.intersectObjects(dpadGroup.children, true).length > 0) {
          pointerIsolator.activePointers[e.pointerId] = {
            type: 'dpad',
            startX: e.clientX,
            startY: e.clientY,
            activeKeys: { left: false, right: false, up: false, down: false }
          };
          return;
        }
      } 
      // ズームアウト状態での起き上がり判定
      else if (!consolePickedUp && !directionalRotator.active) {
        const intersectsConsole = raycaster.intersectObjects(gbConsole.children, true);
        if (intersectsConsole.length > 0) {
          pickConsoleUp();
          return;
        }
      }
    });

    // pointermove
    domEl.addEventListener('pointermove', (e) => {
      const activeAction = pointerIsolator.activePointers[e.pointerId];
      if (!activeAction) return;

      if (activeAction.type === 'dpad') {
        const dx = e.clientX - activeAction.startX;
        const dy = e.clientY - activeAction.startY;
        const deadZone = 12;
        const maxRange = 50;

        const keys = {
          left: dx < -deadZone,
          right: dx > deadZone,
          up: dy < -deadZone,
          down: dy > deadZone
        };

        if (keys.left !== activeAction.activeKeys.left) {
          GBGame.inputs.left = keys.left;
          activeAction.activeKeys.left = keys.left;
        }
        if (keys.right !== activeAction.activeKeys.right) {
          GBGame.inputs.right = keys.right;
          activeAction.activeKeys.right = keys.right;
        }
        if (keys.up !== activeAction.activeKeys.up) {
          GBGame.inputs.up = keys.up;
          activeAction.activeKeys.up = keys.up;
        }
        if (keys.down !== activeAction.activeKeys.down) {
          GBGame.inputs.down = keys.down;
          activeAction.activeKeys.down = keys.down;
        }

        animTargets.dpadRotZ = -Math.min(Math.max(dx / maxRange * 0.08, -0.08), 0.08);
        animTargets.dpadRotX = Math.min(Math.max(dy / maxRange * 0.08, -0.08), 0.08);
      }
    });

    // pointerrelease
    const handlePointerRelease = (e) => {
      const activeAction = pointerIsolator.activePointers[e.pointerId];
      pointerIsolator.handlePointerRelease(e); // カメラ無効化解除の通知
      
      if (!activeAction) return;

      if (activeAction.type === 'button') {
        const key = activeAction.key;
        GBGame.inputs[key] = false;

        if (key === 'a') animTargets.btnAY = 0.42;
        if (key === 'b') animTargets.btnBY = 0.42;
        if (key === 'start') animTargets.btnStartY = 0.41;
        if (key === 'select') animTargets.btnSelectY = 0.41;
      } 
      else if (activeAction.type === 'dpad') {
        GBGame.inputs.left = false;
        GBGame.inputs.right = false;
        GBGame.inputs.up = false;
        GBGame.inputs.down = false;
        animTargets.dpadRotX = 0;
        animTargets.dpadRotZ = 0;
      }
    };

    domEl.addEventListener('pointerup', handlePointerRelease);
    domEl.addEventListener('pointercancel', handlePointerRelease);
    domEl.addEventListener('pointerleave', handlePointerRelease);

    function togglePower() {
      const currentPower = GBGame.getPower();
      const nextPower = !currentPower;
      GBGame.audio.resume(); // オーディオ再開
      GBGame.setPower(nextPower);
      if (powerLinker) {
        powerLinker.setPower(nextPower);
      }

      if (nextPower) {
        animTargets.switchX = -0.66;
        
        // 背面時に自動で起き上がり正面へ
        if (consoleTargets.rotYAngle === Math.PI) {
          consoleTargets.rotYAngle = 0;
          const targetPos = new THREE.Vector3(0, 2.15, 0);
          const targetRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(
            Math.PI / 2, 0, 0, 'YXZ'
          ));
          directionalRotator.start(targetPos, Math.PI / 2, 0, 0.5, null);
        }
      } else {
        animTargets.switchX = -0.74;
      }
      syncTableCartridges(); 
    }

    function pickConsoleUp() {
      consolePickedUp = true;
      GBGame.audio.resume(); // オーディオ再開
      const targetPos = new THREE.Vector3(0, 2.15, 0);
      const targetRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        Math.PI / 2, 0, 0, 'YXZ'
      ));
      consoleTargets.pos.copy(targetPos);
      consoleTargets.rotYAngle = 0;

      directionalRotator.start(targetPos, Math.PI / 2, 0, 0.6, null);

      activeUIPanel.style.display = 'flex';
      instructionPanel.style.display = 'none';
    }

    function putConsoleDown() {
      consolePickedUp = false;
      const targetPos = new THREE.Vector3(0, 0.1, 0);
      const targetRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        0, -Math.PI / 12, 0, 'YXZ'
      ));
      consoleTargets.pos.copy(targetPos);
      consoleTargets.rotYAngle = -Math.PI / 12;

      directionalRotator.start(targetPos, 0, -Math.PI / 12, 0.6, null);

      activeUIPanel.style.display = 'none';
      instructionPanel.style.display = 'block';
    }

    // キー入力
    const keyMap = {
      'ArrowLeft': 'left', 'KeyA': 'left',
      'ArrowRight': 'right', 'KeyD': 'right',
      'ArrowUp': 'up', 'KeyW': 'up',
      'ArrowDown': 'down', 'KeyS': 'down',
      'Space': 'a', 'KeyK': 'a',
      'ShiftLeft': 'b', 'ShiftRight': 'b', 'KeyL': 'b',
      'Enter': 'start',
      'KeyC': 'select', 'KeyV': 'select', 'KeyX': 'select', 'KeyZ': 'select'
    };

    window.addEventListener('keydown', (e) => {
      const action = keyMap[e.code];
      if (action) {
        GBGame.inputs[action] = true;
        if (action === 'left') animTargets.dpadRotZ = 0.08;
        if (action === 'right') animTargets.dpadRotZ = -0.08;
        if (action === 'up') animTargets.dpadRotX = -0.08;
        if (action === 'down') animTargets.dpadRotX = 0.08;
        if (action === 'a') animTargets.btnAY = 0.39;
        if (action === 'b') animTargets.btnBY = 0.39;
        if (action === 'start') animTargets.btnStartY = 0.39;
        if (action === 'select') animTargets.btnSelectY = 0.39;
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      const action = keyMap[e.code];
      if (action) {
        GBGame.inputs[action] = false;
        if (action === 'left' || action === 'right') animTargets.dpadRotZ = 0;
        if (action === 'up' || action === 'down') animTargets.dpadRotX = 0;
        if (action === 'a') animTargets.btnAY = 0.42;
        if (action === 'b') animTargets.btnBY = 0.42;
        if (action === 'start') animTargets.btnStartY = 0.41;
        if (action === 'select') animTargets.btnSelectY = 0.41;
        e.preventDefault();
      }
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  window.addEventListener('DOMContentLoaded', init);

  // 電源トグルのグローバル接続 (one_screen.exit_game からのコールバック用)
  window.togglePower = function() {
    const sw = gbConsole.getObjectByName(powerClickArea.name) || powerClickArea;
    if (sw) {
      // 擬似クリック
      setupEvents.togglePower();
    }
  };
})();
