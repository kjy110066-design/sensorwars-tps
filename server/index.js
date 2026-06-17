'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const WebSocket = require('ws');

// ─────────────────────────────────────────────────────────────────────────────
// 노트북B 중계 모드: SERVER_IP가 설정된 경우 시리얼 → WS 릴레이만 실행
// ─────────────────────────────────────────────────────────────────────────────
if (process.env.SERVER_IP) {
  const { createSerialManager } = require('./serialManager');
  const serverUrl = `ws://${process.env.SERVER_IP}:${process.env.PORT || 3000}`;
  console.log(`[릴레이 모드] 서버 접속: ${serverUrl}`);

  const ws = new WebSocket(serverUrl);
  let relaySerial = null;

  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'join', player: 'B' }));
    console.log('[릴레이] 서버에 Player B로 접속 완료');

    const serialPort = process.env.SERIAL_PORT_B || process.env.SERIAL_PORT_A || 'COM4';
    relaySerial = createSerialManager(serialPort, 'B');
    relaySerial.on('input', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'serialInput', data }));
      }
    });
    relaySerial.on('error', (e) => {
      console.error('[릴레이] 시리얼 오류:', e.message);
    });
  });

  ws.on('message', (raw) => {
    // 진동 명령만 받아서 아두이노로 전달
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'vibrate' && msg.player === 'B' && relaySerial) {
        const power = Math.max(msg.vl || 0, msg.vr || 0);
        relaySerial.send(JSON.stringify({ vl: power, duration: msg.duration }));
      }
    } catch(_) {}
  });

  ws.on('close', () => {
    console.log('[릴레이] 연결 끊김 - 5초 후 재연결');
    setTimeout(() => {
      process.exit(1); // 프로세스 재시작 (pm2 또는 수동 재실행)
    }, 5000);
  });

  ws.on('error', (e) => {
    console.error('[릴레이] WS 오류:', e.message);
  });

  return; // 서버 코드 실행 안 함
}

// ─────────────────────────────────────────────────────────────────────────────
// 노트북A 서버 모드
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const http    = require('http');
const path    = require('path');

const { createSerialManager, SerialManager } = require('./serialManager');
const { createGameState }     = require('./gameState');
const { createGameLoop }      = require('./gameLoop');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// 3D 모델 MIME 타입
app.use((req, res, next) => {
  if (req.path.endsWith('.glb')) {
    res.type('model/gltf-binary');
  } else if (req.path.endsWith('.gltf')) {
    res.type('model/gltf+json');
  } else if (req.path.endsWith('.fbx')) {
    res.setHeader('Content-Type', 'application/octet-stream');
  }
  next();
});

app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '../public/lobby.html')));

// Railway 헬스체크 엔드포인트
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── 조이스틱 캘리브레이션 (플레이어별) ────────────────────────────────────
const calibrations = {
  A: { invertLX: false, invertLY: false, invertRX: false, invertRY: false, swapLXY: false, swapRXY: false },
  B: { invertLX: false, invertLY: false, invertRX: false, invertRY: false, swapLXY: false, swapRXY: false },
};

function applyCalibration(data, calib) {
  if (!calib) return data;
  let { lx = 512, ly = 512, rx = 512, ry = 512, ...rest } = data;
  if (calib.swapLXY) { const t = lx; lx = ly; ly = t; }
  if (calib.swapRXY) { const t = rx; rx = ry; ry = t; }
  if (calib.invertLX) lx = 1023 - lx;
  if (calib.invertLY) ly = 1023 - ly;
  if (calib.invertRX) rx = 1023 - rx;
  if (calib.invertRY) ry = 1023 - ry;
  return { lx, ly, rx, ry, ...rest };
}

// 게임 상태 & 루프
const gameState = createGameState();
const clients   = { A: null, B: null };

// 아두이노 시리얼 참조 (진동 명령 전송용)
const serials = { A: null, B: null };

// 아두이노 연결 상태 추적
let arduinoConnected = false;

