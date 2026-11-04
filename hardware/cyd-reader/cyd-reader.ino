/******************************************************************************
 * cyd-reader.ino — NFC check-in/check-out reader for the NFC boardgame café
 *                  + on-device Settings (scan Wi-Fi / connect + password / URL)
 *
 * Hardware : ESP32-2432S028 "Cheap Yellow Display" (2.8" TFT + XPT2046 touch)
 *            + PN532 NFC on I2C (DIP switch = I2C, "1 0")
 * Backend : ElysiaJS  (docs/api-contract.md §3)
 *    tap   -> POST /api/v1/scans      {"rawTagUid":"<hex>"}  + X-Device-Key
 *    touch -> POST /api/v1/reader/dismiss
 *    push  -> WS  /ws/reader?deviceKey=<key>   (fallback: GET /reader/state)
 *
 * EVERY BOOT shows "Tap to Configure" for BOOT_CONFIG_TIMEOUT_S seconds.
 *    tap within the window       -> Settings (Wi-Fi scan/connect, set URL)
 *    no tap / first boot         -> normal reader run  (first boot auto-enters Settings)
 * Press the board's RST/EN button anytime to come back to this screen.
 *
 * LIBRARIES (Library Manager):
 *   Adafruit_PN532, TFT_eSPI (Bodmer - overwrite its User_Setup.h with ours),
 *   XPT2046_Touchscreen (Paul Stoffregen), WebSockets (Markus Sattler),
 *   ArduinoJson (Benoit Blanchon)
 * Board: ESP32 Dev Module (CPU 240 MHz WiFi/BT).
 ******************************************************************************/

// NOTE: WebServer/FS/DNSServer MUST be included BEFORE TFT_eSPI.h. TFT_eSPI
// (SMOOTH_FONT) defines FS_NO_GLOBALS, which hides the global `FS` type that
// WebServer.h needs — including order fixes it.
#include <Arduino.h>
#include <FS.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <SPI.h>
#include <Wire.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Adafruit_PN532.h>
#include <WebSocketsClient.h>
#include <Preferences.h>

#include "config.h"

// ---- Devices ----
TFT_eSPI   tft = TFT_eSPI();
SPIClass   touchSPI(HSPI);                       // touch on its own SPI bus/pins
XPT2046_Touchscreen ts(TOUCH_CS);                // no IRQ pin (input-only GPIO36/unreliable)
Adafruit_PN532 nfc(PN532_IRQ, PN532_RESET);
WebSocketsClient ws;
Preferences prefs;
WebServer  apServer(80);     // softAP phone-config web server
DNSServer  dnsServer;

// ---- Persisted settings (NVS flash) ----
String configSSID, configPass, configUrl;

// ---- Runtime state ----
bool wifiOk = false, nfcOk = false, wsConnected = false, firstRun = false;
bool readerReady = false;               // true once both NFC + Wi-Fi are up and taps are served
String lastUid; unsigned long lastTapMs = 0;
String lastApUid;                       // last UID read during softAP setup (for phone-page registration)
bool checkInActive = false; unsigned long checkInUntil = 0;
static bool _nfcErrPrinted = false;

// ===========================================================================
// Touch helpers (XPT2046 raw -> 320x240; adjust the map ranges if taps drift)
// ===========================================================================
static int mapX(const TS_Point& p){ return map(p.x, 200, 3700, 0, 320); }
static int mapY(const TS_Point& p){ return map(p.y, 200, 3800, 0, 240); }
static bool inRect(const TS_Point& p, int x0,int y0,int x1,int y1){
  int x=mapX(p), y=mapY(p);
  return x>=x0 && x<=x1 && y>=y0 && y<=y1;
}
static TS_Point waitForTap(){          // block until a NEW press, then its release
  unsigned long r0=millis();
  while(ts.touched()){ if(millis()-r0>800) break; delay(5); }  // wait out stuck-high
  while(!ts.touched()) delay(5);
  TS_Point p = ts.getPoint();
  unsigned long r1=millis();
  while(ts.touched()){ if(millis()-r1>800) break; delay(5); }  // bounded release
  return p;
}

// ===========================================================================
// Small UI primitives
// ===========================================================================
static void uiHeader(const char* title){
  tft.fillScreen(TFT_BLACK);
  tft.fillRect(0,0,320,24,TFT_NAVY);
  tft.setTextColor(TFT_WHITE); tft.setTextSize(2);
  tft.setCursor(8,4); tft.print(title);
}
static void uiButton(const char* label,int x0,int y0,int x1,int y1,uint16_t c){
  tft.fillRect(x0,y0,x1-x0,y1-y0,c);
  tft.setTextColor(TFT_BLACK); tft.setTextSize(2);
  int wlen=(int)strlen(label)*16;
  tft.setCursor(x0+((x1-x0)-wlen)/2, y0+((y1-y0)-16)/2);
  tft.print(label);
}
static void uiFlash(const char* msg){
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_GREEN); tft.setTextSize(2);
  tft.setCursor(12,108); tft.print(msg);
  delay(1400);
}
static void drawKeyRow(const char* chars,int n,int x,int y,int w,int h, bool shift=false){
  for(int i=0;i<n;i++){
    uint16_t bc = TFT_DARKGREY;
    if(chars[i]==' '){ bc = TFT_NAVY; }        // space bar tint
    if(chars[i]=='\x01'){ bc = TFT_ORANGE; }   // DEL key tint
    tft.fillRect(x+i*w, y, w-2, h-2, bc);
    tft.setTextColor(TFT_WHITE); tft.setTextSize(2);
    char ch = chars[i];
    if(ch>='a' && ch<='z' && shift) ch -= ('a'-'A');   // show shifted (uppercase) label
    tft.setCursor(x+i*w+((w-14)/2), y+(h-18)/2);
    tft.print(ch);
  }
  (void)shift;
}

