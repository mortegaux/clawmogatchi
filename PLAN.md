# Clawmogatchi → PICO-8 Tamagotchi Paradise: Conversion Plan

## Project Overview

Convert Clawmogatchi from a vanilla JS browser game into a **PICO-8 cartridge** (.p8), redesigned as a **Tamagotchi Paradise**-inspired virtual pet with multiple zoom levels, biome fields, evolution stages, an economy, and town life — all within PICO-8's constraints.

---

## PICO-8 Constraints (must design around these)

| Resource | Limit |
|----------|-------|
| Screen | 128×128 pixels, 16 fixed colors |
| Tokens | 8,192 max (Lua keywords, variables, operators) |
| Compressed code | 15,360 bytes max (for .p8.png export) |
| Sprite sheet | 128×128 pixels (256 8×8 sprites; bottom 128 shared with map) |
| Map | 128×64 tiles (top half guaranteed; bottom half shares sprite memory) |
| SFX | 64 sound effects, 4 channels |
| Music | 64 music patterns |
| Save data | `cartdata()` → 64 slots of 32-bit numbers via `dset/dget` |
| CPU | 8M vm instructions/sec (30fps) or 4M (60fps) |
| Framerate | 30fps default, 60fps with `_update60` |
| Input | 6 buttons: ⬅➡⬆⬇ (O) (X) |

---

## Tamagotchi Paradise Features to Adapt

Tamagotchi Paradise's signature features, mapped to what's feasible in PICO-8:

| Paradise Feature | PICO-8 Adaptation |
|------------------|-------------------|
| 4 zoom levels (Space/Field/Tama/Cell) | 3 views: Planet, Field, Pet (Cell is too niche) |
| Tama Fields (Sky/Land/Water biomes) | 3 biome fields with distinct tile art and characters |
| Evolution stages (Baby→Kid→Adult) | 3-stage evolution based on biome + diet |
| Gotchi Points economy | Coin system earned from minigames + care streaks |
| Shop / Items / Toys | Simple shop with food, toys, decorations |
| Minigames (Arrow, Flags) | 3 minigames (carry over Guess + Memory, add Flags) |
| Planet decoration | Place items on the field view |
| Planet levels / Missions | Level-up system gating unlocks |
| Cooking | Combine 2 ingredients → food item |
| Connection (2-device) | Skip (no multiplayer in PICO-8 single cart) |
| Emergencies (meteorites) | Random events on field view |

---

## Architecture: PICO-8 Lua Structure

Unlike the JS version's 11 files, PICO-8 uses a single Lua file with `#include` for organization (still counts against the token limit). Target structure:

```
clawmogatchi.p8
├── __lua__
│   ├── main.lua        -- _init, _update, _draw, state router
│   ├── pet.lua         -- pet data, stats, evolution, decay
│   ├── views.lua       -- planet/field/pet view rendering
│   ├── menu.lua        -- menu navigation and actions
│   ├── minigames.lua   -- 3 minigames
│   ├── shop.lua        -- shop, items, economy
│   └── util.lua        -- shared helpers, save/load
├── __gfx__             -- 128×128 spritesheet
├── __gff__             -- sprite flags
├── __map__             -- field tile maps (3 biomes)
├── __sfx__             -- sound effects
└── __music__           -- background music loops
```

**Token budget estimate** (8,192 total):
| Module | Budget |
|--------|--------|
| main + state router | ~800 |
| pet (stats, evolution, decay) | ~1,200 |
| views (3 views, rendering) | ~1,800 |
| menu + actions | ~1,000 |
| minigames (3 games) | ~1,500 |
| shop + economy | ~800 |
| util (save/load, helpers) | ~600 |
| **Headroom** | **~400** |

---

## Phased Implementation Plan

---

### Phase 1: Skeleton Cart + Core Pet Loop
**Goal:** Playable .p8 cart with a single pet on screen, basic stats, and the game tick loop.

