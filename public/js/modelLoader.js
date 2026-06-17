'use strict';

// ─── 파일 경로 매핑 (FBX 우선, .glb 폴백) ───────────────────────────────────
const MODEL_PATHS = {
  playerA: 'models/character/Slash Advance (1).fbx',
  playerB: 'models/character/Slash Advance (2).fbx',
  char3:   'models/character/Slash Advance (3).fbx',
  char4:   'models/character/Slash Advance (4).fbx',
  char5:   'models/character/Slash Advance (5).fbx',
  rifle:   'models/weapons/Assault Rifle.glb',
  shotgun: 'models/weapons/Shotgun.glb',
  pistol:  'models/weapons/9mm Pistol.glb',
  map:     'models/map/map_ep_73.glb',
};

const ANIM_PATHS = {
  idle:    'models/animations/Rifle Idle.fbx',
  walk:    'models/animations/Walk Forward.fbx',
  run:     'models/animations/Rifle Run.fbx',
  shoot:   'models/animations/Firing Rifle.fbx',
  reload:  'models/animations/Reload.fbx',
  death:   'models/animations/Dying.fbx',
  melee:   'models/animations/Standing Melee Kick.fbx',
  hit:     'models/animations/Hit Reaction.fbx',
  strafeL: 'models/animations/Run Left.fbx',
  strafeR: 'models/animations/Run Right.fbx',
  runBack: 'models/animations/Backwards Rifle Run.fbx',
};

// FBX 로드 실패 시 GLB 폴백 경로
function getFallbackPath(filePath) {
  if (filePath.endsWith('.fbx')) return filePath + '.glb';
  return null;
}

// ─── ModelLoader 클래스 ──────────────────────────────────────────────────────
class ModelLoader {
  constructor() {
    this.modelCache = new Map();
    this.animCache  = new Map();
    this._totalAssets   = 0;
    this._loadedAssets  = 0;
  }

  setProgress(pct) {
    const bar = document.getElementById('loadProgress');
    if (bar) bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
  }

  setStatus(text) {
    const el = document.getElementById('loadStatus');
    if (el) el.textContent = text;
  }

  _onAssetLoaded() {
    this._loadedAssets++;
    const pct = this._totalAssets > 0
      ? (this._loadedAssets / this._totalAssets) * 100
      : 0;
    this.setProgress(pct);
  }

  // ── 경로에서 Babylon.js rootUrl / fileName 분리 ──────────────────────────
  _splitPath(filePath) {
    const lastSlash = filePath.lastIndexOf('/');
    return {
      rootUrl:  '/' + filePath.substring(0, lastSlash + 1),
      fileName: filePath.substring(lastSlash + 1),
    };
  }

  // ── 단일 경로 임포트 시도 ──────────────────────────────────────────────────
  async _tryImport(filePath, scene) {
    const { rootUrl, fileName } = this._splitPath(filePath);
    return await BABYLON.SceneLoader.ImportMeshAsync('', rootUrl, fileName, scene);
  }

  // ── 캐릭터 스케일 및 발 위치 자동 보정 ───────────────────────────────────
  _fixCharacterScale(rootMesh) {
    rootMesh.computeWorldMatrix(true);
    let bbox = rootMesh.getHierarchyBoundingVectors(true);
    const height = bbox.max.y - bbox.min.y;

    if (height < 0.01) return; // 빈 메시

    // 목표 키: 1.8m
    const targetH = 1.8;
    if (height > 10 || height < 0.5) {
      // cm 단위이거나 너무 작음 → 재스케일
      const s = targetH / height;
      rootMesh.scaling.scaleInPlace(s);
      rootMesh.computeWorldMatrix(true);
      bbox = rootMesh.getHierarchyBoundingVectors(true);
    }

    // 발이 Y=0이 되도록 오프셋 적용
    if (bbox.min.y < -0.05) {
      rootMesh.position.y -= bbox.min.y;
      rootMesh.computeWorldMatrix(true);
    }
  }

  // ── 무기 스케일 보정 ──────────────────────────────────────────────────────
  _fixWeaponScale(rootMesh) {
    rootMesh.computeWorldMatrix(true);
    const bbox = rootMesh.getHierarchyBoundingVectors(true);
    const maxDim = Math.max(
      bbox.max.x - bbox.min.x,
      bbox.max.y - bbox.min.y,
      bbox.max.z - bbox.min.z
    );
    if (maxDim > 5 || maxDim < 0.05) {
      rootMesh.scaling.scaleInPlace(0.5 / Math.max(maxDim, 0.01));
      rootMesh.computeWorldMatrix(true);
    }
  }

  // ── 맵 스케일 보정 ────────────────────────────────────────────────────────
  _fixMapScale(rootMesh) {
    rootMesh.computeWorldMatrix(true);
    const bbox = rootMesh.getHierarchyBoundingVectors(true);
    const size = Math.max(
      bbox.max.x - bbox.min.x,
      bbox.max.z - bbox.min.z
    );
    if (size > 0 && size < 10) {
      rootMesh.scaling.scaleInPlace(10 / size);
    } else if (size > 200) {
      rootMesh.scaling.scaleInPlace(100 / size);
    }
  }

