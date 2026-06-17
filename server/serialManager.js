'use strict';

const EventEmitter = require('events');

class SerialManager extends EventEmitter {
  constructor(portPath, playerId) {
    super();
    this.portPath = portPath;
    this.playerId = playerId;
    this.port = null;
    this.lineBuffer = '';
    this.connected = false;
  }

  connect() {
    let SerialPort;
    try {
      SerialPort = require('serialport').SerialPort;
    } catch (e) {
      console.error(`[Serial ${this.playerId}] serialport 모듈 로드 실패:`, e.message);
      return;
    }

    try {
      this.port = new SerialPort({
        path: this.portPath,
        baudRate: 115200,
        autoOpen: false,
      });

      this.port.open((err) => {
        if (err) {
          console.error(`[Serial ${this.playerId}] 포트 열기 실패 (${this.portPath}):`, err.message);
          this.emit('error', err);
          return;
        }
        this.connected = true;
        console.log(`[Serial ${this.playerId}] 연결됨: ${this.portPath}`);
        this.emit('connected');
      });

      this.port.on('data', (chunk) => {
        this.lineBuffer += chunk.toString('utf8');
        const lines = this.lineBuffer.split('\n');
        this.lineBuffer = lines.pop();
        lines.forEach(line => this._parseLine(line.trim()));
      });

      this.port.on('error', (err) => {
        console.error(`[Serial ${this.playerId}] 에러:`, err.message);
        this.connected = false;
        this.emit('error', err);
      });

      this.port.on('close', () => {
        this.connected = false;
        console.log(`[Serial ${this.playerId}] 연결 종료`);
        this.emit('disconnected');
        const delay = this._changing ? 100 : 3000;
        this._changing = false;
        setTimeout(() => this.connect(), delay);
      });

    } catch (e) {
      console.error(`[Serial ${this.playerId}] 초기화 실패:`, e.message);
    }
  }

  _parseLine(line) {
    if (!line || line.length < 5) return;
    try {
      const data = JSON.parse(line);
      if (typeof data.lx === 'number') {
        this.emit('input', data);
      }
    } catch (e) {
      // 불완전한 라인 무시
    }
  }

  send(message) {
    if (this.port && this.connected) {
      this.port.write(message + '\n', (err) => {
        if (err) console.error(`[Serial ${this.playerId}] 전송 오류:`, err.message);
      });
    }
  }

  disconnect() {
    if (this.port && this.connected) {
      this.port.close();
    }
  }

  changePort(newPath) {
    if (this.portPath === newPath) return;
    console.log(`[Serial ${this.playerId}] 포트 변경: ${this.portPath} → ${newPath}`);
    this.portPath = newPath;
    this._changing = true;
    if (this.port && this.connected) {
      this.port.close();
    } else {
      this._changing = false;
      this.connect();
    }
  }

  static async listPorts() {
    try {
      const { SerialPort } = require('serialport');
      const ports = await SerialPort.list();
      return ports.map(p => p.path);
    } catch (e) {
      return [];
    }
  }
}

function createSerialManager(portPath, playerId) {
  const manager = new SerialManager(portPath, playerId);
  manager.connect();
  return manager;
}

module.exports = { createSerialManager, SerialManager };