#### Phase 1.1 — Cart Scaffold + Game State
- Create `clawmogatchi.p8` with empty sections (`__lua__`, `__gfx__`, `__gff__`, `__map__`, `__sfx__`, `__music__`)
- Implement `_init()` with game state table:
  ```lua
  g = {
    view = 0,       -- 0=pet, 1=field, 2=planet
    state = 0,      -- 0=idle, 1=menu, 2=feeding, 3=playing, etc.
    tick = 0,        -- game tick counter
    tick_timer = 0,  -- frames until next tick
    coins = 0,       -- gotchi points
    level = 1,       -- planet level
    xp = 0,          -- experience toward next level
  }
  pet = {
    hunger = 80, happy = 70, energy = 90, hygiene = 85,
    age = 0, stage = 0, -- 0=baby, 1=kid, 2=adult
    biome = 0,          -- 0=land, 1=water, 2=sky
    species = 0,        -- which creature (determined at evolution)
    sick = false, sick_t = 0,
    poop = 0, asleep = false,
    x = 56, y = 56,     -- position on field
  }
  ```
- Implement `_update()` skeleton: tick timer (150 frames = 5 sec dev / configurable), state router
- Implement `_draw()` skeleton: `cls()`, draw pet sprite, draw stat bars
- Implement `cartdata("clawmogatchi")` for save slot registration

#### Phase 1.2 — Pet Sprites (Baby Stage)
- Design baby pet sprite: 8×8 base sprite (idle frame 0 and frame 1 for blink)
- Design basic expressions: happy, sad, sick, sleeping, dead
- Place sprites on the sprite sheet (slots 0–15 reserved for pet)
- Draw the pet centered on screen with 2-frame idle animation
- Draw 4 stat bars (hunger, happy, energy, hygiene) using `rectfill` + colors

#### Phase 1.3 — Stat Decay + Tick System
- Implement tick loop: every N frames, advance one tick
  - Hunger: -2/tick (awake), -1/tick (asleep)
  - Happiness: -1/tick, doubled if hungry
  - Energy: -1/tick (awake), +3/tick (asleep)
  - Hygiene: -0.5/tick
- Implement `clamp(val, lo, hi)` helper
- Auto-sleep when energy < 15, auto-wake when energy > 50
- Poop generation: ~1/8 chance per tick, max 3
- Sickness: if hunger=0 for 8+ ticks, or hygiene<15 for 4+ ticks
- Death: sick for 24+ ticks without medicine

#### Phase 1.4 — Save / Load
- Map game state to `dset/dget` slots (64 available):
  - Slots 0–4: hunger, happy, energy, hygiene, age
  - Slots 5–9: stage, biome, species, coins, level
  - Slots 10–14: poop, sick, sick_t, asleep, xp
  - Slots 15–30: reserved for inventory/items
  - Slots 31–63: reserved for future
- Auto-save every 20 ticks
- Load on `_init()` if data exists (check slot 0 > 0)
- Offline catch-up: store a timestamp-like frame counter, calculate missed ticks on load (cap at 200)

---

### Phase 2: Menu System + Core Actions
**Goal:** Full menu navigation with feed, clean, play, sleep, medicine, and stats actions.

#### Phase 2.1 — Menu Navigation
- Design 7 menu icons (8×8 sprites): Feed, Play, Clean, Sleep, Medicine, Shop, Stats
- Draw icon bar along top or bottom of screen (128px / 7 icons = 18px spacing)
- Implement cursor navigation: ⬅/➡ to move, (O) to select, (X) to back
- Highlight selected icon (palette swap or outline)
- Menu auto-timeout: return to idle after 300 frames (~10 sec)

#### Phase 2.2 — Feeding System
- Define 8 food items (store as data tables, not sprites where possible):
  ```lua
  foods = {
    {name="bread",   cat=0, hun=15, hap=3,  cost=5},
    {name="rice",    cat=0, hun=20, hap=2,  cost=8},
    {name="fish",    cat=0, hun=25, hap=5,  cost=12},
    {name="fruit",   cat=0, hun=10, hap=8,  cost=6},
    {name="candy",   cat=1, hun=3,  hap=20, cost=10},
    {name="cake",    cat=1, hun=5,  hap=25, cost=15},
    {name="icecream",cat=1, hun=5,  hap=20, cost=12},
    {name="mystery", cat=2, hun=0,  hap=0,  cost=20},
  }
  ```
  - cat: 0=meal, 1=candy, 2=special
