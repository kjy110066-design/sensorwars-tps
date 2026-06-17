'use strict';

/**
 * relay.js — 로컬 아두이노 ↔ 클라우드 서버 중계기
 *
 * 사용법:
 *   node relay.js <PLAYER> <COM포트> <서버URL>
 *   예) node relay.js A COM8 wss://sensorwars.railway.app
 *
 * 환경변수로도 설정 가능:
 *   PLAYER=A SERIAL_PORT=COM8 SERVER_URL=wss://... node relay.js
 */

const WebSocket = require('ws');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const PLAYER     = process.env.PLAYER      || process.argv[2] || 'A';
const SERIAL_PORT = process.env.SERIAL_PORT || process.argv[3] || 'COM8';
const SERVER_URL  = process.env.SERVER_URL  || process.argv[4] || 'ws://localhost:3000';
const BAUD_RATE   = parseInt(process.env.BAUD_RATE || '115200', 10);

console.log('╔══════════════════════════════════════════╗');
console.log('║        SENSOR WARS 아두이노 릴레이         ║');
console.log('╠══════════════════════════════════════════╣');
console.log(`║  플레이어: ${PLAYER}                          ║`);
console.log(`║  시리얼:   ${SERIAL_PORT}                       ║`);
console.log(`║  서버:     ${SERVER_URL.slice(0, 30)}... ║`);
console.log('╚══════════════════════════════════════════╝');

// ── 시리얼 포트 열기 ──────────────────────────────────────────────────────────
const serial = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE });
const parser = serial.pipe(new ReadlineParser({ delimiter: '\n' }));

serial.on('open', () => {
  console.log(`[시리얼] ${SERIAL_PORT} 열림 (${BAUD_RATE}bps)`);
});

serial.on('error', (e) => {
  console.error('[시리얼] 오류:', e.message);
  console.error('  → COM포트 번호를 확인하고 다시 실행해주세요.');
  process.exit(1);
});

// ── WebSocket 연결 (자동 재연결) ──────────────────────────────────────────────
let ws = null;
let reconnectTimer = null;

function connect() {
  if (ws) { try { ws.terminate(); } catch(_) {} }

  console.log(`[WS] 서버 접속 중: ${SERVER_URL}`);
  ws = new WebSocket(SERVER_URL);

  ws.on('open', () => {
    console.log('[WS] 서버 접속 완료');
    clearTimeout(reconnectTimer);

    // 플레이어로 입장 (isRelay: 브라우저 broadcast 대상에서 제외)
    ws.send(JSON.stringify({ type: 'join', player: PLAYER, isRelay: true }));
    console.log(`[WS] Player ${PLAYER} 입장 전송 (릴레이 모드)`);
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'welcome') {
        console.log(`[WS] 서버 환영: Player ${msg.player}`);
      }

      // 진동 명령 → 아두이노로 전달
      if (msg.type === 'vibrate' && msg.player === PLAYER) {
        const power    = Math.max(msg.vl || 0, msg.vr || 0);
        const duration = msg.duration || 150;
        const cmd      = JSON.stringify({ vl: power, duration }) + '\n';
        if (serial.isOpen) {
          serial.write(cmd);
        }
      }
    } catch(_) {}
  });

  ws.on('close', () => {
    console.log('[WS] 연결 끊김 — 3초 후 재연결');
    reconnectTimer = setTimeout(connect, 3000);
  });

  ws.on('error', (e) => {
    console.error('[WS] 오류:', e.message);
  });
}

// 시리얼 데이터 → 서버로 전달
parser.on('data', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let data;
  try {
    data = JSON.parse(trimmed);
  } catch(_) {
    return; // JSON이 아닌 줄 무시
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'serialInput', data }));
  }
});

connect();

// 종료 처리
process.on('SIGINT', () => {
  console.log('\n[릴레이] 종료 중...');
  if (ws) ws.terminate();
  if (serial.isOpen) serial.close();
  process.exit(0);
});
