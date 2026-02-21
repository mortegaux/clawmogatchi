// ============================================================
// food.js — Food Definitions
//
// All 11 food items for Clawmogatchi, organized into three
// categories: Meals, Candy, and Special.
//
// Each food object has:
//   id          - unique string identifier
//   name        - display name (shown in text bar)
//   category    - 'meal' | 'candy' | 'special'
//   hunger      - how much hunger it restores (+number)
//   happiness   - happiness change (can be positive or negative)
//   energyDelta - energy change (0 if none)
//   hygieneDelta- hygiene change (0 if none, negative = messier)
//   isCandy     - true = counts toward sugar rush tracker
//   special     - object with extra behaviour flags, or null
//
// The 'special' field lets us add unique food behaviours without
// making the engine messy. The engine checks these flags.
// ============================================================

const FOODS = [

  // --------------------------------------------------------
  // MEALS — good hunger restore, small happiness bonus
  // Feed these regularly to keep your pet healthy!
  // --------------------------------------------------------

  {
    id:           'pizza',
    name:         'Pizza Slice',
    category:     'meal',
    hunger:       20,
    happiness:    5,
    energyDelta:  0,
    hygieneDelta: 0,
    isCandy:      false,
    special:      null,
    // Tip: the reliable all-rounder. Always a safe choice.
  },

  {
    id:           'ramen',
    name:         'Ramen Bowl',
    category:     'meal',
    hunger:       25,   // best hunger restore of all meals
    happiness:    3,
    energyDelta:  0,
    hygieneDelta: 0,
    isCandy:      false,
    special:      null,
  },

  {
    id:           'tacos',
    name:         'Tacos',
    category:     'meal',
    hunger:       20,
    happiness:    5,
    energyDelta:  0,
    hygieneDelta: 0,
    isCandy:      false,
    special:      { happyAnimation: 'wiggle' }, // pet does a little wiggle! (Phase 2)
  },

  {
    id:           'mac',
    name:         'Mac & Cheese',
    category:     'meal',
    hunger:       15,
    happiness:    5,
    energyDelta:  0,
    hygieneDelta: 0,
    isCandy:      false,
    special:      null,
    // The comfort food. Lower hunger boost but always cheers the pet up.
  },

  // --------------------------------------------------------
  // CANDY — big happiness boost but with side effects!
  // Feed too many (3+ in 6 ticks) and watch out for the
  // sugar rush → crash → cooldown cycle.
  // --------------------------------------------------------

  {
    id:           'gummy',
    name:         'Gummy Bears',
    category:     'candy',
    hunger:       5,
    happiness:    20,
    energyDelta:  0,
    hygieneDelta: -5,   // sticky paws! hygiene drops
    isCandy:      true,
    special:      { animation: 'sticky' }, // Phase 2: sticky paws animation
  },

  {
    id:           'icecream',
    name:         'Ice Cream',
    category:     'candy',
    hunger:       10,
    happiness:    25,  // best happiness of all candy
    energyDelta:  -5,  // a little energy dip (the sugar crash delayed effect is separate)
    hygieneDelta: 0,
    isCandy:      true,
    special:      null,
  },

  {
    id:           'chocolate',
    name:         'Chocolate Bar',
    category:     'candy',
    hunger:       5,
    happiness:    15,
    energyDelta:  0,
    hygieneDelta: 0,
    isCandy:      true,
    special:      null,
    // Simple treat — no side effects, just pure chocolatey happiness.
  },

  {
    id:           'sourcandy',
    name:         'Sour Candy',
    category:     'candy',
    hunger:       3,
    happiness:    20,
    energyDelta:  0,
    hygieneDelta: 0,
    isCandy:      true,
    special:      { animation: 'sour' }, // Phase 2: pucker-face reaction
  },

  {
    id:           'lollipop',
    name:         'Lollipop',
    category:     'candy',
    hunger:       2,   // not very filling
    happiness:    15,
    energyDelta:  0,
    hygieneDelta: 0,
    isCandy:      true,
    special:      { animation: 'lick' }, // Phase 2: long licking animation (5 frames)
  },

  // --------------------------------------------------------
  // SPECIAL — rare foods with unique availability rules
  // --------------------------------------------------------

  {
    id:           'birthday',
    name:         'Birthday Cake',
    category:     'special',
    hunger:       10,
    happiness:    100, // fills happiness completely!
    energyDelta:  0,
    hygieneDelta: 0,
    isCandy:      false,
    // Only available when pet.age % 288 === 0 (every 288 ticks = one "birthday")
    special:      {
      birthdayOnly:  true,       // engine checks this before allowing the food
      animation:     'confetti', // Phase 2: confetti particle effect
    },
  },

  {
    id:           'mystery',
    name:         'Mystery Food',
    category:     'special',
    hunger:       0,   // base values — engine randomizes these on eat
    happiness:    0,
    energyDelta:  0,
    hygieneDelta: 0,
    isCandy:      false,
    // 50% chance of good effects, 50% chance of bad effects.
    // The engine replaces the 0s with random values when this is eaten.
    special:      {
      mystery:   true,   // engine applies random effects
      animation: 'surprise',
    },
  },

];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * getFoodById(id)
 * Returns the food object with the given id, or null.
 * Use this whenever you need to look up a food by its string id.
 */
