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
    // Ensure new Phase 4 fields exist on old saves
    if (!gameState.aiConfig) {
      gameState.aiConfig = createFreshState().aiConfig;
    }
    if (!gameState.careHistory._tickWindow) {
      gameState.careHistory._tickWindow = [];
    }
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

  // Zoom control
  const zoomSelect = document.getElementById('zoom-select');
  if (zoomSelect) {
    zoomSelect.addEventListener('change', () => {
      hal.setZoom(parseInt(zoomSelect.value, 10));
    });
  }

  // Mute toggle
  const muteCheck = document.getElementById('mute-toggle');
  if (muteCheck) {
    muteCheck.addEventListener('change', () => {
      hal.setMuted(muteCheck.checked);
    });
  }

  // Grid overlay
  const gridCheck = document.getElementById('grid-overlay');
  if (gridCheck) {
    gridCheck.addEventListener('change', () => {
      renderer.setGridOverlay(gridCheck.checked);
    });
  }

  // Minigame dev selector
  const minigameSelect = document.getElementById('minigame-select');
  if (minigameSelect) {
    minigameSelect.addEventListener('change', () => {
      const type = minigameSelect.value;
      if (type && typeof minigames !== 'undefined') {
        minigames.startGame(type, gameState);
        minigameSelect.value = ''; // reset dropdown
      }
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

  // --- AI Settings (Phase 4) ---
  initAISettings();

  // --- Personality Editor (Phase 4) ---
  initPersonalityEditor();
}

/**
 * initAISettings()
 * Wires up the AI settings panel controls.
 */
function initAISettings() {
  // Ensure aiConfig exists on loaded saves
  if (!gameState.aiConfig) {
    gameState.aiConfig = createFreshState().aiConfig;
  }

  const config = gameState.aiConfig;

  const enabledCheck  = document.getElementById('ai-enabled');
  const ollamaUrl     = document.getElementById('ai-ollama-url');
  const ollamaModel   = document.getElementById('ai-ollama-model');
  const claudeKey     = document.getElementById('ai-claude-key');
  const preferOllama  = document.getElementById('ai-prefer-ollama');
  const timeoutInput  = document.getElementById('ai-timeout');
  const forceTalkBtn  = document.getElementById('ai-force-talk');
  const statusDisplay = document.getElementById('ai-status');

  // Set initial values from config
  if (enabledCheck)  enabledCheck.checked  = config.enabled;
  if (ollamaUrl)     ollamaUrl.value       = config.ollamaUrl;
  if (ollamaModel)   ollamaModel.value     = config.ollamaModel;
  if (claudeKey)     claudeKey.value       = config.claudeApiKey;
  if (preferOllama)  preferOllama.checked  = config.preferOllama;
  if (timeoutInput)  timeoutInput.value    = config.timeoutMs;

  // Bind change handlers
  if (enabledCheck) enabledCheck.addEventListener('change', () => {
    config.enabled = enabledCheck.checked;
  });
  if (ollamaUrl) ollamaUrl.addEventListener('change', () => {
    config.ollamaUrl = ollamaUrl.value.trim();
  });
  if (ollamaModel) ollamaModel.addEventListener('change', () => {
    config.ollamaModel = ollamaModel.value.trim();
  });
  if (claudeKey) claudeKey.addEventListener('change', () => {
    config.claudeApiKey = claudeKey.value.trim();
  });
  if (preferOllama) preferOllama.addEventListener('change', () => {
    config.preferOllama = preferOllama.checked;
  });
  if (timeoutInput) timeoutInput.addEventListener('change', () => {
    config.timeoutMs = parseInt(timeoutInput.value, 10) || 5000;
  });

  // Force talk button
  if (forceTalkBtn) forceTalkBtn.addEventListener('click', () => {
    if (typeof stateMachine !== 'undefined' && stateMachine.performTalk) {
      // Force IDLE so performTalk can take over
      if (gameState.pet.state !== 'DEAD') {
        gameState.pet.state = 'IDLE';
        stateMachine.performTalk();
      }
    }
  });

  // Update AI status display periodically
  setInterval(() => {
    if (!statusDisplay) return;
    if (!config.enabled) {
      statusDisplay.textContent = 'Disabled';
      return;
    }
    if (typeof ai !== 'undefined') {
      const status = ai.getStatus();
      const lastTime = ai.getLastResponseTime();
      if (status === 'success' && lastTime > 0) {
        const ago = Math.round((Date.now() - lastTime) / 1000);
        statusDisplay.textContent = `OK (${ago}s ago)`;
      } else {
        statusDisplay.textContent = status === 'requesting' ? 'Requesting...' :
                                    status === 'error' ? 'Error' : 'Ready';
      }
    }
  }, 1000);
}

/**
 * initPersonalityEditor()
 * Wires up the personality sliders in the dev panel.
 */
function initPersonalityEditor() {
  const traits = ['sass', 'curiosity', 'affection', 'energy', 'philosophical'];

  for (const trait of traits) {
    const slider = document.getElementById(`pers-edit-${trait}`);
    const valEl  = document.getElementById(`pers-edit-${trait}-val`);
    if (!slider || !valEl) continue;

    // Set initial value from gameState
    slider.value = gameState.personality[trait];
    valEl.textContent = gameState.personality[trait];

    slider.addEventListener('input', () => {
      const val = parseInt(slider.value, 10);
      gameState.personality[trait] = val;
      valEl.textContent = val;
    });
  }

  // Keep sliders in sync with game state (e.g. after natural personality drift)
  setInterval(() => {
    for (const trait of traits) {
      const slider = document.getElementById(`pers-edit-${trait}`);
      const valEl  = document.getElementById(`pers-edit-${trait}-val`);
      if (!slider || !valEl) continue;
      // Only update if slider isn't being actively dragged
      if (document.activeElement !== slider) {
        slider.value = gameState.personality[trait];
        valEl.textContent = gameState.personality[trait];
      }
    }
  }, 2000);
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
