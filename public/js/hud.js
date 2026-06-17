'use strict';

class HUDManager {
  constructor() {
    this.myPlayer = null;
    this.gameMode = 'deathmatch';
    this.maxTime = 300;
    this.notifQueue = [];
    this._countdownInterval = null;
    this._vignetteTimeout = null;
    this._hitArrows = [];
    this._deadTimer = 0;
    this._deadInterval = null;

    // 미니맵
    this.minimapCtx = null;
    this.MAP_SCALE = 160 / 100; // canvas px per world unit
    this.MAP_OFFSET = 80; // center
    this.minimapBgImage = null;
    this.mapBoundsMin = null;
    this.mapSize = null;

    this._initMinimap();
  }

  init(myPlayer, gameMode) {
    this.myPlayer = myPlayer;
    this.gameMode = gameMode;
    this.maxTime = gameMode === 'pvpve' ? 180 : gameMode === 'deathmatch' ? 300 : 9999;

    // 모드 표시
    const modeNames = { deathmatch: 'DEATHMATCH', coop: 'CO-OP WAVE', pvpve: 'PvPvE' };
    document.getElementById('hudMode').textContent = modeNames[gameMode] || gameMode.toUpperCase();

    // 상대방 레이블
    document.getElementById('enemyLabel').textContent = `P${myPlayer === 'A' ? '2' : '1'} HP`;

    // 웨이브 표시 토글
    const waveCnt = document.getElementById('waveIndicator');
    waveCnt.style.display = (gameMode !== 'deathmatch') ? 'block' : 'none';
  }

  _initMinimap() {
    const canvas = document.getElementById('minimap');
    if (canvas) this.minimapCtx = canvas.getContext('2d');
  }

  // ── 상태 업데이트 ─────────────────────────────────────────────────────────
  update(state) {
    if (!state || !this.myPlayer) return;
    const me = state.players[this.myPlayer];
    const other = state.players[this.myPlayer === 'A' ? 'B' : 'A'];
    if (!me || !other) return;

    // HP
    const hpPct = Math.max(0, (me.hp / me.maxHp) * 100);
    document.getElementById('hpFill').style.width = hpPct + '%';
    document.getElementById('hpText').textContent = `${Math.max(0,me.hp)} / ${me.maxHp}`;

    // HP 바 색상
    const fill = document.getElementById('hpFill');
    if (hpPct < 25) fill.style.background = 'linear-gradient(90deg, #ff0000, #ff3300)';
    else if (hpPct < 50) fill.style.background = 'linear-gradient(90deg, #ff4400, #ff8800)';
    else fill.style.background = 'linear-gradient(90deg, #ff2200, #ff6600)';

    // 탄약
    document.getElementById('ammoCurrent').textContent = me.ammo;
    document.getElementById('ammoMax').textContent = me.maxAmmo || 30;
    const ammoState = document.getElementById('ammoState');
    if (me.isReloading) {
      ammoState.style.display = 'inline';
      ammoState.className = 'ammo-state reloading';
      ammoState.textContent = '재장전';
    } else if (me.isRunning) {
      ammoState.style.display = 'inline';
      ammoState.className = 'ammo-state running';
      ammoState.textContent = '달리기';
    } else if (me.isADS) {
      ammoState.style.display = 'inline';
      ammoState.className = 'ammo-state ads';
      ammoState.textContent = 'ADS';
    } else {
      ammoState.style.display = 'none';
    }

    // 무기 슬롯
    for (let i = 0; i < 3; i++) {
      const slot = document.getElementById('slot' + i);
      slot.className = 'weapon-slot' + (me.weapon === i ? ' active' : '');
    }

    // 점수
    document.getElementById('scoreA').textContent = this.gameMode === 'deathmatch'
      ? (state.players.A.kills || 0)
      : (state.players.A.score || 0);
    document.getElementById('scoreB').textContent = this.gameMode === 'deathmatch'
      ? (state.players.B.kills || 0)
      : (state.players.B.score || 0);

    // 타이머
    const elapsed = state.gameTime || 0;
    const remaining = Math.max(0, this.maxTime - elapsed);
    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    const timerEl = document.getElementById('timerDisplay');
    timerEl.textContent = `${mins}:${secs.toString().padStart(2,'0')}`;
    timerEl.className = 'timer' + (remaining < 30 ? ' urgent' : '');

    // 적 HP
    const ePct = Math.max(0, (other.hp / other.maxHp) * 100);
    document.getElementById('enemyHpFill').style.width = ePct + '%';
    document.getElementById('enemyHpText').textContent = `${Math.max(0,other.hp)} / ${other.maxHp}`;

    // 사망 오버레이
    const deathEl = document.getElementById('death-overlay');
    if (me.isDead) {
      deathEl.style.display = 'flex';
      const t = Math.max(0, me.deadTimer / 1000);
      document.getElementById('respawnTimer').textContent =
        this.gameMode === 'deathmatch'
          ? `리스폰 ${t.toFixed(1)}초...`
          : '사망';
    } else {
      deathEl.style.display = 'none';
    }

    // 미니맵
    this._updateMinimap(state);
  }

