'use strict';

// ─── 스폰 위치 수동 설정 ──────────────────────────────────────────────────────
// null 이면 레이캐스트 자동 감지. 캐릭터가 뜨거나 바닥에 파묻히면 직접 설정.
// 콘솔 로그 "바닥 레이캐스트 (0,-?): y=?" 값을 참고해서 Y를 맞춰주세요.
const SPAWN_CONFIG = {
  A: null, // 예: { x: 0, y: 8.0, z: -16 }
  B: null, // 예: { x: 0, y: 8.0, z:  16 }
};

// ─── 엄폐물 정의 (서버 gameState.js와 동일) ─────────────────────────────────
const COVER_BOXES = [
  { x:  10, z:   0, w: 4.0, h: 2.5, d: 4.0 },
  { x: -10, z:   5, w: 3.0, h: 3.0, d: 6.0 },
  { x:   0, z:  15, w: 6.0, h: 2.5, d: 3.0 },
  { x:  20, z: -10, w: 4.0, h: 3.0, d: 4.0 },
  { x: -20, z:  -8, w: 5.0, h: 2.5, d: 3.0 },
  { x:   5, z: -15, w: 3.0, h: 3.0, d: 5.0 },
  { x:  -5, z: -20, w: 4.0, h: 2.5, d: 4.0 },
  { x:  15, z:  20, w: 6.0, h: 3.0, d: 3.0 },
  { x: -15, z:  15, w: 4.0, h: 2.5, d: 4.0 },
  { x:  25, z:   5, w: 3.0, h: 3.0, d: 5.0 },
  { x: -25, z:  -5, w: 5.0, h: 2.5, d: 3.0 },
  { x:   0, z: -25, w: 4.0, h: 3.0, d: 4.0 },
  { x: -10, z:  25, w: 3.0, h: 2.5, d: 6.0 },
  { x:  10, z: -30, w: 5.0, h: 3.0, d: 3.0 },
  { x: -20, z:  30, w: 4.0, h: 2.5, d: 4.0 },
];

// ─── 무기 메타 ───────────────────────────────────────────────────────────────
const WEAPON_KEYS = ['rifle', 'shotgun', 'pistol'];

// ─── GameRenderer ─────────────────────────────────────────────────────────────
class GameRenderer {
  constructor() {
    this.engine   = null;
    this.scene    = null;
    this.camera   = null;
    this.myPlayer = null;

    // 플레이어 메시 (TransformNode or Mesh)
    this.playerMeshes  = { A: null, B: null };
    this.playerGuns    = { A: null, B: null }; // 손에 붙은 무기 메시
    this.prevDead      = { A: false, B: false };

    // 애니메이션 컨트롤러
    this.animControllers = { A: null, B: null };

    // 맵
    this.mapMesh = null;
    this.proceduralMapRoot = null;
    this.mapBounds = null;
    this.mapCenter = null;
    this.mapSize = null;
    this.minimapBgImage = null;
    this.pendingSpawnA = null;
    this.pendingSpawnB = null;

    // 총알 풀
    this.bulletPool    = [];
    this.activeBullets = new Map();
    this.BULLET_POOL_SIZE = 80;

    // 몬스터 / 아이템
    this.monsterMeshes = new Map();
    this.itemMeshes    = new Map();

    // 카메라
    this.camCurrentDist   = 8;
    this.camCurrentHeight = 4.5;
    this.camShakeTimer    = 0;
    this.camShakeStrength = 0;
    this.camBobPhase      = 0;

    // 캐릭터 선택 (sessionStorage에서 읽음)
    this.characterChoices = { A: 'playerA', B: 'playerB' };

    // 모델 로딩 완료 여부
    this.modelsLoaded = false;

    this.lastState = null;
    this.effects   = null;
  }

  // ── 초기화 ──────────────────────────────────────────────────────────────
  async init(canvasId, myPlayer) {
    this.myPlayer = myPlayer;

    // 캐릭터 선택 읽기
    const charChoice = sessionStorage.getItem('swCharacter');
    if (charChoice) {
      const charIdx = parseInt(charChoice, 10);
      const charMap = { 1: 'playerA', 2: 'playerB', 3: 'char3', 4: 'char4', 5: 'char5' };
      this.characterChoices[myPlayer] = charMap[charIdx] || 'playerA';
    }

    const canvas = document.getElementById(canvasId);

    // Engine (antialias off — FXAA post-process가 대신 처리)
    this.engine = new BABYLON.Engine(canvas, false, {
      preserveDrawingBuffer: false,
      stencil: false,
      antialias: false,
    });
    this.engine.setHardwareScalingLevel(1.0);

    // Scene
    this.scene = this._createScene();

    // 기본 맵 생성 (모델 로딩 전 임시)
    this._createProceduralMap();

    // 폴백 플레이어 메시 생성 (모델 로딩 전 임시)
    this._createFallbackPlayerMeshes();

    // 총알 풀 생성
    this._createBulletPool();

    // Effects 초기화
    if (window.swEffects) {
      swEffects.init(this.scene, this.camera, this.playerMeshes);
      this.effects = swEffects;
    }

    // 렌더 루프 시작 (로딩 중에도 렌더)
    this.engine.runRenderLoop(() => {
      const dt = this.engine.getDeltaTime() / 1000;
      this._updateFrame(dt);
      this.scene.render();
    });

    window.addEventListener('resize', () => this.engine.resize());

    // 모델 비동기 로딩
    if (window.swModelLoader) {
      try {
        await swModelLoader.loadGame(this.scene);
        this._onModelsLoaded();
      } catch (err) {
        console.error('[GameRenderer] 모델 로딩 오류:', err);
        this._hideLoadingScreen();
      }
    } else {
      this._hideLoadingScreen();
    }

    // 로딩 완료/실패 후 카메라를 현재 내 캐릭터 위치로 즉시 점프
    const m0 = this.playerMeshes[this.myPlayer];
    if (m0 && this.camera && m0.position) {
      this.camera.target.copyFromFloats(m0.position.x, m0.position.y + 1.0, m0.position.z);
    }
  }

  // ── 모델 로딩 완료 콜백 ──────────────────────────────────────────────────
  _onModelsLoaded() {
    this.modelsLoaded = true;

    // 맵 먼저 배치 (스폰 좌표 계산이 선행되어야 함)
    this._setupMapMesh();

    // 플레이어 메시 배치 (맵 기준 스폰 위치 사용)
    ['A', 'B'].forEach(id => {
      const charKey = this.characterChoices[id];
      this._setupPlayerMesh(id, charKey);
    });

    // 무기 배치 및 AnimController 초기화 (애니메이션 리타겟팅 포함)
    ['A', 'B'].forEach(id => {
      const state = this.lastState;
      const weaponIdx = state && state.players && state.players[id]
        ? (state.players[id].weapon || 0)
        : 0;
      this._attachWeapon(id, weaponIdx);

      // 캐릭터 뼈대에 맞게 애니메이션 리타겟팅
      const playerRoot = this.playerMeshes[id];
      const animMap = (playerRoot && swModelLoader.animCache.size > 0)
        ? this._buildRetargetedAnimMap(playerRoot)
        : swModelLoader.animCache;
      this.animControllers[id] = new AnimController(animMap);
    });

    // 카메라 타겟을 내 캐릭터 위치로 즉시 점프 (모델 배치 직후)
    const myMesh = this.playerMeshes[this.myPlayer];
    if (myMesh && this.camera && myMesh.position) {
      this.camera.target.copyFromFloats(
        myMesh.position.x,
        myMesh.position.y + 1.0,
        myMesh.position.z
      );
      console.log(`[GameRenderer] 카메라 타겟 재조정: (${myMesh.position.x.toFixed(1)}, ${(myMesh.position.y+1).toFixed(1)}, ${myMesh.position.z.toFixed(1)})`);
    }

    this._hideLoadingScreen();
    console.log('[GameRenderer] 모델 로딩 완료, 게임 준비됨');
  }

