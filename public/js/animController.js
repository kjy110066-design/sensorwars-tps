'use strict';

/**
 * AnimController — 플레이어 1명당 인스턴스 1개.
 * animGroups: Map<string, BABYLON.AnimationGroup> (swModelLoader.animCache 공유)
 *
 * 우선순위가 높은 애니메이션이 낮은 것을 중단시킴.
 * loop=false인 애니메이션은 종료 후 자동으로 idle로 복귀.
 */

const ANIM_PRIORITY = {
  death:  5,
  melee:  4,
  shoot:  4,
  reload: 3,
  hit:    3,
  runBack:2,
  strafeL:2,
  strafeR:2,
  run:    2,
  walk:   1,
  idle:   0,
};

class AnimController {
  /**
   * @param {Map<string, BABYLON.AnimationGroup>} animGroups
   */
  constructor(animGroups) {
    this.animGroups   = animGroups; // swModelLoader.animCache への参照
    this.currentAnim  = 'idle';
    this.locked       = false;      // true = 현재 애니메이션이 완료될 때까지 새 애니메이션 차단
    this._lockTimer   = null;
  }

  // ── 재생 ─────────────────────────────────────────────────────────────────
  /**
   * @param {string}   name     ANIM_PRIORITY 키
   * @param {boolean}  loop     반복 여부 (기본: true)
   * @param {Function} onEnd    종료 콜백 (loop=false 시 유효)
   */
  play(name, loop = true, onEnd = null) {
    // 우선순위 확인
    if (this.locked) {
      const curPri = ANIM_PRIORITY[this.currentAnim] ?? 0;
      const newPri = ANIM_PRIORITY[name] ?? 0;
      // death보다 높은 우선순위는 없음 — locked 상태에서도 death는 허용 안 함
      if (newPri <= curPri) return;
    }

    // 동일 애니메이션이면 무시 (단, locked 해제 목적이 아닌 경우)
    if (name === this.currentAnim && !this.locked) return;

    // 애니메이션 그룹 가져오기
    const ag = this.animGroups.get(name);
    if (!ag) {
      console.warn(`[AnimController] 애니메이션 없음: '${name}' — idle 시도`);
      if (name !== 'idle') this.play('idle', true);
      return;
    }

    // 이전 애니메이션 중지
    this._stopCurrent();

    this.currentAnim = name;
    this.locked      = !loop; // one-shot 애니메이션은 잠금
    clearTimeout(this._lockTimer);

    // 재생
    ag.reset();
    ag.start(loop, 1.0);

    if (!loop) {
      // 애니메이션 길이 기반 자동 잠금 해제
      const durationMs = ag.to > 0
        ? (ag.to - ag.from) / (ag.speedRatio || 1) * (1000 / 60) // 60fps 기준
        : 1000;

      this._lockTimer = setTimeout(() => {
        this.unlock();
        if (typeof onEnd === 'function') onEnd();
      }, Math.max(300, durationMs));
    }
  }

  // ── 현재 애니메이션 중지 ─────────────────────────────────────────────────
  _stopCurrent() {
    const ag = this.animGroups.get(this.currentAnim);
    if (ag) {
      try { ag.stop(); } catch (e) { /* 무시 */ }
    }
    clearTimeout(this._lockTimer);
    this._lockTimer = null;
  }

  // ── 잠금 해제 ────────────────────────────────────────────────────────────
  unlock() {
    this.locked = false;
    if (this.currentAnim !== 'idle') {
      this.currentAnim = 'idle'; // idle로 강제 복귀
      this.play('idle', true);
    }
  }

  // ── 상태 기반 자동 업데이트 ──────────────────────────────────────────────
  /**
   * 서버 플레이어 상태로부터 적절한 애니메이션을 결정합니다.
   * @param {object} playerState  서버 gameState.players[id]
   */
  updateFromState(playerState) {
    if (!playerState) return;

    const {
      isDead, isReloading, isShooting, isHit, isRunning,
      lx, ly,              // 조이스틱 (선택적)
      x, z,                // 위치 (프레임 간 속도 추정용으로는 미사용)
    } = playerState;

    // 이동 속도 추정 (조이스틱 값에서)
    const jlx = playerState.lx !== undefined ? ((playerState.lx - 512) / 512) : 0;
    const jly = playerState.ly !== undefined ? ((playerState.ly - 512) / 512) : 0;
    const speed = Math.hypot(jlx, jly);

    if (isDead) {
      this.play('death', false);
      return;
    }

    // melee 판단: 서버에서는 isMelee 플래그가 없으므로 lastMeleeTime 기반
    // (상위에서 직접 play('melee') 호출하는 방식으로 대체)

    if (isReloading) {
      this.play('reload', false);
      return;
    }

    if (isShooting) {
      this.play('shoot', false);
      return;
    }

    if (isHit) {
      this.play('hit', false);
      return;
    }

    if (speed > 0.2 && isRunning) {
      this.play('run', true);
      return;
    }

    if (speed > 0.05) {
      // 후진 여부 판단 (조이스틱 Y가 양수 = 뒤로)
      if (jly > 0.2) {
        this.play('runBack', true);
      } else {
        this.play('walk', true);
      }
      return;
    }

    this.play('idle', true);
  }
}

// game.js에서 직접 new AnimController(map)으로 사용
// window 전역 등록은 하지 않음
