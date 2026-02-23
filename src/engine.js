// ============================================================
// engine.js — Core Game Loop
//
// This is the "brain" of Clawmogatchi. Every "tick" (default
// 5 minutes of real time, much faster in dev mode), the engine:
//
//   1. Increments age and tick counter
//   2. Decides if the pet is awake or asleep
//   3. Decays stats at the right rates
//   4. Checks for sickness conditions
//   5. Checks for death
//   6. Handles poop generation
//   7. Advances sugar rush/crash states
//   8. Nudges personality traits based on care history
//   9. Auto-saves every 5 ticks
//   10. Logs what happened
//
// The engine never touches the display — that's renderer.js.
// The engine never reads button input — that's input.js and state-machine.js.
// The engine ONLY manages state over time.
// ============================================================

const engine = (() => {

  // We need a reference to the game state.
  // It gets set when engine.init(state) is called from main.js.
  let gameState = null;

  // Callback that the renderer/UI registers to refresh the HTML sidebar
  let onTickCallback = null;

  // ----------------------------------------------------------
  // INIT
  // ----------------------------------------------------------

  /**
   * engine.init(state, onTick)
   * Sets the game state reference and optional per-tick UI callback.
   * Call this from main.js after state is loaded/created.
   */
  function init(state, onTick) {
    gameState      = state;
    onTickCallback = onTick || null;
  }

  // ----------------------------------------------------------
  // OFFLINE CATCH-UP
  // ----------------------------------------------------------

  /**
   * engine.applyCatchUp()
   * Called on page load when an existing save is found.
   *
   * Calculates how many ticks elapsed while the page was closed,
   * then applies stat decay for each missed tick (capped at 288 ticks
   * = 24 hours of real time to prevent instant death after a long break).
   *
   * This is how a real Tamagotchi works — the pet keeps aging even
   * when you're not watching!
   */
  function applyCatchUp() {
    if (!gameState) return;

    const now       = hal.now();
    const lastTick  = gameState.time.lastTickTimestamp;

    // If we have no timestamp (fresh game), just record "now" and skip
    if (!lastTick) {
      gameState.time.lastTickTimestamp = now;
      return;
    }

    const msSinceLastTick = now - lastTick;
    const intervalMs      = gameState.time.tickIntervalMs;

    // Calculate how many ticks were missed
    let missedTicks = Math.floor(msSinceLastTick / intervalMs);

    // Cap at 288 ticks (24 hours) — after that the pet is in bad shape
    // but not instantly dead. This prevents 3-day absences = permadeath.
    const MAX_CATCHUP = 288;
    if (missedTicks > MAX_CATCHUP) {
      addEventLog(gameState, `Missed ${missedTicks} ticks — capped at ${MAX_CATCHUP}`);
      missedTicks = MAX_CATCHUP;
    }

    if (missedTicks <= 0) return;

    addEventLog(gameState, `Offline catch-up: applying ${missedTicks} ticks`);

    // Apply each missed tick silently (no poop/sugar rush events during catch-up)
    for (let i = 0; i < missedTicks; i++) {
      applyStatDecay(/* silent = */ true);
      checkSicknessTriggers();

      // If the pet died during catch-up, stop processing
      if (gameState.pet.state === 'DEAD') break;
    }

    // Update the timestamp so the next catch-up starts from now
    gameState.time.lastTickTimestamp = now;

    if (missedTicks > 0) {
      addEventLog(gameState, `Catch-up complete. Pet survived!`);
    }
  }

  // ----------------------------------------------------------
  // MAIN TICK
  // ----------------------------------------------------------

  /**
   * engine.tick()
   * The main game loop function — called every tickIntervalMs.
   * Everything that changes over time happens here.
   */
  function tick() {
    if (!gameState) return;

    // Dead pets don't keep ticking
    if (gameState.pet.state === 'DEAD') return;

    // --- 1. Advance time ---
    gameState.pet.age++;
    gameState.time.currentTick++;
    gameState.time.lastTickTimestamp = hal.now();

    const tick = gameState.time.currentTick;

    // --- 2. Determine awake/asleep based on real-world hour ---
    updateSleepState();

    // --- 3. Apply stat decay ---
    applyStatDecay(false);

    // --- 4. Advance sugar rush/crash state machine ---
    updateSugarState();

    // --- 5. Handle poop events ---
    maybeGeneratePoop();

    // --- 6. Check sickness triggers ---
    checkSicknessTriggers();

    // --- 7. Check death conditions ---
    checkDeath();

    // --- 8. Update personality traits (slow drift) ---
    updatePersonality();

    // --- 9. Reset the 6-tick candy window if it has expired ---
    if (tick - gameState.pet.candyWindowStartTick >= 6) {
      gameState.pet.candyCount6Tick = 0;
    }

    // --- 10. Auto-save every 5 ticks ---
    if (tick % 5 === 0) {
      saveGame();
    }

    // --- 11. Log the tick ---
    addEventLog(gameState, `Tick #${tick} | H:${gameState.stats.hunger} Hp:${gameState.stats.happiness} E:${gameState.stats.energy}`);

    // --- 12. Notify the UI ---
    if (onTickCallback) onTickCallback(gameState);
  }

  // ----------------------------------------------------------
  // SLEEP STATE
  // ----------------------------------------------------------

  /**
   * updateSleepState()
   * Checks the current real-world hour and auto-sleeps or auto-wakes
   * the pet based on the configured day/night hours.
   *
   * The pet sleeps from nightStartHour to dayStartHour.
   * (Default: 10pm to 7am)
   */
  function updateSleepState() {
    // Don't override manual sleep if the pet is already in a menu/action state
    if (gameState.pet.state !== 'IDLE' && gameState.pet.state !== 'SLEEPING') return;

    const now  = new Date();
    const hour = now.getHours();
    const { dayStartHour, nightStartHour } = gameState.time;

    const shouldBeAsleep = (hour >= nightStartHour) || (hour < dayStartHour);

    if (shouldBeAsleep && !gameState.pet.isAsleep) {
      // Auto-sleep: pet falls asleep naturally
      gameState.pet.isAsleep = true;
      gameState.pet.state    = 'SLEEPING';
      addEventLog(gameState, 'Pet fell asleep (night time)');

    } else if (!shouldBeAsleep && gameState.pet.isAsleep) {
      // Auto-wake: good morning!
      gameState.pet.isAsleep = false;
      gameState.pet.state    = 'IDLE';
      addEventLog(gameState, 'Pet woke up (morning)');
    }
  }

  // ----------------------------------------------------------
  // STAT DECAY
  // ----------------------------------------------------------

  /**
   * applyStatDecay(silent)
   * Reduces stats by the configured amounts for one tick.
   *
   * Rates (per tick, awake):
   *   Hunger:    -2   (halved while asleep)
   *   Happiness: -1   (doubled if hunger < 20; halved while asleep)
   *   Energy:    -1 awake, +3 asleep
   *   Hygiene:   -0.5 (halved while asleep)
   *   Social:    -0.33 (halved while asleep)
   *
   * @param {boolean} silent - If true, skip event log entries (used during catch-up)
   */
  function applyStatDecay(silent = false) {
    const s       = gameState.stats;
    const asleep  = gameState.pet.isAsleep;
    const halved  = asleep ? 0.5 : 1.0; // sleep halves most decay rates

    // --- Hunger ---
    s.hunger -= 2 * halved;

    // --- Happiness ---
    // Decays faster when the pet is starving (hunger < 20)
    let happinessMult = (s.hunger < 20) ? 2 : 1;
    s.happiness -= 1 * halved * happinessMult;

    // --- Energy ---
    // Unique: energy restores during sleep, drains during wakefulness
    if (asleep) {
      s.energy += 3;
    } else {
      s.energy -= 1;
    }

    // --- Hygiene ---
    s.hygiene -= 0.5 * halved;

    // --- Social ---
    s.social -= (1/3) * halved;

    // --- Auto-sleep if exhausted ---
    // If energy drops below 15, the pet falls asleep automatically
    if (s.energy < 15 && !asleep && gameState.pet.state !== 'SLEEPING') {
      gameState.pet.isAsleep = true;
      gameState.pet.state    = 'SLEEPING';
      if (!silent) addEventLog(gameState, 'Pet is exhausted — fell asleep!');
    }

    // --- Clamp all stats to 0–100 ---
    clampStats(gameState);

    // --- Track neglect for sickness and personality ---
    const anyStatLow = (s.hunger < 20 || s.happiness < 20 ||
                        s.energy < 20  || s.hygiene < 20 || s.social < 20);
    if (anyStatLow) gameState.careHistory.neglectTicks++;

    // --- Track consecutive-zero ticks for sickness triggers ---
    // These are counted every tick regardless of sleep
    gameState.pet.hungerZeroTicks    = (s.hunger === 0)    ? gameState.pet.hungerZeroTicks + 1    : 0;
    gameState.pet.happinessZeroTicks = (s.happiness === 0) ? gameState.pet.happinessZeroTicks + 1 : 0;
    gameState.pet.hygieneLoTicks     = (s.hygiene < 15)    ? gameState.pet.hygieneLoTicks + 1     : 0;
  }

  // ----------------------------------------------------------
  // SUGAR RUSH / CRASH STATE MACHINE
  // ----------------------------------------------------------

  /**
   * updateSugarState()
   * Advances the sugar state machine by one tick.
   *
   *   NONE     → RUSH      : when candyCount6Tick >= 3 (checked in state-machine.js after feeding)
   *   RUSH (3 ticks)  → CRASH    : energy -30, happiness -10
   *   CRASH (3 ticks) → COOLDOWN : candy refused for 6 ticks
   *   COOLDOWN (6 ticks) → NONE  : back to normal
   *
   * The NONE → RUSH transition is triggered by applyFoodEffects() in food.js,
   * which sets sugarState to 'RUSH' when the threshold is hit.
   * Here we just count down the remaining ticks in each state.
   */
  function updateSugarState() {
    const pet = gameState.pet;

    // Check if we should enter RUSH (might have been triggered by feeding this tick)
    if (pet.sugarState === 'NONE' && pet.candyCount6Tick >= 3) {
      enterSugarRush();
      return;
    }

    if (pet.sugarState === 'NONE') return; // nothing to update

    // Count down the current state
    pet.sugarStateTicks--;

    if (pet.sugarStateTicks <= 0) {
      // Transition to next state
      if (pet.sugarState === 'RUSH') {
        enterSugarCrash();
      } else if (pet.sugarState === 'CRASH') {
        enterSugarCooldown();
      } else if (pet.sugarState === 'COOLDOWN') {
        exitSugar();
      }
    }
  }

  function enterSugarRush() {
    const pet = gameState.pet;
    pet.sugarState      = 'RUSH';
    pet.sugarStateTicks = 3; // lasts 3 ticks
    gameState.stats.energy    += 20;  // energy spike
    gameState.stats.happiness += 10;
    clampStats(gameState);

    // Override visual state so renderer shows the rush animation
    if (pet.state === 'IDLE') pet.state = 'SUGAR_RUSH';
    hal.playSfx('sugarRush');

    addEventLog(gameState, 'SUGAR RUSH! Too much candy!');
  }

  function enterSugarCrash() {
    const pet = gameState.pet;
    pet.sugarState      = 'CRASH';
    pet.sugarStateTicks = 3; // lasts 3 ticks

    // The crash: energy and happiness tank
    gameState.stats.energy    -= 30;
    gameState.stats.happiness -= 10;
    clampStats(gameState);

    if (pet.state === 'SUGAR_RUSH') pet.state = 'SUGAR_CRASH';
    hal.playSfx('sugarCrash');

    addEventLog(gameState, 'Sugar crash... feeling awful...');
  }

  function enterSugarCooldown() {
    const pet = gameState.pet;
    pet.sugarState      = 'COOLDOWN';
    pet.sugarStateTicks = 6; // candy refused for 6 ticks
    pet.candyCount6Tick = 0; // reset candy counter

    if (pet.state === 'SUGAR_CRASH') pet.state = 'IDLE';

    addEventLog(gameState, 'Sugar cooldown — candy refused for a while');
  }

  function exitSugar() {
    const pet = gameState.pet;
    pet.sugarState      = 'NONE';
    pet.sugarStateTicks = 0;

    addEventLog(gameState, 'Sugar cooldown ended');
  }

  // ----------------------------------------------------------
  // POOP GENERATION
  // ----------------------------------------------------------

  /**
   * maybeGeneratePoop()
   * Random chance (~1 in 12 ticks) to generate a poop event.
   * Max 3 poops can be on screen at once.
   * Each poop reduces hygiene by 15.
   *
   * The chance increases slightly if the pet was recently fed
   * (because, well, food goes in... and comes out).
   */
  function maybeGeneratePoop() {
    const pet = gameState.pet;

    // Already at max poops — no more room
    if (pet.poopCount >= 3) return;

    // Base probability: about 1 in 12 ticks
    let poopChance = 1 / 12;

    // Slightly higher chance if the pet was fed recently (within 2 ticks)
    const recentlyFed = (gameState.time.currentTick - pet.lastFed) <= 2;
    if (recentlyFed) poopChance *= 1.5;

    if (Math.random() < poopChance) {
      pet.poopCount++;
      gameState.stats.hygiene -= 15;
      clampStats(gameState);
      hal.playSfx('poopBloop');
      addEventLog(gameState, `Poop! (${pet.poopCount} on screen)`);
    }
  }

  // ----------------------------------------------------------
  // SICKNESS
  // ----------------------------------------------------------

  /**
   * checkSicknessTriggers()
   * Checks if the pet should become sick based on its current state.
   *
   * Triggers:
   *   - Hunger = 0 for 12+ consecutive ticks (1 hour real time)
   *   - Happiness = 0 for 24+ consecutive ticks (2 hours)
   *   - Hygiene < 15 for 6+ consecutive ticks (30 min)
   *   - 2% random chance if any stat < 25
   */
  function checkSicknessTriggers() {
    if (gameState.pet.isSick) {
      // Already sick — just count up sickTicks and check for death
      gameState.pet.sickTicks++;
      return;
    }

    const pet = gameState.pet;
    const s   = gameState.stats;
    let becameSick = false;
    let cause      = '';

    // Trigger: hunger = 0 for 12+ ticks
    if (pet.hungerZeroTicks >= 12) {
      becameSick = true;
      cause      = 'starvation';
    }

    // Trigger: happiness = 0 for 24+ ticks
    if (pet.happinessZeroTicks >= 24) {
      becameSick = true;
      cause      = 'loneliness';
    }

    // Trigger: hygiene < 15 for 6+ ticks
    if (pet.hygieneLoTicks >= 6) {
      becameSick = true;
      cause      = 'poor hygiene';
    }

    // Trigger: 2% random chance if any stat < 25
    const anyStatLow = (s.hunger < 25 || s.happiness < 25 ||
                        s.energy < 25  || s.hygiene < 25 || s.social < 25);
    if (!becameSick && anyStatLow && Math.random() < 0.02) {
      becameSick = true;
      cause      = 'neglect';
    }

    if (becameSick) {
      pet.isSick   = true;
      pet.sickTicks = 0;
      hal.playSfx('sickAlarm');
      addEventLog(gameState, `Pet got sick! (${cause})`);
    }
  }

  // ----------------------------------------------------------
  // DEATH
  // ----------------------------------------------------------

  /**
   * checkDeath()
   * If the pet has been sick for 36+ ticks without medicine,
   * it dies. The death screen shows the cause.
   */
  function checkDeath() {
    const pet = gameState.pet;

    if (!pet.isSick) return;

    if (pet.sickTicks >= 36) {
      pet.state        = 'DEAD';
      pet.causeOfDeath = buildCauseOfDeath();
      hal.playSfx('deathTone');
      addEventLog(gameState, `Pet died after ${pet.age} ticks — ${pet.causeOfDeath}`);
      saveGame(); // save the death state so it persists on refresh
    }
  }

  /**
   * buildCauseOfDeath()
   * Returns a human-readable death cause string based on the pet's stats.
   */
  function buildCauseOfDeath() {
    const s   = gameState.stats;
    const pet = gameState.pet;

    if (pet.hungerZeroTicks >= 12)    return 'starvation';
    if (pet.happinessZeroTicks >= 24) return 'a broken heart';
    if (pet.hygieneLoTicks >= 6)      return 'unhygienic conditions';
    return 'neglect (too many needs unmet)';
  }

  // ----------------------------------------------------------
  // PERSONALITY EVOLUTION
  // ----------------------------------------------------------

  /**
   * updatePersonality()
   * Gently nudges personality traits based on care history.
   * Each trait drifts very slowly — you'd need many ticks to
   * notice a change. This keeps the evolution feeling organic.
   *
   * Rules:
   *   - Consistent feeding → lower sass, higher affection
   *   - Neglect → higher sass, lower affection
   *   - Lots of play → higher energy
   *   - Lots of talk → higher curiosity + philosophical
   *   - Balanced care → traits drift toward center (50)
   *
   * The nudge is small (±0.5 per tick max) and only triggers
   * every 10 ticks to keep the math clean.
   */
  function updatePersonality() {
    const tick = gameState.time.currentTick;

    // Only adjust every 10 ticks to keep changes gradual
    if (tick % 10 !== 0) return;

    const p    = gameState.personality;
    const care = gameState.careHistory;

    // --- Sass: goes up with neglect, down with frequent feeding ---
    const neglectRate = care.neglectTicks / Math.max(1, tick); // ratio 0-1
    nudgeTrait(p, 'sass', neglectRate > 0.3 ? +0.5 : -0.3);

    // --- Affection: goes up with frequent interaction ---
    const interactionRate = (care.feedCount + care.talkCount) / Math.max(1, tick);
    nudgeTrait(p, 'affection', interactionRate > 0.5 ? +0.5 : -0.2);

    // --- Energy: goes up with play ---
    const playRate = care.playCount / Math.max(1, tick);
    nudgeTrait(p, 'energy', playRate > 0.2 ? +0.5 : -0.2);

    // --- Curiosity: goes up with talking ---
    const talkRate = care.talkCount / Math.max(1, tick);
    nudgeTrait(p, 'curiosity', talkRate > 0.1 ? +0.5 : -0.1);

    // --- Philosophical: goes up with talking, very slowly ---
    nudgeTrait(p, 'philosophical', talkRate > 0.15 ? +0.3 : -0.1);

    clampPersonality(gameState);
  }

  /**
   * nudgeTrait(personality, key, delta)
   * Moves a trait by delta, but only if the trait isn't already
   * "extreme" in that direction (avoids maxing out traits permanently).
   */
  function nudgeTrait(personality, key, delta) {
    const val = personality[key];

    // If trying to go higher but already very high, slow down
    if (delta > 0 && val > 80) delta *= 0.1;
    // If trying to go lower but already very low, slow down
    if (delta < 0 && val < 20) delta *= 0.1;

    personality[key] += delta;
  }

  // ----------------------------------------------------------
  // SAVE / LOAD
  // ----------------------------------------------------------

  const SAVE_KEY = 'clawmogatchi_state';

  /**
   * engine.saveGame()
   * Serializes the game state to JSON and saves it to localStorage.
   */
  function saveGame() {
    if (!gameState) return;
    const json = JSON.stringify(gameState);
    hal.saveState(SAVE_KEY, json);
  }

  /**
   * engine.loadGame()
   * Loads state from localStorage and returns it, or null if none saved.
   */
  function loadGame() {
    const json = hal.loadState(SAVE_KEY);
    if (!json) return null;
    try {
      const loaded = JSON.parse(json);
      // If saved mid-minigame, reset to IDLE (minigame state is transient)
      if (loaded && loaded.pet && loaded.pet.state === 'PLAYING') {
        loaded.pet.state = 'IDLE';
        loaded.pet._currentMinigame = null;
        loaded.pet._minigameData = null;
      }
      return loaded;
    } catch (e) {
      console.warn('[engine] Failed to parse saved state:', e);
      return null;
    }
  }

  /**
   * engine.resetGame()
   * Clears the saved state and creates a fresh pet.
   * Returns the new state (caller should update their reference).
   */
  function resetGame() {
    const currentGen = gameState ? gameState.pet.generation : 1;
    hal.saveState(SAVE_KEY, ''); // clear save
    const fresh = createFreshState(currentGen);
    fresh.time.lastTickTimestamp = hal.now();
    gameState = fresh;
    return fresh;
  }

  // ----------------------------------------------------------
  // Medicine (called by state-machine.js)
  // ----------------------------------------------------------

  /**
   * engine.applyMedicine()
   * Cures the pet if it's sick. Can only be used once every 6 ticks.
   * Returns true if medicine was successfully applied.
   */
  function applyMedicine() {
    if (!gameState.pet.isSick) return false;

    const tick       = gameState.time.currentTick;
    const lastMedTick = gameState.pet._lastMedicineTick || 0;

    if (tick - lastMedTick < 6) {
      addEventLog(gameState, 'Medicine on cooldown');
      return false;
    }

    gameState.pet.isSick     = false;
    gameState.pet.sickTicks  = 0;
    gameState.pet._lastMedicineTick = tick;

    // Cure also gives a small stat boost (you feel better after medicine!)
    gameState.stats.happiness += 10;
    clampStats(gameState);

    addEventLog(gameState, 'Medicine given — pet is cured!');
    return true;
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------
  return {
    init,
    tick,
    applyCatchUp,
    saveGame,
    loadGame,
    resetGame,
    applyMedicine,

    // Expose for dev tools
    getState: () => gameState,
  };

})();