  // ── 애니메이션 리타겟팅 ──────────────────────────────────────────────────
  _buildRetargetedAnimMap(characterRootNode) {
    // 캐릭터 계층의 모든 노드를 이름 → 노드 맵으로 수집
    const nodeMap = new Map();
    const collect = (node) => {
      if (!node) return;
      if (node.name) nodeMap.set(node.name, node);
      const children = node.getChildren ? node.getChildren(null, false) : [];
      children.forEach(collect);
    };
    collect(characterRootNode);

    const retargetedMap = new Map();
    let successCount = 0;

    swModelLoader.animCache.forEach((animGroup, animKey) => {
      const retargeted = new BABYLON.AnimationGroup(`${animKey}_${characterRootNode.name || 'char'}`);
      let mapped = 0;

      animGroup.targetedAnimations.forEach(ta => {
        const charNode = nodeMap.get(ta.target.name);
        if (charNode) {
          retargeted.addTargetedAnimation(ta.animation, charNode);
          mapped++;
        }
      });

      retargetedMap.set(animKey, retargeted);
      if (mapped > 0) successCount++;
    });

    console.log(`[GameRenderer] 애니메이션 리타겟팅: ${successCount}/${swModelLoader.animCache.size}개 성공`);
    return retargetedMap;
  }

  // ── 로딩 화면 숨기기 ──────────────────────────────────────────────────────
  _hideLoadingScreen() {
    const el = document.getElementById('loadingScreen');
    if (el) {
      el.style.transition = 'opacity 0.5s';
      el.style.opacity = '0';
      setTimeout(() => { el.style.display = 'none'; }, 500);
    }
  }

