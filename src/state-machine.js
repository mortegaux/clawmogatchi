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
    gameState.careHistory.cleanCount++;
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

  function performTalk() {
    gameState.pet.state   = 'TALKING';
    gameState.pet.lastTalked = gameState.time.currentTick;
    gameState.careHistory.talkCount++;
    gameState.stats.social = Math.min(100, gameState.stats.social + 10);
    clampStats(gameState);

    // Phase 4 will fire an HTTP request to Ollama/Claude here.
    // For now, use a simple offline response.
    const response = getOfflineDialogue(gameState);
    gameState.pet._dialogue      = response;
    gameState.pet._dialogueTick  = gameState.time.currentTick;
    hal.playSfx('talkStart');

    addEventLog(gameState, `Talked: "${response.substring(0, 30)}..."`);
  }

  /**
   * getOfflineDialogue(state)
   * Returns a pre-written response based on the pet's current mood.
   * Phase 4 will replace this with a real AI call.
   *
   * @param {object} state - The full game state
   */
  function getOfflineDialogue(state) {
    const s   = state.stats;
    const pet = state.pet;

    // Priority: respond to the most urgent need first
    if (s.hunger < 20) {
      return "My tummy is growling... can we get some food?";
    }
    if (s.hygiene < 20) {
      return "I feel kinda gross. Can you clean up?";
    }
    if (s.happiness < 20) {
      return "I'm feeling really down... let's play?";
    }
    if (s.social < 20) {
      return "I missed you! It's been lonely here.";
    }
    if (s.energy < 20) {
      return "So... sleepy... can't keep... eyes open...";
    }
    if (pet.isSick) {
      return "I don't feel so good. Medicine please?";
    }
    if (pet.sugarState === 'RUSH') {
      return "EVERYTHING IS SO AMAZING RIGHT NOW!!!";
    }
    if (pet.sugarState === 'CRASH') {
      return "ugh... why did I eat all that candy...";
    }
    if (pet.poopCount >= 2) {
      return "It's getting a bit... fragrant in here.";
    }

    // Happy responses when everything is fine
    const happyLines = [
      "I'm happy today! Thanks for taking care of me.",
      "What a good day! I hope you're doing well too.",
      "I learned something interesting today. Being alive is neat.",
      "You're my favourite human, you know that?",
      "I wonder what I'll dream about tonight...",
      "Feeling full and happy. Life is good!",
      "Can we just hang out? I like when you're here.",
      "Have you eaten today? You should take care of yourself too!",
    ];

    return happyLines[Math.floor(Math.random() * happyLines.length)];
  }

  // ----------------------------------------------------------
  // STATE: TALKING
  // ----------------------------------------------------------

  function handleTalking(button) {
    // Any button press dismisses the dialogue and returns to IDLE
    if (button === 'ACTION' || button === 'BACK') {
      gameState.pet.state    = 'IDLE';
      gameState.pet._dialogue = null;
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
  };

})();
