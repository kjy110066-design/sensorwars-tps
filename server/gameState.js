'use strict';

// ─── 상수 ───────────────────────────────────────────────────────────────────
const WEAPONS = [
  { name: 'AR',  damage: 25, pellets: 1,  fireRate: 120, maxAmmo: 30, range: 80,  speed: 45 },
  { name: 'SG',  damage: 15, pellets: 5,  fireRate: 800, maxAmmo: 8,  range: 25,  speed: 35 },
  { name: 'HG',  damage: 40, pellets: 1,  fireRate: 400, maxAmmo: 15, range: 60,  speed: 40 },
];

const MAP_HALF = 48;
const PLAYER_RADIUS = 0.55;
const PLAYER_HEIGHT = 1.8;
const MONSTER_RADIUS = 0.7;
const BOSS_RADIUS = 1.2;
const BULLET_Y = 1.2;
const MELEE_RANGE = 2.5;
const MELEE_DAMAGE = 35;
const MELEE_COOLDOWN = 1000;
const RESPAWN_TIME = 5000;
const GROUND_Y = 1.0;
const JUMP_VEL = 7;
const GRAVITY = 20;
const DEATHMATCH_KILLS = 10;
const DEATHMATCH_TIME = 300;
const PVPVE_TIME = 180;
const SPRINT_SPEED = 0.28;
const WALK_SPEED = 0.15;
const RX_SENSITIVITY = 0.06;
const JOYSTICK_DEAD = 30;
const JOYSTICK_CENTER = 512;

// ─── 맵 충돌 박스 (game.js _buildProceduralMap과 동일) ──────────────────────
const COVER_BOXES = [
  // 중앙 건물 4면
  { x:  0,    z:  4.5,  w: 10,  h: 5, d: 1   },
  { x:  0,    z: -4.5,  w: 10,  h: 5, d: 1   },
  { x:  4.5,  z:  0,    w: 1,   h: 5, d: 10  },
  { x: -4.5,  z:  0,    w: 1,   h: 5, d: 10  },
  // 기둥 4개
  { x: -14, z:  14, w: 1.4, h: 4, d: 1.4 },
  { x:  14, z:  14, w: 1.4, h: 4, d: 1.4 },
  { x: -14, z: -14, w: 1.4, h: 4, d: 1.4 },
  { x:  14, z: -14, w: 1.4, h: 4, d: 1.4 },
  // L자 벙커 (sx=-1, sz=-1)
  { x: -11,   z: -15,   w: 6, h: 3, d: 1 },
  { x: -13.5, z: -16.5, w: 1, h: 3, d: 4 },
  // L자 벙커 (sx=1, sz=-1)
  { x:  11,   z: -15,   w: 6, h: 3, d: 1 },
  { x:  13.5, z: -16.5, w: 1, h: 3, d: 4 },
  // L자 벙커 (sx=-1, sz=1)
  { x: -11,   z:  15,   w: 6, h: 3, d: 1 },
  { x: -13.5, z:  16.5, w: 1, h: 3, d: 4 },
  // L자 벙커 (sx=1, sz=1)
  { x:  11,   z:  15,   w: 6, h: 3, d: 1 },
  { x:  13.5, z:  16.5, w: 1, h: 3, d: 4 },
  // 컨테이너 4개
  { x:  21, z:  7, w: 5, h: 3, d: 5 },
  { x:  21, z: -7, w: 5, h: 3, d: 5 },
  { x: -21, z:  7, w: 5, h: 3, d: 5 },
  { x: -21, z: -7, w: 5, h: 3, d: 5 },
  // 전방 엄폐 벽 (z=+26)
  { x: -8, z:  26, w: 7, h: 3, d: 1 },
  { x:  8, z:  26, w: 7, h: 3, d: 1 },
  // 전방 엄폐 벽 (z=-26)
  { x: -8, z: -26, w: 7, h: 3, d: 1 },
  { x:  8, z: -26, w: 7, h: 3, d: 1 },
  // 측면 장벽
  { x: -30, z: 0, w: 0.8, h: 3, d: 60 },
  { x:  30, z: 0, w: 0.8, h: 3, d: 60 },
  // 접근로 플랫폼
  { x: 0, z:  32, w: 12, h: 2, d: 6 },
  { x: 0, z: -32, w: 12, h: 2, d: 6 },
];

