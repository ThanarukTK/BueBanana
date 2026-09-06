# 🎲 NFC Boardgame Library — Web NFC Demo

A **plain HTML** pay-per-play timer demo that uses **Web NFC** (`navigator.nfc`) so an **Android phone** can:

- **Write** a unique **UUID** (+ optional label) to each NFC card.
- **Read** the card to **start a play timer**, and **stop it** to calculate the bill — **฿30/hour**, per-minute billing.

There are no boardgames — each card is simply a **user**, and every tap starts/stops that user's timer. All sessions are totaled per user in the **Users & Bills** panel.

No backend, no server code — it's a static site that persists demo data in `localStorage`.

## ✨ Features

| Mode | What it does |
|------|--------------|
| 🎮 **Play (timer)** | Tap **📲 Tap card**, then tap your card → your timer starts (you appear under **Now playing** with a live clock). Tap the same card again → the timer stops and the bill is calculated (**฿30/hour**, per-minute). |
| 💾 **Register Cards** | Type a UUID (or leave blank to auto-generate one) → tap a card → the UUID is written to it as an NDEF record. |
| 👥 **Users & Bills** | Every card UUID = one user. Shows each user's sessions, total play time, total cost, and an expandable session history. |

## ✅ Requirements

- An **Android phone** with **Chrome** (Web NFC is not supported on iPhone/iOS Safari).
- **NDEF-formattable** NFC tags (e.g. **NTAG213 / NTAG215 / NTAG216**, Mifare Ultralight). Most blank "NFC stickers" work.
- The page must be served over **HTTPS** (Web NFC only works in a secure context).

## 🚀 How to run it

You have a few options — pick the easiest for your demo.

### Option 1 — Host it free (easiest)

Drag & drop the folder onto any static host that gives free HTTPS:

- **GitHub Pages** / **Netlify Drop** / **Vercel** / **Cloudflare Pages**

Then open the URL in Chrome on your Android phone. Done.

### Option 2 — Local + `adb reverse` (no internet needed, USB connected)

1. Serve the folder on your computer:

   ```bash
   # any static server works, e.g.
   python -m http.server 8080
   ```

2. Connect your Android phone via USB (with USB debugging enabled) and forward the port:

   ```bash
   adb reverse tcp:8080 tcp:8080
   ```

3. On the phone, open Chrome and go to:

   ```
   http://localhost:8080
   ```

   `localhost` counts as a secure context, so Web NFC works without a real HTTPS cert.

### Option 3 — Tunnel to HTTPS

If you can't use USB, expose your local server over HTTPS:

```bash
npx localtunnel --port 8080   # or: cloudflared tunnel --url http://localhost:8080
```

Open the generated `https://…` URL on your phone.

## 🃏 Demo flow

1. Open the page in **Chrome on Android**.
2. Tap **💾 Register Cards**, tap a card against the phone → the card now has a UUID.
3. Repeat for as many cards as you want.
4. Tap **🎮 Play (timer)**, then tap **📲 Tap card**.
5. Tap your card → your timer starts and you appear under **⏱️ Now playing**.
6. Tap the same card again → the timer stops and the bill appears, e.g. **1h 25m · ฿42.50**, added to your totals in **👥 Users & Bills**.

Tap **↺ Reset demo** to wipe `localStorage` and start fresh.

## 📝 Notes & troubleshooting

- **"Web NFC unavailable"** → you're not on Android Chrome, or the page isn't HTTPS/localhost.
- **Permission prompt** → Chrome asks the first time; tap the card again to allow.
- **"Tag not NDEF-formattable"** → some tags (e.g. certain Mifare Classic cards) can't be written with Web NFC.
- **Data lives on the phone** (localStorage) — clearing browser data resets it. For a real deployment you'd add a small backend, but this is a self-contained demo.
- The card's own serial number (`serialNumber`) is *not* used as identity — we use the **UUID you write**, so it works the same across different tag brands.

## 🧱 Project structure

```
NFC_boardgame_reader/
├── index.html   # the page (games grid, modes, log)
├── style.css    # mobile-first styling
├── app.js       # Web NFC read/write + check-in/out logic
└── README.md    # this file
```
