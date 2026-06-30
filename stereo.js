/**
 * STEREO 3D Virtual Game Engine - Base Library Components
 */

// 1. ポインター競合干渉ロック (Pointer Interaction Lock)
class PointerCollisionIsolator {
  constructor(controls, targetMeshes = []) {
    this.controls = controls;
    this.targets = targetMeshes;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.activePointers = {};
  }

  registerTarget(mesh) {
    if (!this.targets.includes(mesh)) {
      this.targets.push(mesh);
    }
  }

  handlePointerDown(event, camera, domElement) {
    if (!this.controls) return false;
    
    const rect = domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, camera);
    const intersects = this.raycaster.intersectObjects(this.targets, true);

    if (intersects.length > 0) {
      // 登録メッシュに触れた場合のみ、一時的にカメラを無効化
      this.controls.enabled = false;
      this.activePointers[event.pointerId] = { tempDisabled: true };
      return true;
    }
    return false;
  }

  handlePointerRelease(event) {
    if (this.activePointers[event.pointerId]) {
      delete this.activePointers[event.pointerId];
    }
    
    // 他にアクティブな競合ポインターが無ければ、カメラを復帰
    if (Object.keys(this.activePointers).length === 0 && this.controls) {
      this.controls.enabled = true;
    }
  }
}

// 2. 一方向絶対角オイラー回転器 (Strict Directional Euler Rotator)
class DirectionalRotator {
  constructor(object) {
    this.object = object;
    this.active = false;
    this.t = 0;
    this.duration = 0.5;
    this.startY = 0;
    this.targetY = 0;
    this.startPos = new THREE.Vector3();
    this.targetPos = new THREE.Vector3();
    this.onComplete = null;
  }

  start(targetPos, targetYAngle, duration = 0.5, onComplete = null) {
    this.startPos.copy(this.object.position);
    this.targetPos.copy(targetPos);
    
    this.startY = this.object.rotation.y;
    this.targetY = targetYAngle;
    
    this.duration = duration;
    this.t = 0;
    this.active = true;
    this.onComplete = onComplete;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;

    const progress = Math.min(1.0, this.t / this.duration);
    const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic

    // 位置のイージング
    this.object.position.lerpVectors(this.startPos, this.targetPos, ease);

    // Y軸オイラー角度の絶対数値補間 (slerpによるブレを防止)
    const currentY = this.startY + (this.targetY - this.startY) * ease;
    this.object.rotation.set(Math.PI / 2, currentY, 0, 'YXZ');
    this.object.quaternion.setFromEuler(this.object.rotation);

    if (progress >= 1.0) {
      this.active = false;
      this.object.position.copy(this.targetPos);
      this.object.rotation.set(Math.PI / 2, this.targetY, 0, 'YXZ');
      this.object.quaternion.setFromEuler(this.object.rotation);
      if (this.onComplete) {
        this.onComplete();
      }
    }
  }
}

// 3. カセット/モジュール交換シーケンサー (Cinematic Replacement Sequencer)
class ObjectReplacementSequencer {
  constructor(rotator, durations = {}) {
    this.rotator = rotator;
    this.active = false;
    this.state = 'IDLE'; // 'ROTATE_GB', 'EJECT_SLIDE', 'FLIGHT', 'INSERT_SLIDE', 'ROTATE_BACK'
    this.t = 0;
    this.ejectCartId = null;
    this.insertCartId = null;
    
    // 各ステートの秒数 (デフォルト値)
    this.durations = Object.assign({
      ROTATE_GB: 0.4,
      EJECT_SLIDE: 0.2,
      FLIGHT: 0.35,
      INSERT_SLIDE: 0.2,
      ROTATE_BACK: 0.45
    }, durations);

    this.onStateChange = null; // 外部イベント連動用コールバック
  }

  start(ejectCartId, insertCartId, targetPos, targetYAngle) {
    if (this.active) return;
    this.ejectCartId = ejectCartId;
    this.insertCartId = insertCartId;
    this.active = true;
    this.state = 'ROTATE_GB';
    this.t = 0;

    // 1. 本体回転アニメーションのキック (背面へ)
    this.rotator.start(targetPos, targetYAngle, this.durations.ROTATE_GB, () => {
      this.transitionToNext();
    });
  }

