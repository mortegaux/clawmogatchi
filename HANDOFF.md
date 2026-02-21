# Clawmogatchi — Phase 2 Handoff

**Date:** 2026-02-21
**Status:** Phase 1 complete ✅ — ready to implement Phase 2 (Art & Animation)

---

## What Phase 1 Delivered

Fully playable Tamagotchi loop in the browser:

- `index.html` — emulator shell: dark retro theme, two-column layout
- `style.css` — stat bars, badge system, button styling
- `src/hal.js` — 128×64 framebuffer, 5×7 font, localStorage, audio/network stubs
- `src/state.js` — `gameState` shape, `createFreshState`, `addEventLog`, `clampStats`
- `src/food.js` — 11 foods (4 meals, 5 candy, 2 special), `applyFoodEffects`, `getAvailableFoods`
- `src/sprites.js` — placeholder 1-bit sprites, `MENU_ICONS`, `FOOD_SPRITES` lookup
- `src/engine.js` — tick loop, stat decay, sugar states, poop, sickness, death, save/load
- `src/state-machine.js` — button routing per state, action handlers, offline dialogue
- `src/renderer.js` — rAF render loop, icon bar, pet area, food carousel, HTML sidebar
- `src/input.js` — keyboard + HTML button → `hal._pressButton/_releaseButton`
- `src/main.js` — init, load/catch-up, wire everything, dev panel

**Known Phase 1 limitations (intentional, Phase 2 fixes):**
- Audio: stubs (no-ops)
- Network/AI: stubs (offline dialogue only)
- PLAY button: +10 happiness placeholder (Phase 3)
- SICK: `isSick` flag overlay, not a separate renderer branch yet
- No sprite animation (all sprites are static rectangles with dot eyes)
- No eating animation (food effects apply instantly on ACTION press)

---

## Phase 2 Scope — Art & Animation

### Files to modify (in implementation order)

| File | Nature of change |
|------|-----------------|
| `src/sprites.js` | Full redesign + new sprites + `ANIMATIONS` table + `EATING_REACTIONS` |
| `src/hal.js` | Mutable `ZOOM` + `hal.setZoom(n)` |
| `src/state-machine.js` | FEEDING ACTION: set animation flags instead of applying effects immediately |
| `src/renderer.js` | Eating animation, screen transitions, sugar crash sway, talking mouth, confetti, grid overlay, animation preview |
| `index.html` | Add zoom dropdown, grid checkbox, animation preview canvas+select to dev panel |
| `style.css` | Style new dev panel controls and preview canvas |

---

## Step 1 — `src/sprites.js` (do first, everything else depends on it)

### New pet frames to add (16×16 each)

| Key | Expression |
|-----|-----------|
| `petEat0` | Mouth slightly open — food approaching |
| `petEat1` | Mouth wide open — food at face |
| `petEat2` | Cheeks puffed, mouth closed — chewing |
| `petReactHappy` | Big smile + sparkle eyes |
| `petReactSour` | Puckered lips, squinted eyes |
| `petReactStuffed` | Round cheeks, sleepy eyes |
| `petTalking0` | Mouth open (talking frame A) |
| `petTalking1` | Mouth mid (talking frame B) |

Existing frames to **redesign** (keep same keys, replace pixel data):
`petIdle0`, `petIdle1`, `petHappy`, `petSad`, `petSick`, `petSleep`, `petDead`, `petSugarRush`, `petSugarCrash`

### New effect sprites to add

| Key | Size | Description |
|-----|------|-------------|
| `confetti0` | 3×3 | Confetti particle shape A |
| `confetti1` | 3×3 | Confetti particle shape B |
| `confetti2` | 3×3 | Confetti particle shape C |
| `speedLine` | 8×2 | Horizontal speed lines (sugar rush) |
| `sugarSwirl` | 5×5 | Dizzy swirl (sugar crash overlay) |

### All 7 menu icons — redesign at 8×8 (same keys)

Fork+plate (feed), game-controller D-pad outline (play), broom silhouette (clean), speech bubble (talk), crescent moon (sleep), cross/pill (medicine), bar-chart ascending (stats).

### All 11 food sprites — redesign at 8×8 (same keys)

