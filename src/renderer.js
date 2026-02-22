// ============================================================
// renderer.js — Canvas Renderer
//
// Draws everything to the 128×64 display every animation frame.
// The render loop runs at ~60fps via requestAnimationFrame,
// completely independent of the tick rate.
//
// Display layout (128×64 pixels):
//   Rows  0–7  : icon bar (7 menu icons × 8×8px)
//   Rows  8–55 : pet area (48px tall)
//   Rows 56–63 : text bar (8px tall, scrolling text)
//
// The renderer reads game state but NEVER modifies it.
// All state changes happen in engine.js and state-machine.js.
// ============================================================

const renderer = (() => {

  // Reference to game state — set by init()
  let gameState = null;

  // Animation frame counter — increments every rAF call.
  // Used to drive frame cycling for animations (blink, bounce, etc.)
  let frameCount = 0;

  // Scrolling text state for the text bar
  let scrollOffset = 0;        // current pixel scroll position
  let lastScrollText = '';     // last text that was displayed

  // Heart animation state (shown briefly when you pet the character)
  let heartFrame = 0;

  // Screen transition state (visual wipe effect)
  let activeTransition = null;
  let lastState = null;

  // Dialogue scroll-in state
  let _dialogueScrollX = 0;
  let _lastDialogue = null;

  // Grid overlay and animation preview
  let _gridOverlay = false;
  let _previewAnimation = null;
  let _previewFrame = 0;

  // ----------------------------------------------------------
  // LAYOUT CONSTANTS
  // ----------------------------------------------------------
  const ICON_BAR_Y  = 0;   // top of icon bar
  const PET_AREA_Y  = 8;   // top of pet area
  const TEXT_BAR_Y  = 56;  // top of text bar
  const PET_AREA_H  = 48;  // height of pet area in pixels
  const DISPLAY_W   = 128;
  const DISPLAY_H   = 64;

  // Where the pet sprite is centered in the pet area
  const PET_CENTER_X = 56; // left edge of 16×16 sprite (centered in 128px)
  const PET_CENTER_Y = 20; // y offset within pet area (= row 28 on display)

  // ----------------------------------------------------------
  // INIT
  // ----------------------------------------------------------

  /**
   * renderer.init(state)
   * Stores the game state reference and starts the rAF render loop.
   */
  function init(state) {
    gameState = state;
    requestAnimationFrame(renderLoop);
  }

  // ----------------------------------------------------------
  // MAIN RENDER LOOP
  // ----------------------------------------------------------

  /**
   * renderLoop()
   * Called every animation frame (~60fps).
   * Clears the framebuffer, draws everything, then flushes to canvas.
   */
  function renderLoop() {
    frameCount++;

    // Detect state changes for screen transitions
    if (gameState.pet.state !== lastState) {
      if (['STATS_VIEW','FEEDING','DEAD'].includes(gameState.pet.state) ||
          ['STATS_VIEW','FEEDING','DEAD'].includes(lastState)) {
        activeTransition = { progress: 0, totalFrames: 20 };
      }
      lastState = gameState.pet.state;
    }

    // Step 1: clear the display to all-off
    hal.clearScreen();

    // Step 2: draw each layer from back to front
    drawIconBar();
    drawPetArea();
    drawTextBar();

    // Step 3: push framebuffer to the HTML canvas
    hal.flush();

    // Grid overlay — drawn directly on HTML canvas, not in framebuffer
    if (_gridOverlay) {
      const htmlCanvas = hal.getCanvas();
      const htmlCtx = htmlCanvas.getContext('2d');
      const zoom = hal.getZoom();
      htmlCtx.strokeStyle = 'rgba(255,140,66,0.15)';
      htmlCtx.lineWidth = 1;
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
    }

    // Animation preview canvas
    if (_previewAnimation && ANIMATIONS[_previewAnimation]) {
      const anim = ANIMATIONS[_previewAnimation];
      const previewCanvas = document.getElementById('anim-preview-canvas');
      if (previewCanvas) {
        const pCtx = previewCanvas.getContext('2d');
        pCtx.fillStyle = '#0a0c10';
        pCtx.fillRect(0, 0, 128, 64);

        _previewFrame++;
        const frameIdx = Math.floor(_previewFrame / anim.frameDuration) % anim.frames.length;
        const spriteName = anim.frames[frameIdx];
        const sprite = SPRITES[spriteName];
        if (sprite) {
          // Draw sprite centered in preview at 2x scale
          const sx = Math.floor((128 - sprite[0].length * 2) / 2);
          const sy = Math.floor((64 - sprite.length * 2) / 2);
          for (let row = 0; row < sprite.length; row++) {
            for (let col = 0; col < sprite[row].length; col++) {
              if (sprite[row][col]) {
                pCtx.fillStyle = '#e8f0e0';
                pCtx.fillRect(sx + col * 2, sy + row * 2, 2, 2);
              }
            }
          }
        }
      }
    }

    // Update the HTML sidebar (stat bars, badges, event log)
    updateSidebar();

    // Schedule the next frame
    requestAnimationFrame(renderLoop);
  }

  // ----------------------------------------------------------
  // ICON BAR (rows 0–7)
  // ----------------------------------------------------------

  /**
   * drawIconBar()
   * Draws 7 menu icons spaced evenly across the top 8 rows.
   * The currently selected icon (when in MENU state) is inverted
   * (white background, black icon) so it stands out.
   */
  function drawIconBar() {
    const inMenu      = (gameState.pet.state === 'MENU');
    const selectedIdx = gameState.pet.menuIndex;
    const iconCount   = MENU_ICONS.length; // 7

    // Each icon gets 128/7 ≈ 18px, but we center 8px icons with gaps
    // Spacing: icons at x = 1, 19, 37, 55, 73, 91, 109
    const spacing = Math.floor(DISPLAY_W / iconCount);

    for (let i = 0; i < iconCount; i++) {
      const iconDef  = MENU_ICONS[i];
      const sprite   = SPRITES[iconDef.sprite];
      const x        = i * spacing + Math.floor((spacing - 8) / 2);
      const y        = ICON_BAR_Y;
      const inverted = inMenu && (i === selectedIdx);

      if (sprite) {
        // If selected, fill the background first (draw a filled 8×8 block, then invert sprite)
        if (inverted) {
          for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 10; col++) {
              hal.drawPixel(x - 1 + col, y + row, true);
            }
          }
        }
        hal.drawSprite(x, y, sprite, inverted);
      }
    }

    // Draw a separator line between icon bar and pet area
    for (let x = 0; x < DISPLAY_W; x++) {
      hal.drawPixel(x, 7, true);
    }
  }

  // ----------------------------------------------------------
  // PET AREA (rows 8–55)
  // ----------------------------------------------------------

  /**
   * drawPetArea()
   * Draws the pet, poop sprites, overlays (sick/sugar/sleeping),
   * and any temporary effects (hearts, Zs).
   */
  function drawPetArea() {
    const state = gameState.pet.state;
    const pet   = gameState.pet;
    const stats = gameState.stats;

    // --- Choose which pet sprite to draw ---
    let petSprite = choosePetSprite(state, stats, pet);

    // --- Movement effects ---
    let petX = PET_CENTER_X;
    let petY = PET_AREA_Y + PET_CENTER_Y;
    if (state === 'SUGAR_RUSH') {
      petY += Math.sin(frameCount * 0.8) > 0 ? -2 : 2; // fast bounce
    }
    if (state === 'SUGAR_CRASH') {
      petX = PET_CENTER_X + Math.round(Math.sin(frameCount * 0.05) * 2); // slow sway
    }

    // --- Draw the pet ---
    if (petSprite) {
      hal.drawSprite(petX, petY, petSprite);
    }

    // --- Eating animation (food sprite approaching) ---
    if (pet._eatingFood) {
      drawEatingAnimation();
    }

    // --- Confetti (birthday cake effect) ---
    if (pet._confetti && pet._confetti.length > 0) {
      pet._confetti.forEach(p => {
        const s = SPRITES['confetti' + p.shape];
        if (s) hal.drawSprite(Math.round(p.x), Math.round(p.y), s);
        p.y += p.dy;
      });
      pet._confetti = pet._confetti.filter(p => p.y < PET_AREA_Y + PET_AREA_H);
      if (pet._confetti.length === 0) pet._confetti = null;
    }

    // --- Draw special state overlays ---
    if (state === 'FEEDING') {
      drawFoodCarousel();
    } else if (state === 'STATS_VIEW') {
      drawStatsScreen();
    } else if (state === 'DEAD') {
      drawDeadScreen();
    } else if (state === 'TALKING' && pet._dialogue) {
      drawDialogueBox(pet._dialogue);
    }

    // --- Draw sick indicator (thermometer above pet) ---
    if (pet.isSick && state !== 'DEAD') {
      hal.drawSprite(PET_CENTER_X + 18, PET_AREA_Y + 10, SPRITES.thermometer);
    }

    // --- Draw poops ---
    drawPoops(pet.poopCount);

    // --- Draw sleep Zs ---
    if (pet.isAsleep) {
      drawSleepZs();
    }

    // --- Draw heart (appears briefly when petted) ---
    if (pet._showHeart) {
      const ticksSinceHeart = gameState.time.currentTick - (pet._showHeartTick || 0);
      // Show heart for ~60 render frames (about 1 second)
      if (frameCount % 120 < 60) {
        hal.drawSprite(PET_CENTER_X + 12, PET_AREA_Y + 4, SPRITES.heart);
      }
      // Clear heart flag after a while (based on real frame count, not ticks)
      // We use a simple counter stored on the pet object
      if (!pet._heartFrameStart) pet._heartFrameStart = frameCount;
      if (frameCount - pet._heartFrameStart > 90) {
        pet._showHeart       = false;
        pet._heartFrameStart = 0;
      }
    }

    // --- Draw sugar rush stars ---
    if (state === 'SUGAR_RUSH') {
      drawSugarRushEffect();
    }

    // --- Draw exclamation mark when social is very low ---
    if (stats.social < 20 && state === 'IDLE') {
      // Blink the exclamation mark
      if (Math.floor(frameCount / 15) % 2 === 0) {
        hal.drawSprite(PET_CENTER_X - 8, PET_AREA_Y + 4, SPRITES.exclamation);
      }
    }

    // --- Screen transition wipe ---
    if (activeTransition) {
      const wipeX = Math.round((activeTransition.progress / activeTransition.totalFrames) * DISPLAY_W);
      for (let y = PET_AREA_Y; y < TEXT_BAR_Y; y++) {
        for (let x = 0; x < wipeX; x++) hal.drawPixel(x, y, false);
      }
      activeTransition.progress++;
      if (activeTransition.progress >= activeTransition.totalFrames) activeTransition = null;
    }
  }

  /**
   * choosePetSprite(state, stats, pet)
   * Returns the correct sprite for the pet's current state.
   * Frame cycling creates the illusion of animation.
   */
  function choosePetSprite(state, stats, pet) {
    // Eating animation takes priority over everything else
    if (pet._eatingFood) {
      if (pet._eatingStartFrame === null) {
        pet._eatingStartFrame = frameCount; // latch on first rendered frame
      }
      const eatFrame = Math.floor((frameCount - pet._eatingStartFrame) / 8);
      if (eatFrame < 4) return SPRITES[ANIMATIONS.eating.frames[eatFrame]];
      if (eatFrame < 7) return SPRITES[pet._eatingReact];
      // eatFrame >= 7: animation complete — handled in drawEatingAnimation()
    }

    switch (state) {
      case 'DEAD':
        return SPRITES.petDead;

      case 'SLEEPING':
        return SPRITES.petSleep;

      case 'SICK':
        // Blink between idle and sick sprite for a "unwell" look
        return (Math.floor(frameCount / 20) % 2 === 0) ? SPRITES.petSick : SPRITES.petIdle0;

      case 'SUGAR_RUSH':
        return SPRITES.petSugarRush;

      case 'SUGAR_CRASH':
        return SPRITES.petSugarCrash;

      case 'TALKING':
        // Talking mouth cycle
        return SPRITES[ANIMATIONS.talking.frames[Math.floor(frameCount / 8) % 2]];

      case 'IDLE':
      case 'MENU':
      case 'FEEDING':
      case 'STATS_VIEW':
      default:
        // Show happy/sad sprite based on happiness stat
        if (stats.happiness >= 60) {
          return SPRITES.petHappy;
        } else if (stats.happiness < 30) {
          return SPRITES.petSad;
        }

        // Idle blink: hold eyes open for ~100 frames, close for 5 frames
        const blinkCycle = frameCount % 110;
        if (blinkCycle >= 100) {
          return SPRITES.petIdle1; // blinking
        }
        return SPRITES.petIdle0;  // normal
    }
  }

  /**
   * drawPoops()
   * Draws 1-3 poop sprites in the bottom-left of the pet area.
   * Classic Tamagotchi: poop stays until you clean it!
   */
  function drawPoops(count) {
    const positions = [
      { x: 4,  y: PET_AREA_Y + 38 },
      { x: 14, y: PET_AREA_Y + 36 },
      { x: 9,  y: PET_AREA_Y + 32 },
    ];
    for (let i = 0; i < Math.min(count, 3); i++) {
      hal.drawSprite(positions[i].x, positions[i].y, SPRITES.poop);
    }
  }

  /**
   * drawSleepZs()
   * Draws floating Z sprites above the sleeping pet.
   * The Zs drift upward to simulate floating.
   */
  function drawSleepZs() {
    // Cycle Z position using frameCount to make it float upward
    const offset = (frameCount / 2) % 14; // 0-13 pixel drift

    // Draw two Zs at different offsets for depth
    hal.drawSprite(PET_CENTER_X + 19, PET_AREA_Y + 2 + Math.floor(offset),     SPRITES.sleepZ);
    hal.drawSprite(PET_CENTER_X + 25, PET_AREA_Y + 6 + Math.floor(offset * 0.7), SPRITES.sleepZ);
  }

  /**
   * drawSugarRushEffect()
   * Draws spinning stars around the pet during sugar rush.
   */
  function drawSugarRushEffect() {
    // Two stars that orbit around the pet in a simple circular path
    const angle = (frameCount * 0.15); // rotation speed
    const radius = 14;
    const cx = PET_CENTER_X + 8; // pet center x
    const cy = PET_AREA_Y + PET_CENTER_Y + 8; // pet center y

    const x1 = Math.round(cx + Math.cos(angle) * radius) - 2;
    const y1 = Math.round(cy + Math.sin(angle) * radius) - 2;
    const x2 = Math.round(cx + Math.cos(angle + Math.PI) * radius) - 2;
    const y2 = Math.round(cy + Math.sin(angle + Math.PI) * radius) - 2;

    hal.drawSprite(x1, y1, SPRITES.star);
    hal.drawSprite(x2, y2, SPRITES.star);
  }

  // ----------------------------------------------------------
  // EATING ANIMATION
  // ----------------------------------------------------------

  /**
   * drawEatingAnimation()
   * Draws the food sprite approaching the pet, then handles
   * deferred food effects when the animation completes.
   */
  function drawEatingAnimation() {
    const pet = gameState.pet;
    if (!pet._eatingFood) return;

    if (pet._eatingStartFrame === null) {
      pet._eatingStartFrame = frameCount;
    }

    const eatFrame   = Math.floor((frameCount - pet._eatingStartFrame) / 8);
    const foodY      = PET_AREA_Y + PET_CENTER_Y + 4; // mouth height
    const spriteName = FOOD_SPRITES[pet._eatingFood];
    const sprite     = spriteName ? SPRITES[spriteName] : null;

    if (eatFrame < 2 && sprite) {
      // Food visible at right edge
      hal.drawSprite(108, foodY, sprite);
    } else if (eatFrame < 4 && sprite) {
      // Food approaching pet mouth (interpolate 108 → 68)
      const foodX = 108 - (eatFrame - 2) * 20;
      hal.drawSprite(foodX, foodY, sprite);
    }
    // eatFrame 4-6: chewing reaction — no food drawn
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

  // ----------------------------------------------------------
  // FOOD CAROUSEL (shown in pet area during FEEDING state)
  // ----------------------------------------------------------

  /**
   * drawFoodCarousel()
   * Shows the selected food icon centered in the pet area,
   * with the food name in the text bar.
   * LEFT/RIGHT arrows hint that you can scroll.
   */
  function drawFoodCarousel() {
    const available = getAvailableFoods(gameState);
    if (available.length === 0) return;

    const foodIdx    = gameState.pet.foodIndex % available.length;
    const food       = available[foodIdx];
    const spriteName = FOOD_SPRITES[food.id];
    const sprite     = SPRITES[spriteName];

    // Draw food sprite in center of pet area (scaled 2x = 16×16)
    if (sprite) {
      // Draw the 8×8 sprite at 2× scale by drawing each pixel as a 2×2 block
      const startX = 56;  // center of 128px display, minus 8px
      const startY = PET_AREA_Y + 16;

      for (let row = 0; row < sprite.length; row++) {
        for (let col = 0; col < sprite[row].length; col++) {
          if (sprite[row][col]) {
            hal.drawPixel(startX + col * 2,     startY + row * 2,     true);
            hal.drawPixel(startX + col * 2 + 1, startY + row * 2,     true);
            hal.drawPixel(startX + col * 2,     startY + row * 2 + 1, true);
            hal.drawPixel(startX + col * 2 + 1, startY + row * 2 + 1, true);
          }
        }
      }
    }

    // Draw navigation arrows
    // Left arrow
    hal.drawPixel(46, PET_AREA_Y + 20, true);
    hal.drawPixel(45, PET_AREA_Y + 21, true);
    hal.drawPixel(46, PET_AREA_Y + 22, true);

    // Right arrow
    hal.drawPixel(82, PET_AREA_Y + 20, true);
    hal.drawPixel(83, PET_AREA_Y + 21, true);
    hal.drawPixel(82, PET_AREA_Y + 22, true);

    // Draw food count indicator (e.g., "2/9")
    const countText = `${foodIdx + 1}/${available.length}`;
    hal.drawText(52, PET_AREA_Y + 38, countText, 1);

    // The food name is shown in the text bar (drawTextBar reads from gameState)
    gameState.pet._textBarOverride = food.name.toUpperCase();
  }

  // ----------------------------------------------------------
  // STATS SCREEN (shown when STATS_VIEW state is active)
  // ----------------------------------------------------------

  /**
   * drawStatsScreen()
   * Shows a simplified stat readout inside the pet area.
   * (The detailed bars are always visible in the HTML sidebar.)
   */
  function drawStatsScreen() {
    const s = gameState.stats;

    // Header
    hal.drawText(2, PET_AREA_Y + 1, 'STATS', 1);

    // Draw a mini horizontal bar for each stat
    const statData = [
      { label: 'H', value: s.hunger    },
      { label: 'J', value: s.happiness },
      { label: 'E', value: s.energy    },
      { label: 'C', value: s.hygiene   },
      { label: 'S', value: s.social    },
    ];

    statData.forEach((stat, idx) => {
      const y       = PET_AREA_Y + 12 + idx * 8;
      const barLen  = Math.floor(stat.value / 100 * 60); // 60 pixel wide bar max

      // Label
      hal.drawText(2, y, stat.label, 1);

      // Bar background (faint outline)
      for (let x = 10; x < 70; x++) {
        hal.drawPixel(x, y + 3, true);  // top border
        hal.drawPixel(x, y + 5, true);  // bottom border
      }
      hal.drawPixel(10, y + 4, true);
      hal.drawPixel(70, y + 4, true);

      // Bar fill
      for (let x = 11; x < 11 + barLen; x++) {
        hal.drawPixel(x, y + 4, true);
      }

      // Numeric value
      hal.drawText(74, y, String(stat.value), 1);
    });

    gameState.pet._textBarOverride = 'PRESS ANY KEY';
  }

  // ----------------------------------------------------------
  // DEAD SCREEN
  // ----------------------------------------------------------

  /**
   * drawDeadScreen()
   * Shows the death screen over the pet area.
   */
  function drawDeadScreen() {
    // The pet dead sprite is already drawn as the main pet sprite.
    // Add text overlay.
    const age   = gameState.pet.age;
    const cause = gameState.pet.causeOfDeath || 'unknown';

    hal.drawText(20, PET_AREA_Y + 2,  'GOODBYE...', 1);
    hal.drawText(2,  PET_AREA_Y + 14, `AGE: ${age} TICKS`, 1);

    // Word-wrap the cause — fit in 128px at scale 1 (each char = 6px)
    const causeStr = `CAUSE: ${cause}`.substring(0, 20).toUpperCase();
    hal.drawText(2, PET_AREA_Y + 24, causeStr, 1);

    hal.drawText(14, PET_AREA_Y + 34, 'PRESS A FOR', 1);
    hal.drawText(14, PET_AREA_Y + 42, 'NEW PET', 1);

    gameState.pet._textBarOverride = `GEN ${gameState.pet.generation}`;
  }

  // ----------------------------------------------------------
  // DIALOGUE BOX
  // ----------------------------------------------------------

  /**
   * drawDialogueBox(text)
   * Shows a speech bubble with scrolling text at the top of the pet area.
   * Uses a dark background with a white border (white-on-dark text).
   */
  function drawDialogueBox(text) {
    if (!text) return;

    // Box dimensions — sits above the pet sprite
    const boxX = 1, boxY = PET_AREA_Y + 1;
    const boxW = 126, boxH = 24;

    // The framebuffer background is already dark (cleared to 0).
    // Just draw a white border around the box so it looks like a bubble.
    for (let x = boxX; x < boxX + boxW; x++) {
      hal.drawPixel(x, boxY,             true); // top edge
      hal.drawPixel(x, boxY + boxH - 1,  true); // bottom edge
    }
    for (let y = boxY; y < boxY + boxH; y++) {
      hal.drawPixel(boxX,              y, true); // left edge
      hal.drawPixel(boxX + boxW - 1,   y, true); // right edge
    }
    // Small speech-bubble tail pointing down-left toward the pet
    hal.drawPixel(boxX + 5, boxY + boxH,     true);
    hal.drawPixel(boxX + 6, boxY + boxH + 1, true);

    // Track dialogue changes for scroll-in effect
    if (text !== _lastDialogue) {
      _lastDialogue = text;
      _dialogueScrollX = 64;
    }
    if (_dialogueScrollX > 0) _dialogueScrollX = Math.max(0, _dialogueScrollX - 2);

    // Render text inside the box — white pixels on dark background
    // Wrap text to fit ~20 chars per line at scale 1 (6px per char)
    const lines = wrapText(text.toUpperCase(), 20);
    lines.slice(0, 3).forEach((line, idx) => {
      hal.drawText(boxX + 3 + _dialogueScrollX, boxY + 3 + idx * 7, line, 1);
    });

    gameState.pet._textBarOverride = 'A/B TO DISMISS';
  }

  /**
   * wrapText(text, charsPerLine)
   * Splits text into lines of at most charsPerLine characters,
   * breaking at word boundaries where possible.
   */
  function wrapText(text, charsPerLine) {
    const words = text.split(' ');
    const lines = [];
    let current = '';

    for (const word of words) {
      if ((current + ' ' + word).trim().length > charsPerLine) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = (current + ' ' + word).trim();
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  // ----------------------------------------------------------
  // TEXT BAR (rows 56–63)
  // ----------------------------------------------------------

  /**
   * drawTextBar()
   * Draws the bottom 8-pixel status bar.
   * Shows whatever text is most relevant right now.
   *
   * If the text is longer than the display, it scrolls slowly leftward.
   */
  function drawTextBar() {
    // Separator line
    for (let x = 0; x < DISPLAY_W; x++) {
      hal.drawPixel(x, TEXT_BAR_Y, true);
    }

    // Determine what text to show
    let text = getTextBarContent();

    // If text changed, reset scroll position
    if (text !== lastScrollText) {
      lastScrollText = text;
      scrollOffset   = 0;
    }

    // Measure text width (5px per char + 1px gap)
    const textWidth = text.length * 6;

    // Scroll if text is wider than display
    if (textWidth > DISPLAY_W) {
      // Advance scroll by 1px every 3 frames
      if (frameCount % 3 === 0) scrollOffset++;
      // Loop when fully scrolled off screen
      if (scrollOffset > textWidth + DISPLAY_W) scrollOffset = 0;
    }

    // Draw the text (shifted left by scrollOffset)
    hal.drawText(1 - scrollOffset, TEXT_BAR_Y + 1, text, 1);

    // Clear the text bar override once rendered
    if (gameState.pet._textBarOverride) {
      // Keep it for one more frame (it'll be regenerated by the drawing function)
    }
  }

  /**
   * getTextBarContent()
   * Returns the appropriate text to show in the bottom bar.
   */
  function getTextBarContent() {
    // A drawing function may have set a temporary override
    if (gameState.pet._textBarOverride) {
      const txt = gameState.pet._textBarOverride;
      gameState.pet._textBarOverride = null; // consume it
      return txt;
    }

    const state = gameState.pet.state;
    const pet   = gameState.pet;
    const stats = gameState.stats;

    // State-specific messages
    if (state === 'MENU') {
      return MENU_ICONS[pet.menuIndex].label;
    }
    if (state === 'SLEEPING') {
      return 'ZZZZZZZ...';
    }
    if (state === 'SUGAR_RUSH') {
      return 'WHEEEEE!!!';
    }
    if (state === 'SUGAR_CRASH') {
      return 'not feeling great...';
    }
    if (pet.isSick) {
      return 'Not feeling well...';
    }
    if (pet.poopCount >= 3) {
      return 'Please clean up!';
    }
    if (stats.hunger < 20) {
      return 'So hungry...';
    }
    if (stats.happiness < 20) {
      return 'Very unhappy...';
    }
    if (stats.energy < 15) {
      return 'Exhausted...';
    }
    if (stats.hygiene < 20) {
      return 'Feeling grubby...';
    }
    if (stats.social < 20) {
      return 'Feeling lonely...';
    }

    // Default: show pet name and tick count
    return `${pet.name} - tick ${gameState.time.currentTick}`;
  }

  // ----------------------------------------------------------
  // HTML SIDEBAR UPDATE (outside the canvas)
  // ----------------------------------------------------------

  /**
   * updateSidebar()
   * Updates the HTML stat bars, badges, personality section,
   * and event log in the right panel.
   * Called every render frame, but the DOM updates are cheap.
   */
  function updateSidebar() {
    if (!gameState) return;

    const s   = gameState.stats;
    const pet = gameState.pet;

    // --- Stat bars ---
    updateBar('hunger',    s.hunger);
    updateBar('happiness', s.happiness);
    updateBar('energy',    s.energy);
    updateBar('hygiene',   s.hygiene);
    updateBar('social',    s.social);

    // --- Age and generation ---
    const ageEl = document.getElementById('display-age');
    const genEl = document.getElementById('display-gen');
    if (ageEl) ageEl.textContent = pet.age;
    if (genEl) genEl.textContent = pet.generation;

    // --- Personality ---
    const p = gameState.personality;
    setTextById('pers-sass',          p.sass);
    setTextById('pers-curiosity',     p.curiosity);
    setTextById('pers-affection',     p.affection);
    setTextById('pers-energy',        p.energy);
    setTextById('pers-philosophical', p.philosophical);

    // --- Status badges ---
    setTextById('badge-state', pet.state);
    toggleClass('badge-sick',   'hidden', !pet.isSick);
    toggleClass('badge-asleep', 'hidden', !pet.isAsleep);
    const sugarActive = (pet.sugarState !== 'NONE');
    toggleClass('badge-sugar', 'hidden', !sugarActive);
    if (sugarActive) setTextById('badge-sugar', pet.sugarState);

    // --- Event log ---
    updateEventLog();
  }

  function updateBar(statName, value) {
    const bar = document.getElementById(`bar-${statName}`);
    const val = document.getElementById(`val-${statName}`);
    if (bar) bar.style.width = `${value}%`;
    if (val) val.textContent = value;
  }

  function setTextById(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function toggleClass(id, className, condition) {
    const el = document.getElementById(id);
    if (!el) return;
    if (condition) {
      el.classList.add(className);
    } else {
      el.classList.remove(className);
    }
  }

  function updateEventLog() {
    const logEl = document.getElementById('event-log');
    if (!logEl || !gameState.eventLog) return;

    // Rebuild the log list from the game state ring buffer
    const entries = gameState.eventLog.slice(0, 10); // show last 10
    logEl.innerHTML = entries.map((entry, idx) => {
      const cls = idx === 0 ? 'log-entry recent' : 'log-entry';
      return `<li class="${cls}">T${entry.tick}: ${entry.message}</li>`;
    }).join('');
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------
  return {
    init,
    getFrameCount: () => frameCount,
    setGridOverlay: (v) => { _gridOverlay = v; },
    setPreviewAnimation: (name) => { _previewAnimation = name; _previewFrame = 0; },
  };

})();