  // ── 개별 모델 로딩 (FBX 우선 → GLB 폴백) ──────────────────────────────────
  async loadModel(key, scene) {
    if (this.modelCache.has(key)) return this.modelCache.get(key);

    const filePath = MODEL_PATHS[key];
    if (!filePath) {
      console.warn(`[ModelLoader] 알 수 없는 모델 키: ${key}`);
      return null;
    }

    const tryPaths = [filePath];
    const fallback = getFallbackPath(filePath);
    if (fallback) tryPaths.push(fallback);

    let result = null;
    for (const path of tryPaths) {
      try {
        result = await this._tryImport(path, scene);
        console.log(`[ModelLoader] 로드 성공: ${path}`);
        break;
      } catch (err) {
        console.warn(`[ModelLoader] 로드 실패 (${path}): ${err.message || err}`);
      }
    }

    if (!result) {
      this._onAssetLoaded();
      return null;
    }

    let rootMesh = result.meshes.find(m => m.parent === null) || result.meshes[0];
    if (!rootMesh) { this._onAssetLoaded(); return null; }

    // 스케일/위치 보정
    if (key.startsWith('player') || key.startsWith('char')) {
      this._fixCharacterScale(rootMesh);
    } else if (key === 'map') {
      this._fixMapScale(rootMesh);
    } else if (key === 'rifle' || key === 'shotgun' || key === 'pistol') {
      this._fixWeaponScale(rootMesh);
    }

    // 초기 비활성화 (game.js에서 활성화)
    rootMesh.setEnabled(false);

    const entry = {
      rootMesh,
      meshes: result.meshes,
      animationGroups: result.animationGroups || [],
    };
    this.modelCache.set(key, entry);
    this._onAssetLoaded();
    return entry;
  }

  // ── 개별 애니메이션 로딩 (FBX 우선 → GLB 폴백) ───────────────────────────
  async loadAnimation(animKey, scene) {
    if (this.animCache.has(animKey)) return this.animCache.get(animKey);

    const filePath = ANIM_PATHS[animKey];
    if (!filePath) return null;

    const tryPaths = [filePath];
    const fallback = getFallbackPath(filePath);
    if (fallback) tryPaths.push(fallback);

    let result = null;
    for (const path of tryPaths) {
      try {
        result = await this._tryImport(path, scene);
        break;
      } catch (err) {
        console.warn(`[ModelLoader] 애니메이션 로드 실패 (${path}): ${err.message || err}`);
      }
    }

    if (!result) { this._onAssetLoaded(); return null; }

    // 로드된 메시는 숨기기, 애니메이션 그룹만 추출
    result.meshes.forEach(m => {
      m.setEnabled(false);
      m.isPickable = false;
      m.isVisible = false;
    });

    if (result.animationGroups && result.animationGroups.length > 0) {
      const ag = result.animationGroups[0];
      ag.name = animKey;
      ag.stop();
      this.animCache.set(animKey, ag);
      console.log(`[ModelLoader] 애니메이션 로드: ${animKey}`);
      this._onAssetLoaded();
      return ag;
    }

    this._onAssetLoaded();
    return null;
  }

  // ── 전체 애니메이션 로딩 ────────────────────────────────────────────────
  async loadAllAnimations(scene) {
    const keys = Object.keys(ANIM_PATHS);
    const promises = keys.map(k => this.loadAnimation(k, scene));
    const results = await Promise.allSettled(promises);
    const success = results.filter(r => r.status === 'fulfilled' && r.value).length;
    console.log(`[ModelLoader] 애니메이션 ${success}/${keys.length}개 로드 완료`);
  }

  // ── 폴백 메시 ──────────────────────────────────────────────────────────────
  getFallbackCharacter(scene, color) {
    const root = new BABYLON.TransformNode('fallbackCharRoot', scene);

    const body = BABYLON.MeshBuilder.CreateCylinder('fbChar_body', {
      height: 1.2, diameterTop: 0.55, diameterBottom: 0.50, tessellation: 10
    }, scene);
    body.position.y = 0.6;
    body.parent = root;

    const head = BABYLON.MeshBuilder.CreateSphere('fbChar_head', {
      diameter: 0.50, segments: 7
    }, scene);
    head.position.y = 1.45;
    head.parent = root;

    const mat = new BABYLON.StandardMaterial('fbCharMat_' + Math.random(), scene);
    mat.diffuseColor  = color;
    mat.emissiveColor = color.scale(0.15);
    mat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.4);
    body.material = mat;
    head.material = mat;

    return root;
  }

  getFallbackWeapon(scene) {
    const mesh = BABYLON.MeshBuilder.CreateBox('fbWeapon', { width: 0.08, height: 0.08, depth: 0.5 }, scene);
    const mat  = new BABYLON.StandardMaterial('fbWeaponMat', scene);
    mat.diffuseColor  = new BABYLON.Color3(0.15, 0.15, 0.18);
    mat.emissiveColor = new BABYLON.Color3(0.02, 0.02, 0.04);
    mesh.material = mat;
    return mesh;
  }

  // ── 전체 로딩 (무기만) ───────────────────────────────────────────────────
  async loadGame(scene) {
    const weaponKeys = ['rifle', 'shotgun', 'pistol'];
    this._totalAssets  = weaponKeys.length;
    this._loadedAssets = 0;
    this.setProgress(0);

    this.setStatus('무기 모델 로딩 중...');
    await Promise.allSettled(weaponKeys.map(k => this.loadModel(k, scene)));

    this.setProgress(100);
    this.setStatus('로딩 완료!');
    console.log('[ModelLoader] 무기 에셋 로딩 완료');
  }
}

window.swModelLoader = new ModelLoader();
