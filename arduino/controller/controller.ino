/*
 * SensorWars TPS ─ Arduino UNO 컨트롤러 펌웨어
 * ────────────────────────────────────────────────────────────────
 *  핀 배치:
 *    조이스틱 L : VRX=A0, VRY=A1, SW=D2
 *    조이스틱 R : VRX=A2, VRY=A3, SW=D3
 *    버튼 A (점프/구르기)  D4
 *    버튼 B (발사)         D5
 *    버튼 X (재장전)       D6
 *    버튼 Y (조준 ADS)     D7
 *    버튼 LB (무기교체)    D8
 *    버튼 RB (수류탄)      D9
 *    진동모터 (PWM)        D13
 *
 *  ─── 조이스틱 방향 분석 ─────────────────────────────────────────
 *  조이스틱이 핀이 안쪽을 향하도록 장착됨 → VRX/VRY 역할 교체
 *
 *  왼쪽 조이스틱 (핀이 오른쪽=안쪽, 90° 시계방향 회전):
 *    물리 lx(엄지 좌우) ← A1(VRY)  반전 불필요
 *    물리 ly(엄지 전후) ← A0(VRX)  반전 불필요
 *
 *  오른쪽 조이스틱 (핀이 왼쪽=안쪽, 90° 반시계방향 회전):
 *    물리 rx(카메라 좌우) ← A3(VRY)  반전 불필요
 *    물리 ry(카메라 상하) ← A2(VRX)  ★반전 필요
 *      (엄지 위 → A2 증가 → ry=+1 → 카메라 아래쪽 → 역방향이므로 반전)
 *
 *  방향이 여전히 반대라면 아래 INVERT_* 주석 해제
 *  ─────────────────────────────────────────────────────────────────
 *
 *  PC → Arduino: {"vl":200,"duration":150}
 *  Arduino → PC: {"lx":..., "ly":..., ...} 50ms 간격
 */

// ═══ 방향 반전 설정 (반대이면 주석 해제) ════════════════════════════════════
// #define INVERT_LX
#define INVERT_LY   // 왼쪽 조이스틱 전후 반전 (핀 방향에 따라 ON)
// #define INVERT_RX
#define INVERT_RY   // 오른쪽 조이스틱 VRX → 카메라 상하 반전 (기본 ON)

// ═══ 핀 정의 ═════════════════════════════════════════════════════════════════
#define PIN_LJX    A0   // L 조이스틱 VRX → 물리 ly 원시값
#define PIN_LJY    A1   // L 조이스틱 VRY → 물리 lx 원시값
#define PIN_L3      2   // L 조이스틱 클릭 (달리기)
#define PIN_RJX    A2   // R 조이스틱 VRX → 물리 ry 원시값 (반전 후 사용)
#define PIN_RJY    A3   // R 조이스틱 VRY → 물리 rx 원시값
#define PIN_R3      3   // R 조이스틱 클릭 (근접공격)
#define PIN_BTN_A   4   // 점프/구르기
#define PIN_BTN_B   5   // 발사
#define PIN_BTN_X   6   // 재장전
#define PIN_BTN_Y   7   // 조준 ADS
#define PIN_LB      8   // 무기교체
#define PIN_RB      9   // 수류탄
#define PIN_VIBRATE 13  // 진동모터 PWM (UNO: D13은 디지털 전용이지만 analogWrite 가능)

// ═══ 동작 상수 ═══════════════════════════════════════════════════════════════
#define JOY_CENTER      512
#define JOY_DEADZONE     30   // ±30 이내면 중립
#define SEND_INTERVAL_MS 50   // 전송 주기 (ms)
#define DEBOUNCE_MS      10   // 버튼 디바운스 (ms)
#define RX_BUF_SIZE      80   // 수신 버퍼 크기

// ═══ 버튼 디바운스 ═══════════════════════════════════════════════════════════
struct BtnState {
  uint8_t       pin;
  bool          stable;    // 최종 확정 상태 (true = 눌림)
  bool          lastRaw;
  unsigned long lastEdge;
};

// 순서: L3, R3, A, B, X, Y, LB, RB
static BtnState g_btns[] = {
  { PIN_L3,     false, false, 0UL },
  { PIN_R3,     false, false, 0UL },
  { PIN_BTN_A,  false, false, 0UL },
  { PIN_BTN_B,  false, false, 0UL },
  { PIN_BTN_X,  false, false, 0UL },
  { PIN_BTN_Y,  false, false, 0UL },
  { PIN_LB,     false, false, 0UL },
  { PIN_RB,     false, false, 0UL },
};
static const uint8_t NUM_BTNS = sizeof(g_btns) / sizeof(g_btns[0]);

// 인덱스 별칭
enum BtnIdx { IDX_L3=0, IDX_R3, IDX_A, IDX_B, IDX_X, IDX_Y, IDX_LB, IDX_RB };

// ═══ 진동 상태 (non-blocking) ════════════════════════════════════════════════
static uint8_t        g_vibPower  = 0;
static unsigned long  g_vibEndMs  = 0UL;

// ═══ 전송 타이머 ═════════════════════════════════════════════════════════════
static unsigned long g_lastSendMs = 0UL;

// ═══ 수신 버퍼 ═══════════════════════════════════════════════════════════════
static char    g_rxBuf[RX_BUF_SIZE];
static uint8_t g_rxLen = 0;

// ─────────────────────────────────────────────────────────────────────────────
// 조이스틱 데드존 적용
// ─────────────────────────────────────────────────────────────────────────────
static int applyDeadzone(int raw) {
  return (abs(raw - JOY_CENTER) <= JOY_DEADZONE) ? JOY_CENTER : raw;
}