module.exports.COVER_BOXES = COVER_BOXES;

// ─── 헬퍼 함수 ──────────────────────────────────────────────────────────────
function normJoy(raw) {
  const v = raw - JOYSTICK_CENTER;
  if (Math.abs(v) < JOYSTICK_DEAD) return 0;
  return Math.max(-1, Math.min(1, v / (JOYSTICK_CENTER - JOYSTICK_DEAD)));
}

function dist2D(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function bulletHitsAABB(bx, by, bz, box) {
  const hw = box.w / 2 + 0.15;
  const hd = box.d / 2 + 0.15;
  return bx >= box.x - hw && bx <= box.x + hw &&
         bz >= box.z - hd && bz <= box.z + hd &&
         by >= 0 && by <= box.h + 0.2;
}

function resolvePlayerVsBox(player, box) {
  const hw = box.w / 2 + PLAYER_RADIUS;
  const hd = box.d / 2 + PLAYER_RADIUS;
  const dx = player.x - box.x;
  const dz = player.z - box.z;
  if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
    const overlapX = hw - Math.abs(dx);
    const overlapZ = hd - Math.abs(dz);
    if (overlapX < overlapZ) {
      player.x += overlapX * Math.sign(dx);
    } else {
      player.z += overlapZ * Math.sign(dz);
    }
  }
}

function clampMap(player) {
  player.x = Math.max(-MAP_HALF, Math.min(MAP_HALF, player.x));
  player.z = Math.max(-MAP_HALF, Math.min(MAP_HALF, player.z));
}

// ─── 동적 스폰 위치 ─────────────────────────────────────────────────────────
let _spawnA = { x: 0, y: 1.0, z: -40 };
let _spawnB = { x: 0, y: 1.0, z:  40 };

// ─── 플레이어 생성 ──────────────────────────────────────────────────────────
function createPlayer(spawn) {
  return {
    x: spawn.x, y: spawn.y, z: spawn.z,
    rotY: 0,
    cameraYRot: spawn.z > 0 ? Math.PI : 0,
    cameraXRot: 0,
    hp: 100, maxHp: 100,
    ammo: 30, maxAmmo: 30,
    weapon: 0,
    vy: 0,
    sensitivity: 1.0,
    isADS: false,
    isRunning: false,
    isDead: false,
    isShooting: false,
    isHit: false,
    hitTimer: 0,
    deadTimer: 0,
    score: 0,
    kills: 0,
    lastShot: 0,
    lastMeleeTime: 0,
    lastReloadStart: 0,
    isReloading: false,
    reloadTime: 0,
    ready: false,
    spawnZ: spawn.z,
  };
}

