# Clawmogatchi — Phase 4 Handoff

**Date:** 2026-02-22
**Status:** Phase 4 complete ✅ — ready to implement Phase 5 (ESP32 Hardware Port)

---

## What Phase 4 Delivered

AI-powered personality system with dual-backend dialogue generation:

- `src/ai.js` — NEW: AI integration module (IIFE). System prompt builder, Ollama + Claude API clients, timeout/fallback, death eulogy generation.
- `src/hal.js` — Real `httpPost()` via `fetch()` + `AbortController` (replaces stub).
- `src/state.js` — Added `aiConfig` shape and `_tickWindow` to careHistory.
- `src/engine.js` — Rolling 48-tick care history window, pet-initiated dialogue trigger (~1/24 ticks), death eulogy generation, TALKING state reset on load.
- `src/state-machine.js` — Async `performTalk()` with thinking state, expanded offline dialogue (~50 responses organized by urgency/personality/situation), `getDominantTrait()` helper.
- `src/renderer.js` — Thinking animation (dots + thought bubble), personality-influenced idle sprites (dominant trait cycle), death eulogy word-wrap display.
- `src/sprites.js` — Thinking dot sprites (3 sizes), thought bubble, 5 personality idle sprites (sass/curious/affection/energy/philosophical).
- `src/main.js` — AI settings panel wiring (URL, model, API key, enable, force talk, status), personality editor (5 sliders), old save migration.
- `index.html` — AI settings and personality editor `<details>` sections in dev panel, `ai.js` script tag.
- `style.css` — AI settings grid and personality slider styles.
- `CLAUDE.md` — Updated load order, module table, phase status, Phase 4 notes.

**Key Phase 4 architecture decisions:**
- Care history uses a rolling 48-tick window (ring buffer of per-tick action snapshots), replacing forever-growing counters
- Per-tick action flags (`_fedThisTick`, `_playedThisTick`, etc.) set by action handlers, consumed and cleared by engine each tick
- AI dialogue is fully async — `performTalk()` sets `_aiThinking=true`, renderer shows thinking animation, response or fallback fills `_dialogue`
- User can cancel AI requests mid-flight by pressing BACK (state changes to IDLE, async handler checks state before applying result)
- Old saves without `aiConfig` or `_tickWindow` get them merged on load (backwards compatible)
- Personality idle animations use a 300-frame cycle: personality sprite shown during frames 240-280 when dominant trait ≥ 40

---

## Updated Script Load Order

```
hal → state → food → sprites → minigames → ai → engine → state-machine → renderer → input → main
```

---

## Current Module Responsibilities

| Module | Owns |
|--------|------|
| `hal.js` | Framebuffer, font, canvas I/O, button events, localStorage, Web Audio, HTTP via fetch |
| `state.js` | `gameState` shape, `createFreshState()`, `addEventLog()`, `clampStats()`, `clampPersonality()` |
| `food.js` | Food definitions, `applyFoodEffects()`, `getAvailableFoods()` |
| `sprites.js` | All 1-bit pixel art, `MENU_ICONS`, `FOOD_SPRITES`, `ANIMATIONS`, `EATING_REACTIONS` |
| `minigames.js` | Minigame framework + 3 games (guess, memory, dodge) |
| `ai.js` | System prompt builder, Ollama/Claude API clients, `requestAIDialogue()`, `requestDeathEulogy()` |
| `engine.js` | Tick loop, stat decay, sugar states, poop, sickness, death, personality drift, care history window, pet-initiated dialogue, save/load |
| `state-machine.js` | Button routing, action handlers, async `performTalk()`, expanded offline dialogue (~50 responses) |
| `renderer.js` | rAF render loop, all canvas drawing, thinking animation, personality idle cycle, eulogy display |
| `input.js` | Keyboard + HTML button → `hal._pressButton/_releaseButton` |
| `main.js` | Entry point, init, load/catch-up, wire everything, AI settings panel, personality editor |

---