// Expandable on-screen keyboard.
//   buf      : mutable input buffer (in/out)
//   maxLen   : buffer size (incl. NUL) - max chars = maxLen-1
//   dot      : true = password field (masked), with a show/hide toggle control
// Returns true  -> user pressed OK; buf holds the text.
//         false -> user pressed CANCEL (buf unchanged / partial).
static bool showKeyboard(char* buf,int maxLen,bool dot){
  const char* u1="ABCDEFGHIJKL";   // 12  A-L
  const char* l1="abcdefghijkl";
  const char* u2="MNOPQRSTUVWX";   // 12  M-X
  const char* l2="mnopqrstuvwx";
  const char* yz ="YZ1234567890";  // 12  Y Z + 0-9 (includes 0 and 9)
  const char* sy ="-_./:@#%&+=?";  // 12  symbols (space is the SPACE key below)
  const int KW=26;
  bool shift=false, showPw=false;
  const int ky=66;                                 // first char row Y
  for(;;){
    uiHeader("ENTER TEXT");
    // ---- input field (tall, right-scrolled) ----
    int fx=2,fy=28,fw=316,fh=30;
    tft.fillRect(fx,fy,fw,fh,TFT_BLUE);
    String disp;
    if(dot && !showPw){ for(size_t i=0;i<strlen(buf);i++) disp+="*"; disp+="_"; }
    else disp=String(buf)+"_";
    int maxChars=(fw-12)/16;
    if((int)disp.length()>maxChars) disp=disp.substring(disp.length()-maxChars);
    tft.setTextColor(TFT_WHITE); tft.setTextSize(2);
    tft.setCursor(fx+6,fy+7); tft.print(disp);
    tft.setTextSize(1); tft.setTextColor(TFT_CYAN);
    tft.setCursor(fx+6,fy+fh+2); tft.print(dot?"Password":"Text");

    // ---- 4 character rows (12 columns each) ----
    const char* r0 = shift?u1:l1;
    const char* r1 = shift?u2:l2;
    drawKeyRow(r0,12,2,ky,   KW,28);
    drawKeyRow(r1,12,2,ky+29,KW,28);
    drawKeyRow(yz,12,2,ky+58,KW,28);
    drawKeyRow(sy,12,2,ky+87,KW,28);

    // ---- action row: 6 slots, width 52 ----
    int ay=184, aw=52;
    const char* labels[6]={"SHIFT","SPACE","DEL","CANCEL","OK", dot?(showPw?"HIDE":"SHOW"):""};
    uint16_t colors[6]={TFT_NAVY,TFT_NAVY,TFT_ORANGE,TFT_RED,TFT_GREEN,TFT_NAVY};
    for(int i=0;i<6;i++){
      int x=2+i*aw;
      tft.fillRect(x,ay,aw-2,26,colors[i]);
      if(labels[i][0]){
        tft.setTextColor(TFT_BLACK); tft.setTextSize(2);
        int wlen=(int)strlen(labels[i])*16;
        tft.setCursor(x+(aw-wlen)/2, ay+(26-16)/2); tft.print(labels[i]);
      }
    }

    TS_Point p=waitForTap();
    int ax=(mapX(p)-2)/aw;
    bool inAction=(mapY(p)>=ay && mapY(p)<ay+26);
    if(inAction){
      switch(ax){
        case 0: shift=!shift; continue;                       // SHIFT
        case 1: if((int)strlen(buf)<maxLen-1){buf[strlen(buf)]=' ';buf[strlen(buf)+1]=0;} continue; // SPACE
        case 2: { size_t l=strlen(buf); if(l)buf[l-1]=0; continue; }   // DEL
        case 3: return false;                                 // CANCEL
        case 4: return true;                                  // OK
        case 5: if(dot){ showPw=!showPw; continue; } break;   // SHOW/HIDE
      }
      continue;
    }
    // ---- char keys ----
    int row=(mapY(p)-ky)/29, col=(mapX(p)-2)/KW;
    if(row<0||row>3||col<0||col>11) continue;
    char c=0;
    if(row==0)      c=(shift?u1:l1)[col];
    else if(row==1) c=(shift?u2:l2)[col];
    else if(row==2) c=yz[col];
    else if(row==3) c=sy[col];
    if(c && (int)strlen(buf)<maxLen-1){
      buf[strlen(buf)]=c; buf[strlen(buf)+1]=0;
      if(shift && (row==0||row==1)) shift=false;   // auto-release shift after a letter
    }
  }
}
// ===========================================================================
// Wi-Fi settings
// ===========================================================================
// Run an async Wi-Fi scan with a live "Scanning..." indicator on the TFT.
static int scanWithIndicator(){
  uiHeader("Wi-Fi");
  tft.setTextColor(TFT_YELLOW); tft.setTextSize(2);
  tft.setCursor(10,60); tft.print("Scanning");
  WiFi.scanNetworks(true);               // async; returns immediately
  unsigned long t0=millis(); int dot=0;
  while(WiFi.scanComplete()<0){
    if(millis()-t0>10000){ WiFi.scanDelete(); break; }   // safety timeout
    tft.fillRect(150,60,90,26,TFT_BLACK);
    String d=""; for(int i=0;i<dot;i++) d+=".";
    tft.setTextColor(TFT_YELLOW); tft.setTextSize(3);
    tft.setCursor(150,58); tft.print(d);
    dot=(dot+1)%4; delay(180);
  }
  int n = (WiFi.scanComplete()>=0) ? WiFi.scanComplete() : 0;
  if(n<0)n=0; if(n>32)n=32;
  return n;
}

static void settingsWifi(){
  String ssids[32]; bool openNet[32]; int n=0, off=0;
  n = scanWithIndicator();               // auto-scan on entry (shows the spinner)
  for(int i=0;i<n;i++){ ssids[i]=WiFi.SSID(i); openNet[i]=(WiFi.encryptionType(i)==WIFI_AUTH_OPEN); }
  for(;;){
    uiHeader("Wi-Fi");
    uiButton("BACK", 2, 28,100,54,TFT_RED);        // -> main settings menu
    uiButton("SCAN",220,28,318,54,TFT_NAVY);        // -> rescan
    tft.setTextColor(TFT_YELLOW); tft.setTextSize(1);
    tft.setCursor(106,36); tft.print("Found: "+String(n));
    tft.setCursor(4,58); tft.print("(tap a network)");

    if(n>0){
      int rows=min(n-off,7);
      for(int i=0;i<rows;i++){
        int idx=off+i; int y=66+i*20;
        tft.fillRect(22,y,294,18,TFT_DARKGREY);
        tft.setTextColor(TFT_WHITE); tft.setTextSize(1);
        tft.setCursor(26,y+4); tft.print(ssids[idx]);
        tft.setTextColor(openNet[idx]?TFT_GREEN:TFT_ORANGE);
        tft.setCursor(300,y+4); tft.print(openNet[idx]?"OPEN":"LOCK");
      }
      if(off>0)  uiButton("^",2,66,20,130,TFT_NAVY);
      if(off+7<n)uiButton("v",2,160,20,206,TFT_NAVY);
    }
    TS_Point p=waitForTap();
    if(inRect(p,2,28,100,54)) return;               // BACK -> main settings menu
    if(inRect(p,220,28,318,54)){
      n=scanWithIndicator();
      for(int i=0;i<n;i++){ ssids[i]=WiFi.SSID(i); openNet[i]=(WiFi.encryptionType(i)==WIFI_AUTH_OPEN); }
      off=0; continue;
    }
    if(inRect(p,2,66,20,130)){ if(off>0)off--; continue; }
    if(inRect(p,2,160,20,206)){ if(off+7<n)off++; continue; }
    int rowY=(mapY(p)-66)/20;
    bool inList = inRect(p,22,66,316,66+min(n-off,7)*20);
    if(inList && rowY>=0 && rowY<min(n-off,7)){
      int idx=off+rowY;
      if(openNet[idx]){
        configSSID=ssids[idx]; configPass="";
        saveSettings(); uiFlash("OPEN NETWORK SET");
        return;
      } else {
        char pw[64]="";
        if(showKeyboard(pw,63,true)){ configSSID=ssids[idx]; configPass=String(pw); saveSettings(); uiFlash("Wi-Fi SET"); return; }
        continue;                                   // CANCEL -> back to list
      }
    }
  }
}
// ===========================================================================
// Base URL settings
// ===========================================================================
static void settingsUrl(){
  char url[160];
  strncpy(url, configUrl.c_str(), 156); url[156]=0;
  if(showKeyboard(url,156,false)){
    configUrl=String(url);
    saveSettings();
    uiFlash("URL SET");
  }
}

// HTML-escape a config value so it can't break out of the form fields.
static String htmlEscape(const String& v){
  String o=v; o.replace("&","&amp;"); o.replace("\"","&quot;"); o.replace("<","&lt;"); o.replace(">","&gt;");
  return o;
}

// SoftAP phone config: board becomes a hotspot (CYD-SETUP), you open 192.168.4.1
// in the phone browser, fill Wi-Fi + URL, press Save -> stored to NVS -> reboot.
static bool initNfc();                          // defined later in the reader section
static String uidToHex(const uint8_t* uid,uint8_t len);
static void addPendingReg(const String& uid,const char* label);

