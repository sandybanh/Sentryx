#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// ===================== WIFI / SUPABASE =====================
const char* WIFI_SSID = "Me";
const char* WIFI_PASS = "raspberrypi";

// IMPORTANT: your function slug must match
const char* EDGE_URL = "https://gfssxiaheyggldwntkuw.supabase.co/functions/v1/ingest-sensor";

// MUST be your real anon key (Project Settings -> API -> anon public)
const char* SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";

// Your edge function checks x-device-secret header against env DEVICE_SECRET
const char* DEVICE_SECRET = "esp32_secret_12345";
const char* DEVICE_ID     = "esp32-01";

// ===================== SENSOR PINS =====================
#define PIR_PIN   27
#define TRIG_PIN  5
#define ECHO_PIN  18

// ===================== HARDWIRED OUTPUT PINS =====================
// Choose two FREE GPIOs on the SENDER (avoid 0,2,12,15 for boot-straps if possible)
#define MOTION_OUT_PIN 25   // outputs motion (PIR boolean)
#define ULTRA_OUT_PIN  26   // outputs ultra_close boolean

// ===================== SETTINGS =====================
const int CLOSE_CM = 20;

const unsigned long PIR_HOLD_MS       = 5000;   // motion stays 1 for 5s after trigger
const unsigned long POST_COOLDOWN_MS  = 1500;
const unsigned long HEARTBEAT_MS      = 1000;

const unsigned long ULTRA_TIMEOUT_US  = 12000;  // shorter timeout (less blocking)

unsigned long motionUntil = 0;
unsigned long lastPostMs  = 0;
unsigned long lastBeatMs  = 0;

int lastSentMotion = 0;
int lastSentUltra  = 0;

int failCount = 0;

// ---------------- WiFi keep-alive ----------------
void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println("WiFi dropped. Reconnecting...");
  WiFi.disconnect(true);
  delay(200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 8000) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi OK. IP=");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi still not connected.");
  }
}

// ---------------- Ultrasonic read (cm) ----------------
int readDistanceCmOnce() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long dur = pulseIn(ECHO_PIN, HIGH, ULTRA_TIMEOUT_US);
  if (dur == 0) return -1;

  float cm = (dur * 0.0343f) / 2.0f;
  int d = (int)(cm + 0.5f);
  if (d <= 0 || d > 400) return -1;
  return d;
}

// ---------------- Supabase POST ----------------
bool postToSupabase(int motion, int ultra_close) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, EDGE_URL)) {
    Serial.println("HTTP begin failed");
    return false;
  }

  http.addHeader("Content-Type", "application/json");

  // These headers prevent common 401 "Unauthorized" / "Missing authorization"
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);

  // Your custom header checked by the function code
  http.addHeader("x-device-secret", DEVICE_SECRET);

  String payload = "{";
  payload += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  payload += "\"motion\":" + String(motion) + ",";
  payload += "\"ultra_close\":" + String(ultra_close);
  payload += "}";

  int code = http.POST(payload);
  String resp = http.getString();
  http.end();

  Serial.print("POST code: ");
  Serial.println(code);
  Serial.print("Resp: ");
  Serial.println(resp);

  return (code >= 200 && code < 300);
}

void setup() {
  Serial.begin(115200);
  delay(300);

  // PIR: use pulldown to avoid floating/stuck HIGH (recommended)
  pinMode(PIR_PIN, INPUT_PULLDOWN);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  // Hardwired boolean outputs
  pinMode(MOTION_OUT_PIN, OUTPUT);
  pinMode(ULTRA_OUT_PIN, OUTPUT);
  digitalWrite(MOTION_OUT_PIN, LOW);
  digitalWrite(ULTRA_OUT_PIN, LOW);

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); // helps prevent dropouts

  ensureWiFi();
}

void loop() {
  // heartbeat so you know it's not frozen
  if (millis() - lastBeatMs >= HEARTBEAT_MS) {
    lastBeatMs = millis();
    Serial.print("alive wifi=");
    Serial.println(WiFi.status() == WL_CONNECTED ? "1" : "0");
  }

  ensureWiFi();

  // -------- PIR -> motion (with hold) --------
  int pirRaw = digitalRead(PIR_PIN);
  if (pirRaw == 1) motionUntil = millis() + PIR_HOLD_MS;
  int motion = (millis() < motionUntil) ? 1 : 0;

  // -------- Ultrasonic -> ultra_close --------
  int dist = readDistanceCmOnce();
  int ultra_close = (dist > 0 && dist < CLOSE_CM) ? 1 : 0;

  // HARDWIRED OUTPUTS (send booleans to other ESP via wires)
  digitalWrite(MOTION_OUT_PIN, motion ? HIGH : LOW);
  digitalWrite(ULTRA_OUT_PIN, ultra_close ? HIGH : LOW);

  // Print just the 2 booleans
  Serial.print(motion);
  Serial.print(",");
  Serial.println(ultra_close);

  // Only POST when something is true, rate limited, and changed
  bool shouldSend = (motion == 1 || ultra_close == 1);
  bool cooldownOk = (millis() - lastPostMs) >= POST_COOLDOWN_MS;
  bool changed = (motion != lastSentMotion) || (ultra_close != lastSentUltra);

  if (shouldSend && cooldownOk && changed && WiFi.status() == WL_CONNECTED) {
    bool ok = postToSupabase(motion, ultra_close);
    lastPostMs = millis();

    if (ok) {
      lastSentMotion = motion;
      lastSentUltra  = ultra_close;
      failCount = 0;
    } else {
      failCount++;
      if (failCount >= 5) {
        Serial.println("Too many POST fails. Resetting WiFi...");
        WiFi.disconnect(true);
        delay(300);
        failCount = 0;
      }
    }
  }

  delay(200);
}
