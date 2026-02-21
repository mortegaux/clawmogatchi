// ============================================================
// main.js — Entry Point
//
// This file wires everything together. It runs when the page
// loads and is responsible for:
//
//   1. Initialising the HAL (canvas display)
//   2. Loading saved state (or creating a fresh one)
//   3. Running the offline time catch-up
//   4. Connecting the state machine to button events
//   5. Starting the tick timer (engine loop)
//   6. Starting the render loop (renderer)
//   7. Wiring up the dev panel controls
//
// Think of this as the "conductor" — it doesn't play any
// instrument itself, but it makes sure everything starts
// at the right time and in the right order.
// ============================================================

// We use a single global `gameState` so all modules can
// reach it through the engine reference.
let gameState = null;

/**
 * main()
 * Called once on DOMContentLoaded. Sets up the whole game.
 */
function main() {

  // -----------------------------------------------------------
  // Step 1: Initialise the HAL (connect it to the canvas)
  // -----------------------------------------------------------
  const canvas = document.getElementById('game-canvas');
  hal.init(canvas);

  // -----------------------------------------------------------
  // Step 2: Load saved state or create a fresh pet
  // -----------------------------------------------------------
  const savedJson = engine.loadGame();

  if (savedJson) {
    // We found a save — use it
    gameState = savedJson;
    addEventLog(gameState, 'Save loaded — welcome back!');
  } else {
    // Fresh start — new pet!
    gameState = createFreshState(1);
    gameState.time.lastTickTimestamp = hal.now();
    addEventLog(gameState, 'New pet started — hello Claw!');
  }

  // -----------------------------------------------------------
  // Step 3: Apply offline time catch-up
  // Calculate how many ticks elapsed since the page was last open
  // and apply stat decay for those missed ticks.
  // -----------------------------------------------------------
  engine.init(gameState, onTick);
  engine.applyCatchUp();

  // -----------------------------------------------------------
  // Step 4: Connect the state machine to HAL button events
  // -----------------------------------------------------------
  stateMachine.init(gameState);

  // Register the state machine's handleButton as the callback
  // for every button press event from the HAL.
  for (const button of ['LEFT', 'RIGHT', 'ACTION', 'BACK']) {
    hal.onButtonDown(button, (btn) => {
      stateMachine.handleButton(btn);
    });
  }

  // -----------------------------------------------------------
  // Step 5: Start the tick timer
  // The engine.tick() function runs every tickIntervalMs.
  // Default: 300000ms (5 minutes). Dev slider changes this.
  // -----------------------------------------------------------
  const initialInterval = gameState.time.tickIntervalMs /
                          (gameState.devMode.speedMultiplier || 1);

  hal.tickInterval(engine.tick, initialInterval);

  // -----------------------------------------------------------
  // Step 6: Start the render loop (runs via requestAnimationFrame)
  // -----------------------------------------------------------
  renderer.init(gameState);

  // -----------------------------------------------------------
  // Step 7: Register keyboard + HTML button input handlers
  // -----------------------------------------------------------
  input.init();

  // -----------------------------------------------------------
  // Step 8: Wire up dev panel controls
  // -----------------------------------------------------------
  initDevPanel();

  // -----------------------------------------------------------
  // Step 8: Wire up bottom bar buttons
  // (The onclick attributes in HTML call these global functions)
  // -----------------------------------------------------------
  // devSave(), devLoad(), devScreenshot(), devReset() are defined below

  console.log('[Clawmogatchi] Initialised successfully! 🐾');
  console.log('[Clawmogatchi] Keys: Z=Left  X=Right  A=Action  S=Back');
}

// ============================================================
// DEV PANEL
// ============================================================

/**
 * initDevPanel()
 * Wires up the speed slider and any other dev controls.
 */
function initDevPanel() {
  const slider  = document.getElementById('speed-slider');
  const display = document.getElementById('speed-display');

  if (!slider || !display) return;

  // Set slider to current speed
  slider.value = gameState.devMode.speedMultiplier || 1;
  display.textContent = `${slider.value}x`;

  slider.addEventListener('input', () => {
    const mult = parseInt(slider.value, 10);
    display.textContent = `${mult}x`;

    // Update the tick rate: base is 300000ms, divide by speed multiplier
    const BASE_INTERVAL = 300000; // 5 minutes in ms
    const newInterval   = Math.max(50, Math.floor(BASE_INTERVAL / mult));

    gameState.time.tickIntervalMs        = newInterval;
    gameState.devMode.speedMultiplier    = mult;

    // Restart the tick timer with the new interval
    hal.setTickSpeed(newInterval);

    console.log(`[Dev] Speed ${mult}x → tick every ${newInterval}ms`);
  });
}

/**
 * onTick(state)
 * Called by the engine after each tick.
 * (The renderer updates continuously via rAF, so we don't
 *  need to do extra rendering here — just logging if needed.)
 */
function onTick(state) {
  // The renderer's rAF loop reads gameState directly, so
  // we just need to make sure the reference is still correct.
  // (It is, because we never replace gameState — we mutate it in place.)
}

// ============================================================
// BOTTOM BAR BUTTON HANDLERS
// (Called via onclick in index.html)
// ============================================================

/**
 * devSave()
 * Manual save button — saves game state to localStorage immediately.
 */
function devSave() {
  engine.saveGame();
  flashMessage('Game saved!');
}

/**
 * devLoad()
 * Manual load button — reloads state from localStorage.
 * Useful for reverting to a previous save.
 */
function devLoad() {
  const loaded = engine.loadGame();
  if (loaded) {
    // Update the live gameState in-place
    Object.assign(gameState, loaded);
    engine.init(gameState, onTick);
    stateMachine.init(gameState);
    addEventLog(gameState, 'Manual load from save');
    flashMessage('Save loaded!');
  } else {
    flashMessage('No save found');
  }
}

/**
 * devScreenshot()
 * Captures the current canvas frame as a PNG and downloads it.
 */
function devScreenshot() {
  const canvas = hal.getCanvas();
  if (!canvas) return;

  // Create a download link and click it programmatically
  const link = document.createElement('a');
  link.download = `clawmogatchi-tick${gameState.time.currentTick}.png`;
  link.href     = canvas.toDataURL('image/png');
  link.click();
  flashMessage('Screenshot saved!');
}

/**
 * devReset()
 * Resets to a brand new pet. Asks for confirmation first since
 * this destroys the current pet!
 */
function devReset() {
  if (!confirm('Reset and start a new pet? Your current pet will be lost.')) {
    return;
  }

  const newState = engine.resetGame();
  Object.assign(gameState, newState);
  engine.init(gameState, onTick);
  stateMachine.init(gameState);
  addEventLog(gameState, 'Reset! New pet started.');
  flashMessage('New pet started!');
}

/**
 * flashMessage(text)
 * Temporarily shows a message in the text bar area by adding
 * it to the event log (the renderer will pick it up).
 * Simple feedback for dev button presses.
 */
function flashMessage(text) {
  if (gameState) {
    addEventLog(gameState, text);
  }
}

// ============================================================
// START
// ============================================================

// Wait for the HTML to fully load before starting the game.
document.addEventListener('DOMContentLoaded', main);