static void apSetup(){
  if(!nfcOk) initNfc();                         // PN532 works in AP mode too (I2C, no network needed)
  WiFi.mode(WIFI_AP);
  if(!WiFi.softAP(AP_SSID, AP_PASS)){
    renderError("AP start failed");
    return;
  }
  delay(200);
  IPAddress ip = WiFi.softAPIP();
  dnsServer.start(53, "*", ip);          // captive-portal: answer any hostname with the AP IP

  apServer.on("/", HTTP_GET, [](){
    String page = String(F("<html><head><meta charset='utf-8'>"
      "<meta name='viewport' content='width=device-width,initial-scale=1'>"
      "<title>CYD Reader Setup</title><style>"
      "body{font-family:system-ui,sans-serif;max-width:420px;margin:24px auto;padding:0 14px;color:#222}"
      "h2{border-bottom:2px solid #eee;padding-bottom:8px}"
      ".field{margin:14px 0}label{display:block;font-weight:600;margin-bottom:5px}"
      "input{width:100%;box-sizing:border-box;padding:11px;font-size:16px;border:1px solid #ccc;border-radius:6px}"
      "button{width:100%;padding:13px;font-size:18px;background:#2e7d32;color:#fff;border:0;border-radius:6px;margin-top:12px;font-weight:600}"
      ".small{color:#777;font-size:13px;margin-top:16px}</style></head><body>"
      "<h2>Reader Setup</h2>"
      "<form method='POST' action='/save'>"
      "<div class='field'><label>Wi-Fi name (SSID)</label>"
      "<input name='ssid' value='SSID_VAL' required></div>"
      "<div class='field'><label>Wi-Fi password</label>"
      "<input type='password' name='pass' value='PASS_VAL' id='pw'>"
      "<label style='font-weight:400;margin:6px 0 0;display:inline-flex;align-items:center;gap:6px'>"
      "<input type='checkbox' id='pwshow' onchange=\"document.getElementById('pw').type=this.checked?'text':'password'\"> "
      "Show password</label></div>"
      "<div class='field'><label>Base URL</label>"
      "<input name='url' value='URL_VAL' placeholder='http://192.168.1.100:8080'></div>"
      "<button type='submit'>Save &amp; Reboot</button>"
      "</form>"
      "<p class='small'>Leave the URL blank to keep the current value. "
      "The reader restarts into normal mode after saving.</p>"
      "<h2>Register a card</h2>"
      "<p class='small'>Tap a card on the reader now. Last card: <b id='uid'>(none)</b></p>"
      "<form method='POST' action='/savecard'>"
      "<div class='field'><label>Card name (optional)</label>"
      "<input name='name' placeholder='e.g. Nut'></div>"
      "<button type='submit'>Save card</button></form>"
      "<p class='small'>Cards are queued and sync to the backend on next boot.</p>"
      "<script>"
      "async function tick(){try{const r=await fetch('/lastcard');document.getElementById('uid').textContent=await r.text();}catch(e){}}"
      "setInterval(tick,1500);tick();"
      "</script>"
      "</body></html>"));
    page.replace("SSID_VAL", htmlEscape(configSSID));
    page.replace("PASS_VAL", htmlEscape(configPass));
    page.replace("URL_VAL",  htmlEscape(configUrl));
    apServer.send(200, "text/html", page);
  });

  apServer.on("/save", HTTP_POST, [](){
    if(apServer.hasArg("ssid") && apServer.arg("ssid").length()>0){
      configSSID = apServer.arg("ssid");
      configPass = apServer.arg("pass");
      String u = apServer.arg("url");
      if(u.length()>0) configUrl = u;
      saveSettings();
    }
    apServer.send(200, "text/html",
      "<html><body style='font-family:sans-serif;text-align:center;margin-top:80px'>"
      "<h2>Saved ✓</h2><p>Rebooting the reader...</p></body></html>");
    delay(1500);
    ESP.restart();
  });

  apServer.on("/lastcard", HTTP_GET, [](){
    apServer.send(200, "text/plain", lastApUid.length() ? lastApUid : String("(none)"));
  });

  apServer.on("/savecard", HTTP_POST, [](){
    if(lastApUid.length()==0){
      apServer.send(200, "text/html",
        "<html><body style='font-family:sans-serif;text-align:center;margin-top:60px'>"
        "<h2>No card tapped yet</h2><p>Tap a card on the reader, then try again.</p>"
        "<p><a href='/'>Back</a></p></body></html>");
      return;
    }
    String name = apServer.hasArg("name") ? apServer.arg("name") : "";
    addPendingReg(lastApUid, name.length() ? name.c_str() : (const char*)0);
    String msg = "<html><body style='font-family:sans-serif;text-align:center;margin-top:60px'>"
      "<h2>Card saved ✓</h2><p>UID: " + lastApUid + "</p>"
      "<p>Queued to sync to the backend on next boot.</p>"
      "<p><a href='/'>Back / tap another card</a></p></body></html>";
    apServer.send(200, "text/html", msg);
  });

  apServer.begin();

  // Tell the user where to go.
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_YELLOW); tft.setTextSize(2);
  tft.setCursor(14,14); tft.println("PHONE SETUP");
  tft.setTextColor(TFT_WHITE); tft.setTextSize(1);
  tft.setCursor(14,52); tft.println("1. On your phone, join WiFi:");
  tft.setTextColor(TFT_CYAN); tft.setTextSize(2);
  tft.setCursor(14,70); tft.println(AP_SSID);
  tft.setTextColor(TFT_WHITE); tft.setTextSize(1);
  tft.setCursor(14,104); tft.println("2. Open the browser to:");
  tft.setTextColor(TFT_CYAN); tft.setTextSize(2);
  tft.setCursor(14,122); tft.print(ip);
  tft.setTextColor(TFT_WHITE); tft.setTextSize(1);
  tft.setCursor(14,158); tft.println("Fill WiFi + URL, tap Save.");
  tft.setCursor(14,176); tft.println("Tap a card to register it.");
  tft.setTextColor(TFT_DARKGREY);
  tft.setCursor(14,210); tft.println("touch [CANCEL] to leave");
  tft.fillRect(214,200,104,34,TFT_RED);
  tft.setTextColor(TFT_BLACK); tft.setTextSize(2);
  tft.setCursor(224,207); tft.print("CANCEL");

  // Serve requests until the phone saves (which reboots) or the user cancels.
  while(true){
    dnsServer.processNextRequest();
    apServer.handleClient();
    // Read a card for phone-page registration (PN532 works in AP mode).
    if(nfcOk){
      uint8_t uid[]={0,0,0,0,0,0,0}; uint8_t uidLen=0;
      if(nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A,uid,&uidLen,80)){
        String h=uidToHex(uid,uidLen);
        if(h.length() && h!=lastApUid){ lastApUid=h; Serial.print("AP REG UID: "); Serial.println(h); }
      }
    }
    if(ts.touched()){
      TS_Point p=ts.getPoint();
      if(inRect(p,214,200,318,234)){          // CANCEL -> back to Settings
        WiFi.softAPdisconnect(true);
        apServer.stop(); dnsServer.stop();
        WiFi.mode(WIFI_STA);
        return;
      }
    }
    delay(5);
  }
}

// ===========================================================================
// Main settings menu
// ===========================================================================
static void registerCardMode();   // defined later (needs uidToHex / renderError)