Clear distinct silhouettes: pizza triangle with crust line + dot toppings; ramen bowl with wavy noodle top + steam dots; taco U-shell; mac bowl with O spirals; gummy bear head silhouette; ice cream scoop-on-cone; chocolate rectangle with grid lines; sour candy starburst; lollipop circle+stick; birthday cake layers+candle flame; mystery `?` in rounded box.

### New exports to add at bottom of sprites.js

```js
const ANIMATIONS = {
  idle:       { frames: ['petIdle0','petIdle0','petIdle0','petIdle0',
                          'petIdle0','petIdle0','petIdle0','petIdle0',
                          'petIdle0','petIdle0','petIdle1'], frameDuration: 6 },
  happy:      { frames: ['petHappy'], frameDuration: 6 },
  sad:        { frames: ['petSad'],   frameDuration: 6 },
  sick:       { frames: ['petSick','petIdle0'], frameDuration: 20 },
  sleep:      { frames: ['petSleep'], frameDuration: 6 },
  dead:       { frames: ['petDead'],  frameDuration: 6 },
  sugarRush:  { frames: ['petSugarRush'], frameDuration: 4 },
  sugarCrash: { frames: ['petSugarCrash'], frameDuration: 6 },
  talking:    { frames: ['petTalking0','petTalking1'], frameDuration: 8 },
  eating:     { frames: ['petIdle0','petEat0','petEat1','petEat2'], frameDuration: 8 },
};

const EATING_REACTIONS = {
  default:   'petReactHappy',
  sourcandy: 'petReactSour',
  gummy:     'petReactStuffed',
};
```

---

## Step 2 — `src/hal.js`

Change `const ZOOM = 4` → `let ZOOM = 4`.

Add `setZoom` function and export it:

```js
function setZoom(n) {
  ZOOM = n;
  if (canvas) {
    canvas.style.width  = `${DISPLAY_W * ZOOM}px`;
    canvas.style.height = `${DISPLAY_H * ZOOM}px`;
  }
}
```

Add `setZoom` to the public API return object.

---

## Step 3 — `src/state-machine.js`

**Only change:** the `ACTION` branch of `handleFeeding()`.

**Before** (current code, line ~249):
```js
} else if (button === 'ACTION') {
  const food        = available[gameState.pet.foodIndex];
  const description = applyFoodEffects(gameState, food.id);
  addEventLog(gameState, description);
  // ... sugar rush check ...
  gameState.pet.state = 'IDLE';
}
```

**After:**
```js
} else if (button === 'ACTION') {
  const food = available[gameState.pet.foodIndex];
  // Set eating animation flags — renderer applies effects on completion
  gameState.pet._eatingFood       = food.id;
  gameState.pet._eatingStartFrame = renderer.getFrameCount();
  gameState.pet._eatingReact      = EATING_REACTIONS[food.id] || EATING_REACTIONS.default;
  gameState.pet._pendingFoodId    = food.id;
  // Stay in FEEDING state; renderer will transition to IDLE when done
}
```

The sugar rush check and `applyFoodEffects` call move into `renderer.js` — the renderer calls them when the animation finishes (eatFrame >= 7).

---

## Step 4 — `src/renderer.js`

### 4a. Add `getFrameCount` export

```js
getFrameCount: () => frameCount
```

### 4b. Update `choosePetSprite()` — add eating-aware block at the TOP

```js
function choosePetSprite(state, stats, pet) {
  // Eating animation takes priority over everything else
  if (pet._eatingFood) {
    const eatFrame = Math.floor((frameCount - pet._eatingStartFrame) / 8);
    if (eatFrame < 4) return SPRITES[ANIMATIONS.eating.frames[eatFrame]];
    if (eatFrame < 7) return SPRITES[pet._eatingReact];
    // eatFrame >= 7: animation complete — handled in drawEatingAnimation()
  }

  switch (state) {
    // ... existing cases unchanged ...
    case 'TALKING':
      // Talking mouth cycle
      return SPRITES[ANIMATIONS.talking.frames[Math.floor(frameCount / 8) % 2]];
    // ... rest unchanged
  }
}
```

