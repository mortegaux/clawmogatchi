// ============================================================
// hal.js — Hardware Abstraction Layer (Emulator version)
//
// This file is the "translation layer" between the game logic
// and the actual hardware (or in this case, the browser).
//
// On real ESP32 hardware, there would be a different hal.js
// written in C that talks to the OLED display, buttons, etc.
// Here in the emulator, we fake all of that with canvas + keyboard.
//
// HAL functions:
//   Display:  clearScreen, drawPixel, drawSprite, drawText, flush
//   Input:    isButtonPressed, onButtonDown, onButtonUp
//   Audio:    playTone, playMelody  (stubs — Phase 3)
//   Storage:  saveState, loadState
//   Network:  httpPost, isOnline     (stubs — Phase 4)
//   Time:     now, tickInterval
// ============================================================

const hal = (() => {

  // ----------------------------------------------------------
  // DISPLAY — 128×64 framebuffer
  // ----------------------------------------------------------

  // The emulated display is 128 columns × 64 rows of 1-bit pixels.
  // "1-bit" means each pixel is either ON (true) or OFF (false),
  // just like the real OLED hardware.
  const DISPLAY_W = 128;
  const DISPLAY_H = 64;

  // framebuffer[y][x] = true (pixel lit) or false (pixel off)
  const framebuffer = [];
  for (let y = 0; y < DISPLAY_H; y++) {
    framebuffer.push(new Uint8Array(DISPLAY_W)); // Uint8Array is fast & memory-efficient
  }

  // We'll grab the canvas element once main.js calls hal.init()
  let canvas = null;
  let ctx    = null;

  // Zoom factor: we render the 128×64 buffer at 4× = 512×256 pixels
  const ZOOM = 4;

  // Pixel colours for the "1-bit" display look
  const COLOR_ON  = '#e8f0e0'; // lit pixel — slightly warm white like an OLED
  const COLOR_OFF = '#0a0c10'; // dark pixel — almost black

  /**
   * hal.init(canvasElement)
   * Must be called once from main.js before anything is drawn.
   */
  function init(canvasElement) {
    canvas = canvasElement;
    ctx    = canvas.getContext('2d');
    clearScreen();
    flush();
  }

  /**
   * hal.clearScreen()
   * Sets every pixel in the framebuffer to OFF (false).
   * Call this at the start of each frame before drawing.
   */
  function clearScreen() {
    for (let y = 0; y < DISPLAY_H; y++) {
      framebuffer[y].fill(0);
    }
  }

  /**
   * hal.drawPixel(x, y, on)
   * Sets one pixel in the framebuffer.
   *   x, y — pixel coordinates (0-127, 0-63)
   *   on   — true to light the pixel, false to darken it
   */
  function drawPixel(x, y, on) {
    // Clamp to display bounds so callers don't have to worry about edges
    if (x < 0 || x >= DISPLAY_W || y < 0 || y >= DISPLAY_H) return;
    framebuffer[y][x] = on ? 1 : 0;
  }

  /**
   * hal.drawSprite(x, y, spriteData, inverted)
   * Draws a 2D bit-array sprite at position (x, y).
   *
   *   spriteData — 2D array of 0/1 values, e.g.:
   *                [[0,1,1,0],
   *                 [1,1,1,1],
   *                 [0,1,1,0]]
   *   inverted   — if true, flip 0↔1 (used for selected icons, etc.)
   *
   * Pixels outside the display bounds are silently skipped.
   */
  function drawSprite(x, y, spriteData, inverted = false) {
    for (let row = 0; row < spriteData.length; row++) {
      for (let col = 0; col < spriteData[row].length; col++) {
        let bit = spriteData[row][col] ? 1 : 0;
        if (inverted) bit = 1 - bit;
        drawPixel(x + col, y + row, bit === 1);
      }
    }
  }

  // ----------------------------------------------------------
  // TEXT RENDERING — baked-in 5×7 pixel font
  // ----------------------------------------------------------

  // Each character is a 5-wide × 7-tall bitmap stored as 5 column bytes.
  // A bit set in a column byte means that pixel row is lit.
  // This covers printable ASCII 32–126.
  // Source: classic "5x7" pixel font, public domain.
  const FONT5X7 = {
    ' ': [0x00,0x00,0x00,0x00,0x00],
    '!': [0x00,0x00,0x5F,0x00,0x00],
    '"': [0x00,0x07,0x00,0x07,0x00],
    '#': [0x14,0x7F,0x14,0x7F,0x14],
    '$': [0x24,0x2A,0x7F,0x2A,0x12],
    '%': [0x23,0x13,0x08,0x64,0x62],
    '&': [0x36,0x49,0x55,0x22,0x50],
    "'": [0x00,0x05,0x03,0x00,0x00],
    '(': [0x00,0x1C,0x22,0x41,0x00],
    ')': [0x00,0x41,0x22,0x1C,0x00],
    '*': [0x14,0x08,0x3E,0x08,0x14],
    '+': [0x08,0x08,0x3E,0x08,0x08],
    ',': [0x00,0x50,0x30,0x00,0x00],
    '-': [0x08,0x08,0x08,0x08,0x08],
    '.': [0x00,0x60,0x60,0x00,0x00],
    '/': [0x20,0x10,0x08,0x04,0x02],
    '0': [0x3E,0x51,0x49,0x45,0x3E],
    '1': [0x00,0x42,0x7F,0x40,0x00],
    '2': [0x42,0x61,0x51,0x49,0x46],
    '3': [0x21,0x41,0x45,0x4B,0x31],
    '4': [0x18,0x14,0x12,0x7F,0x10],
    '5': [0x27,0x45,0x45,0x45,0x39],
    '6': [0x3C,0x4A,0x49,0x49,0x30],
    '7': [0x01,0x71,0x09,0x05,0x03],
    '8': [0x36,0x49,0x49,0x49,0x36],
    '9': [0x06,0x49,0x49,0x29,0x1E],
    ':': [0x00,0x36,0x36,0x00,0x00],
    ';': [0x00,0x56,0x36,0x00,0x00],
    '<': [0x08,0x14,0x22,0x41,0x00],
    '=': [0x14,0x14,0x14,0x14,0x14],
    '>': [0x00,0x41,0x22,0x14,0x08],
    '?': [0x02,0x01,0x51,0x09,0x06],
    '@': [0x32,0x49,0x79,0x41,0x3E],
    'A': [0x7E,0x11,0x11,0x11,0x7E],
    'B': [0x7F,0x49,0x49,0x49,0x36],
    'C': [0x3E,0x41,0x41,0x41,0x22],
    'D': [0x7F,0x41,0x41,0x22,0x1C],
    'E': [0x7F,0x49,0x49,0x49,0x41],
    'F': [0x7F,0x09,0x09,0x09,0x01],
    'G': [0x3E,0x41,0x49,0x49,0x7A],
    'H': [0x7F,0x08,0x08,0x08,0x7F],
    'I': [0x00,0x41,0x7F,0x41,0x00],
    'J': [0x20,0x40,0x41,0x3F,0x01],
    'K': [0x7F,0x08,0x14,0x22,0x41],
    'L': [0x7F,0x40,0x40,0x40,0x40],
    'M': [0x7F,0x02,0x04,0x02,0x7F],
    'N': [0x7F,0x04,0x08,0x10,0x7F],
    'O': [0x3E,0x41,0x41,0x41,0x3E],
    'P': [0x7F,0x09,0x09,0x09,0x06],
    'Q': [0x3E,0x41,0x51,0x21,0x5E],
    'R': [0x7F,0x09,0x19,0x29,0x46],
    'S': [0x46,0x49,0x49,0x49,0x31],
    'T': [0x01,0x01,0x7F,0x01,0x01],
    'U': [0x3F,0x40,0x40,0x40,0x3F],
    'V': [0x1F,0x20,0x40,0x20,0x1F],
    'W': [0x3F,0x40,0x38,0x40,0x3F],
    'X': [0x63,0x14,0x08,0x14,0x63],
    'Y': [0x07,0x08,0x70,0x08,0x07],
    'Z': [0x61,0x51,0x49,0x45,0x43],
    '[': [0x00,0x7F,0x41,0x41,0x00],
    '\\': [0x02,0x04,0x08,0x10,0x20],
    ']': [0x00,0x41,0x41,0x7F,0x00],
    '^': [0x04,0x02,0x01,0x02,0x04],
    '_': [0x40,0x40,0x40,0x40,0x40],
    '`': [0x00,0x01,0x02,0x04,0x00],
    'a': [0x20,0x54,0x54,0x54,0x78],
    'b': [0x7F,0x48,0x44,0x44,0x38],
    'c': [0x38,0x44,0x44,0x44,0x20],
    'd': [0x38,0x44,0x44,0x48,0x7F],
    'e': [0x38,0x54,0x54,0x54,0x18],
    'f': [0x08,0x7E,0x09,0x01,0x02],
    'g': [0x0C,0x52,0x52,0x52,0x3E],
    'h': [0x7F,0x08,0x04,0x04,0x78],
    'i': [0x00,0x44,0x7D,0x40,0x00],
    'j': [0x20,0x40,0x44,0x3D,0x00],
    'k': [0x7F,0x10,0x28,0x44,0x00],
    'l': [0x00,0x41,0x7F,0x40,0x00],
    'm': [0x7C,0x04,0x18,0x04,0x78],
    'n': [0x7C,0x08,0x04,0x04,0x78],
    'o': [0x38,0x44,0x44,0x44,0x38],
    'p': [0x7C,0x14,0x14,0x14,0x08],
    'q': [0x08,0x14,0x14,0x18,0x7C],
    'r': [0x7C,0x08,0x04,0x04,0x08],
    's': [0x48,0x54,0x54,0x54,0x20],
    't': [0x04,0x3F,0x44,0x40,0x20],
    'u': [0x3C,0x40,0x40,0x40,0x3C],
    'v': [0x1C,0x20,0x40,0x20,0x1C],
    'w': [0x3C,0x40,0x30,0x40,0x3C],
    'x': [0x44,0x28,0x10,0x28,0x44],
    'y': [0x0C,0x50,0x50,0x50,0x3C],
    'z': [0x44,0x64,0x54,0x4C,0x44],
    '{': [0x00,0x08,0x36,0x41,0x00],
    '|': [0x00,0x00,0x7F,0x00,0x00],
    '}': [0x00,0x41,0x36,0x08,0x00],
    '~': [0x10,0x08,0x08,0x10,0x08],
  };

  /**
   * hal.drawText(x, y, text, scale)
   * Renders a string at pixel position (x, y).
   *   scale=1 → 5×7 px per character
   *   scale=2 → 10×14 px per character (doubled)
   *
   * Characters are separated by 1 blank pixel column.
   */
  function drawText(x, y, text, scale = 1) {
    let cursorX = x;
    const str = String(text).toUpperCase();

    for (const ch of str) {
      const cols = FONT5X7[ch] || FONT5X7['?'];

      // Each column byte encodes 7 vertical pixels (bits 0-6 = rows 0-6 top-to-bottom)
      for (let col = 0; col < 5; col++) {
        const colByte = cols[col];
        for (let bit = 0; bit < 7; bit++) {
          const pixOn = (colByte >> bit) & 1;
          if (scale === 1) {
            drawPixel(cursorX + col, y + bit, pixOn === 1);
          } else {
            // Scale up by filling a scale×scale block per pixel
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                drawPixel(cursorX + col * scale + sx, y + bit * scale + sy, pixOn === 1);
              }
            }
          }
        }
      }

      // Advance cursor: 5 columns + 1 gap, multiplied by scale
      cursorX += (5 + 1) * scale;
    }
  }

  /**
   * hal.flush()
   * Copies the framebuffer to the HTML canvas.
   * This is where the emulator "display" actually updates.
   * Call once per render frame, after all drawing is done.
   */
  function flush() {
    if (!ctx) return;

    // Use putImageData for speed: build a pixel array for the whole canvas
    const imageData = ctx.createImageData(DISPLAY_W * ZOOM, DISPLAY_H * ZOOM);
    const data = imageData.data; // flat RGBA array

    // Parse the CSS colour strings into RGB once
    const onR = 0xe8, onG = 0xf0, onB = 0xe0;
    const offR = 0x0a, offG = 0x0c, offB = 0x10;

    for (let y = 0; y < DISPLAY_H; y++) {
      for (let x = 0; x < DISPLAY_W; x++) {
        const lit = framebuffer[y][x] === 1;
        const r = lit ? onR : offR;
        const g = lit ? onG : offG;
        const b = lit ? onB : offB;

        // Each logical pixel → ZOOM×ZOOM physical pixels
        for (let dy = 0; dy < ZOOM; dy++) {
          for (let dx = 0; dx < ZOOM; dx++) {
            const px = (x * ZOOM + dx);
            const py = (y * ZOOM + dy);
            const idx = (py * DISPLAY_W * ZOOM + px) * 4;
            data[idx]     = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255; // fully opaque
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // ----------------------------------------------------------
  // INPUT — keyboard + HTML button mapping
  // ----------------------------------------------------------

  // Which buttons are currently held down
  const buttonState = {
    LEFT: false, RIGHT: false, ACTION: false, BACK: false
  };

  // Registered callbacks for button events
  // callbacks[button] = { down: [...fns], up: [...fns] }
  const callbacks = {
    LEFT:   { down: [], up: [] },
    RIGHT:  { down: [], up: [] },
    ACTION: { down: [], up: [] },
    BACK:   { down: [], up: [] },
  };

  /**
   * hal.isButtonPressed(button)
   * Returns true if the named button is currently held down.
   * button is one of: 'LEFT', 'RIGHT', 'ACTION', 'BACK'
   */
  function isButtonPressed(button) {
    return !!buttonState[button];
  }

  /**
   * hal.onButtonDown(button, callback)
   * Registers a function to call when button is pressed.
   */
  function onButtonDown(button, callback) {
    if (callbacks[button]) callbacks[button].down.push(callback);
  }

  /**
   * hal.onButtonUp(button, callback)
   * Registers a function to call when button is released.
   */
  function onButtonUp(button, callback) {
    if (callbacks[button]) callbacks[button].up.push(callback);
  }

  /**
   * _pressButton / _releaseButton
   * Internal helpers — called by input.js when a key/click event fires.
   */
  function _pressButton(button) {
    if (!callbacks[button] || buttonState[button]) return; // ignore held-down repeat
    buttonState[button] = true;
    for (const fn of callbacks[button].down) fn(button);
  }

  function _releaseButton(button) {
    if (!callbacks[button]) return;
    buttonState[button] = false;
    for (const fn of callbacks[button].up) fn(button);
  }

  // ----------------------------------------------------------
  // AUDIO — stubs for Phase 1 (Phase 3 will implement Web Audio)
  // ----------------------------------------------------------

  /**
   * hal.playTone(frequency, durationMs)
   * Plays a single beep. No-op in Phase 1.
   */
  function playTone(frequency, durationMs) {
    // TODO Phase 3: Web Audio API oscillator
    // console.log(`[HAL] playTone(${frequency}Hz, ${durationMs}ms)`);
  }

  /**
   * hal.playMelody(noteArray)
   * Plays a sequence of notes: [{freq, dur}, ...]. No-op in Phase 1.
   */
  function playMelody(noteArray) {
    // TODO Phase 3: Web Audio API
  }

  // ----------------------------------------------------------
  // STORAGE — wraps localStorage
  // ----------------------------------------------------------

  /**
   * hal.saveState(key, jsonString)
   * Saves a string to localStorage under the given key.
   */
  function saveState(key, jsonString) {
    try {
      localStorage.setItem(key, jsonString);
    } catch (e) {
      console.warn('[HAL] saveState failed:', e);
    }
  }

  /**
   * hal.loadState(key)
   * Returns the stored string, or null if nothing is saved.
   */
  function loadState(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('[HAL] loadState failed:', e);
      return null;
    }
  }

  // ----------------------------------------------------------
  // NETWORK — stubs for Phase 4 (AI dialogue)
  // ----------------------------------------------------------

  /**
   * hal.httpPost(url, body)
   * Sends a POST request and returns a Promise resolving to parsed JSON.
   * Stub for Phase 1 — always rejects so callers use offline fallback.
   */
  async function httpPost(url, body) {
    // TODO Phase 4: real fetch() call to Ollama or Claude API
    return Promise.reject(new Error('Network not available in Phase 1'));
  }

  /**
   * hal.isOnline()
   * Returns true if network is available.
   */
  function isOnline() {
    return navigator.onLine;
  }

  // ----------------------------------------------------------
  // TIME
  // ----------------------------------------------------------

  /**
   * hal.now()
   * Returns the current timestamp in milliseconds.
   * On ESP32 this would use millis() or NTP.
   */
  function now() {
    return Date.now();
  }

  // Holds the setInterval handle so we can adjust speed later
  let _tickHandle = null;
  let _tickCallback = null;
  let _tickIntervalMs = 300000; // default 5 minutes

  /**
   * hal.tickInterval(callback, intervalMs)
   * Starts a repeating timer that calls callback every intervalMs.
   * Replaces any previously registered tick timer.
   */
  function tickInterval(callback, intervalMs) {
    if (_tickHandle !== null) clearInterval(_tickHandle);
    _tickCallback    = callback;
    _tickIntervalMs  = intervalMs;
    _tickHandle      = setInterval(callback, intervalMs);
  }

  /**
   * hal.setTickSpeed(intervalMs)
   * Called by the dev speed slider to change tick rate on the fly.
   */
  function setTickSpeed(intervalMs) {
    if (_tickCallback) tickInterval(_tickCallback, intervalMs);
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------
  return {
    // Display
    init,
    clearScreen,
    drawPixel,
    drawSprite,
    drawText,
    flush,
    DISPLAY_W,
    DISPLAY_H,

    // Input
    isButtonPressed,
    onButtonDown,
    onButtonUp,
    _pressButton,
    _releaseButton,

    // Audio
    playTone,
    playMelody,

    // Storage
    saveState,
    loadState,

    // Network
    httpPost,
    isOnline,

    // Time
    now,
    tickInterval,
    setTickSpeed,

    // Expose canvas for screenshot utility
    getCanvas: () => canvas,
  };

})();