static void runSettings(){
  for(;;){
    uiHeader("SETTINGS");
    uiButton("SETUP VIA PHONE",20, 28,300, 66,TFT_GREEN);
    uiButton("1. Wi-Fi",        20, 70,300,108,TFT_BLUE);
    uiButton("2. Base URL",     20,112,300,150,TFT_BLUE);
    uiButton("3. Register card",20,154,300,192,TFT_ORANGE);
    uiButton("4. Save & Restart",20,196,300,234,TFT_GREEN);

    TS_Point p=waitForTap();
    if(inRect(p,20,28,300,66))         apSetup();
    else if(inRect(p,20,70,300,108))   settingsWifi();
    else if(inRect(p,20,112,300,150))  settingsUrl();
    else if(inRect(p,20,154,300,192))  registerCardMode();
    else if(inRect(p,20,196,300,234)){ saveSettings(); ESP.restart(); }
  }
}
// ===========================================================================
// Boot "Tap to Configure" countdown
// ===========================================================================
// Boot "Tap & hold to Configure" — the gate into Settings is DELIBERATE: a quick
// casual tap (e.g. a customer touching the screen) must never open the config menu.
// Only a sustained ~3s press enters Settings. Any short touch just falls through
// to normal reader boot. (On first run, setup() forces Settings anyway.)
// ===========================================================================
static void bootConfigScreen(){
  const unsigned long HOLD_MS = 3000;
  for(int s=BOOT_CONFIG_TIMEOUT_S; s>0; s--){
    tft.fillScreen(TFT_BLACK);
    tft.setTextColor(TFT_YELLOW); tft.setTextSize(3);
    tft.setCursor(20,30); tft.print("HOLD SCREEN");
    tft.setTextSize(2); tft.setCursor(20,70); tft.print("3s to Configure");
    tft.setTextColor(TFT_CYAN); tft.setTextSize(1);
    tft.setCursor(20,120); tft.print("hold your finger on the screen");
    tft.setTextSize(1); tft.setCursor(20,140); tft.print("(quick taps just start the reader)");
    tft.setTextColor(TFT_DARKGREY); tft.setTextSize(1);
    tft.setCursor(20,190); tft.print("Auto-start in ");
    tft.setTextColor(TFT_CYAN); tft.print(String(s)+" s");
    unsigned long end=millis()+1000;
    bool prev=false;
    while(millis()<end){
      bool now=ts.touched();
      if(now && !prev){                     // rising edge: a press began this window
        unsigned long d0=millis(); bool heldLong=false;
        while(ts.touched()){ if(millis()-d0>HOLD_MS){ heldLong=true; break; } delay(5); }
        if(heldLong){ runSettings(); return; } // held the full 3s -> Settings
        // else: short tap -> just continue to normal boot
      }
      prev=now;
      delay(10);
    }
  }
}

// ===========================================================================
// Persist / load settings (NVS)
// ===========================================================================
static void loadSettings(){
  prefs.begin("cyd",false);
  firstRun = !prefs.isKey("ssid");
  configSSID = prefs.getString("ssid", WIFI_SSID);
  configPass = prefs.getString("pass", WIFI_PASS);
  configUrl  = prefs.getString("url",  DEFAULT_BASE_URL);
}
static void saveSettings(){
  prefs.putString("ssid", configSSID);
  prefs.putString("pass", configPass);
  prefs.putString("url",  configUrl);
}

// ===========================================================================
// Reader: NFC + backend (normal mode)
// ===========================================================================
static String uidToHex(const uint8_t* uid,uint8_t len){
  String s; char b[3];
  for(uint8_t i=0;i<len;i++){ snprintf(b,sizeof(b),"%02X",uid[i]); s+=b; }
  return s;
}
// ---- friendly warm palette (cafe-kiosk look; RGB565) ----
static const uint16_t C_BG   = 0x20E3;   // warm dark background
static const uint16_t C_CARD = 0x3985;   // warm panel
static const uint16_t C_CARD2= 0x49E7;   // lighter panel
static const uint16_t C_GOLD = 0xF62B;   // amber accent
static const uint16_t C_MINT = 0x4E74;   // soft green (success)
static const uint16_t C_ROSE = 0xEB90;   // soft rose (error)
static const uint16_t C_WHITE= 0xFFDE;   // warm off-white
static const uint16_t C_MUT  = 0xAD12;   // muted text
static const uint16_t C_HEAD = 0x18A2;   // header bar

// rounded "card" panel
static void drawCard(int x0,int y0,int x1,int y1,uint16_t c){
  tft.fillRoundRect(x0,y0,x1-x0,y1-y0,8,c);
}
// centered text at a baseline y (GLCD font, uses textWidth)
static void centerText(const char* s,uint16_t c,int size,int y){
  tft.setTextColor(c); tft.setTextSize(size);
  tft.setCursor((320-(int)tft.textWidth(s))/2, y);
  tft.print(s);
}
static void drawFooter(){
  tft.setTextColor(C_MUT); tft.setTextSize(1);
  tft.setCursor(96,226); tft.print("tap screen to go back");
}
static void startCheckInWindow(){          // keep check-in screen for the backend join window
  checkInActive = true;
  checkInUntil = millis() + JOIN_WINDOW_MS;
}
static void showIdle(){
  tft.fillScreen(C_BG);
  // top bar
  tft.fillRect(0,0,320,26,C_HEAD);
  tft.setTextColor(C_GOLD); tft.setTextSize(1);
  tft.setCursor(12,9); tft.print("BOARD GAME CAFE");
  tft.setTextColor(C_MUT); tft.setCursor(258,9); tft.print("open");
  // hero
  centerText("READY TO", C_WHITE, 3, 58);
  centerText("PLAY!", C_GOLD, 3, 88);
  tft.fillRoundRect(120,118,80,3,2,C_CARD2);      // divider
  // action card
  drawCard(36,132,284,180,C_CARD);
  centerText("Tap your card", C_MINT, 2, 148);
  centerText("to start your session", C_MUT, 1, 166);
  // pricing / help card
  drawCard(36,188,284,230,C_CARD2);
  centerText("B 30 / hr   first 30 min free", C_GOLD, 1, 200);
  centerText("Need a card? Ask our staff", C_MUT, 1, 218);
}

// Show a countdown for `secs`, then return to the idle "Tap your card" screen.
static void holdThenIdle(int secs){
  for(int s=secs; s>0; s--){
    tft.fillRect(10,220,300,18,TFT_BLACK);          // clear previous countdown
    tft.setTextColor(TFT_CYAN); tft.setTextSize(1);
    tft.setCursor(10,222); tft.print("Back to scan in ");
    tft.print(String(s)); tft.print(" s (tap to skip)");
    unsigned long end=millis()+1000;
    while(millis()<end){
      if(ts.touched()){ showIdle(); return; }       // tap -> back to scan immediately
      delay(10);
    }
  }
  showIdle();
}

// ===========================================================================
// Audio feedback (optional) — BUZZER_PIN in config.h. Success = rising two-tone,
// error = low buzz. All calls are no-ops when BUZZER_PIN < 0 (no speaker wired).
// ===========================================================================
// The CYD-2432S028 speaker runs off the ESP32's INNER 8-bit DAC: GPIO 26 = DAC2 feeding
// the on-board mono amp (analog output, NOT a PWM/tone pin). tone() (LEDC PWM) is silent
// here — beeps must be generated as a DAC square wave via dacWrite().
static void dacBeep(int freq, unsigned long durMs){
  if(BUZZER_PIN < 0) return;
  const int HI = 200, LO = 60;                         // 8-bit DAC swing
  const unsigned long halfUs = 1000000UL / (unsigned long)(freq * 2);
  unsigned long end = millis() + durMs;
  while(millis() < end){
    dacWrite(BUZZER_PIN, HI); delayMicroseconds(halfUs);
    dacWrite(BUZZER_PIN, LO); delayMicroseconds(halfUs);
  }
  dacWrite(BUZZER_PIN, 0);                             // silence after the tone
}
static void audioOk(){
  if(BUZZER_PIN < 0) return;
  dacBeep(2093, 90); delay(100);   // C7
  dacBeep(2637, 160);              // E7
}
static void audioErr(){
  if(BUZZER_PIN < 0) return;
  dacBeep(220, 300);               // low buzz
}
static void audioCheckout(){
  if(BUZZER_PIN < 0) return;
  dacBeep(1568, 90); delay(100);   // G6
  dacBeep(2093, 90); delay(100);   // C7
  dacBeep(2637, 200);              // E7
}
static void audioScan(){
  if(BUZZER_PIN < 0) return;
  dacBeep(1568, 70);               // short G6 blip: instant "card read" feedback
}

