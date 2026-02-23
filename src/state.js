// ============================================================
// state.js — Game State Data Structure
//
// This file defines the shape of ALL game data.
// Think of it like a save file — everything the game needs
// to remember is stored here.
//
// The state is one big plain object (no classes) so it can
// be easily serialized to JSON for saving/loading.
// ============================================================

/**
 * createFreshState()
 * Returns a brand-new game state for a newborn pet.
 * Called on first launch or after death when starting over.
 *
 * @param {number} generation - Which generation of pet this is (starts at 1)
 */
function createFreshState(generation = 1) {
  return {

    // ----------------------------------------------------------
    // STATS — the five core needs, each 0-100
    // 0 = completely depleted, 100 = fully satisfied
    // ----------------------------------------------------------
    stats: {
      hunger:    80,  // how full the pet is (100 = stuffed, 0 = starving)
      happiness: 70,  // mood (100 = joyful, 0 = miserable)
      energy:    90,  // alertness (100 = wide awake, 0 = exhausted)
      hygiene:   85,  // cleanliness (100 = spotless, 0 = filthy)
      social:    50,  // social fulfilment (100 = loved, 0 = lonely)
    },

    // ----------------------------------------------------------
    // PERSONALITY — five traits, each 0-100
    // These evolve slowly based on how you care for the pet.
    // Phase 4 will use these to shape AI dialogue.
    // ----------------------------------------------------------
    personality: {
      sass:          30,  // low=earnest, high=sarcastic
      curiosity:     50,  // low=content, high=asks questions
      affection:     50,  // low=independent, high=clingy
      energy:        50,  // low=chill, high=hyperactive
      philosophical: 30,  // low=practical, high=existential
    },

    // ----------------------------------------------------------
    // PET STATUS — everything about the pet's current condition
    // ----------------------------------------------------------
    pet: {
      age:        0,          // total ticks alive
      generation: generation, // how many lives this pet line has had
      name:       'Claw',     // default name (user-settable in Phase 6)
      state:      'IDLE',     // current state machine state (see state-machine.js)

      // --- Health ---
      isSick:     false,      // is the pet sick right now?
      sickTicks:  0,          // how many consecutive ticks has it been sick?

      // --- Sleep ---
      isAsleep:   false,      // is the pet asleep?

      // --- Poop ---
      poopCount:  0,          // number of uncleaned poops on screen (0-3 max)

      // --- Care history timestamps (in tick numbers) ---
      lastFed:    0,          // tick when the pet was last fed
      lastPlayed: 0,          // tick when the pet last played a minigame
      lastTalked: 0,          // tick of last AI/talk interaction

      // --- Death ---
      causeOfDeath: null,     // string describing why the pet died (for eulogy)

      // --- Sugar rush/crash mechanic ---
      // Tracks whether the pet is in a sugar high, crash, or cooldown.
      sugarState:      'NONE', // 'NONE' | 'RUSH' | 'CRASH' | 'COOLDOWN'
      sugarStateTicks: 0,      // ticks remaining in the current sugar state

      // How many candy items were fed in the last 6-tick window.
      // When this hits 3, the sugar rush begins!
      candyCount6Tick: 0,

      // Tracks when the 6-tick candy window started (in absolute tick number).
      // Used to reset candyCount6Tick when 6 ticks have passed.
      candyWindowStartTick: 0,

      // --- Hunger/happiness neglect tracking (for sickness triggers) ---
      hungerZeroTicks:    0,  // consecutive ticks with hunger = 0
      happinessZeroTicks: 0,  // consecutive ticks with happiness = 0
      hygieneLoTicks:     0,  // consecutive ticks with hygiene < 15

      // --- Menu navigation ---
      menuIndex: 0,           // currently selected menu icon (0-6)
      foodIndex: 0,           // currently selected food in the food carousel
    },

    // ----------------------------------------------------------
    // TIME — tick system config and real-time tracking
    // ----------------------------------------------------------
    time: {
      currentTick:      0,      // total ticks that have elapsed
      tickIntervalMs:   300000, // 5 minutes per tick by default
      lastTickTimestamp: 0,     // Date.now() value at the last tick
                                // (used for offline catch-up calculation)
      dayStartHour:  7,         // pet wakes up at 7am
      nightStartHour: 22,       // pet sleeps at 10pm
    },

    // ----------------------------------------------------------
    // EVENT LOG — ring buffer of recent events
    // Keeps the last 20 entries. New entries push to the front.
    // Shown in the right-panel event log in the emulator.
    // ----------------------------------------------------------
    eventLog: [],

    // ----------------------------------------------------------
    // CARE HISTORY — rolling window for personality evolution
    // These counters are used by the engine to slowly shift
    // personality traits over time (Phase 4 will use these more).
    // ----------------------------------------------------------
    careHistory: {
      feedCount:    0,  // times fed in last 48 ticks
      playCount:    0,  // times played in last 48 ticks
      talkCount:    0,  // times talked in last 48 ticks
      cleanCount:   0,  // times cleaned in last 48 ticks
      neglectTicks: 0,  // ticks where any stat was below 20
      // Rolling 48-tick window: each entry records actions for that tick
      // { feed: bool, play: bool, talk: bool, clean: bool, neglect: bool }
      _tickWindow:  [],
    },

    // ----------------------------------------------------------
    // AI CONFIG — Phase 4 AI personality dialogue
    // ----------------------------------------------------------
    aiConfig: {
      enabled:      false,                       // master toggle for AI dialogue
      ollamaUrl:    'http://localhost:11434',     // Ollama server URL
      ollamaModel:  'llama3.2',                  // Ollama model name
      claudeApiKey: '',                           // Claude API key (fallback)
      claudeModel:  'claude-haiku-4-5-20251001', // Claude model ID
      preferOllama: true,                         // try Ollama first, then Claude
      timeoutMs:    5000,                         // per-request timeout
    },

    // ----------------------------------------------------------
    // DEV MODE — emulator-only settings
    // ----------------------------------------------------------
    devMode: {
      speedMultiplier: 1, // 1 = real-time, up to 100x for testing
    },

  };
}

