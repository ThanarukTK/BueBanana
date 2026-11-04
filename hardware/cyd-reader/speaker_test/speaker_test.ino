/*
 * speaker_test.ino — standalone check that the CYD-2432S028's on-board speaker
 * actually produces sound via the internal DAC (GPIO 26 = DAC2 -> mono amp).
 *
 * Flash THIS alone (board: ESP32 Dev Module, upload directly to COM3).
 * If the board has its speaker populated you should hear three beeps every ~3s:
 *   B5  ->  E6  ->  G6
 * This isolates the audio path from the full reader firmware: if you hear beeps
 * here, the speaker + DAC work and the reader's audio will too.
 */
#define SPEAKER 26          // GPIO26 = ESP32 internal DAC2 -> on-board mono amplifier

void beep(int freq, unsigned long ms){
  const int HI = 200, LO = 60;                      // 8-bit DAC swing
  const unsigned long halfUs = 1000000UL / (unsigned long)(freq * 2);
  unsigned long end = millis() + ms;
  while(millis() < end){
    dacWrite(SPEAKER, HI); delayMicroseconds(halfUs);
    dacWrite(SPEAKER, LO); delayMicroseconds(halfUs);
  }
  dacWrite(SPEAKER, 0);                              // silence
}

void setup(){
  Serial.begin(115200);
  delay(300);
  Serial.println("Speaker test: beeping on GPIO26 (DAC2)...");
}

void loop(){
  beep(988,  200); delay(200);   // B5
  beep(1319, 200); delay(200);   // E6
  beep(1568, 300); delay(1000);  // G6
  Serial.println("beep done");
  delay(2000);
}
