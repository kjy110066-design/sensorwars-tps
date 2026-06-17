# SENSOR WARS TPS
> 아두이노 UNO 컨트롤러를 사용하는 2인 멀티플레이어 3인칭 슈팅 게임

---

## 빠른 시작 (SIM_MODE — 아두이노 없이 키보드/마우스 테스트)

```bash
cd game
npm install
node server/index.js
```

브라우저 탭 두 개 열고 각각 `http://localhost:3000`에 접속  
→ 각 탭에서 **Player A**, **Player B** 선택 → 게임 모드 선택 → 시작

---

## 파일 구조

```
game/
├── server/
│   ├── index.js          메인 서버 (Express + WebSocket + SerialPort)
│   ├── gameState.js      게임 상태 + 물리 + AI
│   ├── gameLoop.js       20틱/초 게임 루프
│   └── serialManager.js  아두이노 USB 시리얼 관리
├── public/
│   ├── lobby.html        로비 화면
│   ├── game.html         게임 화면
│   └── js/
│       ├── game.js       Babylon.js 3D 렌더러
│       ├── network.js    WebSocket 클라이언트
│       ├── input.js      컨트롤러/키보드 입력
│       ├── hud.js        HUD UI
│       └── effects.js    파티클·포스트프로세스
└── arduino/
    └── controller/
        └── controller.ino  아두이노 펌웨어
```

---

## 아두이노 핀 배치

| 핀  | 연결      | 기능           |
|-----|-----------|----------------|
| A0  | 조이스틱L VRX | 캐릭터 좌우 이동 |
| A1  | 조이스틱L VRY | 캐릭터 앞뒤 이동 |
| D2  | 조이스틱L SW  | L3: 달리기 토글 |
| A2  | 조이스틱R VRX | 카메라 좌우 회전 |
| A3  | 조이스틱R VRY | (예약) |
| D3  | 조이스틱R SW  | R3: 근접공격 |
| D4  | 버튼1 (↑)    | 수류탄 던지기 |
| D5  | 버튼2 (↓)    | 힐킷 사용 |
| D6  | 버튼3 (←)    | 무기 이전 |
| D7  | 버튼4 (→)    | 무기 다음 |
| D8  | 버튼5 (A 초록) | 점프/구르기 |
| D9  | 버튼6 (B 빨강) | 발사 |
| D10 | 버튼7 (X 파랑) | 재장전 |
| D11 | 버튼8 (Y 노랑) | 조준 (ADS) |

> 모든 버튼: `INPUT_PULLUP` 설정, 눌림 = LOW

---

## 실행 방법

### 방법 1 — 싱글 PC 테스트 (SIM_MODE)

1. `.env`에서 `SIM_MODE=true` 확인
2. `npm install && node server/index.js`
3. 브라우저 탭 A: `http://localhost:3000` → Player A 선택
4. 브라우저 탭 B: `http://localhost:3000` → Player B 선택
5. 둘 다 모드 선택 후 게임 시작

**키보드 매핑:**
| 키 | 기능 |
|----|------|
| WASD / 방향키 | 이동 |
| 마우스 좌우 (포인터락) | 카메라 회전 |
| Shift | 달리기 |
| 마우스 좌클릭 | 발사 |
| 마우스 우클릭 | 조준 (ADS) |
| R | 재장전 |
| F | 근접공격 |
| Q/E | 무기 이전/다음 |
| 1 | 수류탄 |
| 2 | 힐킷 사용 |
| Space | 점프 |

### 방법 2 — 두 노트북 + 아두이노 멀티플레이

#### 노트북A (서버 역할)

```
.env:
  SIM_MODE=false
  SERIAL_PORT_A=COM3   ← 본인 아두이노 포트
  PORT=3000
```

```bash
npm install
node server/index.js
# 출력에서 로컬 IP 확인 (예: 192.168.0.100)
```

브라우저: `http://localhost:3000` → **Player A** 선택

#### 노트북B (클라이언트 역할)

```
.env:
  SIM_MODE=false
  SERIAL_PORT_B=COM3   ← 본인 아두이노 포트 (노트북B의 COM 번호)
  SERVER_IP=192.168.0.100  ← 노트북A의 IP
  PORT=3000
```

```bash
node server/index.js
# "릴레이 모드" 로 실행됨 — 시리얼 → WebSocket 중계
```

브라우저(노트북B): `http://192.168.0.100:3000` → **Player B** 선택

---

## 게임 모드

### 데스매치 (1v1 PvP)
- 두 플레이어가 1:1로 싸움
- **10킬** 선달성 또는 **5분** 후 킬 수 많은 쪽 승리
- 사망 시 **5초** 후 리스폰