/**
 * addEventLog(state, message)
 * Adds a new entry to the event log ring buffer.
 * The log stores the last 20 entries; older ones are dropped.
 *
 * @param {object} state   - The full game state
 * @param {string} message - What happened (e.g. "Fed pizza", "Tick #42")
 */
function addEventLog(state, message) {
  const entry = {
    tick:    state.time.currentTick,
    message: message,
    timestamp: Date.now(),
  };

  // Add to front of array so newest entries come first
  state.eventLog.unshift(entry);

  // Keep only the last 20 entries
  if (state.eventLog.length > 20) {
    state.eventLog.length = 20;
  }
}

/**
 * clampStats(state)
 * Makes sure all stats stay within the valid 0-100 range.
 * Call this after any operation that modifies stats.
 */
function clampStats(state) {
  const s = state.stats;
  s.hunger    = Math.max(0, Math.min(100, Math.round(s.hunger)));
  s.happiness = Math.max(0, Math.min(100, Math.round(s.happiness)));
  s.energy    = Math.max(0, Math.min(100, Math.round(s.energy)));
  s.hygiene   = Math.max(0, Math.min(100, Math.round(s.hygiene)));
  s.social    = Math.max(0, Math.min(100, Math.round(s.social)));
}

/**
 * clampPersonality(state)
 * Keeps all personality traits in 0-100 range.
 */
function clampPersonality(state) {
  const p = state.personality;
  for (const key of Object.keys(p)) {
    p[key] = Math.max(0, Math.min(100, Math.round(p[key])));
  }
}

// Expose functions globally so other modules can use them.
// (In a module system we'd use export, but we're keeping this
//  vanilla JS for simplicity and ESP32 portability.)