### 4c. Sugar crash sway in `drawPetArea()`

Replace the fixed `petY` with:
```js
let petX = PET_CENTER_X;
let petY = PET_AREA_Y + PET_CENTER_Y;
if (state === 'SUGAR_RUSH') {
  petY += Math.sin(frameCount * 0.8) > 0 ? -2 : 2;
}
if (state === 'SUGAR_CRASH') {
  petX = PET_CENTER_X + Math.round(Math.sin(frameCount * 0.05) * 2);
}
```

Then use `hal.drawSprite(petX, petY, petSprite)`.

### 4d. Add `drawEatingAnimation()` function

Called from `drawPetArea()` when `pet._eatingFood` is set. Food sprite approaches from x=108 → hidden when chewing → cleared on completion.

```js
function drawEatingAnimation() {
  const pet = gameState.pet;
  if (!pet._eatingFood) return;

  const eatFrame   = Math.floor((frameCount - pet._eatingStartFrame) / 8);
  const foodY      = PET_AREA_Y + PET_CENTER_Y + 4; // mouth height
  const spriteName = FOOD_SPRITES[pet._eatingFood];
  const sprite     = spriteName ? SPRITES[spriteName] : null;

  if (eatFrame < 2 && sprite) {
    // Food at x=108 (off right edge approaching)
    hal.drawSprite(108, foodY, sprite);
  } else if (eatFrame < 4 && sprite) {
    // Food approaching pet mouth (interpolate 108 → 68)
    const foodX = 108 - (eatFrame - 2) * 20;
    hal.drawSprite(foodX, foodY, sprite);
  }
  // eatFrame 4-6: chewing — no food drawn
  // eatFrame >= 7: animation complete

  if (eatFrame >= 7) {
    // Apply the deferred food effects
    const description = applyFoodEffects(gameState, pet._pendingFoodId);
    addEventLog(gameState, description);

    // Check for birthday confetti
    if (pet._pendingFoodId === 'birthday') {
      pet._confetti = Array.from({length: 6}, (_, i) => ({
        x: 10 + i * 18 + Math.random() * 10,
        y: PET_AREA_Y + 4,
        shape: i % 3,
        dy: 0.5 + Math.random() * 0.5,
      }));
    }

    // Check for sugar rush trigger
    if (gameState.pet.sugarState === 'NONE' && gameState.pet.candyCount6Tick >= 3) {
      gameState.pet.sugarState      = 'RUSH';
      gameState.pet.sugarStateTicks = 3;
      gameState.stats.energy        = Math.min(100, gameState.stats.energy + 20);
      gameState.stats.happiness     = Math.min(100, gameState.stats.happiness + 10);
      clampStats(gameState);
      gameState.pet.state = 'SUGAR_RUSH';
      addEventLog(gameState, 'SUGAR RUSH triggered!');
    } else {
      gameState.pet.state = 'IDLE';
    }

    // Clear animation flags
    pet._eatingFood       = null;
    pet._pendingFoodId    = null;
    pet._eatingStartFrame = 0;
  }
}
```

Call `drawEatingAnimation()` inside `drawPetArea()` — add after the pet sprite draw:
```js
if (pet._eatingFood) {
  drawEatingAnimation();
}
```

### 4e. Confetti in `drawPetArea()`

After drawing the pet and eating animation:
```js
if (pet._confetti && pet._confetti.length > 0) {
  pet._confetti.forEach(p => {
    const s = SPRITES[`confetti${p.shape}`];
    if (s) hal.drawSprite(Math.round(p.x), Math.round(p.y), s);
    p.y += p.dy;
  });
  pet._confetti = pet._confetti.filter(p => p.y < PET_AREA_Y + PET_AREA_H);
  if (pet._confetti.length === 0) pet._confetti = null;
}
```

### 4f. Screen transitions

Add renderer-local state (no serialization needed — visual only):

```js
let activeTransition = null;
// shape: { progress: 0, totalFrames: 32 }
```

Trigger when `pet.state` changes to/from `STATS_VIEW`, `FEEDING`, `DEAD`. Track `let lastState = null;` in the render loop, detect changes:

