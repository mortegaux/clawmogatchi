# Product Requirements Document: CLAWMOGATCHI

## 1. Overview

### 1.1 Concept
Clawmogatchi is an AI-powered virtual pet inspired by the classic Tamagotchi, featuring a Claude-inspired mascot character ("Claw"). Unlike traditional virtual pets that operate on fixed logic trees, Clawmogatchi connects to a large language model backend to give the pet genuine personality, contextual dialogue, memory of past interactions, and personality evolution. The project is built with a **dual-target architecture**: an HTML/Canvas desktop emulator for rapid design and testing, and an ESP32 hardware target for physical deployment. Both targets share the same core game logic via a hardware abstraction layer (HAL).

**Secondary goal:** This project is designed as a STEM learning tool to introduce a 12-year-old to vibe coding, hardware tinkering, and AI concepts. The game design, food system, and interactions are intentionally kid-focused — fun, expressive, and rewarding to customize. The emulator-first approach lets a young coder see results immediately in a browser before graduating to physical hardware.

### 1.2 Target Platforms

**Primary (Development & Testing):**
- HTML5 Canvas + JavaScript browser emulator
- Simulates the ESP32 display, buttons, buzzer, and time system
- Runs in any modern browser, no install required
- Pixel-perfect 1:1 representation of hardware display (128x64 pixels, 1-bit)
- Keyboard keys mapped to physical buttons
- Dev tools: speed up time, inspect stats, trigger events, save/load state

**Secondary (Hardware Deployment):**

*Core components:*
- ESP32-WROOM-32 (on hand)
- Hosyond 0.96" SSD1306 128x64 OLED display, I2C, white (ordered — 5-pack, ASIN B09T6SJBV5)
  - Wiring: VCC→3.3V, GND→GND, SCL→GPIO22, SDA→GPIO21
  - I2C address: likely 0x3C (verify with scanner on arrival)
- 4x tactile push buttons (LEFT, RIGHT, ACTION, BACK)
- Passive piezo buzzer (3.3V compatible)
- Breadboard + jumper wires (prototyping)
- Micro-USB cable (power + programming)

*Portability (Phase 6):*
- TP4056 LiPo charging module (~$2)
- 3.7V LiPo battery, 500-1000mAh with JST connector and built-in protection circuit (~$5-8)
- Slide switch for physical on/off

*Motion & Interaction (Phase 6):*
- MPU6050 accelerometer/gyro (GY-521 breakout, ~$2-3) — I2C, shares bus with OLED
  - Enables: shake to play, tilt to navigate, step counter, drop detection
- Coin-type vibration motor (~$1) — haptic feedback when pet pokes for attention

*Visual Feedback (Phase 6):*
- WS2812B NeoPixel single RGB LED (~$1) — mood light behind/around screen
  - Happy = warm glow, sick = red pulse, sleeping = dim blue
- LDR photoresistor (~$0.50) — pet auto-sleeps in dark, reacts to brightness

*Audio Upgrade (v2, replaces piezo):*
- MAX98357A I2S amplifier + 8Ω speaker (~$4 total) — chiptune melodies, richer sound

*Enclosure:*
- 3D printed custom case (preferred) or small project box with cutouts
- Kid-customizable option: decorated cardboard/foam for first pass

*Estimated total cost (beyond ESP32):* ~$15-25 for full build

**Backend (AI Personality):**
- Ollama running on Unraid server (local, free, private) — primary
- Claude API as fallback/alternative (smarter, costs per call)
- Pet functions fully offline; AI enhances but is not required

### 1.3 Core Experience
**The pet feels alive and uniquely yours — a creature with real personality that remembers you, reacts to how you treat it, and surprises you with things a scripted pet never could.**

The Tamagotchi care loop (feed, play, clean, monitor stats) provides the mechanical foundation. The AI personality layer transforms it from a toy into a companion.

---

## 2. Scope & Design Philosophy

### 2.1 What's IN Scope

- Classic Tamagotchi stat loop: hunger, happiness, energy, hygiene, social
- Stat decay over real time (configurable tick rate)
- Button-driven interactions: feed, play, clean, talk, sleep
- 1-bit pixel art character with animation states (idle, eating, sleeping, happy, sad, sick, talking, dead)
- AI-generated dialogue when WiFi/backend is available
- Personality traits that evolve based on care patterns
- Persistent state across reboots (localStorage in emulator, SPIFFS/NVS on ESP32)
- 2-3 simple minigames playable with 4 buttons
- Day/night cycle tied to real clock
- Sound effects via buzzer/Web Audio API
- Status screens (stats, personality, age, history)
- Death and rebirth mechanics
- Desktop emulator with dev tools (time warp, stat editing, event triggers)
- Hardware abstraction layer enabling shared game logic

### 2.2 What's OUT of Scope

- Multiplayer / pet-to-pet communication
- Voice input/output (mic, speaker)
- Color display or graphics beyond 1-bit
- Mobile app (the emulator runs in mobile browsers but is not a native app)
- Cloud sync between emulator and hardware
- ESP32-CAM or camera integration
- Physical enclosure design (documented as future work, not part of software PRD)
- OTA firmware updates (manual flash is fine for v1)
- Complex evolution tree with multiple species/forms (v1 has one character with mood-based visual variations)

### 2.3 Rationale for Cuts

**Multiplayer/pet-to-pet:** Requires BLE or WiFi Direct protocol design, significantly increases complexity. The core experience is a single-player relationship with the pet. Revisit in v2 if the base is solid.

**Voice I/O:** Adds I2S hardware (mic + DAC + speaker), audio processing, and streaming to backend. Massive scope increase for a feature that isn't core to the Tamagotchi loop. The text-based AI dialogue achieves the personality goal without voice.

**Color display:** The SSD1306 128x64 1-bit OLED is cheap ($3-4), well-documented, and the monochrome aesthetic matches the retro Tamagotchi feel. Color (ST7735, ILI9341) would require rethinking all pixel art and adds cost/complexity.