  transitionToNext() {
    this.t = 0;
    if (this.state === 'ROTATE_GB') {
      if (this.ejectCartId) {
        this.state = 'EJECT_SLIDE';
      } else {
        this.state = 'FLIGHT';
      }
    } 
    else if (this.state === 'EJECT_SLIDE') {
      this.state = 'FLIGHT';
    } 
    else if (this.state === 'FLIGHT') {
      if (this.insertCartId) {
        this.state = 'INSERT_SLIDE';
      } else {
        this.state = 'ROTATE_BACK';
        this.kickRotateBack();
      }
    } 
    else if (this.state === 'INSERT_SLIDE') {
      this.state = 'ROTATE_BACK';
      this.kickRotateBack();
    } 
    else if (this.state === 'ROTATE_BACK') {
      this.state = 'IDLE';
      this.active = false;
    }

    if (this.onStateChange) {
      this.onStateChange(this.state);
    }
  }

  kickRotateBack() {
    if (this.onStateChange) this.onStateChange('ROTATE_BACK_START');
  }

  update(dt, progressUpdateCallback) {
    if (!this.active) return;

    // rotator 自体のアニメーション更新
    if (this.state === 'ROTATE_GB' || this.state === 'ROTATE_BACK') {
      this.rotator.update(dt);
      return;
    }

    this.t += dt;
    const duration = this.durations[this.state];
    const progress = Math.min(1.0, this.t / duration);
    const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic

    if (progressUpdateCallback) {
      progressUpdateCallback(this.state, ease, progress);
    }

    if (progress >= 1.0) {
      this.transitionToNext();
    }
  }
}

// 4. 電源・発光マテリアル連動システム (Power Material & Light Linker)
class PowerMaterialLinker {
  constructor(screenMaterial, ledMaterial, pointLight) {
    this.screenMaterial = screenMaterial;
    this.ledMaterial = ledMaterial;
    this.pointLight = pointLight;
    this.powerOn = false;
    this.intensity = 0;
    this.targetIntensity = 0;
    this.fadeSpeed = 0.15; // 輝度遷移の速度
  }

  setPower(on) {
    this.powerOn = on;
    this.targetIntensity = on ? 1.0 : 0.0;
  }

  update() {
    if (Math.abs(this.intensity - this.targetIntensity) > 0.01) {
      this.intensity += (this.targetIntensity - this.intensity) * this.fadeSpeed;
      
      // スクリーン発光
      if (this.screenMaterial) {
        this.screenMaterial.emissiveIntensity = this.intensity * 0.45;
      }
      
      // LED自発光
      if (this.ledMaterial) {
        if (this.powerOn) {
          this.ledMaterial.emissive.setHex(0xff0000);
          this.ledMaterial.emissiveIntensity = this.intensity * 2.5;
        } else {
          this.ledMaterial.emissive.setHex(0x330000);
          this.ledMaterial.emissiveIntensity = (1.0 - this.intensity) * 0.2;
        }
      }
      
      // 点光源
      if (this.pointLight) {
        this.pointLight.intensity = this.intensity * 0.8;
      }
    }
  }
}

// 5. ゼロコピー CanvasTexture ストリーマー (Monitor Texture Streamer)
class MonitorTextureStreamer {
  constructor(canvas, texture) {
    this.canvas = canvas;
    this.texture = texture;
    this.lastScore = -1;
    this.lastState = '';
  }

  update(gameInstance) {
    if (!gameInstance || !this.texture) return;

    const currentScore = gameInstance.getScore();
    const currentState = gameInstance.getState();
    const isPowered = gameInstance.getPower();

    if (!isPowered) {
      this.texture.needsUpdate = true;
      return;
    }

    if (currentScore !== this.lastScore || currentState !== this.lastState || Math.random() < 0.2) {
      this.texture.needsUpdate = true;
      this.lastScore = currentScore;
      this.lastState = currentState;
    }
  }
}

// グローバル空間へ公開
window.PointerCollisionIsolator = PointerCollisionIsolator;
window.DirectionalRotator = DirectionalRotator;
window.ObjectReplacementSequencer = ObjectReplacementSequencer;
window.PowerMaterialLinker = PowerMaterialLinker;
window.MonitorTextureStreamer = MonitorTextureStreamer;