// 플레이어A 시리얼 (SIM_MODE가 아닐 때)
if (process.env.SIM_MODE !== 'true') {
  const serialA = createSerialManager(process.env.SERIAL_PORT_A || 'COM3', 'A');
  serials.A = serialA;
  serialA.on('input', (data) => {
    gameState.processInput('A', applyCalibration(data, calibrations.A));
  });
  serialA.on('connected', () => {
    arduinoConnected = true;
    broadcastToAll({ type: 'arduinoStatus', player: 'A', status: 'connected' });
  });
  serialA.on('error', () => {
    arduinoConnected = false;
    broadcastToAll({ type: 'arduinoStatus', player: 'A', status: 'error' });
  });
  serialA.on('disconnected', () => {
    arduinoConnected = false;
    broadcastToAll({ type: 'arduinoStatus', player: 'A', status: 'disconnected' });
  });
}

// ─── WebSocket 연결 처리 ────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  let playerRole = null;
  console.log(`[WS] 새 연결: ${req.socket.remoteAddress}`);

  // 현재 서버 모드와 아두이노 상태 즉시 전송
  try {
    ws.send(JSON.stringify({
      type: 'serverMode',
      simMode: process.env.SIM_MODE === 'true',
      arduinoConnected,
    }));
  } catch(_) {}

  ws.on('message', (rawMsg) => {
    let msg;
    try { msg = JSON.parse(rawMsg.toString()); } catch(e) { return; }

    switch (msg.type) {
      case 'join': {
        playerRole = msg.player;
        clients[playerRole] = ws;
        ws.send(JSON.stringify({ type: 'welcome', player: playerRole }));

        if (msg.mode) gameState.setMode(msg.mode);
        if (msg.spawnA && msg.spawnB) gameState.updateSpawnPositions(msg.spawnA, msg.spawnB);

        // 이미 연결된 상대방에게 알림
        const other = playerRole === 'A' ? 'B' : 'A';
        if (clients[other] && clients[other].readyState === WebSocket.OPEN) {
          clients[other].send(JSON.stringify({ type: 'playerJoined', player: playerRole }));
          clients[playerRole].send(JSON.stringify({ type: 'playerJoined', player: other }));
        }

        // 현재 게임 상태 전송
        ws.send(JSON.stringify({ type: 'gameState', state: gameState.state }));
        console.log(`[WS] Player ${playerRole} 입장`);
        break;
      }

      case 'setMode': {
        gameState.setMode(msg.mode);
        broadcast({ type: 'modeChanged', mode: msg.mode });
        break;
      }

      case 'ready': {
        if (!playerRole) break;
        gameState.setPlayerReady(playerRole);
        broadcast({ type: 'playerReady', player: playerRole });

        // 상대방도 연결되어 있으면 자동 ready 처리 (한 명만 눌러도 시작)
        const other = playerRole === 'A' ? 'B' : 'A';
        if (clients[other] && clients[other].readyState === WebSocket.OPEN) {
          gameState.setPlayerReady(other);
        }

        if (gameState.bothReady()) {
          gameState.startGame();
          broadcast({ type: 'countdown', seconds: 3 });
        }
        break;
      }

      case 'input': {
        if (process.env.SIM_MODE === 'true' && playerRole) {
          gameState.processInput(playerRole, applyCalibration(msg.data, calibrations[playerRole]));
        }
        break;
      }

      case 'serialInput': {
        if (playerRole) {
          gameState.processInput(playerRole, applyCalibration(msg.data, calibrations[playerRole]));
        }
        break;
      }

      case 'setCalibration': {
        const target = playerRole || msg.player;
        if (target && msg.calib && calibrations[target]) {
          calibrations[target] = { ...calibrations[target], ...msg.calib };
          if (msg.calib.sensitivity != null) {
            gameState.setSensitivity(target, msg.calib.sensitivity);
          }
          console.log(`[캘리브레이션] Player ${target}:`, calibrations[target]);
          ws.send(JSON.stringify({ type: 'calibrationSaved', player: target }));
        }
        break;
      }

      case 'listPorts': {
        SerialManager.listPorts().then(ports => {
          try {
            ws.send(JSON.stringify({ type: 'portList', ports, current: process.env.SERIAL_PORT_A || 'COM6' }));
          } catch(_) {}
        });
        break;
      }

      case 'setSerialPort': {
        const target = msg.player || 'A';
        if (msg.port && serials[target]) {
          serials[target].changePort(msg.port);
          process.env[`SERIAL_PORT_${target}`] = msg.port;
          console.log(`[포트변경] Player ${target} → ${msg.port}`);
          broadcastToAll({ type: 'serialPortChanged', player: target, port: msg.port });
        }
        break;
      }

      case 'restart': {
        gameState.reset();
        broadcast({ type: 'gameState', state: gameState.state });
        broadcast({ type: 'restarted' });
        break;
      }

      case 'spawnPositions': {
        if (msg.spawnA && msg.spawnB) gameState.updateSpawnPositions(msg.spawnA, msg.spawnB);
        break;
      }

      case 'updateSpawn': {
        if (msg.spawnA && msg.spawnB) gameState.updateSpawnPositions(msg.spawnA, msg.spawnB);
        break;
      }

      case 'setInputMode': {
        const useArduino = msg.mode === 'arduino';
        process.env.SIM_MODE = useArduino ? 'false' : 'true';
        broadcastToAll({ type: 'serverMode', simMode: !useArduino, arduinoConnected });
        console.log(`[모드] 입력 방식 변경: ${useArduino ? '아두이노' : 'SIM(키보드)'}`);
        break;
      }
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Player ${playerRole} 연결 종료`);
    if (playerRole) {
      clients[playerRole] = null;
      broadcast({ type: 'playerDisconnected', player: playerRole });
    }
  });

  ws.on('error', (e) => {
    console.error('[WS] 오류:', e.message);
  });
});

// ─── 브로드캐스트 ──────────────────────────────────────────────────────────
// 게임 플레이어(A/B)에게만 전송
function broadcast(msg) {
  const data = JSON.stringify(msg);
  Object.values(clients).forEach(ws => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(data); } catch(e) {}
    }
  });
}

// 모든 WS 클라이언트(로비 포함)에 전송
function broadcastToAll(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(data); } catch(e) {}
    }
  });
}

// ─── 게임 루프 ────────────────────────────────────────────────────────────
const gameLoop = createGameLoop(gameState, (events) => {
  if (gameState.state.phase === 'waiting') return;

  // 매 틱 상태 브로드캐스트
  broadcast({ type: 'gameState', state: gameState.state });

  // 이벤트 브로드캐스트 (vibrate는 대상 플레이어에게만 전송)
  events.forEach(ev => {
    if (ev.type === 'vibrate') {
      // 해당 플레이어 WebSocket으로만 전송
      const ws = clients[ev.player];
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify(ev)); } catch (e) {}
      }
      // 아두이노 시리얼로 진동 명령 전송 (Arduino는 vl + duration 파싱)
      const serial = serials[ev.player];
      if (serial) {
        const power = Math.max(ev.vl || 0, ev.vr || 0);
        serial.send(JSON.stringify({ vl: power, duration: ev.duration }));
      }
    } else {
      broadcast(ev);
    }
  });
});

gameLoop.start();

// ─── 서버 시작 ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIP = net.address;
        break;
      }
    }
    if (localIP !== 'localhost') break;
  }

  console.log('╔══════════════════════════════════════════╗');
  console.log('║         SENSOR WARS TPS 서버 시작         ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  로컬:   http://localhost:${PORT}            ║`);
  console.log(`║  원격:   http://${localIP}:${PORT}          ║`);
  console.log(`║  모드:   ${process.env.SIM_MODE === 'true' ? 'SIM MODE (키보드/마우스)' : '아두이노 모드'}           ║`);
  console.log('╚══════════════════════════════════════════╝');
});
