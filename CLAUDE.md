# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Project

No build step. Open `index.html` directly in a browser:

```bash
open index.html
# or serve locally to avoid any file:// restrictions:
python3 -m http.server 8080
```

There are no tests, no linter config, and no package manager. This is intentional — the project targets a 12-year-old learning to code, so zero toolchain friction is a feature.

## Architecture

Vanilla JS, no bundler, no modules. All files load as plain `<script>` tags. **Script load order in `index.html` is critical and must be preserved:**

```
hal → state → food → sprites → engine → state-machine → renderer → input → main
```

Each source file is an IIFE that returns a public API object assigned to a global variable (`hal`, `engine`, `stateMachine`, `renderer`, `input`). `gameState` is a single mutable object passed by reference to all modules — modules mutate it directly, they don't return new state.

### Module Responsibilities (strict separation)

| Module | Owns |
|--------|------|
| `hal.js` | Framebuffer, font, canvas I/O, button events, localStorage, audio/network stubs |
| `state.js` | `gameState` shape, `createFreshState()`, `addEventLog()`, `clampStats()`, `clampPersonality()` |
| `food.js` | Food definitions, `applyFoodEffects()`, `getAvailableFoods()` |
| `sprites.js` | All 1-bit pixel art arrays, `MENU_ICONS`, `FOOD_SPRITES` lookup, `ANIMATIONS`, `EATING_REACTIONS` |
| `engine.js` | Tick loop, stat decay, sugar states, poop, sickness, death, personality drift, save/load |
| `state-machine.js` | Button routing per state, action handlers (feed, clean, talk, sleep, medicine), offline dialogue |
| `renderer.js` | `requestAnimationFrame` loop, all canvas drawing — **never modifies gameState** (exception: eating animation completion in Phase 2) |
| `input.js` | Keyboard + HTML button events → `hal._pressButton/_releaseButton` |
| `main.js` | Entry point: init, load/catch-up, wire everything, dev panel |

### Display

- Logical display: 128×64 pixels, 1-bit (pixel on/off)
- Rendered at 4× zoom = 512×256 canvas by default (mutable in Phase 2)
- Layout rows: 0–7 = icon bar, 8–55 = pet area, 56–63 = text bar
- Pet sprite: 16×16px, centered at `PET_CENTER_X=56, PET_CENTER_Y=20` within pet area
- Font: baked-in 5×7 pixel font in `hal.js`, uppercase only

### State Machine States

`IDLE → MENU → FEEDING / PLAYING / CLEANING / TALKING / SLEEPING / STATS_VIEW`
Plus overlay states: `SUGAR_RUSH`, `SUGAR_CRASH`, `SICK` (flag on `pet.isSick`), `DEAD`

### Key Constants

- Tick default: 300,000ms (5 min); dev speed slider divides this (1–100×)
- Save key: `'clawmogatchi_state'` in localStorage
- Auto-save: every 5 ticks; offline catch-up capped at 288 ticks (24 hours)
- Sugar rush: triggered at `candyCount6Tick >= 3`; lasts 3 ticks → 3-tick crash → 6-tick cooldown

## Working on Large Phases

Each phase (especially Phase 2+) contains more changes than can be written in a single response without hitting the output token limit. **Always break phases into numbered subphases and implement one subphase at a time**, confirming with the user before proceeding to the next. For example, Phase 2 should be tackled as: Step 1 (sprites.js redesign) → Step 2 (hal.js zoom) → Step 3 (state-machine.js feeding) → Step 4 (renderer.js animations) → Step 5 (index.html + style.css dev controls).

## Development Phase Status

- **Phase 1** ✅ Complete — playable core loop, placeholder sprites
- **Phase 2** — Real pixel art + animation system (see `HANDOFF.md` for detailed step-by-step spec)
- **Phase 3** — Minigames + Web Audio API
- **Phase 4** — AI personality via Ollama (local) or Claude API (fallback)
- **Phase 5** — ESP32 C port (JS version is the spec)
- **Phase 6** — Accelerometer, haptics, NeoPixel

## Phase 2 Implementation Notes

`HANDOFF.md` contains the full Phase 2 spec with exact code snippets. Key gotcha: `state-machine.js` is parsed before `renderer.js`, so `renderer.getFrameCount()` cannot be called from `state-machine.js`. The eating animation start frame is latched in the renderer on the first frame it detects `pet._eatingFood` (set to `null` initially, not a frame number).

## Conventions

- Sprites are 2D arrays of 0/1 values: `[[0,1,0],[1,1,1],[0,1,0]]`
- `hal.drawSprite(x, y, spriteData, inverted)` — `inverted=true` flips bits (used for selected menu icons)
- All stat values are floats internally, clamped to 0–100 by `clampStats()`
- Event log is a ring buffer of 20 entries on `gameState.eventLog[]`
- Audio (`playTone`, `playMelody`) and network (`httpPost`) are no-ops until Phase 3/4
- The HTML sidebar (stat bars, personality, event log) is rendered by `renderer.js` via direct DOM manipulation, not canvas