static void renderError(const String& msg){
  audioErr();
  tft.fillScreen(C_BG);
  centerText("Ooops", C_ROSE, 3, 44);
  centerText("That didn't work", C_WHITE, 1, 82);
  drawCard(20,104,300,176,C_CARD);
  tft.setTextColor(C_MUT); tft.setTextSize(1);
  tft.setCursor(40,124); tft.print("Please ask our staff for help.");
  tft.setTextColor(C_GOLD); tft.setTextSize(1);
  tft.setCursor(40,142); tft.print(String(msg).substring(0,42));
  checkInActive=false;
  drawFooter();
  holdThenIdle(6);           // error -> countdown -> back to scanning
}

static void drawStatus(const char* top,const char* line,uint16_t c){
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(c); tft.setTextSize(3); tft.setCursor(10,20); tft.println(top);
  tft.setTextColor(TFT_WHITE); tft.setTextSize(2); tft.setCursor(10,90); tft.println(line);
  drawFooter();
}

static void renderResponseJson(const String& body){
  JsonDocument doc;
  if(deserializeJson(doc,body)) return;
  JsonObject data=doc["data"];
  if(data.isNull()) return;
  const char* screen=data["screen"]|"";

  // ---- check-out success (also shown after staff checks someone out) ----
  if(strcmp(screen,"success")==0){
    audioCheckout();
    long amt=data["bill"]["amount"]|0L;
    tft.fillScreen(C_BG);
    centerText("ALL SET!", C_MINT, 3, 46);
    centerText("Thanks for playing", C_WHITE, 1, 78);
    drawCard(40,100,280,182,C_CARD);
    tft.setTextColor(C_MUT); tft.setTextSize(1);
    tft.setCursor(126,116); tft.print("YOUR BILL");
    char bill[16]; snprintf(bill,sizeof(bill),"B %.2f",amt/100.0);
    centerText(bill, C_GOLD, 3, 140);
    centerText("See you next time!", C_MUT, 1, 198);
    drawFooter();
    checkInActive=false;
    holdThenIdle(6);         // check-out success -> countdown -> back to scanning
    return;
  }

  // ---- check-in success: NEW group (first person) ----
  if(strcmp(screen,"waiting")==0){
    audioOk();
    tft.fillScreen(C_BG);
    centerText("WELCOME!", C_MINT, 3, 46);
    centerText("You started a table", C_WHITE, 2, 78);
    drawCard(16,106,304,176,C_CARD);
    centerText("You're the 1st player", C_GOLD, 2, 128);
    centerText("Friends: tap a card now", C_MUT, 1, 154);
    drawFooter(); startCheckInWindow(); return;
  }

  // ---- check-in success: joined an existing open group ----
  if(strcmp(screen,"joined")==0){
    audioOk();
    int n = data["tags"].size();
    tft.fillScreen(C_BG);
    centerText("YOU'RE IN!", C_MINT, 3, 46);
    char line[32]; snprintf(line,sizeof(line),"At the table: %d player%s",n,(n!=1)?"s":"");
    centerText(line, C_WHITE, 2, 78);
    drawCard(16,106,304,176,C_CARD);
    centerText("Tell friends to tap now", C_GOLD, 2, 128);
    centerText("to join this table", C_MUT, 1, 154);
    drawFooter(); startCheckInWindow(); return;
  }

  // ---- re-scan of someone already checked in -> roster with labels + who is scanning ----
  if(strcmp(screen,"group")==0){
    audioOk();
    JsonArray tags = data["tags"].as<JsonArray>();
    int n = tags.size();
    const char* scanId = data["tagId"] | "";
    tft.fillScreen(C_BG);
    // header bar
    tft.fillRect(0,0,320,26,C_HEAD);
    tft.setTextColor(C_GOLD); tft.setTextSize(1); tft.setCursor(12,9);
    tft.print("YOUR TABLE");
    char cnt[18]; snprintf(cnt,sizeof(cnt),"%d player%s",n,(n!=1)?"s":"");
    tft.setTextColor(C_MINT); tft.setTextSize(1); tft.setCursor(230,9); tft.print(cnt);
    // rows: highlighted member = the one who just tapped
    int y=40;
    for(JsonObject t : tags){
      const char* lbl = t["label"] | "";
      const char* tid = t["tagId"] | "";
      bool scanning = (scanId[0] && strcmp(tid,scanId)==0);
      long amtS = t["amountSatang"] | -1L;          // backend-priced, so no local clock to trust
      drawCard(10,y,310,y+26, scanning ? C_GOLD : C_CARD);   // scanning member = gold card
      tft.setTextColor(scanning ? C_HEAD : C_WHITE); tft.setTextSize(1);
      tft.setCursor(20,y+9);
      if(lbl[0]) tft.print(lbl);
      else { tft.print("card "); tft.print(String(tid).substring(0,6)); }
      if(scanning) tft.print("  <- you");
      // estimated elapsed time (฿0.50/min -> ~minutes) + current bill, right-aligned
      if(amtS>=0){
        long mins = amtS/50;
        tft.setTextColor(scanning ? C_HEAD : C_GOLD);
        tft.setCursor(206,y+9);
        tft.print(mins); tft.print("m  B"); tft.print(amtS/100.0,2);
      }
      y+=34;
      if(y > 192) break;
    }
    drawFooter(); startCheckInWindow(); return;
  }

  if(strcmp(screen,"idle")==0) { showIdle(); return; }
}
static WiFiClientSecure secureClient;                 // for HTTPS backend (deployed Render)

// Does the configured base URL use TLS (https / wss)?
static bool useTLS(){ return String(configUrl).startsWith("https://"); }

// begin() an HTTPClient on plain HTTP or over the secure client (https).
static void httpBegin(HTTPClient& http, const String& url){
  if(useTLS()) http.begin(secureClient, url);
  else         http.begin(url);
}

