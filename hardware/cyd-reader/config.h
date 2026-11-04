// cyd-reader configuration — EDIT ME for your environment
#pragma once

// ---- Defaults (real values are stored on the device via Settings; these are
//      used only on first boot until you save from the on-screen Settings) ----
const char* DEFAULT_BASE_URL = "https://buebanana.onrender.com";
const char* WIFI_SSID        = "YourWiFi";
const char* WIFI_PASS        = "YourPassword";
const char* DEVICE_KEY       = "dev-device-key";   // X-Device-Key header (match backend .env)

// ---- Boot behaviour ----
#define BOOT_CONFIG_TIMEOUT_S 10    // seconds of "Tap to configure" countdown

// ---- SoftAP phone config ----
const char* AP_SSID = "CYD-SETUP";   // hotspot the phone joins for provisioning
const char* AP_PASS = "";            // "" = open network (simplest for captive portal)

// ---- NFC tap timing ----
static const unsigned long SCAN_DEDUPE_MS = 2000UL;
static const unsigned long JOIN_WINDOW_MS = 30000UL;   // = backend 30s open-group join window
static const unsigned long NFC_PROBE_MS   = 5000UL;    // PN532 presence heartbeat interval

// ---- Buzzer (audio feedback) ----
// GPIO 26 IS the CYD-2432S028's ON-BOARD speaker amplifier pin — no external wiring
// needed if your board has its speaker populated (some units route it through a small
// 2-pin PicoBlade speaker connector). tone() on GPIO 26 drives the amp/speaker.
// Set BUZZER_PIN to -1 to disable audio if your board has no speaker fitted.
#define BUZZER_PIN (26)

// ---- PN532 (Adafruit_PN532, I2C) ----
#define PN532_IRQ    -1
#define PN532_RESET  -1
#define PN532_SDA    27
#define PN532_SCL    22

// ---- Touch (XPT2046 on the CYD, own SPI bus) ----
#define TOUCH_CS   33
#define TOUCH_CLK  25
#define TOUCH_MOSI 32
#define TOUCH_MISO 39

// ---- Serial ----
#define SERIAL_BAUD 115200
