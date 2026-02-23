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
hal → state → food → sprites → minigames → ai → engine → state-machine → renderer → input → main
```

Each source file is an IIFE that returns a public API object assigned to a global variable (`hal`, `engine`, `stateMachine`, `renderer`, `input`). `gameState` is a single mutable object passed by reference to all modules — modules mutate it directly, they don't return new state.

### Module Responsibilities (strict separation)

| Module | Owns |
|--------|------|
| `hal.js` | Framebuffer, font, canvas I/O, button events, localStorage, Web Audio (playTone/playMelody/playSfx), HTTP fetch |
| `state.js` | `gameState` shape, `createFreshState()`, `addEventLog()`, `clampStats()`, `clampPersonality()` |
| `food.js` | Food definitions, `applyFoodEffects()`, `getAvailableFoods()` |
| `sprites.js` | All 1-bit pixel art arrays, `MENU_ICONS`, `FOOD_SPRITES` lookup, `ANIMATIONS`, `EATING_REACTIONS` |
| `ai.js` | System prompt builder, Ollama/Claude API clients, timeout/fallback |
| `engine.js` | Tick loop, stat decay, sugar states, poop, sickness, death, personality drift, care history window, pet-initiated dialogue, save/load |
| `minigames.js` | Minigame framework + 3 games (guess, memory, dodge): startGame, handleInput, update, draw, endGame |
| `state-machine.js` | Button routing per state, action handlers (feed, play, clean, talk, sleep, medicine), async talk with AI, expanded offline dialogue (~50) |
| `renderer.js` | `requestAnimationFrame` loop, all canvas drawing, thinking animation, personality idle sprites — **never modifies gameState** (exception: eating animation completion in Phase 2) |
| `input.js` | Keyboard + HTML button events → `hal._pressButton/_releaseButton` |
| `main.js` | Entry point: init, load/catch-up, wire everything, dev panel, AI settings, personality editor |

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
- **Phase 2** ✅ Complete — real pixel art, eating animation, screen transitions, dev tools (zoom/grid/preview)
- **Phase 3** ✅ Complete — Minigames (Guess/Memory/Dodge) + Web Audio sound effects + mute toggle
- **Phase 4** ✅ Complete — AI personality via Ollama (local) or Claude API (fallback), expanded offline dialogue, personality animations, dev tools
- **Phase 5** — ESP32 C port (JS version is the spec)
- **Phase 6** — Accelerometer, haptics, NeoPixel

## Phase 2 Implementation Notes

`HANDOFF.md` contains the full Phase 2 spec with exact code snippets. Key gotcha: `state-machine.js` is parsed before `renderer.js`, so `renderer.getFrameCount()` cannot be called from `state-machine.js`. The eating animation start frame is latched in the renderer on the first frame it detects `pet._eatingFood` (set to `null` initially, not a frame number).

## Phase 3 Implementation Notes

- **Audio**: `hal.js` creates a lazy `AudioContext` on first `playSfx()` call (inside a user gesture, satisfying browser autoplay policy). All sounds use oscillator-based synthesis — no audio files needed. `hal.playSfx(name)` plays named presets from the `SFX` table. Mute toggle via `hal.setMuted(bool)`.
- **Minigames**: `minigames.js` IIFE loaded after `sprites.js`, before `engine.js`. Each game stores transient state in `gameState.pet._minigameData`. The `PLAYING` state is handled by `state-machine.js` (routes input) and `renderer.js` (calls `minigames.update/draw`). On load, if saved mid-minigame, engine resets state to IDLE.
- **Guessing Game**: Best of 5 rounds, pet thinks LEFT/RIGHT, player guesses. 3+ correct = win (+20 happiness), else +8.
- **Memory Match**: Show arrow sequence (3–6 based on pet age), player repeats. Perfect = +15–25 happiness.
- **Dodge Game**: Side-scroller, ACTION to jump obstacles. Speed increases every 5 dodges. Survive 10 = +20 happiness.
- **Dev tools**: Minigame dropdown selector and mute checkbox added to dev panel.

## Conventions

- Sprites are 2D arrays of 0/1 values: `[[0,1,0],[1,1,1],[0,1,0]]`
- `hal.drawSprite(x, y, spriteData, inverted)` — `inverted=true` flips bits (used for selected menu icons)
- All stat values are floats internally, clamped to 0–100 by `clampStats()`
- Event log is a ring buffer of 20 entries on `gameState.eventLog[]`
- `hal.httpPost(url, body, headers, timeoutMs)` is a real `fetch()` wrapper with `AbortController` timeout
- The HTML sidebar (stat bars, personality, event log) is rendered by `renderer.js` via direct DOM manipulation, not canvas

## Phase 4 Implementation Notes

- **AI Module**: `ai.js` IIFE loaded after `sprites.js`/`minigames.js`, before `engine.js`. Builds system prompts from pet state, sends to Ollama (`/api/generate`) or Claude API (`/v1/messages`) with configurable timeout and automatic fallback.
- **Async Talk**: `performTalk()` in `state-machine.js` is async. Sets `pet._aiThinking = true` → shows thinking dots animation in renderer → waits for AI response → falls back to offline dialogue on failure. BACK cancels mid-request.
- **Offline Dialogue**: ~50 pre-written responses organized by: urgent needs (stats < 20), situational (sick/sugar/poop), personality-flavored (dominant trait > 60), general happy.
- **Care History**: `careHistory._tickWindow` is a ring buffer of last 48 ticks. Per-tick flags (`_fedThisTick`, `_playedThisTick`, etc.) are set by action handlers, consumed by `updateCareHistoryWindow()` each tick, and counters are recomputed from the window.
- **Pet-Initiated Dialogue**: ~1 in 24 ticks (AI enabled) or ~1 in 48 (offline) random chance during IDLE. Calls `stateMachine.performTalk()`.
- **Death Eulogy**: On death, `requestEulogy()` async-requests an AI eulogy stored in `pet._eulogy`. Fallback pool of 5 pre-written eulogies. Displayed on death screen.
- **Personality Animations**: Dominant trait (highest of 5) triggers a unique idle sprite every ~300 frames (petSassIdle, petCuriousIdle, petAffectionIdle, petEnergyIdle, petPhiloIdle). Only shown if dominant trait >= 40.
- **Dev Tools**: AI Settings panel (Ollama URL/model, Claude API key, enable toggle, force dialogue button, status indicator). Personality Editor (5 sliders, 0–100, live adjustment). Both in collapsible `<details>` sections.
- **Save Compat**: Old saves without `aiConfig` or `_tickWindow` get them merged in on load (main.js). Mid-TALKING state resets to IDLE on load (engine.js).