static void sendScan(const String& uidHex){
  HTTPClient http;
  httpBegin(http, String(configUrl)+"/api/v1/scans");
  http.setTimeout(5000);                       // cloud/DB round-trips spike above 1.5s; a short timeout showed "-11" after the write already committed
  http.addHeader("Content-Type","application/json");
  http.addHeader("X-Device-Key",DEVICE_KEY);
  int code=http.POST("{\"rawTagUid\":\""+uidHex+"\"}");
  String body=http.getString(); http.end();
  if(code==200){ lastUid=uidHex; lastTapMs=millis(); renderResponseJson(body); }
  else renderError("HTTP "+String(code));
}
static void sendDismiss(){
  // Return to the scan screen IMMEDIATELY — never make the user wait on the network to dismiss.
  checkInActive=false;
  showIdle();
  // Best-effort: clear the server's open join window (short timeout so a slow link can't stall the loop).
  HTTPClient http;
  httpBegin(http, String(configUrl)+"/api/v1/reader/dismiss");
  http.setTimeout(1000);
  http.addHeader("Content-Type","application/json");
  http.addHeader("X-Device-Key",DEVICE_KEY);
  http.POST("{}"); http.end();
}
// ===========================================================================
// Backend reachability — Wi-Fi UP is NOT the same as "the backend answers".
// These probe the API over an actual HTTP round-trip so the reader only serves
// taps / reports READY when it can genuinely talk to the backend, and it
// surfaces a dead backend instead of silently letting every tap error out.
// ===========================================================================
static bool backendOk = false;
static unsigned long backendProbeAt = 0;
static const unsigned long BACKEND_PROBE_UP_MS   = 10000;  // slow re-check while healthy
static const unsigned long BACKEND_PROBE_DOWN_MS = 3000;   // fast retry while unreachable
// One HTTP GET /health round-trip — true only if the backend really responds (not just Wi-Fi).
static bool backendReachable(){
  if(!wifiOk) return false;
  HTTPClient http;
  httpBegin(http, String(configUrl)+"/health");
  http.setTimeout(1500);
  int code=http.GET();
  http.end();
  return (code>=200 && code<300);
}
// Scheduled probe caller (from startReader + reconnectLoop). Flips backendOk when
// reachability changes, so a wrong/dead backend URL is caught and reported instead
// of the board sitting on "Ready" while taps fail.
static void backendTick(){
  unsigned long interval = backendOk ? BACKEND_PROBE_UP_MS : BACKEND_PROBE_DOWN_MS;
  if(millis() < backendProbeAt) return;
  backendProbeAt = millis() + interval;
  bool reachable = backendReachable();
  if(reachable != backendOk){
    backendOk = reachable;
    Serial.println(reachable ? "BACKEND OK" : "BACKEND LOST");
  }
}
static void pollReaderState(){
  if(!wifiOk) return;
  static unsigned long lastPoll=0;
  if(millis()-lastPoll<2000) return;      // at most every 2s, so the loop stays free to poll touch
  lastPoll=millis();
  HTTPClient http;
  httpBegin(http, String(configUrl)+"/api/v1/reader/state?deviceKey="+String(DEVICE_KEY));
  http.setTimeout(1200);                   // don't freeze the loop (and touch) for 5s when the socket is down
  int code=http.GET(); if(code==200) renderResponseJson(http.getString());
  http.end();
}
void wsEvent(WStype_t type,uint8_t* payload,size_t len){
  switch(type){
    case WStype_CONNECTED: wsConnected=true; break;
    case WStype_DISCONNECTED: wsConnected=false; break;
    case WStype_TEXT: renderResponseJson(String((char*)payload)); break;
    default: break;
  }
}
static void pollNfc(){
  // Only serve taps when the board can ACTUALLY talk to the backend (not just Wi-Fi).
  // If the backend is unreachable, reconnectLoop() is showing the recovery screen; reading
  // cards here would only produce silent HTTP failures.
  if(!nfcOk || !backendOk) return;
  uint8_t uid[]={0,0,0,0,0,0,0}; uint8_t uidLen=0;
  if(!nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A,uid,&uidLen,100)) return;  // short wait: a 500ms block made the loop sample touch only ~2x/s and swallow taps
  String hex=uidToHex(uid,uidLen);
  if(hex.length()==0) return;
  Serial.print("Tap UID: "); Serial.println(hex);
  unsigned long now=millis();
  if(hex==lastUid && (now-lastTapMs)<SCAN_DEDUPE_MS) return;
  audioScan();          // instant beep the moment a card is read (before the HTTP round-trip)
  // Immediate feedback: the moment a card is read, say we're talking to the backend —
  // otherwise the screen looks frozen while the POST round-trip is in flight.
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_CYAN); tft.setTextSize(2);
  tft.setCursor(10,100); tft.println("Saving...");
  sendScan(hex);
}
static void pollTouch(){
  if(!ts.touched()) return;                       // any touch on a result screen = dismiss / back to scan
  static unsigned long lastDismiss=0;
  if(millis()-lastDismiss>700){ lastDismiss=millis(); sendDismiss(); }
}
// Scan the I2C bus (0x01..0x7E) and return comma-joined addresses that ACK.
static String i2cScan(){
  String found="";
  for(byte a=1; a<127; a++){
    Wire.beginTransmission(a);
    byte e=Wire.endTransmission();
    if(e==0){
      if(found.length()) found+=", ";
      char buf[8]; snprintf(buf,sizeof(buf),"0x%02X",a); found+=buf;
    }
    yield();
  }
  return found;
}

// Show a helpful "PN532 not found" screen including what the I2C scan saw.
static void showPn532NotFound(){
  String f=i2cScan();
  Serial.print("I2C scan: "); Serial.println(f.length()?f:"(none)");
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_RED); tft.setTextSize(2);
  tft.setCursor(10,10); tft.println("PN532 not found");
  tft.setTextColor(TFT_WHITE); tft.setTextSize(1);
  tft.setCursor(10,40); tft.println("I2C addresses answering:");
  tft.setTextColor(TFT_YELLOW); tft.setTextSize(2);
  tft.setCursor(10,60);
  if(f.length()==0) tft.println("none");
  else tft.println(f);
  tft.setTextColor(TFT_DARKGREY); tft.setTextSize(1);
  tft.setCursor(10,150); tft.println("Check:");
  tft.setCursor(10,164); tft.println(" DIP switch = I2C (\'1 0\')");
  tft.setCursor(10,178); tft.println(" SDA->GPIO27  SCL->GPIO22");
  tft.setCursor(10,192); tft.println(" VCC->3V3  GND->GND");
  tft.setCursor(10,206); tft.println(" If 0x24 shows but still here: wiring/addr");
}

static void nfcOkay(bool ok){
  nfcOk=ok;
  if(!ok && !_nfcErrPrinted){ renderError("PN532 not found (I2C + DIP=I2C)"); _nfcErrPrinted=true; }
}
static void connectWifi(){
  // Non-blocking: kick off a fresh connection attempt and return. The 5s retry loop in
  // startReader()/reconnectLoop() calls this, and wifiTick() updates wifiOk once it lands,
  // so a dead backend never blocks the loop for the 15s a blocking wait would.
  if(configSSID.length()==0) return;
  WiFi.disconnect(true);
  WiFi.begin(configSSID.c_str(), configPass.c_str());
}
static void wifiTick(){
  // Live bidirectional monitor (was a one-way latch): also clears the flags when the link drops
  // after a successful connect, so reconnectLoop() re-triggers a reconnect instead of trusting a
  // stale "connected" state.
  if(WiFi.status()==WL_CONNECTED){
    if(!wifiOk){ wifiOk=true; Serial.print("IP: "); Serial.println(WiFi.localIP()); }
  } else if(wifiOk){
    wifiOk=false; wsConnected=false; readerReady=false;
  }
}
// NFC presence heartbeat: readPassiveTargetID() cannot tell "no card in field" from "module gone",
// so probe the PN532 firmware every NFC_PROBE_MS (idle only) and clear nfcOk when it stops answering.
// reconnectLoop() then re-runs initNfc() (Wire.begin + nfc.begin + SAMConfig) to revive it.
static void nfcWatch(){
  if(!nfcOk) return;                       // already down: reconnectLoop() handles re-init
  static unsigned long nfcProbeAt = 0;
  if(millis() >= nfcProbeAt){
    nfcProbeAt = millis() + NFC_PROBE_MS;
    if(checkInActive) return;              // don't disturb an open join window with a probe
    if(nfc.getFirmwareVersion() == 0) nfcOk = false;
  }
}

// ===========================================================================
// On-device NFC registration (PB-15): read a card here, save it locally, and sync
// it to the backend once Wi-Fi is up. Pending UIDs live in NVS under "regqueue"
// (same "cyd" namespace as the other settings), comma-joined.
// ===========================================================================
static bool initNfc(){
  Wire.begin(PN532_SDA,PN532_SCL);
  uint32_t fw=0;
  if(nfc.begin()){ fw=nfc.getFirmwareVersion(); if(fw) nfc.SAMConfig(); }
  nfcOk=(fw!=0);
  if(nfcOk){ Serial.print("PN532 fw 0x"); Serial.println(fw>>16,HEX); }
  return nfcOk;
}

static String pendingRegQueue(){ return prefs.getString("regqueue",""); }
static void saveRegQueue(const String& q){ prefs.putString("regqueue",q); }

