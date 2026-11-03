// TFT_eSPI User_Setup.h — ESP32-2432S028 (Cheap Yellow Display, 2.8" 240x320)
// OVERWRITE: Documents/Arduino/libraries/TFT_eSPI/User_Setup.h
// ILI9341 = original boards. If colours are white/washed/inverted, your batch
// uses ST7789 -> comment the ILI9341_2_DRIVER line and uncomment the ST7789 block.

#define ILI9341_2_DRIVER        // original ILI9341 boards
// #define ST7789_DRIVER         // later batches (two-USB)
// #define TFT_INVERSION_ON      // only for ST7789, only if colours are inverted
// #define TFT_RGB_ORDER TFT_BGR // only for ST7789, only if red/blue swapped

#define TFT_WIDTH   240
#define TFT_HEIGHT  320

#define TFT_MOSI 13
#define TFT_SCLK 14
#define TFT_CS   15
#define TFT_DC    2
#define TFT_RST  -1        // display reset shared with board reset
#define TFT_BL   21
#define TFT_BACKLIGHT_ON HIGH

#define LOAD_GLCD
#define LOAD_FONT2
#define LOAD_FONT4
#define LOAD_FONT6
#define LOAD_FONT7
#define LOAD_FONT8
#define SMOOTH_FONT