- Food selection carousel: ⬅/➡ to browse, (O) to feed, (X) to cancel
- Draw food sprite + name + cost on screen
- Apply stat effects + deduct coins
- 3-frame eating animation
- Candy tracking: 3+ candy in 6 ticks → sugar rush (3 ticks) → crash (3 ticks) → cooldown (6 ticks)

#### Phase 2.3 — Clean, Sleep, Medicine Actions
- **Clean:** Remove all poop, +25 hygiene, sweep animation
- **Sleep:** Toggle manual sleep, draw zzz particles, energy recovery +3/tick
- **Medicine:** Cure sickness if sick, pill animation, +10 happiness
- **Stats:** Full-screen stat view with bar charts + age + coins + level

#### Phase 2.4 — SFX Pass
- Design core sound effects in PICO-8 SFX editor:
  - `sfx(0)` — button click
  - `sfx(1)` — menu select
  - `sfx(2)` — feed chirp
  - `sfx(3)` — clean sweep
  - `sfx(4)` — sleep chime
  - `sfx(5)` — sick alarm
  - `sfx(6)` — death tone
  - `sfx(7)` — medicine jingle
  - `sfx(8)` — poop bloop
  - `sfx(9)` — coin collect
  - `sfx(10)` — level up fanfare

---

### Phase 3: Three View System (Planet / Field / Pet)
**Goal:** Implement Tamagotchi Paradise's zoom-level mechanic — three distinct views the player switches between.

#### Phase 3.1 — Pet View (Default)
- Close-up of the pet filling most of the screen (16×16 sprite scaled or detailed)
- Stat bars visible at the bottom
- All care actions (feed, clean, medicine) happen here
- Dialogue text appears here
- This is the classic Tamagotchi view

#### Phase 3.2 — Field View
- Top-down tile map view of the current biome field (16×16 tile area visible)
- Pet walks around as an 8×8 sprite on the map
- ⬅➡⬆⬇ to move pet around the field
- Field objects: food items to pick up, toy items placed by player, poop to clean
- Other NPC pets wander (1–2 simple AI walkers)
- Three biome tilesets (drawn to map section):
  - Land: grass, dirt, flowers, trees, rocks
  - Water: ocean, sand, coral, seaweed, shells
  - Sky: clouds, rainbows, stars, wind streams
- Each biome is a 16×16 tile region in the map

#### Phase 3.3 — Planet View
- Zoomed-out view of the planet as a small circle/globe
- Shows: current biome indicator, planet level, coin count, time
- Menu options: Travel (switch biome), Decorate, Missions, Clock
- Simple planet sprite (16×16 or 32×32) with rotation animation
- Travel to other biomes unlocked by planet level

#### Phase 3.4 — View Switching
- ⬆/⬇ to zoom in/out between views (or dedicated button combo)
- Smooth transition: screen wipe or iris effect between views
- State persists across view changes
- Different button mappings per view:
  - Pet View: ⬅➡ menu, (O) select, (X) back
  - Field View: ⬅➡⬆⬇ move, (O) interact, (X) zoom to pet
  - Planet View: ⬅➡ menu options, (O) select, (X) zoom to field

---

### Phase 4: Evolution + Biomes
**Goal:** Pet grows through 3 stages (baby → kid → adult), with species determined by biome and diet.

#### Phase 4.1 — Evolution Stages
- **Baby** (age 0–50 ticks): Small 8×8 sprite, limited actions, same for all biomes
- **Kid** (age 50–200): Medium sprite, biome-specific appearance
  - Determined by which biome the pet spent most time in during baby stage
  - 3 kid forms: Land Kid, Water Kid, Sky Kid
- **Adult** (age 200+): Full 16×16 sprite, diet-specific final form
  - Within each biome, 2–3 adult species based on dominant food type
  - Total: 9 adult species (3 biomes × 3 diet paths)
  - Diet tracking: count meals vs candy vs special over kid stage