// ─────────────────────────────────────────────────────────────────────────────
// 버튼 디바운스 업데이트 (매 loop 호출)
// ─────────────────────────────────────────────────────────────────────────────
static void updateButtons(unsigned long now) {
  for (uint8_t i = 0; i < NUM_BTNS; i++) {
    bool raw = (digitalRead(g_btns[i].pin) == LOW); // PULLUP: LOW = 눌림 = true
    if (raw != g_btns[i].lastRaw) {
      g_btns[i].lastRaw  = raw;
      g_btns[i].lastEdge = now;
    }
    if ((now - g_btns[i].lastEdge) >= DEBOUNCE_MS) {
      g_btns[i].stable = g_btns[i].lastRaw;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 진동 업데이트 (non-blocking)
// ─────────────────────────────────────────────────────────────────────────────
static void updateVibration(unsigned long now) {
  if (g_vibPower > 0 && now >= g_vibEndMs) {
    analogWrite(PIN_VIBRATE, 0);
    g_vibPower = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 수신 JSON 파싱: {"vl":255,"duration":200}
// ─────────────────────────────────────────────────────────────────────────────
static void processRxLine() {
  // strstr로 키 위치 탐색 (ArduinoJSON 없이 직접 파싱)
  const char* pVL  = strstr(g_rxBuf, "\"vl\":");
  const char* pDur = strstr(g_rxBuf, "\"duration\":");
  if (!pVL) return;

  int vl  = constrain((int)atoi(pVL  + 5),  0,  255);
  int dur = pDur ? constrain((int)atoi(pDur + 11), 1, 10000) : 200;

  g_vibPower = (uint8_t)vl;
  g_vibEndMs = millis() + (unsigned long)dur;
  analogWrite(PIN_VIBRATE, g_vibPower);
}

// ─────────────────────────────────────────────────────────────────────────────
// 시리얼 수신 처리 (non-blocking, '\n' 단위로 파싱)
// ─────────────────────────────────────────────────────────────────────────────
static void readSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (g_rxLen > 0) {
        g_rxBuf[g_rxLen] = '\0';
        processRxLine();
        g_rxLen = 0;
      }
    } else {
      if (g_rxLen < (uint8_t)(RX_BUF_SIZE - 1)) {
        g_rxBuf[g_rxLen++] = c;
      } else {
        g_rxLen = 0; // 버퍼 오버플로 방지: 초기화
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON 전송
// ─────────────────────────────────────────────────────────────────────────────
static void sendState() {
  // ── 조이스틱 읽기 (X/Y 교체 적용) ──────────────────────────────
  // 왼쪽: 물리 lx ← A1(VRY), 물리 ly ← A0(VRX)
  int lx = applyDeadzone(analogRead(PIN_LJY));  // A1
  int ly = applyDeadzone(analogRead(PIN_LJX));  // A0
  // 오른쪽: 물리 rx ← A3(VRY), 물리 ry ← A2(VRX)
  int rx = applyDeadzone(analogRead(PIN_RJY));  // A3
  int ry = applyDeadzone(analogRead(PIN_RJX));  // A2

  // ── 방향 반전 (필요한 것만 #define으로 활성화) ──────────────────
#ifdef INVERT_LX
  lx = 1023 - lx;
#endif
#ifdef INVERT_LY
  ly = 1023 - ly;
#endif
#ifdef INVERT_RX
  rx = 1023 - rx;
#endif
#ifdef INVERT_RY
  ry = 1023 - ry;
#endif

  // ── 전송 (F() 매크로로 Flash 저장 → SRAM 절약) ─────────────────
  Serial.print(F("{\"lx\":"));  Serial.print(lx);
  Serial.print(F(",\"ly\":"));  Serial.print(ly);
  Serial.print(F(",\"rx\":"));  Serial.print(rx);
  Serial.print(F(",\"ry\":"));  Serial.print(ry);
  Serial.print(F(",\"l3\":"));  Serial.print(g_btns[IDX_L3].stable ? 1 : 0);
  Serial.print(F(",\"r3\":"));  Serial.print(g_btns[IDX_R3].stable ? 1 : 0);
  Serial.print(F(",\"ba\":"));  Serial.print(g_btns[IDX_A ].stable ? 1 : 0);
  Serial.print(F(",\"bb\":"));  Serial.print(g_btns[IDX_B ].stable ? 1 : 0);
  Serial.print(F(",\"bx\":"));  Serial.print(g_btns[IDX_X ].stable ? 1 : 0);
  Serial.print(F(",\"by\":"));  Serial.print(g_btns[IDX_Y ].stable ? 1 : 0);
  Serial.print(F(",\"lb\":"));  Serial.print(g_btns[IDX_LB].stable ? 1 : 0);
  Serial.print(F(",\"rb\":"));  Serial.print(g_btns[IDX_RB].stable ? 1 : 0);
  Serial.println(F("}"));
}

// ═════════════════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);

  // 버튼 핀: INPUT_PULLUP
  for (uint8_t i = 0; i < NUM_BTNS; i++) {
    pinMode(g_btns[i].pin, INPUT_PULLUP);
  }

  // 진동모터 핀
  pinMode(PIN_VIBRATE, OUTPUT);
  analogWrite(PIN_VIBRATE, 0);

  // 시작 진동 확인 (120ms)
  g_vibPower = 180;
  g_vibEndMs = millis() + 120UL;
  analogWrite(PIN_VIBRATE, 180);
}

void loop() {
  unsigned long now = millis();

  updateButtons(now);
  readSerial();
  updateVibration(now);

  if (now - g_lastSendMs >= SEND_INTERVAL_MS) {
    g_lastSendMs = now;
    sendState();
  }
}
