'use strict';

class EffectsManager {
  constructor() {
    this.scene = null;
    this.playerMeshes = {};

    // 파티클 시스템 풀
    this._hitPS = null;
    this._coverHitPS = null;
    this._explosionPS = null;
    this._muzzleFlash = { A: null, B: null };

    // PostProcess
    this._vignettePass = null;
    this._bwPass = null;
    this._vignetteIntensity = 0;
    this._bwActive = false;
  }

  init(scene, camera, playerMeshes) {
    this.scene = scene;
    this.camera = camera;
    this.playerMeshes = playerMeshes;

    this._createHitParticles();
    this._createCoverHitParticles();
    this._createExplosionParticles();
    this._createMuzzleFlash('A');
    this._createMuzzleFlash('B');
    this._createPostProcessEffects(camera);
  }

  // ── 파티클 시스템 ─────────────────────────────────────────────────────────
  _createHitParticles() {
    const ps = new BABYLON.ParticleSystem('hitPS', 60, this.scene);
    ps.particleTexture = new BABYLON.Texture(
      'https://assets.babylonjs.com/particles/flare.png', this.scene);
    ps.emitter = new BABYLON.Vector3(0, 1, 0);
    ps.minEmitBox = new BABYLON.Vector3(-0.1, 0, -0.1);
    ps.maxEmitBox = new BABYLON.Vector3( 0.1, 0,  0.1);
    ps.color1 = new BABYLON.Color4(1, 0.2, 0, 1);
    ps.color2 = new BABYLON.Color4(1, 0.6, 0, 1);
    ps.colorDead = new BABYLON.Color4(0.4, 0, 0, 0);
    ps.minSize = 0.05; ps.maxSize = 0.2;
    ps.minLifeTime = 0.15; ps.maxLifeTime = 0.4;
    ps.emitRate = 200;
    ps.manualEmitCount = 40;
    ps.minEmitPower = 3; ps.maxEmitPower = 8;
    ps.updateSpeed = 0.02;
    ps.gravity = new BABYLON.Vector3(0, -12, 0);
    ps.direction1 = new BABYLON.Vector3(-1, 2, -1);
    ps.direction2 = new BABYLON.Vector3( 1, 4,  1);
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    this._hitPS = ps;
  }

  _createCoverHitParticles() {
    const ps = new BABYLON.ParticleSystem('coverHitPS', 30, this.scene);
    ps.particleTexture = new BABYLON.Texture(
      'https://assets.babylonjs.com/particles/flare.png', this.scene);
    ps.emitter = new BABYLON.Vector3(0, 1, 0);
    ps.color1 = new BABYLON.Color4(1, 1, 0.9, 1);
    ps.color2 = new BABYLON.Color4(0.9, 0.9, 0.8, 1);
    ps.colorDead = new BABYLON.Color4(0.5, 0.5, 0.4, 0);
    ps.minSize = 0.03; ps.maxSize = 0.1;
    ps.minLifeTime = 0.1; ps.maxLifeTime = 0.25;
    ps.manualEmitCount = 20;
    ps.minEmitPower = 2; ps.maxEmitPower = 5;
    ps.updateSpeed = 0.02;
    ps.gravity = new BABYLON.Vector3(0, -9, 0);
    ps.direction1 = new BABYLON.Vector3(-2, 1, -2);
    ps.direction2 = new BABYLON.Vector3( 2, 3,  2);
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    this._coverHitPS = ps;
  }

  _createExplosionParticles() {
    const ps = new BABYLON.ParticleSystem('explosionPS', 150, this.scene);
    ps.particleTexture = new BABYLON.Texture(
      'https://assets.babylonjs.com/particles/flare.png', this.scene);
    ps.emitter = new BABYLON.Vector3(0, 0, 0);
    ps.color1 = new BABYLON.Color4(1, 0.6, 0, 1);
    ps.color2 = new BABYLON.Color4(1, 0.2, 0, 1);
    ps.colorDead = new BABYLON.Color4(0.2, 0.1, 0, 0);
    ps.minSize = 0.2; ps.maxSize = 0.8;
    ps.minLifeTime = 0.3; ps.maxLifeTime = 0.8;
    ps.manualEmitCount = 100;
    ps.minEmitPower = 5; ps.maxEmitPower = 15;
    ps.updateSpeed = 0.02;
    ps.gravity = new BABYLON.Vector3(0, -6, 0);
    ps.direction1 = new BABYLON.Vector3(-3, 2, -3);
    ps.direction2 = new BABYLON.Vector3( 3, 6,  3);
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    this._explosionPS = ps;
  }