#### Phase 4.2 — Biome-Specific Sprites
- Design sprite sets for each evolution path:
  - **Baby** (shared): 4 sprites (idle0, idle1, happy, sad) = 4 slots
  - **Land Kid**: 4 sprites = 4 slots
  - **Water Kid**: 4 sprites = 4 slots
  - **Sky Kid**: 4 sprites = 4 slots
  - **9 Adults**: 2 sprites each (idle, happy) = 18 slots
  - **Total pet sprites:** ~34 slots (272 pixels of sprite sheet)
- Sprite sheet layout:
  - Row 0–1 (sprites 0–31): Pet sprites (all stages)
  - Row 2–3 (sprites 32–63): Menu icons, food sprites, UI elements
  - Row 4–7 (sprites 64–127): Field tiles (top bank, safe from map sharing)
  - Row 8–15 (sprites 128–255): Shared with map data (use for maps, not sprites)

#### Phase 4.3 — Biome Time Tracking
- Track frames spent in each biome during baby stage:
  ```lua
  pet.biome_time = {0, 0, 0}  -- land, water, sky
  ```
- On evolution to kid: pick biome with most time
- During kid stage, track diet:
  ```lua
  pet.diet = {0, 0, 0}  -- meals, candy, special
  ```
- On evolution to adult: pick species based on biome + dominant diet

#### Phase 4.4 — Evolution Animation
- Flash screen, play fanfare sfx
- Old sprite shrinks/fades, new sprite grows/appears
- Show "Evolved!" text banner
- Brief stat boost: +20 to all stats on evolution

---

### Phase 5: Economy + Shop
**Goal:** Gotchi Points (coins) system with a shop to buy food, toys, and decorations.

#### Phase 5.1 — Earning Coins
- Win minigame: +10–30 coins based on performance
- Care streak bonus: +5 coins per tick where all stats > 50
- Clean poop: +2 coins each
- Level-up reward: +50 × level coins
- Evolution bonus: +100 coins

#### Phase 5.2 — Shop System
- Accessible from menu (Shop icon)
- Categories: Food, Toys, Decorations
- **Food shop:** Buy food items to feed pet (prices in food table)
- **Toy shop:** 4 toys that boost happiness when used on field
  - Ball (20 coins): +10 happy, bouncing animation
  - Book (30 coins): +8 happy, +5 curiosity equivalent
  - Swing (50 coins): +15 happy, placed on field
  - Telescope (80 coins): +10 happy, unlocks sky trivia
- **Decorations:** 4 items to place on field view
  - Flower pot (15 coins): decorative, +1 happy/tick when nearby
  - Lamp (25 coins): lights up at night
  - Fountain (60 coins): decorative, +hygiene aura
  - Flag (10 coins): marks territory

#### Phase 5.3 — Inventory System
- Store owned items in a compact bitfield (save data slots 15–30):
  - 8 food quantities (4 bits each = 0–15 stock)
  - 4 toy ownership flags (1 bit each)
  - 4 decoration placement flags (1 bit each)
- Inventory screen: list owned items with quantities
- Use item: select from inventory, apply effect

---

### Phase 6: Minigames
**Goal:** 3 minigames playable from the menu, earning coins and happiness.

#### Phase 6.1 — Guessing Game (Arrow)
- Carry over from original: pet thinks ⬅ or ➡, player guesses
- Best of 5 rounds
- Win (3+): +15 happy, +20 coins
- Lose: +5 happy, +5 coins
- Simple UI: pet sprite + arrow display + score counter

#### Phase 6.2 — Memory Sequence
- Carry over from original: show sequence of ⬅➡⬆⬇, player repeats
- Sequence length: 3 + floor(age/100), max 6
- Win: +20 happy, +25 coins
- Lose: +5 happy, +8 coins
- Animated arrows with sfx for each direction

#### Phase 6.3 — Flag Game (New — Tamagotchi Paradise style)
- Pet holds up colored flags (red=🅾, blue=❎)
- 10 rounds: pet raises a flag, player must press matching button quickly
- If pet lowers both flags: player must NOT press anything
- Speed increases each round
- Win (8+ correct): +15 happy, +20 coins
- Lose: +5 happy, +5 coins
- Timer bar shows remaining reaction time

---

### Phase 7: Planet Levels + Missions
**Goal:** Progression system that gates features and gives long-term goals.