```js
if (gameState.pet.state !== lastState) {
  if (['STATS_VIEW','FEEDING','DEAD'].includes(gameState.pet.state) ||
      ['STATS_VIEW','FEEDING','DEAD'].includes(lastState)) {
    activeTransition = { progress: 0, totalFrames: 20 };
  }
  lastState = gameState.pet.state;
}
```

In `drawIconBar()` etc., when `activeTransition` is active, blank out a progressively smaller left portion of the pet area to create a wipe effect:

```js
if (activeTransition) {
  const wipeX = Math.round((activeTransition.progress / activeTransition.totalFrames) * DISPLAY_W);
  for (let y = PET_AREA_Y; y < TEXT_BAR_Y; y++) {
    for (let x = 0; x < wipeX; x++) hal.drawPixel(x, y, false);
  }
  activeTransition.progress++;
  if (activeTransition.progress >= activeTransition.totalFrames) activeTransition = null;
}
```

Apply this at the END of `drawPetArea()`.

### 4g. Dialogue scroll-in

Add renderer-local: `let _dialogueScrollX = 0;`

When `pet._dialogue` changes (new dialogue set), set `_dialogueScrollX = 64`.

In `drawDialogueBox(text)`, offset the text draw by `_dialogueScrollX`:
```js
hal.drawText(boxX + 3 + _dialogueScrollX, boxY + 3 + idx * 7, line, 1);
```

Each frame: `if (_dialogueScrollX > 0) _dialogueScrollX = Math.max(0, _dialogueScrollX - 2);`

### 4h. Grid overlay and animation preview

Add renderer-local:
```js
let _gridOverlay = false;
let _previewAnimation = null;
let _previewFrame = 0;
```

After `hal.flush()` in the render loop, if `_gridOverlay`:
```js
// Draw grid on the HTML canvas directly (not in framebuffer)
const htmlCanvas = hal.getCanvas();
const htmlCtx = htmlCanvas.getContext('2d');
htmlCtx.strokeStyle = 'rgba(255,140,66,0.15)';
htmlCtx.lineWidth = 1;
const zoom = 4; // current zoom — will be mutable after Step 2
for (let gx = 0; gx <= 128; gx += 8) {
  htmlCtx.beginPath();
  htmlCtx.moveTo(gx * zoom, 0);
  htmlCtx.lineTo(gx * zoom, 64 * zoom);
  htmlCtx.stroke();
}
for (let gy = 0; gy <= 64; gy += 8) {
  htmlCtx.beginPath();
  htmlCtx.moveTo(0, gy * zoom);
  htmlCtx.lineTo(128 * zoom, gy * zoom);
  htmlCtx.stroke();
}
```

Animation preview canvas: drive independently via `_previewAnimation` in the rAF loop. Draw the current frame sprite (scaled 4×) onto the preview canvas element.

Add to public API:
```js
setGridOverlay: (v) => { _gridOverlay = v; },
setPreviewAnimation: (name) => { _previewAnimation = name; _previewFrame = 0; },
getFrameCount: () => frameCount,
```

---

## Step 5 — `index.html` and `style.css`

### In `#dev-controls` section, after the speed slider label:

```html
<label>Zoom:
  <select id="zoom-select">
    <option value="2">2×</option>
    <option value="4" selected>4×</option>
    <option value="6">6×</option>
    <option value="8">8×</option>
  </select>
</label>

<label>
  <input type="checkbox" id="grid-overlay"> Grid overlay
</label>

<label>Preview:
  <select id="anim-preview-select">
    <option value="">— none —</option>
  </select>
</label>
<canvas id="anim-preview-canvas" width="128" height="64"></canvas>
```

### In `main.js` `initDevPanel()`, add wiring:

```js
// Zoom
const zoomSelect = document.getElementById('zoom-select');
if (zoomSelect) {
  zoomSelect.addEventListener('change', () => {
    hal.setZoom(parseInt(zoomSelect.value, 10));
  });
}

// Grid overlay
const gridCheck = document.getElementById('grid-overlay');
if (gridCheck) {
  gridCheck.addEventListener('change', () => {
    renderer.setGridOverlay(gridCheck.checked);
  });
}

// Animation preview — populate options from ANIMATIONS keys
const previewSelect = document.getElementById('anim-preview-select');
if (previewSelect && typeof ANIMATIONS !== 'undefined') {
  for (const key of Object.keys(ANIMATIONS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key;
    previewSelect.appendChild(opt);
  }
  previewSelect.addEventListener('change', () => {
    renderer.setPreviewAnimation(previewSelect.value || null);
  });
}
```