  _createMuzzleFlash(id) {
    const ps = new BABYLON.ParticleSystem(`muzzle${id}`, 30, this.scene);
    ps.particleTexture = new BABYLON.Texture(
      'https://assets.babylonjs.com/particles/flare.png', this.scene);
    ps.emitter = new BABYLON.Vector3(0, 1.2, 0);
    ps.color1 = new BABYLON.Color4(1, 0.9, 0.4, 1);
    ps.color2 = new BABYLON.Color4(1, 0.6, 0, 1);
    ps.colorDead = new BABYLON.Color4(1, 0.3, 0, 0);
    ps.minSize = 0.05; ps.maxSize = 0.2;
    ps.minLifeTime = 0.03; ps.maxLifeTime = 0.08;
    ps.manualEmitCount = 15;
    ps.minEmitPower = 3; ps.maxEmitPower = 6;
    ps.updateSpeed = 0.03;
    ps.direction1 = new BABYLON.Vector3(-0.3, -0.1, 0.8);
    ps.direction2 = new BABYLON.Vector3( 0.3,  0.3, 1.5);
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    this._muzzleFlash[id] = ps;
  }

  // ── PostProcess ───────────────────────────────────────────────────────────
  _createPostProcessEffects(camera) {
    // PostProcess는 성능 부담이 크므로 CSS로 대체
    // 피격 비네팅: game.html의 #hit-vignette div 사용
    // 흑백: CSS filter로 대체
    this._vignettePass = null;
    this._bwPass = null;
  }

  // ── 공개 이벤트 핸들러 ────────────────────────────────────────────────────
  onShoot(playerId, weaponIdx) {
    const mesh = this.playerMeshes[playerId];
    if (!mesh) return;
    const ps = this._muzzleFlash[playerId];
    if (ps) {
      ps.emitter = mesh.position.clone().add(
        new BABYLON.Vector3(
          Math.sin(mesh.rotation.y || 0) * 0.6,
          1.2,
          Math.cos(mesh.rotation.y || 0) * 0.6
        )
      );
      ps.reset();
      ps.start();
      setTimeout(() => ps.stop(), 80);
    }
    // 크로스헤어 퍼짐
    if (window.swHUD) swHUD.showCrosshairSpread();
  }

  onHitReceived() {
    // 카메라 흔들림은 game.js에서 처리
    if (window.swGame) swGame.triggerCameraShake(0.3, 0.3);
  }

  onBulletHitCover(x, y, z) {
    const ps = this._coverHitPS;
    if (ps) {
      ps.emitter = new BABYLON.Vector3(x, y, z);
      ps.reset();
      ps.start();
      setTimeout(() => ps.stop(), 100);
    }
  }

  onMonsterHit(x, y, z) {
    const ps = this._hitPS;
    if (ps) {
      ps.emitter = new BABYLON.Vector3(x, y, z);
      ps.reset();
      ps.start();
      setTimeout(() => ps.stop(), 200);
    }
  }

  onExplosion(x, y, z) {
    const ps = this._explosionPS;
    if (ps) {
      ps.emitter = new BABYLON.Vector3(x, y || 0.5, z);
      ps.reset();
      ps.start();
      setTimeout(() => ps.stop(), 500);
    }
    // 카메라 흔들림
    if (window.swGame) swGame.triggerCameraShake(0.5, 0.4);
  }

  onPlayerDeath(playerId) {
    const mesh = this.playerMeshes[playerId];
    if (mesh) {
      const ps = this._explosionPS;
      if (ps) {
        ps.emitter = mesh.position.clone().addInPlaceFromFloats(0, 0.5, 0);
        ps.reset();
        ps.start();
        setTimeout(() => ps.stop(), 600);
      }
    }
    // 흑백 효과 (내 캐릭터 사망 시)
    if (window.swNetwork && playerId === swNetwork.myPlayer) {
      this.setGrayscale(true);
    }
  }

  onRespawn(playerId) {
    if (window.swNetwork && playerId === swNetwork.myPlayer) {
      this.setGrayscale(false);
    }
  }

  onGameOver(isWinner) {
    // 승리: 파란 틴트, 패배: 계속 흑백
    if (!isWinner && this._bwPass) {
      this._bwPass.degree = 1;
    }
  }

  setGrayscale(active) {
    // CSS filter로 흑백 처리 (PostProcess 대체)
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
      canvas.style.transition = 'filter 0.4s';
      canvas.style.filter = active ? 'grayscale(1) brightness(0.6)' : '';
    }
  }

  update(dt) {
    // PostProcess 제거 후 업데이트 불필요
  }
}

window.swEffects = new EffectsManager();