#### Phase 7.1 — Planet Level System
- 5 planet levels, each requiring XP to advance:
  - Level 1 (start): Pet view + basic care
  - Level 2 (50 XP): Unlock Field view + 1st biome
  - Level 3 (150 XP): Unlock Shop + 2nd biome
  - Level 4 (350 XP): Unlock 3rd biome + decoration placement
  - Level 5 (600 XP): Unlock all items + special evolution path
- XP sources: care actions (+1), minigame wins (+3), evolutions (+10), missions (+5–20)
- Level-up: fanfare animation, coin reward, unlock notification

#### Phase 7.2 — Mission System
- 10 missions (achievement-like goals):
  1. Feed pet 10 times (+5 XP, +20 coins)
  2. Win 5 minigames (+10 XP, +30 coins)
  3. Evolve to kid stage (+10 XP, +50 coins)
  4. Collect 100 coins (+5 XP)
  5. Clean 10 poops (+5 XP, +15 coins)
  6. Keep all stats > 50 for 20 ticks (+15 XP, +40 coins)
  7. Evolve to adult stage (+20 XP, +100 coins)
  8. Buy all 4 toys (+10 XP, +50 coins)
  9. Visit all 3 biomes (+10 XP, +30 coins)
  10. Reach planet level 5 (+20 XP, +200 coins)
- Mission progress stored in save data (bitfield for completion)
- Mission screen accessible from Planet view

#### Phase 7.3 — Field Events
- Random events during field view (1/100 chance per frame while on field):
  - **Meteor shower:** Dodge falling sprites for 5 seconds → coins
  - **Visitor:** NPC pet appears, interact for happiness + coins
  - **Item drop:** Free food or toy appears on field
- Events only trigger at planet level 3+

---

### Phase 8: Music + Polish
**Goal:** Background music, particle effects, screen transitions, and final polish.

#### Phase 8.1 — Background Music
- 3 biome themes (8-bar loops each, 4 patterns per biome):
  - Land: gentle, pastoral melody
  - Water: flowing, bubbly arpeggios
  - Sky: airy, ethereal pads
- Menu music: simple 4-bar loop
- Minigame music: upbeat 4-bar loop (shared across all 3)
- Night/sleep: quiet, slow lullaby
- Total: ~24 SFX slots for music + ~10 for sfx = 34/64

#### Phase 8.2 — Particle Effects
- Poop cloud (small brown particles)
- Evolution sparkle (white/yellow dots)
- Sleep zzz (rising text)
- Heart when happy (floating up)
- Coin pickup (sparkle + number)
- Rain/snow weather in biomes (optional, token budget permitting)

#### Phase 8.3 — Screen Transitions
- Iris-in / iris-out between views (circle wipe)
- Palette fade on death (shift all colors to dark)
- Flash on evolution, level-up, mission complete

#### Phase 8.4 — Title Screen + Death Screen
- Title screen: "CLAWMOGATCHI" text, press start prompt, animated planet
- Death screen: memorial with pet name, age, cause of death, generation counter
- New game: hatch new egg animation (egg sprite → crack → baby)

---

### Phase 9: Balancing + Token Optimization
**Goal:** Playtest, balance stats/economy/progression, and optimize to fit within 8,192 tokens.

#### Phase 9.1 — Token Audit
- Run PICO-8 `info` command to check token/char/compressed counts
- Identify and compress verbose code:
  - Replace long variable names with short ones (e.g., `hunger` → `hun`)
  - Use numeric constants instead of strings for states
  - Compress data tables (pack food/item data into strings)
  - Remove comments (0 tokens, but count toward char limit)
  - Merge similar functions

#### Phase 9.2 — Gameplay Balancing
- Tune stat decay rates for fun (not frustrating, not trivial)
- Balance coin economy: earning rate vs shop prices
- Balance evolution timing: baby→kid→adult pacing
- Balance minigame difficulty and rewards
- Test death conditions: not too easy, not too hard to trigger
- Ensure a "perfect care" player can reach level 5 in ~1 hour real-time