static bool queueHas(const String& q,const String& uid){
  int start=0;
  while(start<(int)q.length()){
    int comma=q.indexOf(',',start);
    if(comma<0) comma=q.length();
    String item=q.substring(start,comma);
    int at=item.indexOf('@');
    String key=(at>=0)?item.substring(0,at):item;
    if(key==uid) return true;
    start=comma+1;
  }
  return false;
}
// Queue entry: "UID" or "UID@NAME" (name is optional). addPendingReg keeps a UID's first name.
static void addPendingReg(const String& uid,const char* label=NULL){
  String q=pendingRegQueue();
  if(queueHas(q,uid)) return;
  if(q.length()) q+=",";
  q+=uid;
  if(label && label[0]){ q+="@"; q+=label; }
  saveRegQueue(q);
}
static void removePendingReg(const String& uid){
  String q=pendingRegQueue(), out="";
  int start=0;
  while(start<(int)q.length()){
    int comma=q.indexOf(',',start);
    if(comma<0) comma=q.length();
    String item=q.substring(start,comma);
    int at=item.indexOf('@');
    String key=(at>=0)?item.substring(0,at):item;
    if(key!=uid){ if(out.length()) out+=","; out+=item; }
    start=comma+1;
  }
  saveRegQueue(out);
}

// POST one UID (and optional queued name) to the reader-authenticated registration endpoint.
// True on 2xx.
static bool postRegisterTag(const String& uid,const char* label=NULL){
  HTTPClient http;
  httpBegin(http, String(configUrl)+"/api/v1/reader/nfc-tags");
  http.setTimeout(5000);
  http.addHeader("Content-Type","application/json");
  http.addHeader("X-Device-Key",DEVICE_KEY);
  String bodyStr="{\"rawTagUid\":\""+uid+"\"";
  if(label && label[0]){ bodyStr+=",\"label\":\""; bodyStr+=label; bodyStr+="\""; }
  bodyStr+="}";
  int code=http.POST(bodyStr);
  http.end();
  return code>=200 && code<300;
}

// Data sync: register locally-saved cards against the backend before serving taps.
static void syncPendingRegistrations(){
  String q=pendingRegQueue();
  if(!q.length()) return;
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_CYAN); tft.setTextSize(2);
  tft.setCursor(10,80); tft.println("Syncing cards...");
  int remaining=0, start=0;
  while(start<(int)q.length()){
    int comma=q.indexOf(',',start);
    if(comma<0) comma=q.length();
    String token=q.substring(start,comma);        // "UID" or "UID@NAME"
    int at=token.indexOf('@');
    String uid   = (at>=0)? token.substring(0,at) : token;
    String label = (at>=0)? token.substring(at+1) : "";
    tft.setTextColor(TFT_WHITE); tft.setTextSize(1);
    tft.setCursor(10,120); tft.println(uid);
    Serial.print("SYNC REG UID: "); Serial.println(uid);
    if(postRegisterTag(uid, label.length()?label.c_str():NULL)) removePendingReg(uid);
    else remaining++;
    start=comma+1;
  }
  if(remaining>0){
    tft.setTextColor(TFT_YELLOW); tft.setTextSize(1);
    tft.setCursor(10,150); tft.print(String(remaining));
    tft.println(" card(s) failed - retry next boot");
  }
  delay(1400);
}

// Register-card mode (Settings → 3. Register card): enter an optional name, tap a card, save
// locally, and try the backend immediately. Cards that can't reach the backend stay queued for the
// next boot. After one card registers it returns to the entry screen so the next can be registered
// without restarting the board.
static void registerCardMode(){
  // If the PN532 is missing we still enter; the loop below retries it every 5s.
  char regName[81]="";
  String lastUid=""; unsigned long lastMs=0;
  for(;;){
    tft.fillScreen(TFT_BLACK);
    tft.setTextColor(TFT_YELLOW); tft.setTextSize(2); tft.setCursor(10,10); tft.println("REGISTER CARD");
    tft.setTextColor(TFT_WHITE); tft.setTextSize(1);
    tft.setCursor(10,50); tft.println("Tap a card to register it.");
    if(nfcOk){
      tft.setCursor(10,70); tft.println("Saved locally; synced to the");
      tft.setCursor(10,84); tft.println("backend on next boot if offline.");
    } else {
      tft.setTextColor(TFT_YELLOW);
      tft.setCursor(10,70); tft.println("PN532 not found.");
      tft.setCursor(10,84); tft.println("Retrying every 5s...");
    }
    // Icons row: [NAME: <name>] [CLEAR]
    tft.setTextColor(TFT_WHITE);
    tft.fillRect(10,110,200,30,TFT_BLUE);
    tft.setTextColor(TFT_BLACK); tft.setTextSize(2);
    tft.setCursor(16,116);
    if(regName[0]) tft.print(regName); else { tft.setTextColor(TFT_WHITE); tft.setTextSize(1); tft.print(" NAME <empty>"); }
    tft.fillRect(222,110,90,30,TFT_ORANGE);
    tft.setTextColor(TFT_BLACK); tft.setTextSize(2);
    tft.setCursor(246,116); tft.print("CLEAR");
    tft.setTextColor(TFT_DARKGREY); tft.setTextSize(1);
    tft.setCursor(10,150); tft.println("touch [NAME] to type it, then tap a card.");
    tft.setTextColor(TFT_DARKGREY);
    tft.setCursor(10,210); tft.println("touch [CANCEL]");
    tft.fillRect(214,200,104,34,TFT_RED);
    tft.setTextColor(TFT_BLACK); tft.setTextSize(2);
    tft.setCursor(230,207); tft.print("CANCEL");

    // Touch handling (non-blocking, 50ms poll so NFC still works).
    unsigned long pollEnd=millis()+50;
    while(millis()<pollEnd){
      if(ts.touched()){
        TS_Point p=ts.getPoint();
        if(inRect(p,10,110,210,140)){            // NAME -> on-screen keyboard
          showKeyboard(regName,80,false);
        } else if(inRect(p,222,110,312,140)){    // CLEAR name
          regName[0]=0;
        } else if(inRect(p,214,200,318,234)){    // CANCEL -> back to Settings
          return;
        }
      }
      delay(5);
    }

    // Re-open the PN532 every 5s if it was missing.
    if(!nfcOk){
      static unsigned long retryAt=0;
      if(millis()>=retryAt){ retryAt=millis()+5000; initNfc(); }
      continue;
    }

    // Read a card.
    uint8_t uid[]={0,0,0,0,0,0,0}; uint8_t uidLen=0;
    if(nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A,uid,&uidLen,80)){
      String hex=uidToHex(uid,uidLen);
      if(hex.length()){
        Serial.print("REG UID: "); Serial.println(hex);   // what register will POST (compare to "Tap UID:")
        unsigned long now=millis();
        if(!(hex==lastUid && (now-lastMs)<SCAN_DEDUPE_MS)){   // hold-dedupe
          lastUid=hex; lastMs=now;
          for(char* ch=regName; *ch; ch++) if(*ch=='@') *ch=' ';   // '@' is the queue separator
          addPendingReg(hex,regName[0]?regName:(const char*)0);
          // Immediate backend contact, the same visible cue the normal reader uses.
          tft.fillScreen(TFT_BLACK);
          tft.setTextColor(TFT_CYAN); tft.setTextSize(2);
          tft.setCursor(10,90); tft.println("Contacting backend...");
          bool ok=postRegisterTag(hex,regName[0]?regName:(const char*)0);
          if(ok) removePendingReg(hex);
          tft.fillScreen(TFT_BLACK);
          if(ok){
            tft.setTextColor(TFT_GREEN); tft.setTextSize(2);
            tft.setCursor(10,70); tft.println("CARD REGISTERED");
          } else {
            tft.setTextColor(TFT_YELLOW); tft.setTextSize(2);
            tft.setCursor(10,70); tft.println("SAVED LOCALLY");
            tft.setTextColor(TFT_WHITE); tft.setTextSize(1);
            tft.setCursor(10,100); tft.println("Will sync on next boot.");
          }
          tft.setTextColor(TFT_WHITE); tft.setTextSize(1);
          tft.setCursor(10,130); tft.print("UID: "); tft.println(hex);
          tft.setCursor(10,146); tft.print("Name: "); tft.println(regName[0]?regName:"(none)");
          delay(1800);
          // Stay in register mode: loop back to the entry screen for the next card.
          regName[0]=0;   // clear the name so the next swipes clean
        }
      }
    }
  }
}

