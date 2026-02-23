# Clawmogatchi

An AI-powered virtual pet inspired by the classic Tamagotchi. Feed, play, clean, talk to, and care for your pet lobster "Claw" — a 1-bit pixel creature with personality.

Built as a browser-first emulator with plans for ESP32 hardware deployment.

## Quick Start

No build step, no dependencies. Just open the file:

```bash
open index.html
```

Or serve locally to avoid file:// restrictions:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Controls

| Key | Button | Action |
|-----|--------|--------|
| Z / Arrow Left | LEFT | Navigate left, menu select |
| X / Arrow Right | RIGHT | Navigate right, menu select |
| A / Enter | ACTION | Confirm, pet, jump (in dodge game) |
| S / Escape | BACK | Cancel, go back |

On-screen buttons also work for mouse/touch.

## Features

**Core Loop** — Five stats (hunger, happiness, energy, hygiene, social) decay in real time. Feed, play, clean, talk, and put your pet to sleep to keep it alive and happy.

**11 Foods** — Pizza, ramen, tacos, mac & cheese, gummy bears, ice cream, chocolate, sour candy, lollipop, birthday cake (rare!), and mystery food. Candy triggers a sugar rush/crash cycle.

**3 Minigames** — Accessed via the PLAY menu icon:
- **Guessing Game** — Pet thinks LEFT or RIGHT, you guess. Best of 5 rounds.
- **Memory Match** — Watch a sequence of arrows, repeat it back. Difficulty scales with pet age.
- **Dodge** — Side-scrolling obstacle avoidance. Press ACTION to jump. Survive 10 to win.

**Sound Effects** — Web Audio oscillator-based sounds for all actions (feeding, cleaning, poop, sickness, death, menus, minigames). Toggle mute in the dev panel.

**Sickness & Death** — Neglect your pet and it gets sick. Leave it sick too long and it dies. Give medicine to cure, or start a new generation.

**Personality System** — Five personality traits (sass, curiosity, affection, energy, philosophical) evolve slowly based on how you care for your pet. Each dominant trait triggers unique idle animations and flavors dialogue.

**AI Dialogue** — Connect to a local Ollama server or Claude API to give your pet real personality-driven conversation. The pet builds context from its current stats, personality, care history, and recent events. Falls back gracefully to ~50 pre-written offline responses when AI is unavailable. Pet also initiates conversation on its own occasionally.

**Save/Load** — Auto-saves every 5 ticks. Offline catch-up calculates missed ticks when you return (capped at 24 hours).

## Dev Tools

Below the game screen:
- **Speed slider** — 1x to 100x tick speed for testing
- **Mute** — Toggle all audio
- **Zoom** — 2x / 4x / 6x / 8x display zoom
- **Minigame** — Force-start a specific minigame
- **Grid overlay** — 8px pixel grid for sprite alignment
- **Animation preview** — Cycle through animation states
- **AI Settings** — Ollama URL/model, Claude API key, enable/disable, force talk, status indicator
- **Personality Editor** — 5 trait sliders (0-100) for real-time personality adjustment
- **Save / Load / Screenshot / Reset** buttons

## Architecture

Vanilla JS, no bundler, no modules. All files load as plain `<script>` tags in order:

```
hal → state → food → sprites → minigames → ai → engine → state-machine → renderer → input → main
```

See [CLAUDE.md](CLAUDE.md) for full architecture documentation.

## File Structure

```
clawmogatchi/
├── index.html            # Emulator shell
├── style.css             # Dark retro theme
├── CLAUDE.md             # Architecture guide
├── clawmogatchi-prd.md   # Product requirements
├── MANUAL.md             # User manual
└── src/
    ├── hal.js            # Hardware abstraction (display, input, audio, storage, HTTP)
    ├── state.js          # Game state shape + helpers
    ├── food.js           # 11 food items + effects
    ├── sprites.js        # All 1-bit pixel art (16x16 pet, 8x8 food/icons)
    ├── minigames.js      # 3 minigames (guess, memory, dodge)
    ├── ai.js             # AI dialogue (Ollama/Claude API, system prompt, fallback)
    ├── engine.js         # Tick loop, stat decay, sickness, death, save/load
    ├── state-machine.js  # Button routing, action handlers, offline dialogue
    ├── renderer.js       # 60fps render loop, all drawing
    ├── input.js          # Keyboard + button event wiring
    └── main.js           # Entry point, dev panel wiring
```

## Development Phases

- Phase 1 — Core loop (complete)
- Phase 2 — Pixel art & animations (complete)
- Phase 3 — Minigames & Web Audio (complete)
- Phase 4 — AI personality via Ollama/Claude API (complete)
- Phase 5 — ESP32 hardware port
- Phase 6 — Accelerometer, haptics, NeoPixel

## License

Personal project. Not yet licensed for distribution.
