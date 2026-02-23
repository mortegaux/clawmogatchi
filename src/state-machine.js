// ============================================================
// state-machine.js — State Transitions + Action Handlers
//
// The state machine controls what happens when the player
// presses buttons. It reads the current pet.state and either:
//   (a) Changes the state (e.g., IDLE → MENU)
//   (b) Triggers an action (e.g., feed food, clean poop)
//   (c) Ignores the input (e.g., can't feed during DEAD state)
//
// States (from PRD §7.1):
//   IDLE         — main screen, pet visible, stats decaying
//   MENU         — icon bar active, navigating with LEFT/RIGHT
//   FEEDING      — food carousel open
//   CLEANING     — clean animation playing (brief)
//   TALKING      — AI dialogue (stub for Phase 4)
//   SLEEPING     — pet asleep, limited interaction
//   SICK         — sick overlay on top of other states
//   DEAD         — death screen
//   STATS_VIEW   — showing stat bars
//   SUGAR_RUSH   — hyperactive overlay
//   SUGAR_CRASH  — sluggish overlay
//
// This file only handles button presses and state transitions.
// Time-based state changes (auto-sleep, death) happen in engine.js.
// ============================================================

const stateMachine = (() => {

  // Reference to game state — set by init()
  let gameState = null;

  // Timeout handle for menu auto-return (menu exits after 10s idle)
  let menuTimeoutHandle = null;
  const MENU_TIMEOUT_MS = 10000; // 10 seconds

  // ----------------------------------------------------------
  // INIT
  // ----------------------------------------------------------

  /**
   * stateMachine.init(state)
   * Sets the game state reference. Call from main.js.
   */
  function init(state) {
    gameState = state;
  }

  // ----------------------------------------------------------
  // BUTTON HANDLERS
  // ----------------------------------------------------------

  /**
   * stateMachine.handleButton(button)
   * The main dispatcher — called by input.js whenever a button is pressed.
   * Routes to the appropriate handler based on current state.
   *
   * @param {string} button - 'LEFT' | 'RIGHT' | 'ACTION' | 'BACK'
   */
  function handleButton(button) {
    if (!gameState) return;

    const state = gameState.pet.state;

    // Route to the correct handler for the current state
    switch (state) {
      case 'IDLE':        handleIdle(button);        break;
      case 'MENU':        handleMenu(button);         break;
      case 'FEEDING':     handleFeeding(button);      break;
      case 'CLEANING':    /* busy, ignore input */     break;
      case 'TALKING':     handleTalking(button);      break;
      case 'SLEEPING':    handleSleeping(button);     break;
      case 'SICK':        handleSick(button);         break;
      case 'DEAD':        handleDead(button);          break;
      case 'PLAYING':     handlePlaying(button);       break;
      case 'STATS_VIEW':  handleStatsView(button);    break;
      case 'SUGAR_RUSH':  handleSugarRush(button);    break;
      case 'SUGAR_CRASH': handleSugarCrash(button);   break;
      default:
        // Unknown state — fall back to IDLE
        gameState.pet.state = 'IDLE';
    }
  }

  // ----------------------------------------------------------
  // STATE: IDLE
  // ----------------------------------------------------------

  function handleIdle(button) {
    if (button === 'LEFT' || button === 'RIGHT') {
      // Open the menu
      hal.playSfx('menuTick');
      enterMenu();

    } else if (button === 'ACTION') {
      // Petting the pet! Small happiness boost and a heart animation trigger
      gameState.stats.happiness = Math.min(100, gameState.stats.happiness + 3);
      gameState.stats.social    = Math.min(100, gameState.stats.social + 2);
      clampStats(gameState);

      addEventLog(gameState, 'Petted Claw (+3 happiness)');
      hal.playSfx('petHeart');

      // Signal the renderer to show a heart animation (it reads this flag)
      gameState.pet._showHeart    = true;
      gameState.pet._showHeartTick = gameState.time.currentTick;
    }
    // BACK does nothing from IDLE
  }

  // ----------------------------------------------------------
  // STATE: MENU
  // ----------------------------------------------------------

  function handleMenu(button) {
    const iconCount = MENU_ICONS.length; // 7 icons

    if (button === 'LEFT') {
      // Cycle left through icons (wrapping)
      gameState.pet.menuIndex = (gameState.pet.menuIndex - 1 + iconCount) % iconCount;
      hal.playSfx('menuTick');
      resetMenuTimeout();

    } else if (button === 'RIGHT') {
      // Cycle right through icons (wrapping)
      gameState.pet.menuIndex = (gameState.pet.menuIndex + 1) % iconCount;
      hal.playSfx('menuTick');
      resetMenuTimeout();

    } else if (button === 'ACTION') {
      // Select the current icon
      hal.playSfx('menuSelect');
      clearMenuTimeout();
      dispatchMenuAction(MENU_ICONS[gameState.pet.menuIndex].id);

    } else if (button === 'BACK') {
      // Exit menu, return to idle
      hal.playSfx('menuBack');
      clearMenuTimeout();
      exitMenu();
    }
  }

  function enterMenu() {
    gameState.pet.state = 'MENU';
    // Start the 10-second timeout to auto-return to IDLE
    resetMenuTimeout();
  }

  function exitMenu() {
    gameState.pet.state = 'IDLE';
    clearMenuTimeout();
  }

  function resetMenuTimeout() {
    clearMenuTimeout();
    menuTimeoutHandle = setTimeout(() => {
      if (gameState.pet.state === 'MENU') {
        exitMenu();
        addEventLog(gameState, 'Menu closed (timeout)');
      }
    }, MENU_TIMEOUT_MS);
  }

  function clearMenuTimeout() {
    if (menuTimeoutHandle !== null) {
      clearTimeout(menuTimeoutHandle);
      menuTimeoutHandle = null;
    }
  }

  /**
   * dispatchMenuAction(iconId)
   * Called when the player selects an icon from the menu.
   * Routes to the correct sub-action.
   */
  function dispatchMenuAction(iconId) {
    switch (iconId) {
      case 'feed':
        enterFeeding();
        break;

      case 'play':
        // Pick a random minigame and start it
        {
          const types = minigames.GAME_TYPES;
          const pick = types[Math.floor(Math.random() * types.length)];
          gameState.pet._playedThisTick = true; // rolling window tracking
          minigames.startGame(pick, gameState);
        }
        break;

      case 'clean':
        performClean();
        break;

      case 'talk':
        performTalk();
        break;

      case 'sleep':
        toggleSleep();
        break;

      case 'medicine':
        if (gameState.pet.isSick) {
          engine.applyMedicine();
          hal.playSfx('medicineChime');
          exitMenu();
        } else {
          addEventLog(gameState, 'No medicine needed right now');
          // Stay in menu so player can see the message
        }
        break;

      case 'stats':
        gameState.pet.state = 'STATS_VIEW';
        break;
    }
  }

  // ----------------------------------------------------------
  // STATE: FEEDING
  // ----------------------------------------------------------

  function enterFeeding() {
    // Make sure we have at least one food available
    const available = getAvailableFoods(gameState);
    if (available.length === 0) {
      addEventLog(gameState, 'No food available right now');
      exitMenu();
      return;
    }

    // Reset food carousel to first item
    gameState.pet.foodIndex = 0;
    gameState.pet.state     = 'FEEDING';
    addEventLog(gameState, 'Food menu opened');
  }

  function handleFeeding(button) {
    const available = getAvailableFoods(gameState);
    if (available.length === 0) {
      exitMenu();
      return;
    }

    if (button === 'LEFT') {
      // Scroll left in food carousel (wrapping)
      gameState.pet.foodIndex = (gameState.pet.foodIndex - 1 + available.length) % available.length;

    } else if (button === 'RIGHT') {
      // Scroll right in food carousel (wrapping)
      gameState.pet.foodIndex = (gameState.pet.foodIndex + 1) % available.length;

    } else if (button === 'ACTION') {
      // Set eating animation flags — renderer applies effects on completion
      const food = available[gameState.pet.foodIndex];
      gameState.pet._eatingFood       = food.id;
      gameState.pet._eatingStartFrame = null;  // renderer latches on first frame
      gameState.pet._eatingReact      = EATING_REACTIONS[food.id] || EATING_REACTIONS.default;
      gameState.pet._pendingFoodId    = food.id;
      gameState.pet._fedThisTick      = true; // rolling window tracking
      hal.playSfx('feedChirp');
      // Stay in FEEDING state; renderer will transition to IDLE when done

    } else if (button === 'BACK') {
      // Cancel — go back to menu
      hal.playSfx('menuBack');
      enterMenu();
    }
  }

  // ----------------------------------------------------------
  // ACTION: CLEAN
  // ----------------------------------------------------------

  function performClean() {
    // Cleaning restores hygiene and removes all poop
    gameState.stats.hygiene = Math.min(100, gameState.stats.hygiene + 30);
    gameState.pet.poopCount = 0;
    gameState.pet._cleanedThisTick = true; // rolling window tracking
    clampStats(gameState);

    addEventLog(gameState, `Cleaned! Hygiene +30`);
    hal.playSfx('cleanSweep');

    // Reset the hygiene-low-ticks counter since we just cleaned
    gameState.pet.hygieneLoTicks = 0;

    // Brief CLEANING state (renderer shows a sparkle, Phase 2)
    // For now just return to IDLE immediately
    gameState.pet.state = 'IDLE';
  }

  // ----------------------------------------------------------
  // ACTION: TALK (Phase 4 stub)
  // ----------------------------------------------------------

  /**
   * performTalk()
   * Async talk action. If AI is enabled, shows "thinking..." animation
   * while waiting for the AI response, then falls back to offline dialogue
   * on failure. If AI is disabled, uses offline dialogue immediately.
   */
  async function performTalk() {
    gameState.pet.state          = 'TALKING';
    gameState.pet.lastTalked     = gameState.time.currentTick;
    gameState.pet._talkedThisTick = true; // rolling window tracking
    gameState.stats.social       = Math.min(100, gameState.stats.social + 10);
    clampStats(gameState);
    hal.playSfx('talkStart');

    const aiEnabled = gameState.aiConfig && gameState.aiConfig.enabled &&
                      typeof ai !== 'undefined';

    if (!aiEnabled) {
      // Instant offline response
      const response = getOfflineDialogue(gameState);
      gameState.pet._dialogue     = response;
      gameState.pet._dialogueTick = gameState.time.currentTick;
      gameState.pet._aiThinking   = false;
      addEventLog(gameState, `Talked: "${response.substring(0, 30)}..."`);
      return;
    }

    // AI enabled — show thinking state
    gameState.pet._dialogue   = null;
    gameState.pet._aiThinking = true;

    try {
      const response = await ai.requestAIDialogue(gameState);

      // Check if user cancelled during the request (pressed BACK)
      if (gameState.pet.state !== 'TALKING') return;

      if (response) {
        gameState.pet._dialogue     = response;
        gameState.pet._aiThinking   = false;
        gameState.pet._dialogueTick = gameState.time.currentTick;
        addEventLog(gameState, `AI: "${response.substring(0, 30)}..."`);
      } else {
        // AI returned null — use offline fallback
        const fallback = getOfflineDialogue(gameState);
        gameState.pet._dialogue     = fallback;
        gameState.pet._aiThinking   = false;
        gameState.pet._dialogueTick = gameState.time.currentTick;
        addEventLog(gameState, `Talked: "${fallback.substring(0, 30)}..."`);
      }
    } catch (e) {
      // All AI backends failed — offline fallback
      if (gameState.pet.state !== 'TALKING') return;
      const fallback = getOfflineDialogue(gameState);
      gameState.pet._dialogue     = fallback;
      gameState.pet._aiThinking   = false;
      gameState.pet._dialogueTick = gameState.time.currentTick;
      addEventLog(gameState, `Talked: "${fallback.substring(0, 30)}..."`);
    }
  }

  /**
   * getOfflineDialogue(state)
   * Returns a pre-written response based on the pet's current mood,
   * personality traits, and situation. ~50 total responses organized
   * by urgency → situation → personality flavor → general happy.
   *
   * @param {object} state - The full game state
   */
  function getOfflineDialogue(state) {
    const s   = state.stats;
    const pet = state.pet;
    const p   = state.personality;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // --- Priority 1: Urgent stat needs (any stat < 20) ---
    if (s.hunger < 20) return pick([
      "My tummy is growling... can we get some food?",
      "I'm so hungry I could eat a whole pizza!",
      "Feed me? Pretty please? I'll be good!",
    ]);
    if (s.happiness < 20) return pick([
      "I'm feeling really down... let's play?",
      "Everything feels grey today. Cheer me up?",
      "I could use something fun right about now...",
    ]);
    if (s.energy < 20) return pick([
      "So... sleepy... can't keep... eyes open...",
      "I think I need a nap. Or five.",
      "Running on empty here... zzz...",
    ]);
    if (s.hygiene < 20) return pick([
      "I feel kinda gross. Can you clean up?",
      "Is that smell coming from me? Oh no...",
      "A bath sounds really nice right now.",
    ]);
    if (s.social < 20) return pick([
      "I missed you! It's been lonely here.",
      "Hey! Don't forget about me in here!",
      "I just want someone to talk to...",
    ]);

    // --- Priority 2: Situational ---
    if (pet.isSick) return pick([
      "I don't feel so good. Medicine please?",
      "My head is spinning... help...",
      "Is there a doctor in the house?",
    ]);
    if (pet.sugarState === 'RUSH') return pick([
      "EVERYTHING IS SO AMAZING RIGHT NOW!!!",
      "I CAN SEE THROUGH TIME!!! WHEEEEE!!!",
      "CANDY IS THE BEST THING EVER INVENTED!",
    ]);
    if (pet.sugarState === 'CRASH') return pick([
      "ugh... why did I eat all that candy...",
      "I regret everything. My tummy hurts.",
      "No more sugar... ever... I mean it this time.",
    ]);
    if (pet.poopCount >= 2) return pick([
      "It's getting a bit... fragrant in here.",
      "Ahem. Could someone tidy up around here?",
      "I'd clean it myself but... no thumbs.",
    ]);

    // --- Priority 3: Personality-flavored happy responses ---
    // Find the dominant personality trait
    const dominant = getDominantTrait(p);

    if (dominant === 'sass' && p.sass > 60) return pick([
      "Oh, you finally decided to talk to me?",
      "I GUESS we can chat. If you insist.",
      "You know, I could do this all by myself.",
      "Tell me something I don't already know.",
    ]);
    if (dominant === 'curiosity' && p.curiosity > 60) return pick([
      "Hey, what's outside this screen anyway?",
      "Do you think other virtual pets dream?",
      "I wonder how many pixels I'm made of...",
      "What's the weirdest thing you learned today?",
    ]);
    if (dominant === 'affection' && p.affection > 60) return pick([
      "You're my favourite human, you know that?",
      "I love when you visit me! Never leave!",
      "Can we just hang out? I like when you're here.",
      "You make my little pixel heart happy!",
    ]);
    if (dominant === 'energy' && p.energy > 60) return pick([
      "Let's DO something! I'm SO bored!",
      "Race you! Oh wait, I can't move. BUT STILL!",
      "I've got so much energy! Play with me!",
      "Sitting still is SO HARD right now!",
    ]);
    if (dominant === 'philosophical' && p.philosophical > 60) return pick([
      "Do you think I exist when you close the browser?",
      "I wonder what I'll dream about tonight...",
      "Being alive is neat. Even pixel-alive.",
      "What does it mean to be a good pet, really?",
    ]);

    // --- Priority 4: General happy responses ---
    return pick([
      "I'm happy today! Thanks for taking care of me.",
      "What a good day! I hope you're doing well too.",
      "Feeling full and happy. Life is good!",
      "Have you eaten today? Take care of yourself too!",
      "I learned something today. Not sure what, but it felt important.",
      "Thanks for checking in! That's nice of you.",
      "Everything's good here. Just vibing.",
      "You know what? Today is a pretty good day.",
    ]);
  }

  /**
   * getDominantTrait(personality)
   * Returns the name of the highest personality trait.
   */
  function getDominantTrait(p) {
    let best = 'sass';
    let bestVal = p.sass;
    for (const key of ['curiosity', 'affection', 'energy', 'philosophical']) {
      if (p[key] > bestVal) { best = key; bestVal = p[key]; }
    }
    return best;
  }

  // ----------------------------------------------------------
  // STATE: TALKING
  // ----------------------------------------------------------

  function handleTalking(button) {
    if (button === 'BACK') {
      // Cancel thinking or dismiss dialogue — return to IDLE
      gameState.pet.state       = 'IDLE';
      gameState.pet._dialogue   = null;
      gameState.pet._aiThinking = false;
    } else if (button === 'ACTION') {
      // Only dismiss if we have dialogue (not while thinking)
      if (gameState.pet._dialogue && !gameState.pet._aiThinking) {
        gameState.pet.state     = 'IDLE';
        gameState.pet._dialogue = null;
      }
    }
  }

  // ----------------------------------------------------------
  // ACTION: SLEEP TOGGLE
  // ----------------------------------------------------------

  function toggleSleep() {
    if (gameState.pet.isAsleep) {
      // Wake up (forced — happiness penalty)
      gameState.pet.isAsleep    = false;
      gameState.pet.state       = 'IDLE';
      gameState.stats.happiness = Math.max(0, gameState.stats.happiness - 10);
      clampStats(gameState);
      addEventLog(gameState, 'Woke pet up (-10 happiness)');
    } else {
      // Put to sleep manually
      gameState.pet.isAsleep = true;
      gameState.pet.state    = 'SLEEPING';
      addEventLog(gameState, 'Pet went to sleep');
    }
    hal.playSfx('sleepToggle');
  }

  // ----------------------------------------------------------
  // STATE: SLEEPING
  // ----------------------------------------------------------

  function handleSleeping(button) {
    if (button === 'ACTION') {
      // Force wake — costs happiness
      toggleSleep();
    }
    // Other buttons do nothing while sleeping
  }

  // ----------------------------------------------------------
  // STATE: SICK
  // ----------------------------------------------------------

  function handleSick(button) {
    // When sick, the menu is still accessible but routes differently.
    // For now treat sick state like IDLE — open menu with LEFT/RIGHT.
    handleIdle(button);
  }

  // ----------------------------------------------------------
  // STATE: DEAD
  // ----------------------------------------------------------

  function handleDead(button) {
    if (button === 'ACTION') {
      // New pet! Increment generation and reset state.
      const newGen   = (gameState.pet.generation || 1) + 1;
      const newState = createFreshState(newGen);
      newState.time.lastTickTimestamp = hal.now();

      // Copy the new state into the existing gameState reference
      // (We do this in-place so main.js's reference stays valid)
      Object.assign(gameState, newState);

      addEventLog(gameState, `Generation ${newGen} begins!`);
      hal.playSfx('newPet');
      engine.saveGame();
    }
  }

  // ----------------------------------------------------------
  // STATE: PLAYING (minigame active)
  // ----------------------------------------------------------

  function handlePlaying(button) {
    // Route all input to the active minigame
    minigames.handleInput(button, gameState);

    // If the minigame just completed, apply rewards and exit
    if (minigames.isComplete(gameState)) {
      minigames.endGame(gameState);
    }
  }

  // ----------------------------------------------------------
  // STATE: STATS_VIEW
  // ----------------------------------------------------------

  function handleStatsView(button) {
    // Any button returns to IDLE
    gameState.pet.state = 'IDLE';
  }

  // ----------------------------------------------------------
  // STATE: SUGAR RUSH
  // ----------------------------------------------------------

  function handleSugarRush(button) {
    // Can't do much during a sugar rush — just let it run out
    // But you can still open the menu
    if (button === 'LEFT' || button === 'RIGHT') {
      enterMenu();
    }
  }

  // ----------------------------------------------------------
  // STATE: SUGAR CRASH
  // ----------------------------------------------------------

  function handleSugarCrash(button) {
    // Same as sugar rush — limited interaction
    if (button === 'LEFT' || button === 'RIGHT') {
      enterMenu();
    }
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------
  return {
    init,
    handleButton,
    performTalk,          // exposed for engine.js pet-initiated dialogue
    getOfflineDialogue,   // exposed for fallback usage
    getDominantTrait,     // exposed for renderer personality animations
  };

})();