**Cloud sync:** Emulator and hardware are separate instances of the same pet. Syncing state between them requires conflict resolution logic and a server component. Not worth it for v1.

**Complex evolution tree:** Classic Tamagotchis had branching evolution trees (baby → child → teen → adult) with care quality determining the path. This is a significant content and balancing effort. V1 has one character form with visual mood/personality variations (accessories, expressions). Evolution is a great v2 feature.

**OTA updates:** ESP-IDF supports OTA but it adds partition management, rollback logic, and a serving endpoint. Manual USB flash is fine during development.

---

## 3. Core Mechanics

### 3.1 Stats System

Five core stats, each ranging from 0-100 (stored as integers).

**Hunger (0 = starving, 100 = full):**
- Decay rate: -2 per tick (1 tick = 5 real minutes, configurable)
- If hunger < 20: pet displays hungry animation, happiness decays 2x
- If hunger = 0 for 12 consecutive ticks (1 hour): pet gets sick
- Feeding restores variable amount depending on food type (see §3.7 Food System)
- Overfeeding (hunger > 90 when fed): happiness -5, pet displays stuffed animation

**Happiness (0 = miserable, 100 = joyful):**
- Decay rate: -1 per tick
- Boosted by: playing minigames (+10-25 depending on outcome), talking (+5-15 from AI interaction), petting/ACTION button when idle (+3)
- If happiness < 20: pet refuses to play, AI dialogue becomes melancholy
- If happiness = 0 for 24 consecutive ticks (2 hours): pet gets sick