  // ── 씬 생성 ──────────────────────────────────────────────────────────────
  _createScene() {
    const scene = new BABYLON.Scene(this.engine);
    scene.clearColor = new BABYLON.Color4(0.04, 0.07, 0.18, 1); // 다크 나이트 스카이
    scene.fogMode  = BABYLON.Scene.FOGMODE_LINEAR;
    scene.fogStart = 60; scene.fogEnd = 110;
    scene.fogColor = new BABYLON.Color3(0.05, 0.09, 0.20);

    // 환경광 (약간 푸른 달빛 분위기)
    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity   = 0.65;
    hemi.diffuse     = new BABYLON.Color3(0.75, 0.85, 1.0);
    hemi.groundColor = new BABYLON.Color3(0.10, 0.12, 0.18);

    // 주 방향광 (달빛 느낌)
    const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.8, -2, -1.2), scene);
    sun.intensity = 0.7;
    sun.diffuse   = new BABYLON.Color3(0.88, 0.92, 1.0);

    // 보조 방향광 (약한 오렌지 림라이트)
    const rimLight = new BABYLON.DirectionalLight('rim', new BABYLON.Vector3(1, -0.5, 0.8), scene);
    rimLight.intensity = 0.18;
    rimLight.diffuse   = new BABYLON.Color3(1.0, 0.65, 0.3);

    // ArcRotateCamera (캐릭터 뒤에서 따라다니는 궤도 카메라)
    this.camera = new BABYLON.ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 4, 8, new BABYLON.Vector3(0, 1, 0), scene);
    this.camera.lowerRadiusLimit = 4;
    this.camera.upperRadiusLimit = 12;
    this.camera.lowerBetaLimit = 0.1;
    this.camera.upperBetaLimit = 1.85;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 250;
    this.camera.wheelPrecision = 50;
    this.camera.attachControl(this.engine.getRenderingCanvas(), true);

    // ── 카메라 추적: 모델 로딩 전후 항상 동작 ──────────────────────────────
    scene.registerBeforeRender(() => {
      const m = this.playerMeshes[this.myPlayer];
      if (!m || !this.camera) return;
      const px = m.position ? m.position.x : 0;
      const py = m.position ? m.position.y : 0;
      const pz = m.position ? m.position.z : 0;
      // 카메라가 유효 범위 밖에 있으면 즉시 점프, 아니면 lerp
      const tx = px, ty = py + 1.0, tz = pz;
      const dist = Math.hypot(this.camera.target.x - tx, this.camera.target.z - tz);
      const alpha = dist > 30 ? 1.0 : 0.12;
      this.camera.target.x += (tx - this.camera.target.x) * alpha;
      this.camera.target.y += (ty - this.camera.target.y) * alpha;
      this.camera.target.z += (tz - this.camera.target.z) * alpha;
    });

    // 성능 최적화
    scene.autoClear = true;
    scene.skipFrustumClipping = false;
    scene.pointerMovePredicate = () => false;

    // PBR 머티리얼을 위한 환경 텍스처 (캐릭터 GLB 렌더링)
    try {
      scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(
        'https://assets.babylonjs.com/environments/environmentSpecular.env', scene);
      scene.environmentIntensity = 0.35;
    } catch(_) {}

    // ── 후처리 파이프라인 (FXAA + Bloom + 톤매핑 + 비네팅) ──────────────────
    try {
      const pipeline = new BABYLON.DefaultRenderingPipeline('swPipeline', true, scene, [this.camera]);

      // FXAA — 부드러운 안티앨리어싱 (비용 낮음)
      pipeline.fxaaEnabled = true;

      // Bloom — 발광 오브젝트에 글로우 효과
      pipeline.bloomEnabled    = true;
      pipeline.bloomThreshold  = 0.60;
      pipeline.bloomWeight     = 0.35;
      pipeline.bloomKernel     = 32;
      pipeline.bloomScale      = 0.5;

      // 이미지 프로세싱
      pipeline.imageProcessingEnabled = true;
      pipeline.imageProcessing.contrast = 1.25;
      pipeline.imageProcessing.exposure = 1.10;
      pipeline.imageProcessing.toneMappingEnabled = true;

      // 비네팅 (화면 가장자리 어두움)
      pipeline.imageProcessing.vignetteEnabled   = true;
      pipeline.imageProcessing.vignetteWeight    = 3.0;
      pipeline.imageProcessing.vignetteCameraFov = 0.5;
      pipeline.imageProcessing.vignetteColor     = new BABYLON.Color4(0, 0, 0.05, 0);
      pipeline.imageProcessing.vignetteBlendMode =
        BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

      this._pipeline = pipeline;
    } catch(e) {
      console.warn('[Pipeline] 후처리 초기화 실패:', e.message);
    }

    return scene;
  }

  // ── 맵 모델 배치 ─────────────────────────────────────────────────────────
  _setupMapMesh() {
    const mapEntry = swModelLoader.modelCache.get('map');
    if (!mapEntry) {
      console.warn('[GameRenderer] 맵 모델 없음 — 기본 바닥 유지');
      return;
    }

    const root = mapEntry.rootMesh;
    root.setEnabled(true);

    // 각 메시별 월드 바운딩 박스 계산 (정점 없는 __root__ 컨테이너 메시 제외)
    const mapBoundsCalc = {
      min: new BABYLON.Vector3(Infinity, Infinity, Infinity),
      max: new BABYLON.Vector3(-Infinity, -Infinity, -Infinity),
    };
    mapEntry.meshes.forEach(m => {
      if (m.getTotalVertices && m.getTotalVertices() === 0) return; // 빈 컨테이너 제외
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      const mn = bb.minimumWorld, mx = bb.maximumWorld;
      if (mn.x === mx.x && mn.y === mx.y && mn.z === mx.z) return; // 크기 0 제외
      mapBoundsCalc.min = BABYLON.Vector3.Minimize(mapBoundsCalc.min, mn);
      mapBoundsCalc.max = BABYLON.Vector3.Maximize(mapBoundsCalc.max, mx);
    });
    // 유효한 바운드가 없으면 폴백
    if (!isFinite(mapBoundsCalc.min.y)) {
      mapBoundsCalc.min.copyFromFloats(-50, -2, -50);
      mapBoundsCalc.max.copyFromFloats( 50, 20,  50);
    }
    console.log(`[GameRenderer] 맵 원본 bounds: min.y=${mapBoundsCalc.min.y.toFixed(2)}, max.y=${mapBoundsCalc.max.y.toFixed(2)}`);

    const mapSize   = mapBoundsCalc.max.subtract(mapBoundsCalc.min);
    const mapCenter = BABYLON.Vector3.Center(mapBoundsCalc.min, mapBoundsCalc.max);

    // 맵을 X/Z 중심=원점, 바닥 Y=0 으로 배치
    root.position.set(-mapCenter.x, -mapBoundsCalc.min.y, -mapCenter.z);

    // 레이캐스트 전 world matrix 강제 갱신 (스폰 위치 정확도 확보)
    root.computeWorldMatrix(true);
    mapEntry.meshes.forEach(m => {
      try { m.computeWorldMatrix(true); } catch(_) {}
    });

    // 배치 후 월드 공간 바운딩 박스 (바닥=0)
    this.mapBounds = {
      min: new BABYLON.Vector3(-mapSize.x / 2, 0, -mapSize.z / 2),
      max: new BABYLON.Vector3( mapSize.x / 2, mapSize.y, mapSize.z / 2),
    };
    this.mapCenter = BABYLON.Vector3.Zero();
    this.mapSize   = mapSize.clone();

    // 프로시저럴 맵 숨기기
    if (this.proceduralMapRoot) this.proceduralMapRoot.setEnabled(false);
    const procFloor = this.scene.getMeshByName('floor');
    if (procFloor) procFloor.setEnabled(false);

    // 맵 메시 충돌 + 최적화
    mapEntry.meshes.forEach(mesh => {
      const lname = (mesh.name || '').toLowerCase();
      if (!lname.includes('trigger') && !lname.includes('spawn_') && !lname.includes('camera')) {
        mesh.checkCollisions = true;
        mesh.isPickable = true;
      }
      try { mesh.freezeWorldMatrix(); } catch(_) {}
      if (mesh.material) { try { mesh.material.freeze(); } catch(_) {} }
    });

    this._addBoundaryWalls();

    // 스폰 Z 범위
    const spawnZ = Math.min(25, mapSize.z * 0.3);

    // 레이캐스트로 실제 바닥 Y 감지
    const findFloorY = (wx, wz) => {
      const ray = new BABYLON.Ray(new BABYLON.Vector3(wx, 500, wz), new BABYLON.Vector3(0, -1, 0), 1000);
      const hit = this.scene.pickWithRay(ray, m => m.isPickable);
      const floorY = (hit && hit.hit) ? hit.pickedPoint.y : 0;
      console.log(`[GameRenderer] 바닥 레이캐스트 (${wx.toFixed(0)},${wz.toFixed(0)}): y=${floorY.toFixed(2)}`);
      return floorY;
    };
    const floorA = findFloorY(0, -spawnZ);
    const floorB = findFloorY(0,  spawnZ);

    // SPAWN_CONFIG 수동 설정이 있으면 우선 사용, 없으면 레이캐스트 결과 사용
    // y: 바닥 Y + 0.05 (캐릭터 발이 Y=0 기준이므로 살짝만 올림)
    const spawnA = SPAWN_CONFIG.A
      ? { ...SPAWN_CONFIG.A }
      : { x: 0, y: floorA + 0.05, z: -spawnZ };
    const spawnB = SPAWN_CONFIG.B
      ? { ...SPAWN_CONFIG.B }
      : { x: 0, y: floorB + 0.05, z:  spawnZ };
    this.pendingSpawnA = spawnA;
    this.pendingSpawnB = spawnB;

    // 서버에 스폰 위치 전송 (updateSpawn → 플레이어 위치 즉시 반영)
    if (window.swNetwork && swNetwork.connected) {
      swNetwork.send({ type: 'updateSpawn', spawnA, spawnB });
    }

    this._setupMinimapRTT(mapEntry.meshes);
    if (window.swHUD) swHUD.setMapBounds(this.mapBounds.min, this.mapSize);

    this.mapMesh = root;
    console.log(`[GameRenderer] 맵 배치: size=(${mapSize.x.toFixed(1)},${mapSize.y.toFixed(1)},${mapSize.z.toFixed(1)}), spawnA=${JSON.stringify(spawnA)}`);
  }

  // ── 경계 투명 벽 ──────────────────────────────────────────────────────────
  _addBoundaryWalls() {
    if (!this.mapSize) return;
    const halfX = this.mapSize.x / 2;
    const halfZ = this.mapSize.z / 2;
    const wallH = 25;

    const mat = new BABYLON.StandardMaterial('boundaryWallMat', this.scene);
    mat.alpha = 0;

    const defs = [
      { pos: [0, wallH/2,  halfZ+0.5], size: [this.mapSize.x+2, wallH, 1] },
      { pos: [0, wallH/2, -halfZ-0.5], size: [this.mapSize.x+2, wallH, 1] },
      { pos: [ halfX+0.5, wallH/2, 0], size: [1, wallH, this.mapSize.z+2] },
      { pos: [-halfX-0.5, wallH/2, 0], size: [1, wallH, this.mapSize.z+2] },
      // 바닥 (낙하 방지)
      { pos: [0, -2, 0], size: [this.mapSize.x+10, 1, this.mapSize.z+10] },
    ];

    defs.forEach((d, i) => {
      const w = BABYLON.MeshBuilder.CreateBox(`bwall${i}`, {
        width: d.size[0], height: d.size[1], depth: d.size[2]
      }, this.scene);
      w.position.set(...d.pos);
      w.material = mat;
      w.checkCollisions = true;
      w.isPickable = false;
      w.isVisible = false;
    });
  }

  // ── 미니맵 RTT ────────────────────────────────────────────────────────────
  _setupMinimapRTT(mapMeshes) {
    if (!this.mapSize || !this.engine) return;
    const size = this.mapSize;
    const scene = this.scene;

    const minimapCam = new BABYLON.FreeCamera('minimapCam',
      new BABYLON.Vector3(0, size.y + 60, 0), scene);
    minimapCam.setTarget(BABYLON.Vector3.Zero());
    minimapCam.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
    minimapCam.orthoLeft   = -size.x / 2;
    minimapCam.orthoRight  =  size.x / 2;
    minimapCam.orthoTop    =  size.z / 2;
    minimapCam.orthoBottom = -size.z / 2;
    minimapCam.minZ = 1;
    minimapCam.maxZ = size.y + 100;

    // 맵이 완전히 렌더된 후 스크린샷
    setTimeout(() => {
      BABYLON.Tools.CreateScreenshotUsingRenderTarget(
        this.engine, minimapCam,
        { precision: 1, width: 512, height: 512 },
        (data) => {
          const img = new Image();
          img.onload = () => {
            this.minimapBgImage = img;
            if (window.swHUD) swHUD.setMinimapBg(img);
          };
          img.src = data;
          minimapCam.dispose();
        }
      );
    }, 1000);
  }

  // ── 플레이어 메시 설정 ──────────────────────────────────────────────────
  _setupPlayerMesh(id, modelKey) {
    // 기존 클론 정리
    const prev = this.playerMeshes[id];
    if (prev) {
      if (prev._swClone) {
        prev.getDescendants(false).forEach(d => { try { d.dispose(); } catch(_){} });
        try { prev.dispose(); } catch(_) {}
      } else {
        prev.setEnabled(false);
      }
    }

    const entry = swModelLoader.modelCache.get(modelKey);
    let rootNode;

    if (entry && entry.rootMesh) {
      // 원본 rootMesh 직접 사용 (clone/instantiate 없음 — GLB skinned mesh 안정성)
      rootNode = entry.rootMesh;
      rootNode._swClone = false;

      // 모든 노드 활성화 (TPS 3인칭 — 내 캐릭터도 보임)
      rootNode.setEnabled(true);
      if (rootNode.isVisible !== undefined) { rootNode.isVisible = true; rootNode.visibility = 1.0; }
      rootNode.getChildMeshes(false).forEach(child => {
        child.setEnabled(true);
        child.isVisible = true;
        child.visibility = 1.0;
        child.isPickable = false;
      });

      console.log(`[GameRenderer] 캐릭터 ${id} 모델 배치: ${modelKey}`);
    } else {
      // 폴백 캡슐
      const col = id === 'A'
        ? new BABYLON.Color3(0.10, 0.45, 1.0)
        : new BABYLON.Color3(1.0, 0.18, 0.18);
      rootNode = swModelLoader.getFallbackCharacter(this.scene, col);
      rootNode._swClone = false;
      console.warn(`[GameRenderer] [FALLBACK] 캐릭터 ${id} 폴백 사용`);
    }

    // 스폰 위치로 초기 배치 (pendingSpawnA/B 우선 사용)
    const spawn = id === 'A' ? this.pendingSpawnA : this.pendingSpawnB;
    if (spawn) {
      rootNode.position.set(spawn.x, spawn.y, spawn.z);
    } else if (this.mapBounds) {
      const spawnZ = Math.min(25, this.mapSize.z * 0.3);
      rootNode.position.set(0, 1.0, id === 'A' ? -spawnZ : spawnZ);
    } else {
      rootNode.position.set(0, 1.0, id === 'A' ? -40 : 40);
    }

    this.playerMeshes[id] = rootNode;
    this._addNameLabel(id, rootNode);

    if (this.effects) this.effects.playerMeshes = this.playerMeshes;
  }

  // ── 이름표 추가 ──────────────────────────────────────────────────────────
  _addNameLabel(id, parentNode) {
    // 기존 레이블 제거
    const existing = this.scene.getMeshByName(`pLabel${id}`);
    if (existing) existing.dispose();

    const label = BABYLON.MeshBuilder.CreatePlane(`pLabel${id}`, { width: 1.2, height: 0.3 }, this.scene);
    label.position.y = 2.2;
    label.parent = parentNode;
    label.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    label.isPickable = false;

    const ltex = new BABYLON.DynamicTexture(`pLabelTex${id}`, { width: 192, height: 48 }, this.scene, false);
    const lctx = ltex.getContext();
    lctx.clearRect(0, 0, 192, 48);
    lctx.fillStyle = id === 'A' ? 'rgba(0,80,255,0.9)' : 'rgba(200,0,0,0.9)';
    lctx.fillRect(2, 2, 188, 44);
    lctx.fillStyle = '#fff';
    lctx.font = 'bold 26px monospace';
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    lctx.fillText(id === 'A' ? 'P1' : 'P2', 96, 24);
    ltex.update();

    const lmat = new BABYLON.StandardMaterial(`pLabelMat${id}`, this.scene);
    lmat.diffuseTexture = ltex;
    lmat.diffuseTexture.hasAlpha = true;
    lmat.disableLighting = true;
    lmat.backFaceCulling = false;
    label.material = lmat;
  }

  // ── 무기 배치 ──────────────────────────────────────────────────────────
  _attachWeapon(playerId, weaponIdx) {
    if (this.playerGuns[playerId]) {
      try { this.playerGuns[playerId].dispose(); } catch(_) {}
      this.playerGuns[playerId] = null;
    }

    const weaponKey = WEAPON_KEYS[weaponIdx] || 'rifle';
    const playerMesh = this.playerMeshes[playerId];
    if (!playerMesh) return;

    const entry = swModelLoader ? swModelLoader.modelCache.get(weaponKey) : null;
    let weaponMesh;

    if (entry && entry.rootMesh) {
      weaponMesh = entry.rootMesh.clone(`gun_${playerId}`, null, false);
      weaponMesh.setEnabled(true);
      weaponMesh.getDescendants(false).forEach(d => {
        d.setEnabled(true);
        if (d.isVisible !== undefined) d.isVisible = true;
      });
    } else {
      weaponMesh = BABYLON.MeshBuilder.CreateBox(`gun_${playerId}`,
        { width: 0.08, height: 0.08, depth: 0.5 }, this.scene);
      const gmat = new BABYLON.StandardMaterial(`gunMat_${playerId}`, this.scene);
      gmat.diffuseColor = new BABYLON.Color3(0.12, 0.12, 0.15);
      weaponMesh.material = gmat;
    }

    // 오른손 뼈대 탐색
    const handNames = [
      'mixamorig:RightHand', 'RightHand', 'Hand_R', 'Hand.R',
      'right_hand', 'Bip01_R_Hand', 'RightHandIndex1', 'Bip001_R_Hand',
    ];

    let handNode = null;
    const allNodes = playerMesh.getChildTransformNodes
      ? playerMesh.getChildTransformNodes(true)
      : [];

    for (const node of allNodes) {
      if (handNames.some(n => node.name.toLowerCase().includes(n.toLowerCase()))) {
        handNode = node;
        break;
      }
    }

    if (handNode) {
      weaponMesh.parent = handNode;
      weaponMesh.position = new BABYLON.Vector3(0, 0, 0.1);
      weaponMesh.rotation = new BABYLON.Vector3(0, 0, 0);
    } else {
      weaponMesh.parent = playerMesh;
      weaponMesh.position = new BABYLON.Vector3(0.4, 0.9, 0.3);
    }

    this.playerGuns[playerId] = weaponMesh;
  }

  // ── 폴백 플레이어 메시 (로딩 전 임시) ──────────────────────────────────
  _createFallbackPlayerMeshes() {
    ['A', 'B'].forEach(id => {
      const colA = new BABYLON.Color3(0.10, 0.45, 1.0);
      const colB = new BABYLON.Color3(1.0,  0.18, 0.18);
      const col  = id === 'A' ? colA : colB;
      const emi  = id === 'A' ? new BABYLON.Color3(0, 0.05, 0.25) : new BABYLON.Color3(0.25, 0, 0);

      // 몸통 — 초기 스폰 위치에 배치 (카메라가 처음부터 따라갈 수 있도록)
      const body = BABYLON.MeshBuilder.CreateCylinder(`pBody${id}`, {
        height: 1.2, diameterTop: 0.65, diameterBottom: 0.55, tessellation: 10
      }, this.scene);
      body.position.y = 0.6;
      body.position.z = id === 'A' ? -40 : 40; // 기본 스폰 Z

      // 머리
      const head = BABYLON.MeshBuilder.CreateSphere(`pHead${id}`, { diameter: 0.55, segments: 7 }, this.scene);
      head.position.y = 1.25;
      head.parent = body;

      // 총기
      const gun = BABYLON.MeshBuilder.CreateBox(`pGun${id}`, { width: 0.08, height: 0.08, depth: 0.55 }, this.scene);
      gun.position.set(0.32, 1.05, 0.25);
      gun.parent = body;

      const gunBarrel = BABYLON.MeshBuilder.CreateBox(`pBarrel${id}`, { width: 0.05, height: 0.05, depth: 0.25 }, this.scene);
      gunBarrel.position.set(0.32, 1.05, 0.58);
      gunBarrel.parent = body;

      // 재질
      const mat = new BABYLON.StandardMaterial(`pMat${id}`, this.scene);
      mat.diffuseColor  = col;
      mat.emissiveColor = emi;
      mat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.4);
      if (id === this.myPlayer) mat.alpha = 0.5;
      body.material = mat;
      head.material = mat;

      const gunMat = new BABYLON.StandardMaterial(`pGunMat${id}`, this.scene);
      gunMat.diffuseColor  = new BABYLON.Color3(0.12, 0.12, 0.15);
      gunMat.emissiveColor = new BABYLON.Color3(0.02, 0.02, 0.04);
      gun.material     = gunMat;
      gunBarrel.material = gunMat;

      // 글로우 링
      const ring = BABYLON.MeshBuilder.CreateTorus(`pRing${id}`, { diameter: 1.1, thickness: 0.06, tessellation: 20 }, this.scene);
      ring.position.set(0, -0.55, 0);
      ring.rotation.x = Math.PI / 2;
      ring.parent = body;
      const ringMat = new BABYLON.StandardMaterial(`pRingMat${id}`, this.scene);
      ringMat.emissiveColor = col;
      ringMat.disableLighting = true;
      ring.material = ringMat;
      ring.isPickable = false;

      // 이름표
      const label = BABYLON.MeshBuilder.CreatePlane(`pLabel${id}`, { width: 1.2, height: 0.3 }, this.scene);
      label.position.y = 2.0;
      label.parent = body;
      label.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
      const ltex = new BABYLON.DynamicTexture(`pLabelTex${id}`, { width: 192, height: 48 }, this.scene, false);
      const lctx = ltex.getContext();
      lctx.clearRect(0, 0, 192, 48);
      lctx.fillStyle = id === 'A' ? 'rgba(0,80,255,0.9)' : 'rgba(200,0,0,0.9)';
      lctx.fillRect(2, 2, 188, 44);
      lctx.fillStyle = '#fff';
      lctx.font = 'bold 26px monospace';
      lctx.textAlign = 'center';
      lctx.textBaseline = 'middle';
      lctx.fillText(id === 'A' ? 'P1' : 'P2', 96, 24);
      ltex.update();
      const lmat = new BABYLON.StandardMaterial(`pLabelMat${id}`, this.scene);
      lmat.diffuseTexture = ltex;
      lmat.diffuseTexture.hasAlpha = true;
      lmat.disableLighting = true;
      lmat.backFaceCulling = false;
      label.material = lmat;

      this.playerMeshes[id]  = body;
      this.playerGuns[id]    = gun;
    });
  }

  // ── 프로시저럴 맵 (고품질) ────────────────────────────────────────────────
  _createProceduralMap() {
    const S = this.scene;
    const root = new BABYLON.TransformNode('proceduralMapRoot', S);
    this.proceduralMapRoot = root;

    // ── 머티리얼 팩토리 ────────────────────────────────────────────────────
    const mkMat = (name, diff, emi, spec) => {
      const m = new BABYLON.StandardMaterial(name + '_' + Math.random().toString(36).slice(2,6), S);
      if (diff) m.diffuseColor  = new BABYLON.Color3(...diff);
      if (emi)  { m.emissiveColor = new BABYLON.Color3(...emi); m.disableLighting = true; }
      m.specularColor = spec ? new BABYLON.Color3(...spec) : new BABYLON.Color3(0.10, 0.12, 0.18);
      return m;
    };
    const mFloor = mkMat('fl', [0.06, 0.08, 0.10]);           // 어두운 금속 바닥
    const mConc  = mkMat('co', [0.22, 0.24, 0.30]);           // 짙은 콘크리트
    const mMetal = mkMat('me', [0.18, 0.22, 0.30], null, [0.3,0.35,0.5]); // 금속
    const mRust  = mkMat('ru', [0.28, 0.16, 0.08]);           // 녹슨 철판
    const mGrid  = mkMat('gr', null, [0.02, 0.18, 0.06]);     // 에메랄드 그리드
    const mBlue  = mkMat('bl', null, [0.05, 0.35, 1.00]);     // 밝은 사이버 블루
    const mOrng  = mkMat('or', null, [0.90, 0.35, 0.02]);     // 오렌지 경고
    const mSpA   = mkMat('sa', null, [0.05, 0.50, 1.00]);     // P1 파란 스폰
    const mSpB   = mkMat('sb', null, [1.00, 0.15, 0.05]);     // P2 빨간 스폰
    const mTeal  = mkMat('te', null, [0.00, 0.80, 0.60]);     // 청록 악센트

    // ── 박스 헬퍼 ─────────────────────────────────────────────────────────
    const bx = (name, x, y, z, w, h, d, mat, col = true, pick = false) => {
      const m = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, S);
      m.position.set(x, y, z);
      m.material = mat;
      m.parent = root;
      m.checkCollisions = col;
      m.isPickable = pick;
      return m;
    };

    // ── 바닥 ──────────────────────────────────────────────────────────────
    const floor = BABYLON.MeshBuilder.CreateGround('floor', { width: 96, height: 96, subdivisions: 2 }, S);
    floor.material = mFloor;
    floor.parent = root;
    floor.checkCollisions = true;
    floor.isPickable = true;

    // 격자선
    for (let v = -44; v <= 44; v += 8) {
      bx('gx'+v,  v, 0.004, 0, 0.05, 0.005, 96, mGrid, false);
      bx('gz'+v,  0, 0.004, v, 96, 0.005, 0.05, mGrid, false);
    }

    // ── 중앙 건물 (십자형 개방 구조) ──────────────────────────────────────
    bx('cn',  0, 2.5,  4.5, 10, 5, 1,   mConc);
    bx('cs',  0, 2.5, -4.5, 10, 5, 1,   mConc);
    bx('ce',  4.5, 2.5, 0,  1, 5, 10,   mConc);
    bx('cw', -4.5, 2.5, 0,  1, 5, 10,   mConc);
    bx('croof', 0, 5.05, 0, 12, 0.1, 12, mMetal, true, true);
    // 루프 글로우 엣지
    bx('cen', 0, 5.12,  6,   12.1, 0.08, 0.08, mBlue, false);
    bx('ces', 0, 5.12, -6,   12.1, 0.08, 0.08, mBlue, false);
    bx('cee', 6, 5.12,  0,  0.08, 0.08, 12.1,  mBlue, false);
    bx('cew',-6, 5.12,  0,  0.08, 0.08, 12.1,  mBlue, false);

    // ── 중앙 기둥 4개 ─────────────────────────────────────────────────────
    for (const [px, pz] of [[-14,14],[14,14],[-14,-14],[14,-14]]) {
      bx('pil'+px+pz, px, 2.0, pz, 1.4, 4.0, 1.4, mMetal);
      bx('pig'+px+pz, px, 4.1, pz, 1.5, 0.12, 1.5, mBlue, false);
    }

    // ── L자 벙커 (z=±15, x=±11) ───────────────────────────────────────────
    for (const [sx, sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
      const bX = 11*sx, bZ = 15*sz;
      bx('la'+bX+bZ, bX,       1.5, bZ,           6,   3, 1,   mConc);
      bx('lb'+bX+bZ, bX+2.5*sx, 1.5, bZ+1.5*sz,  1,   3, 4,   mConc);
      bx('lg'+bX+bZ, bX,       3.06, bZ,          6.1, 0.08, 1.1, mBlue, false);
    }

    // ── 컨테이너 (x=±21, z=±7) ───────────────────────────────────────────
    for (const [cx, cz] of [[21,7],[21,-7],[-21,7],[-21,-7]]) {
      bx('ct'+cx+cz,  cx, 1.5, cz, 5, 3, 5,   mMetal);
      bx('ctr'+cx+cz, cx, 3.1, cz, 5.2, 0.2, 5.2, mRust);
      bx('cgs'+cx+cz, cx+Math.sign(cx)*2.6, 1.5, cz, 0.06, 2, 5, mOrng, false);
    }

    // ── 전방 엄폐 벽 (z=±26) ─────────────────────────────────────────────
    for (const sz of [-1, 1]) {
      const fz = 26 * sz;
      bx('fwL'+fz, -8,  1.5, fz, 7, 3, 1, mConc);
      bx('fwR'+fz,  8,  1.5, fz, 7, 3, 1, mConc);
      bx('fgL'+fz, -8, 3.06, fz, 7.1, 0.08, 1.1, mBlue, false);
      bx('fgR'+fz,  8, 3.06, fz, 7.1, 0.08, 1.1, mBlue, false);
    }

    // ── 접근로 플랫폼 (z=±32) ────────────────────────────────────────────
    for (const sz of [-1, 1]) {
      const pz = 32 * sz;
      bx('plat'+pz,  0, 1.0, pz, 12, 2, 6, mConc, true, true);
      bx('step'+pz,  0, 0.5, pz-sz*2.8, 12, 1, 1.2, mConc);
      bx('railL'+pz, -6.5, 2.4, pz, 0.15, 0.8, 6, mMetal);
      bx('railR'+pz,  6.5, 2.4, pz, 0.15, 0.8, 6, mMetal);
    }

    // ── 측면 장벽 (x=±30, 코리도 형성) ──────────────────────────────────
    bx('swL', -30, 1.5, 0, 0.8, 3, 60, mConc);
    bx('swR',  30, 1.5, 0, 0.8, 3, 60, mConc);

    // ── 스폰 존 (z=±40) ──────────────────────────────────────────────────
    for (const [sz, mat] of [[-40, mSpA], [40, mSpB]]) {
      for (const r of [2, 3.5, 5]) {
        const ring = BABYLON.MeshBuilder.CreateTorus('spR'+r+sz,
          { diameter: r*2, thickness: 0.07, tessellation: 36 }, S);
        ring.position.set(0, 0.03, sz);
        ring.rotation.x = Math.PI / 2;
        ring.material = mat;
        ring.isPickable = false;
        ring.parent = root;
      }
    }

    // ── 경계 글로우 ───────────────────────────────────────────────────────
    bx('be_N',  0, 0.04,  48, 96, 0.05, 0.12, mGrid, false);
    bx('be_S',  0, 0.04, -48, 96, 0.05, 0.12, mGrid, false);
    bx('be_E',  48, 0.04,  0, 0.12, 0.05, 96, mGrid, false);
    bx('be_W', -48, 0.04,  0, 0.12, 0.05, 96, mGrid, false);

    // ── 투명 경계 충돌 벽 ────────────────────────────────────────────────
    for (const [x, z, w, d] of [[0,48.5,100,1],[0,-48.5,100,1],[48.5,0,1,100],[-48.5,0,1,100]]) {
      const bwall = BABYLON.MeshBuilder.CreateBox('bwall'+x+z, { width: w, height: 12, depth: d }, S);
      bwall.position.set(x, 6, z);
      bwall.checkCollisions = true;
      bwall.isPickable = false;
      bwall.isVisible = false;
      bwall.parent = root;
    }
  }

  // ── 총알 풀 ──────────────────────────────────────────────────────────────
  _createBulletPool() {
    const mat = new BABYLON.StandardMaterial('bulletMat', this.scene);
    mat.diffuseColor  = new BABYLON.Color3(1, 0.95, 0.3);
    mat.emissiveColor = new BABYLON.Color3(1, 0.85, 0.1);
    mat.disableLighting = true;

    for (let i = 0; i < this.BULLET_POOL_SIZE; i++) {
      const mesh = BABYLON.MeshBuilder.CreateBox(`bullet${i}`, { width: 0.08, height: 0.08, depth: 0.28 }, this.scene);
      mesh.material = mat;
      mesh.setEnabled(false);
      mesh.isPickable = false;
      this.bulletPool.push(mesh);
    }
  }

  _getBulletMesh() {
    return this.bulletPool.find(m => !m.isEnabled()) || null;
  }

  // ── 몬스터 메시 ──────────────────────────────────────────────────────────
  _getOrCreateMonsterMesh(id, isBoss) {
    if (this.monsterMeshes.has(id)) return this.monsterMeshes.get(id);

    const scale = isBoss ? 2.0 : 1.0;
    const col   = isBoss ? new BABYLON.Color3(0.8, 0.05, 0.05) : new BABYLON.Color3(0.1, 0.65, 0.1);
    const emi   = isBoss ? new BABYLON.Color3(0.3, 0, 0)       : new BABYLON.Color3(0, 0.15, 0);

    const body = BABYLON.MeshBuilder.CreateBox(`mon${id}`, { width: 0.9 * scale, height: 1.6 * scale, depth: 0.7 * scale }, this.scene);
    body.position.y = 0.8 * scale;
    const head = BABYLON.MeshBuilder.CreateSphere(`monH${id}`, { diameter: 0.55 * scale, segments: 6 }, this.scene);
    head.position.y = (0.8 + 0.65) * scale;
    head.parent = body;

    const mat = new BABYLON.StandardMaterial(`monMat${id}`, this.scene);
    mat.diffuseColor = col; mat.emissiveColor = emi;
    body.material = mat; head.material = mat;

    if (isBoss) {
      const pLight = new BABYLON.PointLight(`bossLight${id}`, new BABYLON.Vector3(0, 2, 0), this.scene);
      pLight.diffuse = new BABYLON.Color3(1, 0.1, 0);
      pLight.intensity = 1.5; pLight.range = 8;
      pLight.parent = body;
    }

    // HP바
    const hpBar = BABYLON.MeshBuilder.CreatePlane(`monHP${id}`, { width: 1.2 * scale, height: 0.14 * scale }, this.scene);
    hpBar.position.y = 1.85 * scale; hpBar.parent = body;
    hpBar.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    const hpTex = new BABYLON.DynamicTexture(`monHPTex${id}`, { width: 128, height: 16 }, this.scene, false);
    const hpMat = new BABYLON.StandardMaterial(`monHPMat${id}`, this.scene);
    hpMat.diffuseTexture = hpTex; hpMat.disableLighting = true; hpMat.backFaceCulling = false;
    hpBar.material = hpMat;

    const wrapper = { mesh: body, head, hpTex, isBoss, maxHp: isBoss ? 500 : 50 };
    this.monsterMeshes.set(id, wrapper);
    return wrapper;
  }

  _updateMonsterHP(wrapper, hp) {
    const ctx = wrapper.hpTex.getContext();
    ctx.clearRect(0, 0, 128, 16);
    ctx.fillStyle = '#110000'; ctx.fillRect(0, 0, 128, 16);
    const pct = Math.max(0, hp / wrapper.maxHp);
    ctx.fillStyle = wrapper.isBoss ? '#ff3300' : '#22ee22';
    ctx.fillRect(2, 2, 124 * pct, 12);
    wrapper.hpTex.update();
  }

  // ── 아이템 메시 ──────────────────────────────────────────────────────────
  _getOrCreateItemMesh(id) {
    if (this.itemMeshes.has(id)) return this.itemMeshes.get(id);
    const mesh = BABYLON.MeshBuilder.CreateSphere(`item${id}`, { diameter: 0.5, segments: 6 }, this.scene);
    const mat  = new BABYLON.StandardMaterial(`itemMat${id}`, this.scene);
    mat.diffuseColor  = new BABYLON.Color3(0, 1, 0.4);
    mat.emissiveColor = new BABYLON.Color3(0, 0.6, 0.2);
    mesh.material = mat;
    this.itemMeshes.set(id, mesh);
    return mesh;
  }

  // ── 매 프레임 업데이트 ──────────────────────────────────────────────────
  _updateFrame(dt) {
    if (!this.lastState) return;
    const state = this.lastState;

    this._updatePlayerMeshes(state, dt);
    this._updateBulletMeshes(state, dt);
    this._updateMonsterMeshes(state);
    this._updateItemMeshes(state);
    this._updateCamera(state, dt);

    if (this.effects) this.effects.update(dt);
    if (window.swHUD)  swHUD.update(state);

    // 아이템 부유 애니메이션
    const t = performance.now() / 1000;
    this.itemMeshes.forEach(mesh => {
      mesh.position.y  = 0.4 + Math.sin(t * 2) * 0.12;
      mesh.rotation.y += dt * 2;
    });
  }

  _updatePlayerMeshes(state, dt) {
    ['A', 'B'].forEach(id => {
      const p    = state.players[id];
      const mesh = this.playerMeshes[id];
      if (!mesh || !p) return;

      // 위치 보간 (lerp)
      const lerpFactor = Math.min(1, dt * 20);
      if (mesh.position) {
        mesh.position.x += (p.x - mesh.position.x) * lerpFactor;
        mesh.position.z += (p.z - mesh.position.z) * lerpFactor;
        // Y: 서버값 항상 적용 (단, 맵 바닥 아래로 떨어지면 보정)
        const floorMin = this.mapBounds ? this.mapBounds.min.y : -1;
        const targetY  = Math.max(floorMin, p.y);
        mesh.position.y += (targetY - mesh.position.y) * lerpFactor;
      }

      // 회전 보간
      if (mesh.rotation) {
        let diff = (p.rotY || 0) - mesh.rotation.y;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        mesh.rotation.y += diff * 0.25;
      }

      // 사망 처리
      if (p.isDead) {
        if (!this.prevDead[id]) {
          this.prevDead[id] = true;
          if (mesh.rotation) { mesh.rotation.z = Math.PI / 2; mesh.position.y = 0.2; }
          if (this.effects) this.effects.onPlayerDeath(id);
        }
      } else {
        if (this.prevDead[id]) {
          this.prevDead[id] = false;
          if (mesh.rotation) mesh.rotation.z = 0;
          if (this.effects) this.effects.onRespawn(id);
        }
      }

      // 무기 변경 시 재attach
      if (p.weapon !== undefined && this.playerGuns[id]) {
        const weaponKey = WEAPON_KEYS[p.weapon] || 'rifle';
        const expectedName = `gun_${id}`;
        const currentName  = this.playerGuns[id].name;
        // 무기가 바뀌었으면 재attach (단순 비교)
        // 매 프레임 재생성하면 비용이 크므로 간단히 무시하고 아래서 따로 처리
      }

      // 애니메이션 업데이트
      if (this.modelsLoaded && this.animControllers[id]) {
        this.animControllers[id].updateFromState(p);
      }

      // LOD: 거리 40 이상 캐릭터 숨김
      if (id !== this.myPlayer && this.myPlayer && state.players[this.myPlayer]) {
        const myP = state.players[this.myPlayer];
        const dist = Math.hypot(p.x - myP.x, p.z - myP.z);
        if (dist > 40 && mesh.isEnabled()) mesh.setEnabled(false);
        else if (dist <= 40 && !mesh.isEnabled()) mesh.setEnabled(true);
      }

      // 낙하 방지
      if (this.mapBounds && mesh.position && mesh.position.y < this.mapBounds.min.y - 3) {
        mesh.position.y = this.mapBounds.min.y + 2;
      }
    });
  }

  _updateBulletMeshes(state, dt) {
    const serverIds = new Set((state.bullets || []).map(b => b.id));

    this.activeBullets.forEach((mesh, id) => {
      if (!serverIds.has(id)) {
        mesh.setEnabled(false);
        this.activeBullets.delete(id);
      }
    });

    (state.bullets || []).forEach(b => {
      let mesh = this.activeBullets.get(b.id);
      if (!mesh) {
        mesh = this._getBulletMesh();
        if (!mesh) return;
        mesh.setEnabled(true);
        this.activeBullets.set(b.id, mesh);
      }
      const angle = Math.atan2(b.vx, b.vz);
      mesh.rotation.y = angle;
      mesh.position.set(b.x + b.vx * dt, b.y, b.z + b.vz * dt);
    });
  }

  _updateMonsterMeshes(state) {
    const serverIds = new Set((state.monsters || []).map(m => m.id));

    this.monsterMeshes.forEach((wrapper, id) => {
      if (!serverIds.has(id)) {
        wrapper.mesh.dispose();
        this.monsterMeshes.delete(id);
      }
    });

    (state.monsters || []).forEach(m => {
      const wrapper = this._getOrCreateMonsterMesh(m.id, m.isBoss);
      wrapper.mesh.position.x += (m.x - wrapper.mesh.position.x) * 0.18;
      wrapper.mesh.position.z += (m.z - wrapper.mesh.position.z) * 0.18;
      wrapper.mesh.rotation.y  = m.rotY || 0;
      this._updateMonsterHP(wrapper, m.hp);
      if (m.state === 'dead') {
        if (this.effects) this.effects.onMonsterHit(m.x, 1, m.z);
        wrapper.mesh.dispose();
        this.monsterMeshes.delete(m.id);
      }
    });
  }

  _updateItemMeshes(state) {
    const serverIds = new Set((state.items || []).map(i => i.id));
    this.itemMeshes.forEach((mesh, id) => {
      if (!serverIds.has(id)) { mesh.dispose(); this.itemMeshes.delete(id); }
    });
    (state.items || []).forEach(item => {
      const mesh = this._getOrCreateItemMesh(item.id);
      mesh.position.x = item.x;
      mesh.position.z = item.z;
    });
  }

  // ── 카메라 (ArcRotateCamera — 서버 yaw에 동기화) ────────────────────────────
  _updateCamera(state, dt) {
    if (!this.myPlayer || !state.players[this.myPlayer]) return;
    const p = state.players[this.myPlayer];

    // ADS에 따라 카메라 거리 조절
    const targetRadius = p.isADS ? 4.5 : 8.0;
    this.camera.radius += (targetRadius - this.camera.radius) * Math.min(1, dt * 8);

    // 오른쪽 조이스틱 → 카메라 수평 회전 (cameraYRot 동기화)
    // alpha = -PI/2 - cameraYRot: 캐릭터 등 뒤에서 따라가는 공식
    const targetAlpha = -Math.PI / 2 - p.cameraYRot;
    let alphaDiff = targetAlpha - this.camera.alpha;
    while (alphaDiff >  Math.PI) alphaDiff -= Math.PI * 2;
    while (alphaDiff < -Math.PI) alphaDiff += Math.PI * 2;
    this.camera.alpha += alphaDiff * Math.min(1, dt * 20);

    // 오른쪽 조이스틱 수직 (cameraXRot 동기화)
    const targetBeta = Math.PI / 4 + (p.cameraXRot || 0);
    this.camera.beta = Math.max(
      this.camera.lowerBetaLimit  || 0.1,
      Math.min(this.camera.upperBetaLimit || Math.PI / 2.2, targetBeta));

    // 카메라 흔들림
    if (this.camShakeTimer > 0) {
      this.camShakeTimer -= dt;
      if (this.camShakeTimer > 0) {
        const s = this.camShakeStrength;
        this.camera.alpha += (Math.random() - 0.5) * s * 0.04;
        this.camera.beta = Math.max(
          this.camera.lowerBetaLimit || 0.1,
          Math.min(this.camera.upperBetaLimit || Math.PI / 2.2,
            this.camera.beta + (Math.random() - 0.5) * s * 0.02));
      }
    }

    if (window.swHUD) swHUD.setCrosshairADS(p.isADS);
  }

  // ── 외부 이벤트 ─────────────────────────────────────────────────────────
  onStateUpdate(state) { this.lastState = state; }

  onKillEvent(msg) {
    const mesh = this.playerMeshes[msg.victim];
    if (mesh && this.effects) {
      const pos = mesh.position || { x: 0, y: 0.5, z: 0 };
      this.effects.onExplosion(pos.x, pos.y + 0.5, pos.z);
    }
  }

  triggerCameraShake(duration, strength) {
    this.camShakeTimer    = duration;
    this.camShakeStrength = strength;
  }

  onMeleeEvent(msg) {
    if (!this.scene) return;
    const uid = Date.now();
    const ring = BABYLON.MeshBuilder.CreateTorus('meleeRing' + uid, {
      diameter: 0.6, thickness: 0.09, tessellation: 24,
    }, this.scene);
    ring.position.set(msg.x, 0.6, msg.z);
    ring.rotation.x = Math.PI / 2;
    ring.isPickable = false;
    const mat = new BABYLON.StandardMaterial('meleeRingMat' + uid, this.scene);
    mat.emissiveColor = (msg.player === this.myPlayer)
      ? new BABYLON.Color3(0.1, 0.8, 1.0)
      : new BABYLON.Color3(1.0, 0.3, 0.1);
    mat.disableLighting = true;
    mat.alpha = 0.9;
    ring.material = mat;
    let elapsed = 0;
    const update = () => {
      elapsed += 0.016;
      const p = elapsed / 0.35;
      ring.scaling.setAll(1 + p * 10);
      mat.alpha = Math.max(0, 0.9 * (1 - p));
      if (p >= 1) {
        try { ring.dispose(); mat.dispose(); } catch(_) {}
        this.scene.unregisterAfterRender(update);
      }
    };
    this.scene.registerAfterRender(update);
  }
}

// ── 전역 등록 ────────────────────────────────────────────────────────────────
window.swGame = new GameRenderer();

window.addEventListener('load', async () => {
  const player   = sessionStorage.getItem('swPlayer')   || 'A';
  const mode     = sessionStorage.getItem('swMode')     || 'deathmatch';
  const serverIP = sessionStorage.getItem('swServerIP') || 'localhost';
  const simMode  = (serverIP === 'localhost' || serverIP === '127.0.0.1');

  if (window.swHUD) swHUD.init(player, mode);

  // 비동기 init (모델 로딩 포함)
  await swGame.init('gameCanvas', player);

  if (window.swInput) {
    swInput.init(data => swNetwork.sendInput(data), simMode);
  }

  swNetwork.myPlayer      = player;
  swNetwork.onStateUpdate = state => swGame.onStateUpdate(state);
  swNetwork.connect(serverIP, 3000);

  if (simMode && window.swHUD) {
    setTimeout(() => swHUD.startCountdown(3), 800);
  }
});