#### Phase 9.3 — Multi-cart Contingency
- If token limit exceeded: split into 2 carts using `load()`
  - Cart 1: Core pet care + field view + menus
  - Cart 2: Minigames + shop (loaded on demand)
  - Shared save data via `cartdata`

---

## Sprite Sheet Layout Plan (128×128 = 256 sprites of 8×8)

```
Row 0  (spr 0-15):   Baby pet (4), Land kid (4), Water kid (4), Sky kid (4)
Row 1  (spr 16-31):  Adult species 1-3 land (6), Adult species 1-3 water (6), Adult 1-3 sky (4)
Row 2  (spr 32-47):  Menu icons (8), Food sprites (8)
Row 3  (spr 48-63):  Toys (4), Decorations (4), UI elements (8)
Row 4  (spr 64-79):  Land biome tiles (16)
Row 5  (spr 80-95):  Water biome tiles (16)
Row 6  (spr 96-111): Sky biome tiles (16)
Row 7  (spr 112-127): Shared tiles, effects, particles, poop, zzz, hearts
--- below this line: shared with map memory ---
Row 8-15 (spr 128-255): MAP DATA (3 biome maps, 16×16 each fit in 48×16 = 768 tiles)
```

## Save Data Layout (64 dset/dget slots, 32-bit each)

```
Slot 0:  hunger (0-100)
Slot 1:  happy (0-100)
Slot 2:  energy (0-100)
Slot 3:  hygiene (0-100)
Slot 4:  age (tick count)
Slot 5:  stage (0=baby, 1=kid, 2=adult)
Slot 6:  biome (0=land, 1=water, 2=sky)
Slot 7:  species (0-8 adult form)
Slot 8:  coins (0-9999)
Slot 9:  planet level (1-5)
Slot 10: xp (0-999)
Slot 11: poop count (0-3)
Slot 12: sick (0/1)
Slot 13: sick ticks (0-24)
Slot 14: asleep (0/1)
Slot 15: sugar state (0-3)
Slot 16: sugar ticks remaining
Slot 17: candy count in window
Slot 18: generation count
Slot 19: cause of death (encoded)
Slot 20-23: biome time tracking (land, water, sky, reserved)
Slot 24-26: diet tracking (meals, candy, special)
Slot 27-30: inventory bitfield (food quantities packed)
Slot 31: toy ownership bitfield
Slot 32: decoration placement bitfield
Slot 33: mission completion bitfield
Slot 34-36: mission progress counters (feeds, wins, cleans)
Slot 37: care streak counter
Slot 38: total play time (ticks)
Slot 39-63: reserved for future use
```

---

## Migration Notes (JS → PICO-8)

### What carries over directly
- Core 4-stat system (drop social — too many stats for tiny screen)
- Tick-based decay loop
- Sugar rush/crash/cooldown mechanic
- Poop/sickness/death cycle
- Guessing + Memory minigames
- Food category system (meals/candy/special)
- Save/load pattern

### What changes significantly
- **Display:** 128×64 1-bit → 128×128 16-color (more room, more color!)
- **Input:** 4 buttons → 6 buttons (⬅➡⬆⬇ + O + X)
- **Architecture:** 11 IIFE modules → single Lua file with includes
- **Rendering:** DOM canvas API → PICO-8 `spr()`, `map()`, `print()`, `rectfill()`
- **Audio:** Web Audio synthesis → PICO-8 SFX tracker
- **AI/Dialogue:** Removed entirely (no network in PICO-8) → expanded pre-written dialogue
- **Sprites:** 2D arrays of 0/1 → PICO-8 sprite editor (16-color)

### What's brand new
- Three-view zoom system (Planet/Field/Pet)
- Tile-based field with pet walking
- Evolution with biome + diet branching
- Coin economy + shop
- Planet level + mission system
- Flag minigame
- NPC pets on field
- Field events (meteor, visitor, item drop)
- Background music (3 biome themes)

### What's removed
- AI personality system (no network access in PICO-8)
- 5th stat (social) — streamlined to 4 core stats
- Personality traits — too complex for token budget
- Care history rolling window — simplified to counters
- HTML sidebar / dev panel — PICO-8 has no HTML
- Offline catch-up with real timestamps — simplified to tick delta