  // ── 미니맵 배경 / 바운드 설정 ────────────────────────────────────────────
  setMinimapBg(image) {
    this.minimapBgImage = image;
  }

  setMapBounds(boundsMin, mapSize) {
    const maxDim = Math.max(mapSize.x || 100, mapSize.z || 100);
    this.MAP_SCALE  = 140 / maxDim;
    this.MAP_OFFSET = 75;
    this.mapBoundsMin = boundsMin;
    this.mapSize = mapSize;
  }

  // ── 미니맵 ────────────────────────────────────────────────────────────────
  _updateMinimap(state) {
    const ctx = this.minimapCtx;
    if (!ctx) return;

    ctx.clearRect(0, 0, 160, 160);

    // 원형 클리핑
    ctx.save();
    ctx.beginPath();
    ctx.arc(80, 80, 78, 0, Math.PI * 2);
    ctx.clip();

    // RTT 배경 이미지 (맵 위에서 렌더링)
    if (this.minimapBgImage && this.minimapBgImage.complete) {
      ctx.drawImage(this.minimapBgImage, 2, 2, 156, 156);
    } else {
      // 폴백 배경
      ctx.fillStyle = 'rgba(2,6,20,0.90)';
      ctx.fillRect(0, 0, 160, 160);
      ctx.strokeStyle = 'rgba(0,100,255,0.12)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 160; i += 16) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 160); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(160, i); ctx.stroke();
      }
    }

    // 월드 좌표 → 미니맵 픽셀 변환
    const toMM = (wx, wz) => {
      if (this.mapSize && this.mapBoundsMin) {
        const nx = (wx - this.mapBoundsMin.x) / this.mapSize.x;
        const nz = (wz - this.mapBoundsMin.z) / this.mapSize.z;
        return { x: 5 + nx * 150, y: 5 + (1 - nz) * 150 };
      }
      return {
        x: this.MAP_OFFSET + wx * this.MAP_SCALE,
        y: this.MAP_OFFSET + wz * this.MAP_SCALE,
      };
    };