// ===========================================================================
// Reader bring-up with self-healing: keeps trying to (re)connect the scan
// module and the backend every 5s until both are up, then serves taps. Any
// later loss is handled from loop() (see reconnectLoop()).
static void startReader(){
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE); tft.setTextSize(2); tft.setCursor(10,10); tft.println("Starting reader...");
  unsigned long scanRetryAt=0, netRetryAt=0;

  for(;;){
    // ---- scan module: re-init every 5s until it answers ----
    if(!nfcOk && millis()>=scanRetryAt){ scanRetryAt=millis()+5000; initNfc(); }
    // ---- backend: reconnect every 5s until it answers ----
    if(!wifiOk && millis()>=netRetryAt){ netRetryAt=millis()+5000; connectWifi(); }
    wifiTick();
    backendTick();       // READY requires the backend to actually answer, not just Wi-Fi

    if(nfcOk && wifiOk && backendOk){
      Serial.print("IP: "); Serial.println(WiFi.localIP());
      tft.fillScreen(TFT_BLACK);
      tft.setTextColor(TFT_GREEN); tft.setTextSize(2); tft.setCursor(10,10); tft.println("NFC OK");
      tft.setTextColor(TFT_WHITE); tft.setTextSize(1);
      tft.setCursor(10,40); tft.print("Backend OK  IP: "); tft.println(WiFi.localIP());
      delay(1200);

      // Data sync: register locally-saved cards before serving taps.
      syncPendingRegistrations();

      showIdle();
      readerReady=true;
      break;                       // NFC + backend up -> normal operation in loop()
    }

    // Not ready: clearly state which component can't be reached, then wait ~1s.
    tft.fillScreen(TFT_BLACK);
    tft.setTextColor(TFT_YELLOW); tft.setTextSize(2); tft.setCursor(10,40); tft.println("Connecting...");
    int y=80;
    if(!nfcOk){
      tft.setTextColor(TFT_RED); tft.setTextSize(2);
      tft.setCursor(10,y);   tft.println("Cannot connect to");
      tft.setCursor(10,y+22);tft.println("NFC module - retry 5s");
      y+=56;
    }
    if(!wifiOk){
      tft.setTextColor(TFT_RED); tft.setTextSize(2);
      tft.setCursor(10,y);   tft.println("Cannot connect to");
      tft.setCursor(10,y+22);tft.println("backend - retry 5s");
      y+=56;
    }
    if(!backendOk && wifiOk){
      tft.setTextColor(TFT_RED); tft.setTextSize(2);
      tft.setCursor(10,y);   tft.println("Cannot reach");
      tft.setCursor(10,y+22);tft.println("backend API - retry");
    }
    tft.setTextColor(TFT_DARKGREY); tft.setTextSize(1);
    tft.setCursor(10,200); tft.println("RST to configure");
    unsigned long end=millis()+1000;
    while(millis()<end) delay(50);
  }

  // ---- WebSocket link (non-blocking; retries via reconnectLoop) ----
  // Parse host + port correctly from the base URL, then pick ws / wss.
  String u=String(configUrl); bool tls=u.startsWith("https://");
  u.replace("http://",""); u.replace("https://","");
  int slash=u.indexOf('/');
  String hostport=(slash>=0)?u.substring(0,slash):u;
  String h; int port;
  int c=hostport.indexOf(':');
  if(c>=0){ h=hostport.substring(0,c); port=hostport.substring(c+1).toInt(); }
  else    { h=hostport; port=tls?443:80; }
  String path="/ws/reader?deviceKey="+String(DEVICE_KEY);
  if(tls) ws.beginSSL(h.c_str(),port,path.c_str());   // no CA -> lib calls setInsecure()
  else    ws.begin(h.c_str(),port,path.c_str());
  ws.onEvent(wsEvent); ws.setReconnectInterval(2000);
  ws.enableHeartbeat(15000, 60000, 5000);   // keepalive: ping 15s, consider dead after 60s, check 5s
}

// Self-healing from loop(): if the scan module or the backend drops during normal
// operation, reconnect every 5s (showing a status screen while recovering) and resume
// serving taps once both are back.
static unsigned long reconnectAt=0;
static void reconnectLoop(){
  // Live link monitoring FIRST: flips the latched wifiOk / nfcOk back off when a link that was up
  // drops, so the recovery branches below stay reachable after boot (previously these flags were
  // one-way latches, so a post-boot drop was never detected or reconnected).
  wifiTick();
  nfcWatch();
  backendTick();      // READY requires the backend to actually answer (not just Wi-Fi)

  bool nfcDown = !nfcOk;
  bool netDown = !wifiOk;
  bool backendDown = !backendOk;

  // Re-attempt the scan module every 5s.
  if(nfcDown && millis()>=reconnectAt){
    reconnectAt=millis()+5000;
    initNfc();
  }
  // Re-attempt the backend (Wi-Fi) every 5s.
  if(netDown && millis()>=reconnectAt+500){
    connectWifi();
  }
  // backendTick() handles the backend re-probe when Wi-Fi is up but the API is down.

  // Recovered (fresh read): resume normal operation.
  if(nfcOk && wifiOk && backendOk){
    if(!readerReady){ readerReady=true; showIdle(); }
    return;
  }
  if(readerReady){ readerReady=false; wsConnected=false; }
  // Show *which* component dropped, once per second; retry every 5s.
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_YELLOW); tft.setTextSize(2); tft.setCursor(10,40); tft.println("CONNECTION LOST");
  int y=80;
  if(!nfcOk){
    tft.setTextColor(TFT_RED); tft.setTextSize(2);
    tft.setCursor(10,y);   tft.println("Cannot connect to");
    tft.setCursor(10,y+22);tft.println("NFC module - retry 5s");
    y+=56;
  }
  if(!wifiOk){
    tft.setTextColor(TFT_RED); tft.setTextSize(2);
    tft.setCursor(10,y);   tft.println("Cannot connect to");
    tft.setCursor(10,y+22);tft.println("backend - retry 5s");
    y+=56;
  }
  if(backendDown && wifiOk){
    tft.setTextColor(TFT_RED); tft.setTextSize(2);
    tft.setCursor(10,y);   tft.println("Cannot reach");
    tft.setCursor(10,y+22);tft.println("backend API - retry");
  }
  delay(1000);
}

void setup(){
  Serial.begin(SERIAL_BAUD);
  delay(200);
  tft.init(); tft.setRotation(1);
  secureClient.setInsecure();   // allow connection to the deployed HTTPS backend (skip CA verify)
  touchSPI.begin(TOUCH_CLK, TOUCH_MISO, TOUCH_MOSI, TOUCH_CS);
  ts.begin(touchSPI);
  loadSettings();
  bootConfigScreen();       // countdown; tap -> Settings
  if(firstRun) runSettings();   // first boot: force config before running
  WiFi.setSleep(false);        // reader is always-on: keep the radio responsive for WS keepalive
  WiFi.setAutoReconnect(true); // native first-line reconnect; the manual watchdog below is the safety net
  startReader();
}
void loop(){
  ws.loop();
  reconnectLoop();          // re-open scan module / backend if they dropped
  pollTouch();              // sample touch FIRST so a tap isn't lost during the NFC read window
  pollNfc();
  if(checkInActive && millis()>checkInUntil){ checkInActive=false; showIdle(); }
  if(readerReady && !wsConnected && wifiOk) pollReaderState();
  delay(5);
}