## Phase 5 Scope — ESP32 Hardware Port

Port the complete Clawmogatchi experience to ESP32 hardware. The JS emulator serves as the specification — the C port should be functionally identical.

### Hardware Components

- ESP32-WROOM-32
- SSD1306 128×64 OLED (I2C: SCL→GPIO22, SDA→GPIO21, address 0x3C)
- 4× tactile buttons (LEFT, RIGHT, ACTION, BACK → GPIO pins)
- Passive piezo buzzer (3.3V)
- Breadboard + jumpers

### HAL Functions to Implement in C

```c
// DISPLAY
void hal_clearScreen();
void hal_drawPixel(int x, int y, bool on);
void hal_drawSprite(int x, int y, const uint8_t* sprite, int w, int h, bool inverted);
void hal_drawText(int x, int y, const char* text, int size);
void hal_flush();

// INPUT
bool hal_isButtonPressed(int button);
void hal_onButtonDown(int button, void (*callback)(int));

// AUDIO
void hal_playTone(int freq, int durationMs);
void hal_playSfx(const char* name);

// STORAGE
void hal_saveState(const char* key, const char* json);
char* hal_loadState(const char* key);

// NETWORK
char* hal_httpPost(const char* url, const char* body, int timeoutMs);
bool hal_isOnline();

// TIME
unsigned long hal_now();
void hal_tickInterval(void (*callback)(), int intervalMs);
```

### Implementation Order (suggested)

1. **ESP32 HAL** — SSD1306 display init, framebuffer, font, GPIO button input, buzzer tone
2. **Core game state** — Port `state.js` structs to C
3. **Food system** — Port `food.js` (11 foods, effects, availability rules)
4. **Sprites** — Port sprite data as `const uint8_t[]` arrays
5. **Engine** — Port tick loop, stat decay, sugar states, poop, sickness, death, save/load (SPIFFS)
6. **State machine** — Port button routing, action handlers, offline dialogue
7. **Renderer** — Port drawing logic to SSD1306 framebuffer
8. **Audio** — Port SFX table to buzzer tones
9. **AI integration** — Port `ai.js` HTTP client using WiFiClient
10. **Minigames** — Port all 3 minigames

### Key Gotchas for ESP32 Port

- **Memory**: All sprite data should be in `PROGMEM` / flash. gameState fits in ~2KB RAM.
- **Display**: SSD1306 supports partial refresh — only redraw changed regions for performance.
- **WiFi**: Connect only when TALK is triggered, disconnect after response. Don't keep WiFi on constantly.
- **Persistence**: Use SPIFFS or NVS for save state. JSON serialize/deserialize with ArduinoJson.
- **Offline time**: Use NTP for accurate time when WiFi available, `millis()` fallback.
- **Audio**: Single-channel piezo can play one tone at a time. Map Web Audio SFX to frequency sequences.
- **Eating animation**: The renderer modifies game state when eating animation completes (the one intentional exception). Same pattern applies in C.
- **AI thinking**: The async model needs adaptation — ESP32 can use non-blocking HTTP with a polling check in the main loop.

---

## Verification Checklist (Phase 4, all passing)

1. Open page → pet displays idle animation with personality cycle
2. Enable AI in dev panel → set Ollama URL → press Force Talk → "thinking..." animation → AI response appears → dismiss with ACTION/BACK
3. Press BACK during "thinking..." → cancels request, returns to IDLE
4. Disable AI / set bad URL → TALK falls back to offline responses instantly
5. Offline responses vary by stat urgency (hunger < 20 triggers hungry responses) and personality (high sass = sarcastic)
6. Wait ~24 ticks at high speed → pet initiates dialogue on its own
7. Let pet die → eulogy appears on death screen (AI-generated or fallback)
8. Adjust personality sliders in dev panel → idle animation changes (e.g., max sass → side-eye sprite in idle cycle)
9. Save/load preserves AI config and personality settings
10. All Phase 1-3 features still work (minigames, sound, feeding, sugar rush, etc.)