### CSS additions for the new dev controls:

```css
#anim-preview-canvas {
  display: block;
  image-rendering: pixelated;
  border: 1px solid #2a2f3a;
  width: 128px;
  height: 64px;
  margin-top: 4px;
}

#dev-controls select {
  background: #1a1f2b;
  border: 1px solid #2a2f3a;
  color: #c8d0e0;
  font-family: inherit;
  font-size: 12px;
  border-radius: 3px;
  padding: 2px 4px;
  accent-color: #ff8c42;
}
```

---

## Key Architecture Reminders

- All JS is **vanilla, no bundler** — plain `<script>` tags in order
- All modules are **IIFEs** returning a public API object
- `gameState` is a **single mutable object** passed by reference
- **Script load order:** hal → state → food → sprites → engine → state-machine → renderer → input → main
- Renderer comments say "never modifies state" — the eating animation completion (Step 4d) is the one intentional exception; this is acceptable for Phase 2
- `EATING_REACTIONS` is defined in `sprites.js` but referenced by `state-machine.js` — sprites.js loads before state-machine.js so this works ✓
- `renderer.getFrameCount()` is called from `state-machine.js` — renderer.js loads before state-machine.js ✗ — **fix:** store `_eatingStartFrame` as `null` initially and set it in the renderer on first frame the flag is seen (or use a global `Date.now()` timestamp instead of frameCount for the eating animation trigger)

### Eating animation timing fix

Because state-machine.js runs before renderer.js loads, `renderer.getFrameCount()` doesn't exist when state-machine.js is parsed. Instead:

In `state-machine.js` FEEDING ACTION:
```js
pet._eatingFood       = food.id;
pet._eatingStartFrame = null;  // renderer sets this on first frame it sees the flag
pet._eatingReact      = EATING_REACTIONS[food.id] || EATING_REACTIONS.default;
pet._pendingFoodId    = food.id;
```

In `drawEatingAnimation()` (renderer.js):
```js
if (pet._eatingStartFrame === null) {
  pet._eatingStartFrame = frameCount; // latch on first rendered frame
}
const eatFrame = Math.floor((frameCount - pet._eatingStartFrame) / 8);
```

---

## Verification Checklist

1. Open page — Claw should look like a character (antennae, expressive eyes, arms)
2. Press A to pet → heart appears briefly
3. Open feed menu → select pizza → press A → food approaches from right, pet chews, happy reaction, stats change **after** animation ends
4. Feed sour candy → puckered reaction frame visible
5. Feed birthday cake (set age to multiple of 288 via speed + wait) → confetti falls
6. Feed 3 candy in 6 ticks → SUGAR RUSH: bounce + speed lines; after 3 ticks → SUGAR CRASH: sway slowly
7. Open TALK → mouth cycles open/closed during dialogue; text scrolls in from right
8. Open STATS → screen wipes left to reveal stat bars
9. Toggle grid overlay → 8px grid appears over canvas pixels
10. Select "idle" in animation preview → tiny preview canvas shows blink cycle
11. Change zoom to 8× → canvas doubles in size, stays crisp

---

## Sprite Design Notes

The 16×16 Claw character should have (per PRD §6.2):
- Rounded rectangular body
- Two large expressive eyes (2×3 px each, 4px apart)
- Small mood-driven mouth
- Two small ear-antennae on top
- Tiny side arms

The Phase 1 placeholder already has the right proportions — the main improvements for Phase 2 are:
- Add the two antennae on top (small 2px protrusions at rows 0-1)
- Make the arms visible (1px lines on left/right sides around row 8)
- Make the mouth expressions more distinct and readable at 1-bit
- Add the new eating/reaction frames

All 8×8 food sprites should have **clear silhouettes** that are recognizable at 1-bit — focus on outline shape, not interior detail.