### 협동 웨이브 (Co-op)
- 두 플레이어 협력해서 몬스터 웨이브를 막음
- 웨이브 N = 기본 `3 + N×2`마리
- **5웨이브마다 보스** (HP 500) 등장
- 둘 다 사망하면 게임 오버

### 생존 배틀 (PvPvE)
- 플레이어 + 몬스터 동시 존재
- 몬스터 처치 시 **힐 아이템** 드롭
- 상대방보다 먼저 처치하거나 **3분** 후 점수 높은 쪽 승리

---

## 무기 스펙

| 무기 | 데미지 | 연사 | 탄창 | 사거리 |
|------|--------|------|------|--------|
| AR (소총) | 25 | 0.12초 | 30 | 80 |
| SG (샷건) | 15×5탄 | 0.8초 | 8 | 20 |
| HG (권총) | 40 | 0.4초 | 15 | 60 |

---

## 아두이노 펌웨어 업로드

1. Arduino IDE 또는 VS Code + PlatformIO 설치
2. `arduino/controller/controller.ino` 열기
3. 보드: **Arduino UNO** 선택
4. 포트: 해당 COM 포트 선택
5. 업로드

업로드 후 시리얼 모니터(115200bps)에서 JSON 출력 확인:
```
{"lx":512,"ly":490,"rx":512,"ry":512,"l3":0,"r3":0,"b1":0,...}
```

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `serialport` 오류 | 아두이노 미연결 | `SIM_MODE=true`로 테스트 |
| 포트 열기 실패 | 잘못된 COM 번호 | 장치 관리자에서 포트 번호 확인 |
| 노트북B 연결 안 됨 | 방화벽 또는 IP 오류 | Windows 방화벽에서 포트 3000 허용 |
| 게임이 안 시작됨 | 두 플레이어 모두 ready 필요 | 로비에서 양쪽 다 모드 선택 후 시작 |

---

## 기술 스택

- **Node.js** + Express + ws + serialport + dotenv
- **Babylon.js 6.x** (CDN) — GLB 로더, ParticleSystem
- 순수 HTML/CSS/JS (빌드툴 없음)

---

## 모델 파일 구조

```
public/models/
├── character/
│   ├── Slash Advance (1).fbx.glb    ← Player A 기본 캐릭터
│   ├── Slash Advance (2).fbx.glb    ← Player B 기본 캐릭터
│   ├── Slash Advance (3).fbx.glb    ← 선택 캐릭터 #3
│   ├── Slash Advance (4).fbx.glb    ← 선택 캐릭터 #4
│   └── Slash Advance (5).fbx.glb    ← 선택 캐릭터 #5
├── weapons/
│   ├── Assault Rifle.glb
│   ├── Shotgun.glb
│   └── 9mm Pistol.glb
├── map/
│   └── map_ep_73.glb
└── animations/
    ├── Rifle Idle.fbx.glb
    ├── Walk Forward.fbx.glb
    ├── Rifle Run.fbx.glb
    ├── Firing Rifle.fbx.glb
    ├── Reload.fbx.glb
    ├── Dying.fbx.glb
    ├── Standing Melee Kick.fbx.glb
    ├── Hit Reaction.fbx.glb
    ├── Run Left.fbx.glb
    ├── Run Right.fbx.glb
    └── Backwards Rifle Run.fbx.glb
```

> 모델 파일이 없는 경우 자동으로 폴백 메시(캡슐/박스)가 사용됩니다.

---

## Railway 배포 방법

### 1. 사전 준비

```bash
# railway CLI 설치
npm install -g @railway/cli
railway login
```

### 2. 프로젝트 배포

```bash
cd game
railway init        # 새 프로젝트 생성
railway up          # 배포
```

### 3. 환경변수 설정 (Railway 대시보드)

```
PORT=3000
NODE_ENV=production
SIM_MODE=true
TICK_RATE=20
```

### 4. 로컬 아두이노 연결 (local/serialClient.js)

Railway 배포 후 로컬 아두이노를 연결하려면:

```bash
# local/.env 설정
RAILWAY_URL=wss://your-app.up.railway.app
SERIAL_PORT=COM3
PLAYER=A
SIM_MODE=false   # 실제 시리얼 사용 시

# 실행
node local/serialClient.js
```

- Player A 노트북: `PLAYER=A SERIAL_PORT=COM3 node local/serialClient.js`
- Player B 노트북: `PLAYER=B SERIAL_PORT=COM4 node local/serialClient.js`

`SIM_MODE=true`이면 아두이노 없이 더미 입력을 전송해 연결 테스트를 할 수 있습니다.