**Energy (0 = exhausted, 100 = rested):**
- Decay rate: -1 per tick during "awake" hours
- Restored by: sleeping (+3 per tick while asleep), napping (+15 quick rest action)
- If energy < 15: pet auto-sleeps (cannot interact except wake)
- Sleep cycle: pet should sleep ~8 ticks (40 min real time, scaled)
- Waking a sleeping pet: energy +0, happiness -10 (don't do this)

**Hygiene (0 = filthy, 100 = clean):**
- Decay rate: -1 per 2 ticks
- Drops sharply after pooping (-15 per poop event)
- Poop events: random, ~1 per 12 ticks (1 hour), influenced by feeding frequency
- Cleaning restores +30
- If hygiene < 15: pet gets sick (faster than hunger/happiness)
- Poop remains on screen until cleaned (classic Tamagotchi behavior)

**Social (0 = lonely, 100 = fulfilled):**
- Decay rate: -1 per 3 ticks
- Boosted by: talking to pet via AI (+10-20), playing minigames (+5), petting (+2)
- If social < 20: pet displays attention-seeking animation (calling out)
- Social is the primary driver for AI interaction incentive

### 3.2 Time System

**Real-time based with configurable scaling:**
- 1 tick = 5 real minutes (default)
- Emulator dev mode: 1 tick = 5 seconds (for testing)
- Emulator supports time-warp: jump forward N ticks instantly
- Hardware: RTC or NTP time when WiFi available, millis() fallback
- Day/night: 7am-10pm = awake, 10pm-7am = sleep (adjustable)
- Pet auto-sleeps at night, auto-wakes in morning
- Stats still decay during sleep but at 50% rate (except energy which restores)

**Offline time handling:**
- When device powers on after being off, calculate elapsed ticks
- Apply stat decay for missed time (capped at 288 ticks / 24 hours)
- If off for > 24 hours: pet is in critical state but alive
- If off for > 72 hours: pet has died (can be reborn)

### 3.3 Sickness & Death

**Sickness triggers:**
- Hunger = 0 for 12+ ticks
- Happiness = 0 for 24+ ticks
- Hygiene < 15 for 6+ ticks
- Random chance: 2% per tick if any stat < 25

**When sick:**
- All stat decay rates doubled
- Pet displays sick animation (thermometer, dizzy eyes)
- Cure: medicine action (available once per 6 ticks)
- If sick for 36 ticks (3 hours) without medicine: death

**Death:**
- All interaction disabled
- Death screen displayed with age and cause
- After viewing death screen: option to "Remember" (view AI-generated eulogy if online) or "New Pet" (reset all stats, increment generation counter)
- Generation counter persists across deaths

### 3.4 AI Personality System

**Personality Traits (each 0-100, evolve over time):**
- Sass (low = earnest, high = sarcastic/witty)
- Curiosity (low = content, high = asks questions, shares facts)
- Affection (low = independent, high = clingy/affectionate)
- Energy (low = chill/zen, high = hyperactive/excitable)
- Philosophical (low = practical, high = existential/deep)

**Trait evolution:**
- Traits shift based on care patterns over rolling 48-tick windows
- Consistent feeding → lower sass, higher affection
- Neglect → higher sass, lower affection
- Lots of play → higher energy
- Lots of talk → higher curiosity, higher philosophical
- Balanced care → traits drift toward center

**AI Dialogue Generation:**
- Triggered by: TALK button, or pet initiates (random, ~1 per 24 ticks)
- ESP32 sends HTTP POST to backend with: current stats, personality traits, recent event history (last 10 events), time of day, pet age
- Backend (Ollama/Claude) generates 1-3 short sentences (max 140 chars to fit display)
- Response displayed as scrolling text on screen
- If offline: falls back to ~50 pre-written responses mapped to stat ranges and personality quadrants

**System prompt template for AI backend:**

```
You are Claw, a small virtual pet creature. You have a personality
defined by these traits (0-100 scale): sass={sass}, curiosity={curiosity},
affection={affection}, energy={energy}, philosophical={philosophical}.

Current state: hunger={hunger}, happiness={happiness}, energy={energy_stat},
hygiene={hygiene}, social={social}. Age: {age} ticks. Time: {time_of_day}.

Recent events: {event_log}

Respond in character as Claw. Keep responses under 140 characters.
Use simple language. Be expressive. React to your current state.
If hungry, mention it. If happy, show it. If neglected, guilt trip
your owner (scaled by sass trait).
```

### 3.5 Button Interactions

**4-button layout: LEFT, RIGHT, ACTION, BACK**

**Menu navigation:**
- LEFT/RIGHT: cycle through menu icons along top of screen
- ACTION: select current menu item
- BACK: return to main screen / cancel

**Menu items (6 icons, cycled with LEFT/RIGHT):**
1. 🍖 FEED — action opens food submenu (see §3.7 Food System — scroll through food options with LEFT/RIGHT, select with ACTION)
2. 🎮 PLAY — starts a random minigame
3. 🧹 CLEAN — cleans poop / bathes pet (+30 hygiene)
4. 💬 TALK — triggers AI dialogue (or offline fallback)
5. 💤 SLEEP — toggles lights off/on (manual sleep/wake)
6. 💊 MEDICINE — available only when sick, cures sickness
7. 📊 STATS — shows stat bars and personality summary

**Idle screen interactions:**
- ACTION when no menu selected: pet reacts (small happiness boost, animation)
- Leaving pet on idle screen: pet plays idle animations, occasional autonomous actions

### 3.6 Minigames

**Game 1: Memory Match**
- Pet shows a sequence of 3-6 directional arrows (LEFT/RIGHT pattern)
- Player repeats the sequence using LEFT/RIGHT buttons
- Correct: happiness +15, streak bonus +5 per consecutive win
- Wrong: happiness +5 (consolation), streak resets
- Difficulty scales with pet age (longer sequences)

**Game 2: Dodge**
- Side-scrolling obstacle avoidance
- Pet auto-runs right, player presses ACTION to jump
- Obstacles appear at random intervals
- Survive 10 obstacles: happiness +20
- Hit obstacle: happiness +8 (partial credit)
- Speed increases every 5 obstacles

**Game 3: Guessing Game (classic Tamagotchi)**
- Pet thinks of LEFT or RIGHT
- Player guesses by pressing LEFT or RIGHT
- Best of 5 rounds
- Win 3+: happiness +25
- Win 1-2: happiness +10
- Win 0: happiness +3, sass +1

---

## 4. Food System

The food system is designed to be fun and expressive for a kid audience. Each food has a unique 8x8 sprite and a unique eating animation. The variety makes feeding the pet a discovery experience, not just a stat button.

### 4.1 Food Categories

**Meals (restore hunger, small happiness boost):**

| Food | Hunger | Happiness | Other | Notes |
|------|--------|-----------|-------|-------|
| Pizza slice | +20 | +5 | — | Reliable all-rounder |
| Ramen bowl | +25 | +3 | — | Best hunger restore |
| Tacos | +20 | +5 | — | Pet does happy wiggle |
| Mac & cheese | +15 | +5 | — | Comfort food |

**Candy & Treats (big happiness, consequences):**

| Food | Hunger | Happiness | Other | Notes |
|------|--------|-----------|-------|-------|
| Gummy bears | +5 | +20 | Hygiene -5 | Sticky paws animation |
| Ice cream cone | +10 | +25 | Energy -5 (delayed) | Sugar crash after 3 ticks |
| Chocolate bar | +5 | +15 | — | Simple treat |
| Sour candy | +3 | +20 | — | Funny pucker-face animation |
| Lollipop | +2 | +15 | — | Long licking animation |

**Special / Rare Foods:**

| Food | Hunger | Happiness | Other | Notes |
|------|--------|-----------|-------|-------|
| Birthday cake | +10 | +100 (full) | — | Only available on pet's birthday (every 288 ticks). Confetti animation. |
| Mystery food | ±random | ±random | Random side effect | Could be amazing or gross. Pet reacts with surprise. 50% chance good/bad. |

### 4.2 Sugar Rush / Sugar Crash Mechanic

This teaches cause-and-effect without being preachy — the pet's reaction tells the story.

**Trigger:** 3+ candy/treat items fed within a 6-tick window

**Sugar Rush phase (immediate, lasts 3 ticks):**
- Pet enters hyperactive animation (bouncing, spinning, stars around head)
- Energy spikes +20
- Happiness +10
- Pet's AI dialogue becomes manic/silly ("EVERYTHING IS AMAZING! LET'S GO! WHEEE!")

**Sugar Crash phase (after rush ends, lasts 3 ticks):**
- Energy -30
- Happiness -10
- Pet enters sluggish animation (droopy, slow movement)
- AI dialogue becomes grumpy ("ugh... I don't feel so good... why did I eat all that...")

**Cooldown:** No candy effects for 6 ticks after crash ends (pet refuses treats: "my tummy says no")

### 4.3 Food Selection UI

In the FEED submenu:
- LEFT/RIGHT scrolls through available foods (wrapping carousel)
- Current food shown as large sprite (scaled 2x) in center of screen
- Food name displayed in text bar
- ACTION selects and feeds
- BACK returns to main menu
- Foods are grouped: meals first, then candy, then special (if available)

### 4.4 Feeding Animation

Each food has a 4-frame eating sequence:
1. Food sprite approaches pet from right
2. Pet opens mouth, food reaches pet
3. Pet chews (mouth animation, 2 frames)
4. Food gone, pet reacts (expression based on food type)

Candy items have a bonus 5th frame for the side effect (sticky paws, pucker face, etc.)

Each food item requires a unique 8x8 sprite (11 foods = 11 sprites).

---

## 5. Emulator Architecture

### 5.1 Design Principles

The emulator is NOT an ESP32 emulator. It's a **game emulator** — it replicates the Clawmogatchi experience in a browser, sharing core game logic with the hardware target through a common abstraction layer.

**Architecture:**

```
┌─────────────────────────────────────────┐
│          SHARED GAME LOGIC (JS/C)       │
│  Stats engine, tick system, AI client,  │
│  minigames, state machine, animations   │
├──────────────────┬──────────────────────┤
│  EMULATOR HAL    │   ESP32 HAL          │
│  (JavaScript)    │   (C/Arduino)        │
│                  │                       │
│  Canvas 128x64   │   SSD1306 OLED       │
│  Web Audio API   │   Piezo buzzer       │
│  Keyboard input  │   GPIO buttons       │
│  localStorage    │   SPIFFS/NVS         │
│  fetch() API     │   WiFiClient HTTP    │
│  Date.now()      │   NTP/millis()       │
└──────────────────┴──────────────────────┘
```

### 5.2 Language Strategy

**Option A: JavaScript everywhere (Recommended for v1)**
- Emulator: native JS in browser
- ESP32: port game logic to C/Arduino manually, using the JS version as spec
- Pros: fastest to prototype, emulator is zero-install, web-native
- Cons: manual port to C for hardware, potential drift between implementations

**Option B: C core with Emscripten**
- Write game logic in C, compile to WebAssembly for emulator, compile to ESP32 natively
- Pros: single source of truth, no drift
- Cons: slower iteration in browser, Emscripten build complexity, harder to add dev tools

**Option C: MicroPython on both**
- Emulator: Python with Pygame or browser via Pyodide
- ESP32: MicroPython
- Pros: same language both sides
- Cons: MicroPython is slow on ESP32, limited library support, Pyodide is heavy

**Recommendation: Option A for speed, with clear interface contracts.** Write the game logic in JS as a clean module with a defined API surface. The ESP32 port reads like a 1:1 translation. The HAL interface is small enough (~15 functions) that keeping them in sync is manageable.

### 5.3 HAL Interface (Hardware Abstraction Layer)

```javascript
// DISPLAY
hal.clearScreen()
hal.drawPixel(x, y, on)           // 1-bit: on = true/false
hal.drawSprite(x, y, spriteData)  // spriteData = 2D bit array
hal.drawText(x, y, text, size)    // size: 1 = 5x7 font, 2 = scaled
hal.flush()                        // push framebuffer to display

// INPUT
hal.isButtonPressed(button)        // button: LEFT, RIGHT, ACTION, BACK
hal.onButtonDown(button, callback)
hal.onButtonUp(button, callback)

// AUDIO
hal.playTone(frequency, durationMs)
hal.playMelody(noteArray)          // [{freq, dur}, ...]

// STORAGE
hal.saveState(key, jsonString)
hal.loadState(key) → jsonString

// NETWORK
hal.httpPost(url, jsonBody) → Promise<jsonResponse>
hal.isOnline() → boolean

// TIME
hal.now() → timestamp (ms)
hal.tickInterval(callback, intervalMs)
```

### 5.4 Emulator-Specific Features (Dev Tools)

- **Time warp slider**: speed up tick rate from 1x to 100x
- **Stat editor**: click any stat to manually set its value (0-100)
- **Event injector**: trigger poop, sickness, sleep, random AI dialogue
- **Personality editor**: adjust trait values manually
- **State export/import**: JSON dump of full game state
- **Screen zoom**: 1x (128x64), 2x, 4x, 8x for pixel art design
- **Animation preview**: cycle through all animation states
- **Grid overlay**: toggle pixel grid for sprite alignment
- **Console log**: shows tick events, stat changes, AI requests/responses
- **Screenshot**: capture current frame as PNG

### 5.5 Emulator UI Layout

```
┌──────────────────────────────────────────────────────┐
│  CLAWMOGATCHI EMULATOR                    [⚙ Dev]    │
├───────────────────────────┬──────────────────────────┤
│                           │                          │
│   ┌───────────────────┐   │   STATS                  │
│   │                   │   │   ████████░░ Hunger: 80   │
│   │   128x64 DISPLAY  │   │   ██████░░░░ Happy: 60   │
│   │   (scaled 4x)     │   │   ████░░░░░░ Energy: 40  │
│   │                   │   │   █████████░ Hygiene: 90  │
│   │                   │   │   ███░░░░░░░ Social: 30   │
│   └───────────────────┘   │                          │
│                           │   PERSONALITY            │
│   [←] [→] [A] [B]        │   Sass: 45               │
│   (Z)  (X) (A) (S)       │   Curiosity: 72          │
│                           │   Affection: 58          │
│   ⏩ Speed: [1x ▼]       │   Energy: 31             │
│   🕐 Age: 142 ticks      │   Philosophical: 66      │
│   📅 Gen: 1              │                          │
│                           │   EVENT LOG              │
│                           │   12:05 - Fed (meal)     │
│                           │   12:00 - Tick #142      │
│                           │   11:55 - Talked (AI)    │
├───────────────────────────┴──────────────────────────┤
│  [💾 Save] [📂 Load] [📸 Screenshot] [🔄 Reset]     │
└──────────────────────────────────────────────────────┘
```

Keyboard mapping:
- Z = LEFT, X = RIGHT, A = ACTION, S = BACK
- Arrow keys as alternate: ← → ↵ Esc

---

## 6. Visual Design

### 6.1 Display Layout (128x64, 1-bit)

```
┌────────────────────────────────────┐
│ 🍖 🎮 🧹 💬 💤 💊 📊  │ 8px icon bar
├────────────────────────────────────┤
│                                    │
│         PET AREA                   │  48px main area
│         (character + animations)   │
│                                    │
├────────────────────────────────────┤
│ [status text / dialogue]           │  8px text bar
└────────────────────────────────────┘
```

- Icon bar: 7 icons × 8x8 pixels, selected icon is inverted (white bg, black icon)
- Pet area: 128x48 pixels for character, animations, poop sprites, minigame playfield
- Text bar: single line scrolling text for dialogue, notifications

### 6.2 Character Design — "Claw"

**Base form (16x16 sprite, centered in pet area):**
- Rounded rectangular body (inspired by Claude's orange/sunset brand aesthetic, rendered in 1-bit)
- Two large expressive eyes (2x3 pixels each, spaced 4px apart)
- Small mouth that changes with mood (1px line = neutral, curve up = happy, curve down = sad, open = talking, zigzag = sick)
- Two small "ears" or antennae on top (2px each, gives personality)
- Optional: tiny arms (1-2px lines) that animate with gestures

**Animation states (frames per state):**
- Idle: 2 frames, slow blink cycle (120 tick interval)
- Happy: 2 frames, bouncing (4px vertical oscillation)
- Sad: 2 frames, drooping ears, slow sway
- Eating: 4 frames, mouth open/close cycle with food sprite approaching (5 frames for candy — bonus reaction frame)
- Sleeping: 2 frames, closed eyes, Z sprites floating up
- Talking: 3 frames, mouth shapes cycling, speech bubble appears
- Sick: 2 frames, swirl over head, body sways
- Playing: 3 frames, jumping/spinning
- Attention: 2 frames, waving arms, exclamation mark
- Dead: 1 frame, X eyes, halo/angel wings, static
- Pooping: 2 frames, embarrassed expression, poop sprite appears behind
- **Sugar Rush: 3 frames, rapid bouncing, stars orbiting head, wide eyes**
- **Sugar Crash: 2 frames, droopy body, half-closed eyes, slow sway, green-tint cheeks**
- **Sour face: 2 frames, puckered lips, squinted eyes (sour candy reaction)**
- **Stuffed: 2 frames, round belly, sleepy expression (overfeeding reaction)**

### 6.3 Additional Sprites

- Poop: 5x5 pixel classic swirl
- **Food sprites (8x8 each, 11 total):** pizza slice, ramen bowl, tacos, mac & cheese, gummy bears, ice cream cone, chocolate bar, sour candy, lollipop, birthday cake, mystery food (question mark)
- Medicine: 6x6 pill/syringe
- Sleep Z's: 3x5, float upward
- Hearts: 5x5, appear when petted
- Speech bubble: variable width, 8px tall, appears above pet
- Menu icons: 8x8 each, 7 total
- Minigame arrows: 5x7 LEFT/RIGHT indicators
- Minigame obstacles: 4x8 blocks for dodge game
- **Sugar rush effects:** stars (3x3), swirl lines (variable), speed lines
- **Sugar crash effects:** dizzy swirl (5x5), droopy eyelid overlay
- **Confetti particles:** 1x1 and 2x2 pixels for birthday cake animation

### 6.4 Screen Transitions

- Menu selection: instant (no animation, responsive feel)
- Screen switch (stats, minigame): horizontal wipe, 4 frames
- AI dialogue: text scrolls in from right, 2px per frame
- Death: screen inverts, fades to death screen

---

## 7. Technical Implementation

### 7.1 State Machine

```
STATES:
  IDLE          - Main screen, pet visible, stats decaying
  MENU          - Icon bar active, LEFT/RIGHT to navigate
  FEEDING       - Food selection submenu (carousel of food items)
  PLAYING       - Minigame active
  CLEANING      - Cleaning animation plays
  TALKING       - AI request in flight, or displaying dialogue
  SLEEPING      - Lights off, pet asleep, limited interaction
  SICK          - Sick overlay, medicine available
  DEAD          - Death screen, waiting for input
  STATS_VIEW    - Showing stat bars and personality
  SUGAR_RUSH    - Hyperactive overlay (3 ticks after 3+ candy)
  SUGAR_CRASH   - Sluggish overlay (3 ticks after rush ends)
  SETTINGS      - (emulator only) dev tools

TRANSITIONS:
  IDLE → MENU          : any LEFT/RIGHT press
  MENU → IDLE          : BACK press or timeout (10s)
  MENU → FEEDING       : ACTION on feed icon
  FEEDING → IDLE       : after eating animation completes
  FEEDING → SUGAR_RUSH : if candyCount6Tick >= 3 after feeding candy
  SUGAR_RUSH → SUGAR_CRASH : after 3 ticks
  SUGAR_CRASH → IDLE   : after 3 ticks (cooldown tracked in pet state)
  MENU → PLAYING       : ACTION on play icon
  MENU → CLEANING      : ACTION on clean icon
  MENU → TALKING       : ACTION on talk icon
  MENU → SLEEPING      : ACTION on sleep icon
  MENU → STATS_VIEW    : ACTION on stats icon
  PLAYING → IDLE       : after minigame ends
  CLEANING → IDLE      : after animation completes
  TALKING → IDLE       : after dialogue dismissed (ACTION/BACK)
  SLEEPING → IDLE      : ACTION press (wake) or auto-wake at morning
  SICK → any           : overlays on top of other states
  any → DEAD           : death condition met
  DEAD → IDLE          : ACTION press (new pet)
```

### 7.2 Data Structures

```javascript
const gameState = {
  // Core stats (0-100)
  stats: {
    hunger: 80,
    happiness: 70,
    energy: 90,
    hygiene: 85,
    social: 50
  },

  // Personality traits (0-100, evolve over time)
  personality: {
    sass: 30,
    curiosity: 50,
    affection: 50,
    energy: 50,
    philosophical: 30
  },

  // Pet status
  pet: {
    age: 0,               // ticks alive
    generation: 1,         // reincarnation count
    name: "Claw",          // user-settable
    state: "IDLE",         // current state machine state
    isSick: false,
    sickTicks: 0,          // ticks spent sick
    isAsleep: false,
    poopCount: 0,          // poops on screen (0-3 max)
    lastFed: 0,            // tick of last feeding
    lastPlayed: 0,         // tick of last minigame
    lastTalked: 0,         // tick of last AI interaction
    causeOfDeath: null,     // for eulogy generation
    sugarState: "NONE",    // NONE, RUSH, CRASH, COOLDOWN
    sugarStateTicks: 0,    // ticks remaining in current sugar state
    candyCount6Tick: 0     // candy items fed in last 6 ticks (triggers sugar rush at 3+)
  },

  // Timing
  time: {
    currentTick: 0,
    tickIntervalMs: 300000, // 5 minutes default
    lastTickTimestamp: 0,    // for offline catch-up
    dayStartHour: 7,
    nightStartHour: 22
  },

  // AI interaction log (ring buffer, last 20 entries)
  eventLog: [],

  // Personality evolution tracking (rolling window)
  careHistory: {
    feedCount: 0,          // feeds in last 48 ticks
    playCount: 0,          // plays in last 48 ticks
    talkCount: 0,          // talks in last 48 ticks
    cleanCount: 0,         // cleans in last 48 ticks
    neglectTicks: 0        // ticks with any stat < 20
  }
};
```

### 7.3 Network / AI Integration

**Request flow:**
1. User presses TALK (or pet initiates autonomously)
2. Game enters TALKING state, displays "thinking..." animation
3. HAL sends HTTP POST to backend:
   ```
   POST http://<unraid-ip>:11434/api/generate  (Ollama)
   POST https://api.anthropic.com/v1/messages   (Claude API)
   ```
4. Payload includes system prompt + current game state (see §3.4)
5. On response: display text on screen, scroll if needed
6. On timeout (5 seconds) or error: fall back to offline response pool
7. Return to IDLE after user dismisses

**Offline fallback:**
- ~50 pre-written responses organized by stat ranges and mood
- Selected by: primary stat concern (lowest stat) + personality quadrant
- Example: hunger < 20 + high sass → "Oh, so you DO remember I exist. Got any food or...?"
- Example: happiness > 80 + high affection → "I'm so happy right now! Stay with me?"

### 7.4 Persistence

**Emulator:**
- `localStorage.setItem('clawmogatchi_state', JSON.stringify(gameState))`
- Auto-save every 5 ticks
- Manual save/load buttons in dev tools
- Export as downloadable JSON file

**ESP32:**
- SPIFFS or NVS (Non-Volatile Storage)
- Serialize gameState to JSON, write to file
- Auto-save every 5 ticks
- Read on boot, apply offline time catch-up

### 7.5 Performance Considerations

**Emulator:**
- requestAnimationFrame for render loop (60fps visual, tick rate independent)
- Canvas 2D context, no WebGL needed (128x64 is trivial)
- AI fetch calls are async, UI never blocks

**ESP32:**
- Main loop: check buttons → process tick → update display → sleep
- Display update: only redraw changed regions (SSD1306 supports partial refresh)
- WiFi: connect only when TALK is triggered, disconnect after response
- Deep sleep: if battery powered, sleep between ticks to save power
- Memory: gameState fits in ~2KB, well within ESP32's 520KB SRAM
- AI requests: non-blocking HTTP with timeout

---

## 8. Audio Design

### 8.1 Sound Effects

All sounds are simple tone sequences playable on a piezo buzzer (single channel, frequency + duration).

- **Feed**: ascending 3-note chirp (C5-E5-G5, 80ms each)
- **Play win**: victory jingle (C5-E5-G5-C6, 100ms each)
- **Play lose**: descending wah-wah (G4-E4, 200ms each)
- **Clean**: sweeping tone (200Hz→800Hz, 300ms)
- **Talk received**: two-tone notification (A5-D6, 60ms each)
- **Poop**: low bloop (C3, 150ms)
- **Sick**: alarm pattern (A5-rest-A5-rest, 100ms each, repeats 3x)
- **Medicine**: healing chime (C5-E5-G5-B5-C6, 60ms each)
- **Death**: slow descending tone (C5→C3, 1000ms)
- **New pet**: fanfare (C5-C5-C5-E5-G5-E5-G5, mixed durations)
- **Button press**: short click (1000Hz, 20ms)
- **Menu navigate**: soft tick (800Hz, 15ms)

### 8.2 Music

No background music in v1. The silence between sounds is part of the Tamagotchi authenticity. Minigames may have simple looping 2-bar patterns if it enhances the feel.

---

## 9. Development Phases

### Phase 1: Emulator Shell + Core Loop (Playable Vertical Slice) ✅ COMPLETE
- [x] Set up HTML/Canvas emulator with 128x64 display (scaled 4x)
- [x] Implement HAL interface for emulator (display, input, audio, storage, time)
- [x] Keyboard input mapping (Z/X/A/S + arrow keys)
- [x] Implement tick system with configurable rate
- [x] Implement 5-stat system with decay rates
- [x] Implement state machine (IDLE, MENU, FEEDING, CLEANING, SLEEPING, DEAD, SUGAR_RUSH, SUGAR_CRASH)
- [x] Create placeholder sprites (rectangles/simple shapes)
- [x] Menu navigation with icon bar
- [x] Food selection submenu with carousel UI (LEFT/RIGHT scroll, ACTION select)
- [x] Implement all 11 food items with stat effects (meals, candy, special)
- [x] Sugar rush / sugar crash mechanic with state transitions
- [x] Candy cooldown tracking (candyCount6Tick rolling window)
- [x] Clean action with stat changes
- [x] Sleep/wake cycle with day/night
- [x] Sickness and death conditions
- [x] Poop generation and display
- [x] Persistent state via localStorage
- [x] Offline time catch-up on page load
- **Goal:** Fully playable Tamagotchi loop in browser with placeholder art. Food system complete with sugar mechanic. No AI, no minigames, no sound.
- **Delivered:** 2026-02-21. All items complete. Known Phase 1 limitations (by design): audio stubs, network/AI stubs, PLAY gives +10 happiness placeholder, SICK is isSick flag (no separate renderer branch), no sprite animation frame cycling.

### Phase 2: Art & Animation ✅
- [x] Design Claw character sprite (16x16 base)
- [x] Create all animation states (idle, happy, sad, eating, sleeping, sick, talking, dead, pooping, attention, sugar rush, sugar crash, sour face, stuffed)
- [x] Design menu icons (7 × 8x8)
- [x] Design all 11 food sprites (8x8 each: pizza, ramen, tacos, mac & cheese, gummy bears, ice cream, chocolate, sour candy, lollipop, birthday cake, mystery food)
- [x] Design additional sprites (poop, medicine, hearts, Z's, speech bubble, confetti, stars, sugar effects)
- [x] Implement sprite animation system (frame cycling with configurable timing)
- [x] Food-specific eating animations (4 frames standard, 5 frames for candy with reaction)
- [x] Sugar rush animation (stars orbiting, hyperactive bounce)
- [x] Sugar crash animation (droopy, sluggish sway)
- [x] Birthday cake confetti particle effect
- [x] Screen transitions (wipe effect)
- [x] Stats view screen with bar graphs
- [x] Add emulator dev tools: zoom levels, grid overlay, animation preview, screenshot
- **Goal:** Visually complete Tamagotchi experience. Every food has a unique sprite and eating animation. The pet looks alive and expressive.
- **Delivered:** 2026-02-22. All items complete. Eating animation defers food effects to renderer (the one intentional exception to "renderer never modifies state"). Dialogue scroll-in effect added. Talking state cycles mouth frames.

### Phase 3: Minigames & Sound
- [ ] Implement Memory Match minigame
- [ ] Implement Dodge minigame
- [ ] Implement Guessing Game minigame
- [ ] Random minigame selection from PLAY menu
- [ ] Sound effect system (Web Audio API for emulator)
- [ ] All sound effects from §7.1
- [ ] Minigame sound feedback (correct/wrong/win/lose)
- **Goal:** Feature-complete Tamagotchi with games and audio. Still no AI.

### Phase 4: AI Personality Integration
- [ ] Implement personality trait system with evolution
- [ ] Care history tracking (rolling 48-tick window)
- [ ] Trait evolution calculations per tick
- [ ] TALK action: build AI prompt from game state
- [ ] HTTP client for Ollama backend
- [ ] HTTP client for Claude API (alternative)
- [ ] Dialogue display system (scrolling text on screen)
- [ ] Offline fallback response pool (~50 responses)
- [ ] Pet-initiated dialogue (random trigger)
- [ ] Personality-influenced animations (e.g., high-sass pet has different idle)
- [ ] AI-generated death eulogy
- [ ] Emulator dev tools: personality editor, force AI dialogue
- **Goal:** The pet has personality. AI dialogue works with local Ollama. The pet feels different from a scripted toy.

### Phase 5: ESP32 Hardware Port
- [ ] Set up Arduino/ESP-IDF project
- [ ] Implement ESP32 HAL (SSD1306, GPIO buttons, buzzer, SPIFFS, WiFi HTTP)
- [ ] Port game logic from JS to C/Arduino (using JS as specification)
- [ ] Test stat system on hardware
- [ ] Test display rendering on OLED
- [ ] Test button input and menu navigation
- [ ] Test buzzer sound effects
- [ ] Test WiFi + Ollama connectivity
- [ ] Test persistence across reboots
- [ ] Test offline time catch-up
- [ ] Test battery operation (if applicable)
- **Goal:** Clawmogatchi runs on physical ESP32 hardware, functionally identical to emulator.

### Phase 6: Polish & Extras
- [ ] Naming ceremony (name your pet on first boot)
- [ ] Generation tracking with personality inheritance
- [ ] MPU6050 accelerometer integration (shake to play, tilt to navigate, step counter, drop detection)
- [ ] Vibration motor for haptic feedback (pet pokes for attention)
- [ ] WS2812B NeoPixel mood light (happy=warm, sick=red, sleeping=blue)
- [ ] LDR photoresistor (auto-sleep in dark, react to brightness)
- [ ] Personality-specific sprite variations (accessories, expressions)
- [ ] Achievement system (survived 1000 ticks, fed 50 different foods, etc.)
- [ ] Emulator: shareable state links (encode state in URL hash)
- [ ] Power optimization for battery life (TP4056 + LiPo)
- [ ] Enclosure design documentation (3D print files or laser cut plans)
- [ ] Kid-customizable enclosure options (decorated foam/cardboard template)
- **Goal:** Polished, complete physical device with motion sensing, haptic feedback, and mood lighting. Ready to show off or gift.

---

## 10. Key Design Decisions

### 10.1 Emulator-First Development
**Decision:** Build and iterate entirely in the browser emulator before touching ESP32 hardware.
**Rationale:** Browser iteration is 10-100x faster than flash-test-repeat on hardware. The emulator provides instant feedback, dev tools, and no hardware debugging headaches. The HAL pattern ensures the port is mechanical, not creative. All game design decisions happen in the emulator.

### 10.2 JavaScript for Emulator, C for ESP32 (Not Shared Language)
**Decision:** Write emulator in JS, port to C for ESP32, rather than using a shared language.
**Rationale:** A C/Emscripten approach would share code but add significant build complexity and slow browser iteration. MicroPython on ESP32 is too slow for responsive UI. The HAL interface is small (~15 functions) and the game logic is bounded (~500-1000 lines). Manual port is manageable and results in optimal code for each platform.

### 10.3 1-Bit Display (SSD1306 128x64 OLED)
**Decision:** Target a monochrome 128x64 OLED, not a color TFT.
**Rationale:** Matches retro Tamagotchi aesthetic. Extremely cheap ($3-4). Well-documented with Arduino/ESP-IDF. Forces pixel art discipline (which plays to your PICO-8 strengths). The constraint is the feature — 1-bit art with personality is more charming than mediocre color art.

### 10.4 AI as Enhancement, Not Requirement
**Decision:** The pet is fully functional offline. AI adds personality but isn't needed for the core loop.
**Rationale:** WiFi isn't always available. API calls cost money or require server uptime. A pet that breaks when offline is a bad pet. The Tamagotchi loop is proven fun without AI. The AI layer is the "plus" that makes Clawmogatchi special, but the foundation must stand alone.

### 10.5 Ollama Primary, Claude API Secondary
**Decision:** Target local Ollama on Unraid as the primary AI backend.
**Rationale:** Free, private, no API costs, no internet dependency (only LAN needed). Claude API is smarter but costs per call. For a pet that talks multiple times per day for months, local inference is more sustainable. Claude API is available as an option for users without local inference.

### 10.6 4-Button Input
**Decision:** LEFT, RIGHT, ACTION, BACK — not a D-pad, not touch, not more buttons.
**Rationale:** Classic Tamagotchi had 3 buttons (A/B/C). 4 buttons add BACK for easier navigation without complexity. Every interaction must be achievable with these 4 inputs. This constraint keeps the UI simple and the hardware build easy (4 GPIO pins + 4 resistors).

### 10.7 Real-Time with Configurable Scaling
**Decision:** Stats decay in real time (default 1 tick = 5 minutes) but the emulator can scale time.
**Rationale:** Real-time is what makes a Tamagotchi compelling — it exists in your life, not just when you play. But for development and testing, waiting 5 minutes per tick is brutal. The emulator's time warp (down to 5 seconds/tick) enables rapid testing. The tick rate is configurable so users can adjust difficulty.

### 10.8 Kid-Focused Design
**Decision:** All game elements (food, dialogue, animations, consequences) are designed for a 12-year-old audience. The project doubles as a STEM learning tool for vibe coding.
**Rationale:** The primary user is a STEM-focused 12-year-old learning to code. Food choices are things kids get excited about (pizza, gummy bears, ice cream). Consequences are playful, not punitive (sugar crash is funny, not frustrating). The emulator-first approach provides instant browser feedback — critical for maintaining a young coder's engagement loop.

### 10.9 Rich Food System Over Simple Meal/Snack
**Decision:** 11 food items across 3 categories (meals, candy, special) with a sugar rush/crash mechanic, rather than a simple meal/snack binary.
**Rationale:** For a kid audience, variety is engagement. Each food having a unique sprite and eating animation makes the FEED action a discovery experience. The sugar rush/crash mechanic teaches cause-and-effect through play (feed too much candy → funny hyperactive pet → grumpy crashed pet) without lecturing. The food carousel UI is also more fun to navigate than a 2-item submenu.

---

## 11. Success Metrics

### 11.1 Functional Requirements

- [ ] All 5 stats decay at correct rates and respond to all interactions
- [ ] Pet can be kept alive indefinitely with attentive care
- [ ] Pet dies within ~3 hours of total neglect
- [ ] All 3 minigames are playable and affect stats correctly
- [ ] AI dialogue generates contextually appropriate responses
- [ ] Offline fallback produces reasonable dialogue without AI
- [ ] State persists across browser refresh / ESP32 reboot
- [ ] Offline time catch-up correctly applies when resuming
- [ ] Day/night cycle works correctly with real time
- [ ] All animations play smoothly (no flicker, correct frames)
- [ ] All sound effects trigger at correct moments
- [ ] Emulator dev tools function correctly
- [ ] ESP32 build runs at stable framerate with no crashes

### 11.2 Feel Requirements

- Pet idle animations make it feel **alive** even when you're not interacting
- Stat decay creates a **gentle urgency** — you want to check on it, not panic
- AI dialogue makes you **smile or react** — it shouldn't feel generic
- Neglecting the pet produces **genuine guilt** (the pet communicates its state clearly)
- Minigames feel **snappy and fair** (no input lag, clear win/lose feedback)
- The 1-bit art has **charm and personality** despite the constraint
- The emulator feels like a **real device** — the scaled display, the click sounds, the button mapping

### 11.3 Authenticity

- Core loop recognizable to anyone who owned a Tamagotchi
- The AI personality layer feels like a natural evolution, not a gimmick bolted on
- The physical device (ESP32 build) feels like a complete product, not a prototype

---

## 12. Open Questions

1. ~~**Display choice**~~ **RESOLVED:** Hosyond 0.96" SSD1306 128x64 I2C OLED (white, 5-pack). Verify I2C address (0x3C vs 0x3D) on arrival.

2. **LLM model selection for Ollama**: Which model to run? Llama 3.1 8B is a good balance of quality and speed. Phi-3 Mini is smaller/faster but less personality. Mistral 7B is another option. **Depends on Unraid server specs (CPU/GPU, RAM).**

3. **Pet naming**: Should the pet always be named "Claw" or should the user name it on first boot? Naming creates attachment but adds a text input UI on a 4-button device. **Leaning toward user-nameable with "Claw" as default. Could use a letter-carousel input (LEFT/RIGHT to scroll alphabet, ACTION to confirm).**

4. ~~**Accelerometer priority**~~ **RESOLVED:** MPU6050 (GY-521 breakout) in Phase 6. I2C shared bus with OLED. Enables shake, tilt, step counter, drop detection.

5. ~~**Multiple food types**~~ **RESOLVED:** Full food system with 4 meals, 5 candy items, 2 special foods. Sugar rush/crash mechanic for cause-and-effect learning.

6. **Emulator as standalone product**: The HTML emulator could work as a standalone web toy even without the ESP32 hardware. Should it be designed to be shareable/deployable as a web page others can play? **This doesn't change the architecture, just whether we add a nice landing page and hosted version.**

7. ~~**Claude mascot IP**~~ **RESOLVED:** Design original character inspired by the concept, don't copy Anthropic logos/trademarks. "Claw" is an original character.

8. **Kid onboarding UX**: Since this is a STEM learning tool, should the emulator include a "how it works" mode that shows the code running behind the scenes? E.g., a side panel that highlights which function is executing when you press a button. **Could be powerful for teaching but significant scope increase.**

9. **Food unlocking**: Should all foods be available from the start, or should some unlock over time (e.g., birthday cake only after 288 ticks, mystery food after first death/rebirth)? **Unlocking adds progression but food variety is part of the initial appeal for a kid.**

10. **Difficulty modes**: Should there be an "easy mode" with slower stat decay for younger/more casual players? The tick rate is already configurable, but a named difficulty setting is more accessible. **Leaning yes — "Chill" (0.5x decay), "Normal" (1x), "Hardcore" (2x).**

---

## 13. References

- Original Tamagotchi (Bandai, 1996) — core loop reference
- ESP32-WROOM-32 datasheet and pinout
- SSD1306 OLED datasheet and Arduino library (Adafruit_SSD1306)
- Ollama API documentation (https://github.com/ollama/ollama/blob/main/docs/api.md)
- Anthropic Claude API documentation (https://docs.anthropic.com)
- Wokwi ESP32 Simulator (https://wokwi.com/esp32) — for hardware-level simulation if needed
- Rosetta Code Tamagotchi emulator examples (https://rosettacode.org/wiki/Tamagotchi_emulator)
- PICO-8 sprite design patterns (your existing experience)
- DEADLOCK (TIC-80) — your recent game dev for state machine patterns

---

**CLAWMOGATCHI** — *A pet with a mind of its own.*
