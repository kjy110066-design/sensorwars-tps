'use strict';

class NetworkManager {
  constructor() {
    this.ws = null;
    this.myPlayer = null;
    this.serverIP = 'localhost';
    this.port = 3000;
    this.onStateUpdate = null;
    this.onEvent = null;
    this.reconnectTimer = null;
    this.connected = false;
  }

  connect(serverIP, port) {
    this.serverIP = serverIP || 'localhost';
    this.port = port || 3000;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    // localhost 기본값이면 현재 페이지 호스트(Railway 도메인 포함)를 자동 사용
    const isLocalDefault = !serverIP || serverIP === 'localhost' || serverIP === '127.0.0.1';
    const host = isLocalDefault ? location.host : `${this.serverIP}:${this.port}`;
    const url = `${proto}://${host}`;

    if (this.ws) { this.ws.close(); }

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      console.log(`[Network] 서버 연결: ${url}`);
      clearTimeout(this.reconnectTimer);

      // 이전 세션 정보로 재입장 (맵 스폰 위치도 함께 전송)
      if (this.myPlayer) {
        const joinMsg = {
          type: 'join',
          player: this.myPlayer,
          mode: sessionStorage.getItem('swMode') || 'deathmatch',
        };
        if (window.swGame && swGame.pendingSpawnA && swGame.pendingSpawnB) {
          joinMsg.spawnA = swGame.pendingSpawnA;
          joinMsg.spawnB = swGame.pendingSpawnB;
        }
        this.send(joinMsg);
      }
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this._handleMessage(msg);
      } catch(err) {
        console.warn('[Network] 메시지 파싱 오류:', err);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      console.log('[Network] 연결 끊김 - 3초 후 재연결');
      this.reconnectTimer = setTimeout(() => this.connect(this.serverIP || null, this.port), 3000);
    };

    this.ws.onerror = (e) => {
      console.error('[Network] WS 오류');
    };
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'gameState':
        if (this.onStateUpdate) this.onStateUpdate(msg.state);
        break;

      case 'welcome':
        this.myPlayer = msg.player;
        if (this.onEvent) this.onEvent(msg);
        break;

      case 'countdown':
        if (window.swHUD) swHUD.startCountdown(msg.seconds || 3);
        break;

      case 'gameStart':
        if (this.onEvent) this.onEvent(msg);
        if (window.swHUD) swHUD.onGameStart(msg.mode);
        break;

      case 'hit':
        if (msg.target === this.myPlayer) {
          if (window.swHUD) swHUD.showHitVignette();
          if (window.swHUD) swHUD.showHitDirection(msg.direction);
          if (window.swEffects) swEffects.onHitReceived();
        }
        break;

      case 'killed':
        if (window.swHUD) swHUD.showNotification(
          msg.killer === this.myPlayer
            ? `🎯 ${msg.victim === 'A' ? 'P1' : 'P2'} 처치!`
            : `💀 ${msg.killer === 'A' ? 'P1' : 'P2'}에게 사망`
        );
        if (window.swGame) swGame.onKillEvent(msg);
        break;

      case 'monsterKilled':
        if (msg.killer === this.myPlayer) {
          if (window.swHUD) swHUD.showNotification(msg.isBoss ? '👑 보스 처치! +500' : '+100 점');
        }
        break;

      case 'waveStart':
        if (window.swHUD) swHUD.showNotification(`🌊 웨이브 ${msg.wave} 시작!`);
        if (window.swHUD) swHUD.setWave(msg.wave);
        break;

      case 'waveClear':
        if (window.swHUD) swHUD.showNotification(`✅ 웨이브 ${msg.wave} 클리어!`);
        break;

      case 'bossSpawn':
        if (window.swHUD) swHUD.showNotification('⚠️ 보스 등장!');
        break;

      case 'shoot':
        if (window.swEffects) swEffects.onShoot(msg.player, msg.weapon);
        break;

      case 'bulletHitCover':
        if (window.swEffects) swEffects.onBulletHitCover(msg.x, msg.y, msg.z);
        break;

      case 'reload':
        if (msg.player === this.myPlayer) {
          if (window.swHUD) swHUD.showNotification('🔄 재장전 중...');
        }
        break;

      case 'respawn':
        if (msg.player === this.myPlayer) {
          if (window.swHUD) swHUD.onRespawn();
        }
        break;

      case 'gameOver':
        if (window.swHUD) swHUD.onGameOver(msg, this.myPlayer);
        if (window.swEffects) swEffects.onGameOver(msg.winner === this.myPlayer);
        break;

      case 'vibrate':
        // 모바일/크롬 haptics 지원 시 실제 진동
        if (msg.player === this.myPlayer && navigator.vibrate && msg.duration) {
          navigator.vibrate(msg.duration);
        }
        break;

      case 'itemPickup':
        if (msg.player === this.myPlayer) {
          if (window.swHUD) swHUD.showNotification(`💊 힐킷 획득 (+40HP)`);
        }
        break;

      case 'grenade':
        if (window.swEffects) swEffects.onExplosion(msg.x, 0, msg.z);
        break;

      case 'melee':
        if (window.swGame) swGame.onMeleeEvent(msg);
        break;

      case 'restarted':
        document.getElementById('game-over-overlay').style.display = 'none';
        break;

      case 'calibrationSaved': {
        const st = document.getElementById('gCalibStatus');
        if (st) { st.textContent = '✓ 적용됨'; setTimeout(() => { st.textContent = ''; }, 1500); }
        break;
      }

      default:
        if (this.onEvent) this.onEvent(msg);
    }
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendInput(data) {
    this.send({ type: 'input', data });
  }
}

window.swNetwork = new NetworkManager();