    // 아이템 (보라)
    if (state.items) {
      state.items.forEach(item => {
        const mm = toMM(item.x, item.z);
        ctx.fillStyle = '#aa44ff';
        ctx.beginPath();
        ctx.arc(mm.x, mm.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 몬스터 (초록/주황)
    if (state.monsters) {
      state.monsters.forEach(m => {
        if (m.state === 'dead') return;
        const mm = toMM(m.x, m.z);
        ctx.fillStyle = m.isBoss ? '#ffaa00' : '#00ff88';
        ctx.beginPath();
        ctx.arc(mm.x, mm.y, m.isBoss ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 플레이어 (방향 삼각형)
    const drawPlayerArrow = (p, id, color) => {
      if (!p || p.isDead) return;
      const mm = toMM(p.x, p.z);
      const isMe = id === this.myPlayer;
      ctx.save();
      ctx.translate(mm.x, mm.y);
      ctx.rotate(p.rotY || 0);
      ctx.fillStyle = color;
      ctx.strokeStyle = isMe ? '#ffffff' : 'transparent';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(6, 6);
      ctx.lineTo(-6, 6);
      ctx.closePath();
      ctx.fill();
      if (isMe) ctx.stroke();
      ctx.restore();
    };

    drawPlayerArrow(state.players.A, 'A', '#3399ff');
    drawPlayerArrow(state.players.B, 'B', '#ff4444');

    ctx.restore();

    // 원 테두리
    ctx.strokeStyle = 'rgba(0,170,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(80, 80, 78, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── 이벤트 알림 ───────────────────────────────────────────────────────────
  showNotification(text) {
    const el = document.createElement('div');
    el.className = 'notif';
    el.textContent = text;
    const container = document.getElementById('notifications');
    container.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2600);
  }

  // ── 피격 비네팅 ──────────────────────────────────────────────────────────
  showHitVignette() {
    const el = document.getElementById('hit-vignette');
    el.style.opacity = '1';
    clearTimeout(this._vignetteTimeout);
    this._vignetteTimeout = setTimeout(() => {
      el.style.opacity = '0';
    }, 500);
  }

  // ── 피격 방향 화살표 ──────────────────────────────────────────────────────
  showHitDirection(direction) {
    if (!direction || !this.myPlayer) return;
    const container = document.getElementById('hit-indicators');
    const el = document.createElement('div');
    el.className = 'hit-arrow';

    const angle = Math.atan2(direction.x, direction.z) * (180 / Math.PI);
    const r = 42; // vw 퍼센트
    const ax = 50 + r * Math.sin(angle * Math.PI / 180);
    const ay = 50 + r * Math.cos(angle * Math.PI / 180);

    el.style.cssText = `
      position:absolute;
      left:${ax}%;top:${ay}%;
      transform:translate(-50%,-50%) rotate(${angle}deg);
      width:0;height:0;
      border-left:10px solid transparent;
      border-right:10px solid transparent;
      border-bottom:24px solid rgba(255,50,50,0.9);
      opacity:1;filter:drop-shadow(0 0 6px red);
    `;

    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.8s';
      el.style.opacity = '0';
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
    }, 1200);
  }

  // ── 크로스헤어 스프레드 ──────────────────────────────────────────────────
  showCrosshairSpread() {
    const ch = document.getElementById('crosshair');
    ch.classList.add('spread');
    setTimeout(() => ch.classList.remove('spread'), 200);
  }

  setCrosshairADS(isADS) {
    const ch = document.getElementById('crosshair');
    if (isADS) {
      ch.innerHTML = '<div class="ch-ads-ring"></div><div class="ch-dot"></div>';
    } else {
      ch.innerHTML =
        '<div class="ch-line ch-h-l"></div>' +
        '<div class="ch-line ch-h-r"></div>' +
        '<div class="ch-line ch-v-t"></div>' +
        '<div class="ch-line ch-v-b"></div>' +
        '<div class="ch-dot"></div>';
    }
  }

  // ── 웨이브 표시 ──────────────────────────────────────────────────────────
  setWave(wave) {
    const el = document.getElementById('waveIndicator');
    el.textContent = `WAVE ${wave}`;
    el.style.display = 'block';
  }

  // ── 카운트다운 ────────────────────────────────────────────────────────────
  startCountdown(seconds) {
    const overlay = document.getElementById('countdown-overlay');
    const numEl = document.getElementById('countdown-num');
    overlay.style.display = 'flex';
    let count = seconds;

    const tick = () => {
      if (count <= 0) {
        numEl.textContent = 'GO!';
        numEl.style.animation = 'none';
        numEl.offsetHeight; // reflow
        numEl.style.animation = 'countPop .9s ease-out forwards';
        setTimeout(() => { overlay.style.display = 'none'; }, 1000);
        return;
      }
      numEl.textContent = count;
      numEl.style.animation = 'none';
      numEl.offsetHeight;
      numEl.style.animation = 'countPop .9s ease-out forwards';
      count--;
      setTimeout(tick, 1000);
    };
    tick();
  }

  onGameStart(mode) {
    this.showNotification('게임 시작!');
  }

  onRespawn() {
    document.getElementById('death-overlay').style.display = 'none';
    this.showNotification('리스폰!');
  }

  onGameOver(msg, myPlayer) {
    const overlay = document.getElementById('game-over-overlay');
    overlay.style.display = 'flex';
    document.getElementById('goWinner').textContent =
      msg.winner ? `PLAYER ${msg.winner} WIN! 🏆` : 'DRAW';
    document.getElementById('goScoreA').textContent = msg.scores?.A?.score || 0;
    document.getElementById('goScoreB').textContent = msg.scores?.B?.score || 0;
    document.getElementById('goKillsA').textContent = `${msg.scores?.A?.kills || 0} KILLS`;
    document.getElementById('goKillsB').textContent = `${msg.scores?.B?.kills || 0} KILLS`;
  }
}

window.swHUD = new HUDManager();
