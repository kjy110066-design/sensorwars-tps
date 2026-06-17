'use strict';

class InputManager {
  constructor() {
    this.keys = {};
    this.mouseButtons = {};
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLocked = false;

    // 입력 상태 (아두이노 프로토콜과 동일한 구조)
    this.state = {
      lx: 512, ly: 512, rx: 512, ry: 512,
      l3: 0, r3: 0,
      b1: 0, b2: 0, b3: 0, b4: 0,
      b5: 0, b6: 0, b7: 0, b8: 0,
      ba: 0, bb: 0, bx: 0, by: 0, lb: 0, rb: 0,
    };

    // 버튼 에지 감지
    this._prevB3 = 0; this._prevB4 = 0;
    this._prevB7 = 0;
    this._sendInterval = null;
    this._mouseSensitivity = 8; // 마우스 픽셀 → rx 조이스틱 변환

    this._bindEvents();
  }

  init(sendFn, simMode) {
    this.sendFn = sendFn;
    this.simMode = simMode;

    if (simMode) {
      document.getElementById('sim-indicator').style.display = 'block';
      // 포인터락 안내
      document.getElementById('gameCanvas').addEventListener('click', () => {
        document.getElementById('gameCanvas').requestPointerLock();
      });
    }

    // 주기적으로 입력 전송 (20Hz)
    this._sendInterval = setInterval(() => this._sendInput(), 50);
  }

  _bindEvents() {
    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      e.preventDefault();
    });
    document.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    document.addEventListener('mousedown', (e) => {
      this.mouseButtons[e.button] = true;
    });
    document.addEventListener('mouseup', (e) => {
      this.mouseButtons[e.button] = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = !!document.pointerLockElement;
    });
  }

  _buildState() {
    const k = this.keys;
    const mb = this.mouseButtons;

    // 조이스틱L: WASD
    let lx = 512, ly = 512;
    if (k['KeyA'] || k['ArrowLeft'])  lx = 100;
    if (k['KeyD'] || k['ArrowRight']) lx = 924;
    if (k['KeyW'] || k['ArrowUp'])    ly = 100;
    if (k['KeyS'] || k['ArrowDown'])  ly = 924;

    // 조이스틱R: 마우스 좌우 (수평)
    let rx = 512;
    if (this.mouseDX !== 0) {
      const norm = Math.max(-1, Math.min(1, this.mouseDX / this._mouseSensitivity));
      rx = Math.round(512 + norm * 400);
      this.mouseDX = 0;
    }

    // 조이스틱R: 마우스 상하 (수직)
    let ry = 512;
    if (this.mouseDY !== 0) {
      const norm = Math.max(-1, Math.min(1, this.mouseDY / this._mouseSensitivity));
      ry = Math.round(512 + norm * 400);
      this.mouseDY = 0;
    }

    this.state.lx = lx;
    this.state.ly = ly;
    this.state.rx = rx;
    this.state.ry = ry;

    // L3: Shift (달리기)
    this.state.l3 = (k['ShiftLeft'] || k['ShiftRight']) ? 1 : 0;
    // R3: F (근접)
    this.state.r3 = k['KeyF'] ? 1 : 0;

    // B1: 1 (수류탄), B2: 2 (힐킷)
    this.state.b1 = k['Digit1'] ? 1 : 0;
    this.state.b2 = k['Digit2'] ? 1 : 0;

    // B3: Q (무기이전), B4: E (무기다음)
    this.state.b3 = k['KeyQ'] ? 1 : 0;
    this.state.b4 = k['KeyE'] ? 1 : 0;

    // B5 / ba: Space (점프)
    this.state.b5 = k['Space'] ? 1 : 0;
    this.state.ba = k['Space'] ? 1 : 0;
    // B6 / bb: 마우스 좌클릭 (발사)
    this.state.b6 = mb[0] ? 1 : 0;
    this.state.bb = mb[0] ? 1 : 0;
    // B7 / bx: R (재장전)
    this.state.b7 = k['KeyR'] ? 1 : 0;
    this.state.bx = k['KeyR'] ? 1 : 0;
    // B8 / by: 마우스 우클릭 (ADS)
    this.state.b8 = mb[2] ? 1 : 0;
    this.state.by = mb[2] ? 1 : 0;
    // lb: E (무기교체), rb: G (수류탄)
    this.state.lb = k['KeyE'] ? 1 : 0;
    this.state.rb = k['KeyG'] ? 1 : 0;
  }

  _sendInput() {
    if (!this.sendFn || !this.simMode) return;
    this._buildState();
    this.sendFn({ ...this.state });
  }

  // 현재 상태 반환 (게임.js에서 참조용)
  getState() {
    this._buildState();
    return { ...this.state };
  }

  destroy() {
    if (this._sendInterval) clearInterval(this._sendInterval);
  }
}

window.swInput = new InputManager();