function getFoodById(id) {
  return FOODS.find(f => f.id === id) || null;
}

/**
 * getAvailableFoods(state)
 * Returns the list of foods that can currently be fed to the pet.
 *
 * Rules:
 *   - Birthday cake is only available when age % 288 === 0
 *   - If sugarState === 'COOLDOWN', candy items are hidden
 *     (the pet refuses them with "my tummy says no")
 *   - All other foods are always available
 *
 * @param {object} state - The current game state
 */
function getAvailableFoods(state) {
  const age = state.pet.age;
  const inCooldown = state.pet.sugarState === 'COOLDOWN';

  return FOODS.filter(food => {
    // Birthday cake: only on tick multiples of 288
    if (food.special && food.special.birthdayOnly) {
      return age > 0 && age % 288 === 0;
    }

    // Candy is blocked during sugar cooldown
    if (food.isCandy && inCooldown) {
      return false;
    }

    return true;
  });
}

/**
 * applyFoodEffects(state, foodId)
 * Applies a food's stat changes to the game state.
 * Handles the mystery food's random effects too.
 * Returns a description string for the event log.
 *
 * @param {object} state  - The current game state (mutated in place)
 * @param {string} foodId - The id of the food being eaten
 */
function applyFoodEffects(state, foodId) {
  const food = getFoodById(foodId);
  if (!food) return 'Ate unknown food';

  let hungerDelta    = food.hunger;
  let happinessDelta = food.happiness;
  let energyDelta    = food.energyDelta;
  let hygieneDelta   = food.hygieneDelta;
  let description    = `Fed ${food.name}`;

  // Mystery food: randomize the effects
  if (food.special && food.special.mystery) {
    const good = Math.random() < 0.5; // 50/50 chance

    if (good) {
      // Surprisingly delicious!
      hungerDelta    = 10 + Math.floor(Math.random() * 20); // +10 to +29
      happinessDelta = 10 + Math.floor(Math.random() * 20);
      description    = 'Mystery food was AMAZING!';
    } else {
      // Surprisingly gross...
      hungerDelta    = -(5 + Math.floor(Math.random() * 10)); // -5 to -14
      happinessDelta = -(5 + Math.floor(Math.random() * 10));
      description    = 'Mystery food was GROSS!';
    }
  }

  // Apply stat changes
  state.stats.hunger    += hungerDelta;
  state.stats.happiness += happinessDelta;
  state.stats.energy    += energyDelta;
  state.stats.hygiene   += hygieneDelta;

  // Check for overfeeding (hunger was high before eating)
  // If hunger would go over 90+meal's hunger, apply stuffed penalty
  const newHunger = state.stats.hunger;
  if (newHunger > 100) {
    // Pet gets a happiness penalty for being stuffed
    state.stats.happiness -= 5;
    description += ' (overfed! -5 happiness)';
  }

  // Track candy for sugar rush mechanic
  if (food.isCandy) {
    const currentTick = state.time.currentTick;

    // Reset the 6-tick candy window if it's been more than 6 ticks
    if (currentTick - state.pet.candyWindowStartTick >= 6) {
      state.pet.candyCount6Tick     = 0;
      state.pet.candyWindowStartTick = currentTick;
    }

    state.pet.candyCount6Tick++;
  }

  // Update care history
  state.careHistory.feedCount++;

  // Record when the pet was last fed
  state.pet.lastFed = state.time.currentTick;

  // Clamp all stats to 0-100
  clampStats(state);

  return description;
}