// ─── 주 게임 상태 ────────────────────────────────────────────────────────────
function createGameState() {
  let bulletIdCounter = 0;
  let monsterIdCounter = 0;
  let itemIdCounter = 0;

  const state = {
    players: {
      A: createPlayer(_spawnA),
      B: createPlayer(_spawnB),
    },
    bullets: [],
    monsters: [],
    items: [],
    wave: 1,
    gameTime: 0,
    gameMode: 'deathmatch',
    phase: 'waiting',
    winner: null,
    waveInProgress: false,
    timeSinceWaveEnd: 0,
    monsterSpawnQueue: 0,
    monsterSpawnTimer: 0,
    bossSpawned: false,
    countdownTimer: 0,
    countdownStarted: false,
  };

  const inputs = { A: null, B: null };
  const prevInputs = { A: {}, B: {} }; // 에지 감지용 이전 입력

  // ─── 공개 API ──────────────────────────────────────────────────────────────
  const gs = {
    state,

    processInput(playerId, data) {
      inputs[playerId] = data;
    },

    setMode(mode) {
      state.gameMode = mode;
    },

    setSensitivity(playerId, value) {
      if (state.players[playerId]) {
        state.players[playerId].sensitivity = Math.max(0.2, Math.min(3.0, Number(value) || 1.0));
      }
    },

    setPlayerReady(id) {
      state.players[id].ready = true;
    },

    bothReady() {
      return state.players.A.ready && state.players.B.ready;
    },

    setSpawnPositions(spawnA, spawnB) {
      _spawnA = { x: spawnA.x, y: spawnA.y, z: spawnA.z };
      _spawnB = { x: spawnB.x, y: spawnB.y, z: spawnB.z };
      if (state.players.A) Object.assign(state.players.A, { x: _spawnA.x, y: _spawnA.y, z: _spawnA.z });
      if (state.players.B) Object.assign(state.players.B, { x: _spawnB.x, y: _spawnB.y, z: _spawnB.z });
    },

    updateSpawnPositions(spawnA, spawnB) {
      _spawnA = { x: spawnA.x, y: spawnA.y, z: spawnA.z };
      _spawnB = { x: spawnB.x, y: spawnB.y, z: spawnB.z };
      if (state.players.A) { state.players.A.x = _spawnA.x; state.players.A.y = _spawnA.y; state.players.A.z = _spawnA.z; }
      if (state.players.B) { state.players.B.x = _spawnB.x; state.players.B.y = _spawnB.y; state.players.B.z = _spawnB.z; }
    },

    startGame() {
      state.phase = 'countdown';
      state.countdownTimer = 3000;
      state.countdownStarted = true;
      state.gameTime = 0;
      _resetPositions();
      if (state.gameMode !== 'deathmatch') {
        state.wave = 1;
        state.waveInProgress = false;
        state.monsterSpawnQueue = 0;
        state.monsters = [];
        state.items = [];
      }
    },

    reset() {
      const A = createPlayer(_spawnA);
      const B = createPlayer(_spawnB);
      A.ready = false; B.ready = false;
      state.players.A = A;
      state.players.B = B;
      state.bullets = [];
      state.monsters = [];
      state.items = [];
      state.wave = 1;
      state.gameTime = 0;
      state.phase = 'waiting';
      state.winner = null;
      state.waveInProgress = false;
      state.bossSpawned = false;
      inputs.A = null;
      inputs.B = null;
    },

    // 메인 틱 - dt 초 단위
    tick(dt) {
      const events = [];

      if (state.phase === 'countdown') {
        state.countdownTimer -= dt * 1000;
        if (state.countdownTimer <= 0) {
          state.phase = 'playing';
          events.push({ type: 'gameStart', mode: state.gameMode });
          if (state.gameMode !== 'deathmatch') {
            _spawnWave(state.wave, events);
          }
        }
        return events;
      }

      if (state.phase !== 'playing') return events;

      state.gameTime += dt;

      // 데스매치 리스폰 타이머 (입력 여부와 무관하게 매 틱 처리)
      if (state.gameMode === 'deathmatch') {
        ['A', 'B'].forEach(id => {
          const p = state.players[id];
          if (p.isDead && p.deadTimer > 0) {
            p.deadTimer -= dt * 1000;
            if (p.deadTimer <= 0) _respawnPlayer(id, events);
          }
        });
      }

      // 점프 / 중력 물리
      ['A', 'B'].forEach(id => {
        const p = state.players[id];
        if (p.isDead) return;
        if (p.vy !== 0 || p.y > GROUND_Y) {
          p.vy -= GRAVITY * dt;
          p.y  += p.vy * dt;
          if (p.y <= GROUND_Y) { p.y = GROUND_Y; p.vy = 0; }
        }
      });

      // 인풋 처리
      ['A', 'B'].forEach(id => {
        if (inputs[id]) _processPlayerInput(id, inputs[id], dt, events);
      });

      // 총알 업데이트
      _updateBullets(dt, events);

      // 몬스터 업데이트
      if (state.gameMode !== 'deathmatch' && state.monsters.length > 0) {
        _updateMonsters(dt, events);
      }
      if (state.gameMode !== 'deathmatch') {
        _checkWaveLogic(dt, events);
      }

      // 아이템 픽업
      if (state.gameMode === 'pvpve') {
        _checkItemPickups(events);
      }

      // 게임 종료 조건
      _checkGameEnd(events);

      return events;
    },
  };

  // ─── 리스폰 위치 초기화 ────────────────────────────────────────────────────
  function _resetPositions() {
    const A = state.players.A;
    const B = state.players.B;
    A.x = _spawnA.x; A.y = _spawnA.y; A.z = _spawnA.z; A.rotY = 0; A.cameraYRot = 0;
    B.x = _spawnB.x; B.y = _spawnB.y; B.z = _spawnB.z; B.rotY = Math.PI; B.cameraYRot = Math.PI;
    A.hp = 100; B.hp = 100;
    A.ammo = WEAPONS[A.weapon].maxAmmo;
    B.ammo = WEAPONS[B.weapon].maxAmmo;
    A.isDead = false; B.isDead = false;
  }

  // ─── 플레이어 인풋 처리 ────────────────────────────────────────────────────
  function _processPlayerInput(id, inp, dt, events) {
    const p = state.players[id];

    // 피격 타이머 업데이트 (매 틱)
    p.isShooting = false;
    if (p.isHit && p.hitTimer > 0) {
      p.hitTimer -= dt * 1000;
      if (p.hitTimer <= 0) p.isHit = false;
    }

    // 에지 감지용 이전 입력 (early return 전에 반드시 업데이트)
    const prev = { ...prevInputs[id] };
    prevInputs[id] = { ...inp };

    // 사망 중 — 리스폰은 tick()에서 처리
    if (p.isDead) return;

    // 재장전 중
    if (p.isReloading) {
      p.reloadTime -= dt * 1000;
      if (p.reloadTime <= 0) {
        p.isReloading = false;
        p.ammo = WEAPONS[p.weapon].maxAmmo;
      }
      return;
    }

    const lx = normJoy(inp.lx);
    const ly = normJoy(inp.ly);
    const rx = normJoy(inp.rx);
    const ry = normJoy(inp.ry);

    // 점프 에지 감지 (ba: Arduino A버튼 / b5: Space)
    const baRising = (inp.ba === 1 || inp.b5 === 1) && !(prev.ba === 1 || prev.b5 === 1);
    if (baRising && p.y <= GROUND_Y + 0.1) {
      p.vy = JUMP_VEL;
    }

    // 오른쪽 조이스틱: ry(전후) → 수평 회전, rx(좌우) → 수직 상하
    const sens = p.sensitivity ?? 1.0;
    p.cameraYRot -= ry * RX_SENSITIVITY * sens;
    p.cameraXRot = Math.max(-0.5, Math.min(1.2, p.cameraXRot - rx * 0.04 * sens));

    // 이동 방향 계산 (카메라 기준)
    const fwdX = Math.sin(p.cameraYRot);
    const fwdZ = Math.cos(p.cameraYRot);
    const rtX  = Math.cos(p.cameraYRot);
    const rtZ  = -Math.sin(p.cameraYRot);

    // 달리기
    p.isRunning = inp.l3 === 1 || inp.shift === 1;

    // ADS 토글 (에지 감지 — 홀드 불안정 대응)
    const adsRising = (inp.by === 1 || inp.b8 === 1 || inp.ads === 1) &&
                     !(prev.by === 1 || prev.b8 === 1 || prev.ads === 1);
    if (adsRising) p.isADS = !p.isADS;

    const speed = p.isRunning ? SPRINT_SPEED : WALK_SPEED;
    // lx → 전진/후진, ly → 좌우 스트레이프 (ly 반전으로 좌우 정상화)
    const moveX = (fwdX * lx - rtX * ly) * speed;
    const moveZ = (fwdZ * lx - rtZ * ly) * speed;

    p.x += moveX;
    p.z += moveZ;

    // 이동 방향으로 몸체 회전
    if (Math.abs(lx) > 0.1 || Math.abs(ly) > 0.1) {
      const targetRot = Math.atan2(moveX, moveZ);
      let diff = targetRot - p.rotY;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.rotY += diff * 0.2;
    }

    // 엄폐물 충돌 해소 (3패스: 코너에서 관통 방지)
    for (let pass = 0; pass < 3; pass++) {
      COVER_BOXES.forEach(box => resolvePlayerVsBox(p, box));
    }
    clampMap(p);

    const now = Date.now();

    // 발사 (B: bb)
    if ((inp.b6 === 1 || inp.fire === 1 || inp.bb === 1) && p.ammo > 0) {
      const weapon = WEAPONS[p.weapon];
      if (now - p.lastShot >= weapon.fireRate) {
        p.lastShot = now;
        p.ammo--;
        p.isShooting = true;
        _createBullets(id, p, weapon, events);
      }
    }

    // 재장전 (X: bx)
    if ((inp.b7 === 1 || inp.reload === 1 || inp.bx === 1) && !p.isReloading && p.ammo < WEAPONS[p.weapon].maxAmmo) {
      p.isReloading = true;
      p.reloadTime = 2000;
      events.push({ type: 'reload', player: id });
      events.push({ type: 'vibrate', player: id, vl: 100, vr: 100, duration: 150 });
    }

    // 근접 (R3)
    if ((inp.r3 === 1 || inp.melee === 1) && now - p.lastMeleeTime >= MELEE_COOLDOWN) {
      p.lastMeleeTime = now;
      _processMelee(id, p, events);
    }

    // 무기 변경 — 에지 감지 (홀드 연속 전환 방지)
    // lb: 무기 다음 (LB 버튼)
    const b4Rising = (inp.b4 === 1 || inp.weaponNext === 1 || inp.lb === 1)
                  && !(prev.b4 === 1 || prev.weaponNext === 1 || prev.lb === 1);
    const b3Rising = (inp.b3 === 1 || inp.weaponPrev === 1)
                  && !(prev.b3 === 1 || prev.weaponPrev === 1);
    // rb: 수류탄 (RB 버튼)
    const b1Rising = (inp.b1 === 1 || inp.item1 === 1 || inp.rb === 1)
                  && !(prev.b1 === 1 || prev.item1 === 1 || prev.rb === 1);
    const b2Rising = (inp.b2 === 1 || inp.item2 === 1)
                  && !(prev.b2 === 1 || prev.item2 === 1);

    if (b4Rising) {
      p.weapon = (p.weapon + 1) % WEAPONS.length;
      p.ammo = WEAPONS[p.weapon].maxAmmo;
      p.isReloading = false;
    }
    if (b3Rising) {
      p.weapon = (p.weapon + WEAPONS.length - 1) % WEAPONS.length;
      p.ammo = WEAPONS[p.weapon].maxAmmo;
      p.isReloading = false;
    }

    // B1: 수류탄 — 에지 감지
    if (b1Rising) {
      _throwGrenade(id, p, events);
    }

    // B2: 힐킷 — 에지 감지
    if (b2Rising) {
      if (p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + 30);
        events.push({ type: 'itemUse', player: id, effect: 'heal', amount: 30 });
      }
    }

    // 자동 탄약 보충 (빈 총일 때 자동 재장전)
    if (p.ammo === 0 && !p.isReloading) {
      p.isReloading = true;
      p.reloadTime = 2000;
    }
  }

  // ─── 총알 생성 ────────────────────────────────────────────────────────────
  function _createBullets(ownerId, player, weapon, events) {
    for (let i = 0; i < weapon.pellets; i++) {
      let aimAngle = player.cameraYRot;
      if (weapon.pellets > 1) {
        const spread = (Math.random() - 0.5) * 0.4;
        aimAngle += spread;
      }
      bulletIdCounter++;
      const bullet = {
        id: bulletIdCounter,
        x: player.x + Math.sin(aimAngle) * 0.6,
        y: BULLET_Y,
        z: player.z + Math.cos(aimAngle) * 0.6,
        vx: Math.sin(aimAngle) * weapon.speed,
        vy: 0,
        vz: Math.cos(aimAngle) * weapon.speed,
        owner: ownerId,
        damage: weapon.damage,
        range: weapon.range,
        distTraveled: 0,
      };
      state.bullets.push(bullet);
    }
    events.push({ type: 'shoot', player: ownerId, weapon: player.weapon });
    events.push({ type: 'vibrate', player: ownerId, vl: 0, vr: 150, duration: 80 });
  }

  // ─── 총알 물리 / 충돌 ─────────────────────────────────────────────────────
  function _updateBullets(dt, events) {
    const toRemove = new Set();

    state.bullets.forEach(b => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.x = Math.round(b.x * 10) / 10;
      b.z = Math.round(b.z * 10) / 10;
      b.distTraveled += Math.hypot(b.vx, b.vz) * dt;

      // 사거리 초과
      if (b.distTraveled >= b.range) {
        toRemove.add(b.id);
        return;
      }

      // 맵 경계
      if (Math.abs(b.x) > MAP_HALF + 2 || Math.abs(b.z) > MAP_HALF + 2) {
        toRemove.add(b.id);
        return;
      }

      // 엄폐물 충돌
      for (const box of COVER_BOXES) {
        if (bulletHitsAABB(b.x, b.y, b.z, box)) {
          events.push({ type: 'bulletHitCover', id: b.id, x: b.x, y: b.y, z: b.z });
          toRemove.add(b.id);
          return;
        }
      }

      // 플레이어 충돌
      ['A', 'B'].forEach(pid => {
        if (pid === b.owner) return;
        const p = state.players[pid];
        if (p.isDead) return;
        const d = dist2D(b.x, b.z, p.x, p.z);
        if (d < PLAYER_RADIUS + 0.3 && b.y < PLAYER_HEIGHT) {
          toRemove.add(b.id);
          const died = _damagePlayer(pid, b.damage, b.owner, events);
          if (!died) {
            const dirX = p.x - b.x;
            const dirZ = p.z - b.z;
            events.push({ type: 'hit', target: pid, damage: b.damage, direction: { x: dirX, z: dirZ } });
          }
        }
      });

      // 몬스터 충돌 (coop / pvpve)
      if (state.gameMode !== 'deathmatch') {
        for (const m of state.monsters) {
          if (m.state === 'dead') continue;
          const r = m.isBoss ? BOSS_RADIUS : MONSTER_RADIUS;
          const d = dist2D(b.x, b.z, m.x, m.z);
          if (d < r + 0.2) {
            toRemove.add(b.id);
            m.hp -= b.damage;
            events.push({ type: 'monsterHit', monsterId: m.id, damage: b.damage });
            if (m.hp <= 0 && m.state !== 'dead') {
              m.state = 'dead';
              state.players[b.owner].score += m.isBoss ? 500 : 100;
              state.players[b.owner].kills++;
              events.push({ type: 'monsterKilled', monsterId: m.id, killer: b.owner });
              if (state.gameMode === 'pvpve') {
                _spawnItem(m.x, m.z, 'heal');
              }
            }
            break;
          }
        }
      }
    });

    state.bullets = state.bullets.filter(b => !toRemove.has(b.id));
  }

  // ─── 플레이어 데미지 ──────────────────────────────────────────────────────
  function _damagePlayer(id, damage, killer, events) {
    const p = state.players[id];
    p.hp -= damage;
    if (p.hp <= 0) {
      p.hp = 0;
      p.isDead = true;
      p.deadTimer = state.gameMode === 'deathmatch' ? RESPAWN_TIME : 0;
      // killer가 유효한 플레이어 ID일 때만 점수 부여
      if (state.players[killer]) {
        state.players[killer].kills++;
        state.players[killer].score += 200;
      }
      events.push({ type: 'killed', killer, victim: id });
      events.push({ type: 'vibrate', player: id, vl: 255, vr: 255, duration: 600 });
      return true;
    }
    p.isHit = true;
    p.hitTimer = 350;
    events.push({ type: 'vibrate', player: id, vl: 255, vr: 255, duration: 200 });
    return false;
  }

  // ─── 근접 공격 ────────────────────────────────────────────────────────────
  function _processMelee(id, player, events) {
    events.push({ type: 'melee', player: id, x: player.x, z: player.z, angle: player.cameraYRot });
    const other = id === 'A' ? 'B' : 'A';
    const op = state.players[other];
    if (!op.isDead) {
      const d = dist2D(player.x, player.z, op.x, op.z);
      if (d < MELEE_RANGE) {
        _damagePlayer(other, MELEE_DAMAGE, id, events);
        events.push({ type: 'hit', target: other, damage: MELEE_DAMAGE, direction: { x: op.x - player.x, z: op.z - player.z } });
      }
    }
    // 몬스터 근접
    if (state.gameMode !== 'deathmatch') {
      state.monsters.forEach(m => {
        if (m.state === 'dead') return;
        const d = dist2D(player.x, player.z, m.x, m.z);
        if (d < MELEE_RANGE) {
          m.hp -= MELEE_DAMAGE;
          events.push({ type: 'monsterHit', monsterId: m.id, damage: MELEE_DAMAGE });
          if (m.hp <= 0) {
            m.state = 'dead';
            state.players[id].score += m.isBoss ? 500 : 100;
            state.players[id].kills++;
            events.push({ type: 'monsterKilled', monsterId: m.id, killer: id });
          }
        }
      });
    }
  }

  // ─── 수류탄 ───────────────────────────────────────────────────────────────
  function _throwGrenade(id, player, events) {
    const now = Date.now();
    if (!player._lastGrenade || now - player._lastGrenade > 8000) {
      player._lastGrenade = now;
      const fx = player.x + Math.sin(player.cameraYRot) * 6;
      const fz = player.z + Math.cos(player.cameraYRot) * 6;
      events.push({ type: 'grenade', owner: id, x: fx, z: fz });
      // 폭발 범위 데미지
      const BLAST_R = 4.0;
      const BLAST_DMG = 60;
      const other = id === 'A' ? 'B' : 'A';
      const op = state.players[other];
      if (!op.isDead && dist2D(fx, fz, op.x, op.z) < BLAST_R) {
        _damagePlayer(other, BLAST_DMG, id, events);
        events.push({ type: 'hit', target: other, damage: BLAST_DMG, direction: { x: op.x - fx, z: op.z - fz } });
      }
      state.monsters.forEach(m => {
        if (m.state === 'dead') return;
        if (dist2D(fx, fz, m.x, m.z) < BLAST_R) {
          m.hp -= BLAST_DMG;
          if (m.hp <= 0) {
            m.state = 'dead';
            state.players[id].score += m.isBoss ? 500 : 100;
            state.players[id].kills++;
            events.push({ type: 'monsterKilled', monsterId: m.id, killer: id });
          }
        }
      });
    }
  }

  // ─── 리스폰 ───────────────────────────────────────────────────────────────
  function _respawnPlayer(id, events) {
    const p = state.players[id];
    const spawn = id === 'A' ? _spawnA : _spawnB;
    p.x = spawn.x; p.y = spawn.y; p.z = spawn.z;
    p.spawnZ = spawn.z;
    p.vy = 0;
    p.hp = 100;
    p.ammo = WEAPONS[p.weapon].maxAmmo;
    p.isDead = false;
    p.isReloading = false;
    p.isADS = false;
    events.push({ type: 'respawn', player: id });
  }

  // ─── 몬스터 AI ─────────────────────────────────────────────────────────────
  function _updateMonsters(dt, events) {
    const now = Date.now();
    state.monsters.forEach(m => {
      if (m.state === 'dead') return;

      // 가장 가까운 살아있는 플레이어
      let nearest = null;
      let nearestDist = Infinity;
      ['A', 'B'].forEach(pid => {
        const p = state.players[pid];
        if (p.isDead) return;
        const d = dist2D(m.x, m.z, p.x, p.z);
        if (d < nearestDist) { nearestDist = d; nearest = p; m.targetPlayer = pid; }
      });

      if (!nearest) { m.state = 'idle'; return; }

      const chaseRange = m.isBoss ? 30 : 15;
      const atkRange   = m.isBoss ? 3.0 : 2.0;
      const speed      = m.isBoss ? 0.025 : 0.045;

      if (nearestDist > chaseRange) { m.state = 'idle'; return; }
      if (nearestDist <= atkRange) {
        m.state = 'attack';
        if (now - m.lastAttack > (m.isBoss ? 1500 : 1000)) {
          m.lastAttack = now;
          const dmg = m.isBoss ? 25 : 10;
          _damagePlayer(m.targetPlayer, dmg, '__monster__', events);
          events.push({ type: 'hit', target: m.targetPlayer, damage: dmg, direction: { x: nearest.x - m.x, z: nearest.z - m.z } });
        }
      } else {
        m.state = 'chase';
        const dx = nearest.x - m.x;
        const dz = nearest.z - m.z;
        const len = Math.hypot(dx, dz);
        m.x += (dx / len) * speed;
        m.z += (dz / len) * speed;
        m.x = Math.max(-MAP_HALF, Math.min(MAP_HALF, m.x));
        m.z = Math.max(-MAP_HALF, Math.min(MAP_HALF, m.z));
        m.rotY = Math.atan2(dx, dz);
      }
    });

    // 죽은 몬스터 정리
    state.monsters = state.monsters.filter(m => m.state !== 'dead');
  }

  // ─── 웨이브 스폰 ─────────────────────────────────────────────────────────
  function _spawnWave(wave, events) {
    state.waveInProgress = true;
    const count = 3 + wave * 2;
    state.monsterSpawnQueue = count;
    state.monsterSpawnTimer = 0;
    state.bossSpawned = false;
    events.push({ type: 'waveStart', wave });
  }

  function _spawnMonster(isBoss) {
    monsterIdCounter++;
    // 맵 가장자리 4방향 중 랜덤 스폰
    const side = Math.floor(Math.random() * 4);
    let sx, sz;
    switch (side) {
      case 0: sx = (Math.random() - 0.5) * 80; sz = -45; break;
      case 1: sx = (Math.random() - 0.5) * 80; sz =  45; break;
      case 2: sx = -45; sz = (Math.random() - 0.5) * 80; break;
      default: sx =  45; sz = (Math.random() - 0.5) * 80;
    }
    state.monsters.push({
      id: monsterIdCounter,
      x: sx, y: 0, z: sz,
      rotY: 0,
      hp: isBoss ? 500 : 50,
      maxHp: isBoss ? 500 : 50,
      state: 'idle',
      targetPlayer: null,
      lastAttack: 0,
      isBoss,
    });
  }

  function _checkWaveLogic(dt, events) {
    if (!state.waveInProgress) {
      state.timeSinceWaveEnd += dt;
      if (state.timeSinceWaveEnd >= 5) {
        state.timeSinceWaveEnd = 0;
        state.wave++;
        _spawnWave(state.wave, events);
      }
      return;
    }

    // 몬스터 점진적 스폰
    if (state.monsterSpawnQueue > 0) {
      state.monsterSpawnTimer += dt;
      if (state.monsterSpawnTimer >= 1.5) {
        state.monsterSpawnTimer = 0;
        state.monsterSpawnQueue--;
        _spawnMonster(false);
      }
    }

    // 보스 웨이브 (5웨이브마다)
    if (state.wave % 5 === 0 && !state.bossSpawned && state.monsterSpawnQueue === 0) {
      state.bossSpawned = true;
      _spawnMonster(true);
      events.push({ type: 'bossSpawn' });
    }

    // 웨이브 클리어 조건
    if (state.monsterSpawnQueue === 0 && state.monsters.length === 0) {
      state.waveInProgress = false;
      state.timeSinceWaveEnd = 0;
      events.push({ type: 'waveClear', wave: state.wave });
    }
  }

  // ─── 아이템 ───────────────────────────────────────────────────────────────
  function _spawnItem(x, z, type) {
    itemIdCounter++;
    state.items.push({ id: itemIdCounter, x, z, type });
  }

  function _checkItemPickups(events) {
    const toRemove = [];
    state.items.forEach(item => {
      ['A', 'B'].forEach(pid => {
        const p = state.players[pid];
        if (p.isDead) return;
        if (dist2D(p.x, p.z, item.x, item.z) < 1.5) {
          if (item.type === 'heal') {
            p.hp = Math.min(p.maxHp, p.hp + 40);
          }
          events.push({ type: 'itemPickup', itemId: item.id, player: pid, effect: item.type });
          toRemove.push(item.id);
        }
      });
    });
    state.items = state.items.filter(i => !toRemove.includes(i.id));
  }

  // ─── 게임 종료 조건 ────────────────────────────────────────────────────────
  function _checkGameEnd(events) {
    if (state.phase !== 'playing') return;
    const pA = state.players.A;
    const pB = state.players.B;

    if (state.gameMode === 'deathmatch') {
      if (pA.kills >= DEATHMATCH_KILLS) {
        _endGame('A', events);
      } else if (pB.kills >= DEATHMATCH_KILLS) {
        _endGame('B', events);
      } else if (state.gameTime >= DEATHMATCH_TIME) {
        const winner = pA.kills >= pB.kills ? 'A' : 'B';
        _endGame(winner, events);
      }
    } else if (state.gameMode === 'coop') {
      if (pA.isDead && pB.isDead) {
        _endGame(null, events);
      }
    } else if (state.gameMode === 'pvpve') {
      if (pA.isDead && !pB.isDead) {
        _endGame('B', events);
      } else if (pB.isDead && !pA.isDead) {
        _endGame('A', events);
      } else if (pA.isDead && pB.isDead) {
        _endGame(null, events);
      } else if (state.gameTime >= PVPVE_TIME) {
        const winner = pA.score >= pB.score ? 'A' : 'B';
        _endGame(winner, events);
      }
    }
  }

  function _endGame(winner, events) {
    state.phase = 'ended';
    state.winner = winner;
    events.push({
      type: 'gameOver',
      winner,
      scores: {
        A: { score: state.players.A.score, kills: state.players.A.kills },
        B: { score: state.players.B.score, kills: state.players.B.kills },
      },
    });
  }

  return gs;
}

module.exports = { createGameState, COVER_BOXES, WEAPONS };
