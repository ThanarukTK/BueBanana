# cyd-reader — ESP32-2432S028 + PN532 NFC check-in/check-out reader

Firmware for the NFC boardgame café's hardware reader. Talks to the ElysiaJS
backend exactly as `docs/api-contract.md` §3 and `docs/api-convention.md` describe.

## Hardware
| Part | Model |
|---|---|
| Board | ESP32-2432S028 ("Cheap Yellow Display", 2.8" 320×240 TFT + XPT2046 touch) |
| NFC | PN532 module (set the DIP switch to **I2C** = "1 0") |

## Wiring (I2C)

| PN532 | CYD |
|---|---|
| VCC | 3V3 |
| GND | GND |
| SDA | GPIO 27 |
| SCL | GPIO 22 |
| RST / IRQ | leave unconnected (Adafruit lib polls; `-1`) |

> I2C is used because both of the CYD's SPI buses are consumed by the display
> (HSPI: 12/13/14/15/2) and touch (25/32/33/36/39), and the SD slot is on VSPI.

## Libraries (Arduino Library Manager)
- **Adafruit_PN532**
- **TFT_eSPI** (Bodmer) — then overwrite its `User_Setup.h` with the
  `User_Setup.h` in this folder (ILI9341 for original boards; ST7789 if colours
  are inverted/washed).
- **XPT2046_Touchscreen** (Paul Stoffregen)
- **WebSockets** (Markus Sattler) — gives `WebSocketsClient`
- **ArduinoJson** (Benoit Blanchon)

Board: **ESP32 Dev Module** (CPU 240 MHz WiFi/BT).

## On-device configure (no PC needed to set it up)
Every boot shows **"TAP SCREEN to Configure"** for 10 s:
- **Tap it** → Settings: **1. Wi-Fi** (SCAN → pick a network → type password, or
  pick an OPEN one) and **2. Base URL** (type the backend URL). Then
  **3. Save & Restart**.
- **Don't tap** → it boots straight into the reader (connects the saved Wi-Fi).
- Press the board's **RST/EN** button anytime to get back to the config screen.
- **First boot** has nothing saved, so it forces Settings automatically.

**Configuration via phone (softAP)** — the easiest way to set Wi-Fi + URL:
1. In Settings tap **SETUP VIA PHONE** (top button).
2. On your phone, join the board's hotspot **`CYD-SETUP`** (no password).
3. Open a browser to **`192.168.4.1`** (most phones auto-open the captive-portal page).
4. Fill in **Wi-Fi name, password, base URL** → **Save & Reboot**.
5. Board stores it in flash and restarts into the reader.

The on-screen keyboard (Settings → 1. Wi-Fi / 2. Base URL) remains as the offline
fallback. The softAP uses the ESP32's built-in `WebServer` + `DNSServer` (captive
portal), no extra libraries.

Saved settings live in the ESP32 flash (NVS `Preferences`) and survive power-off.
Only `DEVICE_KEY` is compile-time — edit `config.h` if it changes.


Wi-Fi SSID/pass and URL in `config.h` are **defaults for fresh boots only**; once
you save from Settings they're ignored.

## Register a real card
1. Flash + Serial Monitor (115200). Hold a card to the PN532 — it prints
   `Tap UID: 04A3B2C1D4`.
2. Register that **exact** uppercase-hex string as a tag in the backend
   (`POST /api/v1/nfc-tags` with `{"rawTagUid":"04A3B2C1D4","label":"..."}`
   and a staff token). Same string the reader hashes, so it must match.
3. Tap again → backend resolves the tag and opens/joins a session.

## How it works
- Each tap → `POST /api/v1/scans {"rawTagUid":"<hex>"}` + `X-Device-Key`.
- `data.screen`: `waiting` (new group) / `joined` / `group`.
- WebSocket `/ws/reader?deviceKey=...` pushes the freshest screen including
  `success` with the exact bill (`data.bill.amount` in **satang** → show `/100`).
- WS drops → polls `GET /api/v1/reader/state` (200 = render, 204 = nothing).
- Touching the "DISMISS" footer → `POST /api/v1/reader/dismiss` (clears the join
  window; not audited).
- 2 s local dedupe so a flaky tap doesn't spam the endpoint.

## Touch calibration
`mapX`/`mapY` in `cyd-reader.ino` are approximate
(`map(p.x,200,3700,…)` / `map(p.y,200,3800,…)`). If taps land off-target, read
raw `p.x`/`p.y` during a hold and adjust the two ranges.

## HTTPS (deploy)
DEV uses plain HTTP so it can hit your localhost backend. The real deployment is
HTTPS-only per `docs/rule.md` (PDPA). For a self-signed HTTPS backend add
`WiFiClientSecure` + store the server's CA cert (not yet wired in this version).
