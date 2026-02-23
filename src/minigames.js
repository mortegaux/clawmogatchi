// ============================================================
// minigames.js — Minigame Framework + Individual Games
//
// Provides a shared API for all minigames:
//   minigames.startGame(type, gameState) — launch a minigame
//   minigames.handleInput(button, gameState) — route button to active game
//   minigames.update(frameCount, gameState) — per-frame logic
//   minigames.draw(hal, gameState) — render the active minigame
//   minigames.isComplete(gameState) — true when game has ended
//
// Minigame types: 'guess', 'memory', 'dodge'
//
// Each minigame stores its state in gameState.pet._minigameData.
// On completion, rewards are applied and state returns to IDLE.
// ============================================================

const minigames = (() => {

  // ----------------------------------------------------------
  // SHARED API
  // ----------------------------------------------------------

  /**
   * startGame(type, gameState)
   * Initialises the minigame data and sets pet state to PLAYING.
   */
  function startGame(type, gameState) {
    gameState.pet.state = 'PLAYING';
    gameState.pet._currentMinigame = type;

    switch (type) {
      case 'guess':  initGuessGame(gameState);  break;
      case 'memory': initMemoryGame(gameState); break;
      case 'dodge':  initDodgeGame(gameState);  break;
      default:
        // Fallback: go back to idle if unknown type
        gameState.pet.state = 'IDLE';
        return;
    }

    hal.playSfx('gameStart');
    addEventLog(gameState, `Minigame started: ${type}`);
  }

  /**
   * handleInput(button, gameState)
   * Routes button press to the active minigame's input handler.
   */
  function handleInput(button, gameState) {
    const type = gameState.pet._currentMinigame;
    if (!type) return;

    switch (type) {
      case 'guess':  guessHandleInput(button, gameState);  break;
      case 'memory': memoryHandleInput(button, gameState); break;
      case 'dodge':  dodgeHandleInput(button, gameState);  break;
    }
  }

  /**
   * update(frameCount, gameState)
   * Per-frame update for the active minigame (animations, timers).
   */
  function update(frameCount, gameState) {
    const type = gameState.pet._currentMinigame;
    if (!type) return;

    switch (type) {
      case 'guess':  guessUpdate(frameCount, gameState);  break;
      case 'memory': memoryUpdate(frameCount, gameState); break;
      case 'dodge':  dodgeUpdate(frameCount, gameState);  break;
    }
  }

  /**
   * draw(hal, gameState, frameCount)
   * Renders the active minigame to the 128x64 display.
   */
  function draw(h, gameState, frameCount) {
    const type = gameState.pet._currentMinigame;
    if (!type) return;

    switch (type) {
      case 'guess':  guessDraw(h, gameState, frameCount);  break;
      case 'memory': memoryDraw(h, gameState, frameCount); break;
      case 'dodge':  dodgeDraw(h, gameState, frameCount);  break;
    }
  }

  /**
   * isComplete(gameState)
   * Returns true if the current minigame has finished.
   */
  function isComplete(gameState) {
    const d = gameState.pet._minigameData;
    return d && d.complete;
  }

  /**
   * endGame(gameState)
   * Applies rewards and returns to IDLE.
   */
  function endGame(gameState) {
    const d = gameState.pet._minigameData;
    if (!d) return;

    // Apply happiness reward
    const reward = d.reward || 0;
    gameState.stats.happiness = Math.min(100, gameState.stats.happiness + reward);
    gameState.stats.social    = Math.min(100, gameState.stats.social + Math.floor(reward / 2));
    clampStats(gameState);

    gameState.pet.lastPlayed = gameState.time.currentTick;
    gameState.pet._playedThisTick = true; // rolling window care history

    const resultMsg = d.won ? 'Won' : 'Lost';
    addEventLog(gameState, `Minigame ${resultMsg}! (+${reward} happiness)`);

    if (d.won) {
      hal.playSfx('gameWin');
    } else {
      hal.playSfx('gameLose');
    }

    // Clean up
    gameState.pet._currentMinigame = null;
    gameState.pet._minigameData = null;
    gameState.pet.state = 'IDLE';
  }

  // ===========================================================
  // GUESSING GAME — "Which claw am I thinking of?"
  //
  // Best of 5 rounds. Pet "thinks" LEFT or RIGHT, player guesses.
  // 3+ correct = win (+20 happiness), else +8 happiness.
  // ===========================================================

  function initGuessGame(gs) {
    gs.pet._minigameData = {
      type:       'guess',
      round:      0,       // current round (0-4)
      totalRounds: 5,
      correct:    0,       // correct guesses so far
      phase:      'prompt', // 'prompt' | 'result' | 'done'
      answer:     null,     // LEFT or RIGHT (pet's choice)
      playerChoice: null,
      resultTimer: 0,      // frames to show result
      complete:   false,
      won:        false,
      reward:     0,
    };
    // Generate first round answer
    guessNewRound(gs);
  }

  function guessNewRound(gs) {
    const d = gs.pet._minigameData;
    d.answer = Math.random() < 0.5 ? 'LEFT' : 'RIGHT';
    d.playerChoice = null;
    d.phase = 'prompt';
  }

  function guessHandleInput(button, gs) {
    const d = gs.pet._minigameData;
    if (!d || d.complete) return;

    if (d.phase === 'prompt') {
      if (button === 'LEFT' || button === 'RIGHT') {
        d.playerChoice = button;
        d.phase = 'result';
        d.resultTimer = 60; // ~1 second at 60fps

        if (button === d.answer) {
          d.correct++;
          hal.playSfx('gameCorrect');
        } else {
          hal.playSfx('gameWrong');
        }
      } else if (button === 'BACK') {
        // Quit minigame early
        d.complete = true;
        d.won = false;
        d.reward = Math.max(5, d.correct * 4); // partial credit
      }
    } else if (d.phase === 'done') {
      // Any button dismisses the final result
      if (button === 'ACTION' || button === 'BACK') {
        d.complete = true;
      }
    }
  }

  function guessUpdate(frameCount, gs) {
    const d = gs.pet._minigameData;
    if (!d || d.complete) return;

    if (d.phase === 'result') {
      d.resultTimer--;
      if (d.resultTimer <= 0) {
        d.round++;
        if (d.round >= d.totalRounds) {
          // Game over
          d.phase = 'done';
          d.won = d.correct >= 3;
          d.reward = d.won ? 20 : 8;
        } else {
          guessNewRound(gs);
        }
      }
    }
  }

  function guessDraw(h, gs, frameCount) {
    const d = gs.pet._minigameData;
    if (!d) return;

    const PET_AREA_Y = 8;

    // Title
    h.drawText(20, PET_AREA_Y + 1, 'GUESS THE CLAW', 1);

    // Score
    h.drawText(2, PET_AREA_Y + 10, `ROUND ${d.round + 1}/${d.totalRounds}`, 1);
    h.drawText(80, PET_AREA_Y + 10, `${d.correct} RIGHT`, 1);

    if (d.phase === 'prompt') {
      // Show question mark and arrows
      h.drawText(46, PET_AREA_Y + 22, '?', 2);

      // Left arrow
      h.drawSprite(20, PET_AREA_Y + 24, SPRITES.arrowLeft);
      h.drawText(14, PET_AREA_Y + 34, 'LEFT', 1);

      // Right arrow
      h.drawSprite(98, PET_AREA_Y + 24, SPRITES.arrowRight);
      h.drawText(92, PET_AREA_Y + 34, 'RIGHT', 1);

      // Prompt text
      gs.pet._textBarOverride = 'PICK LEFT OR RIGHT!';

    } else if (d.phase === 'result') {
      const isCorrect = d.playerChoice === d.answer;

      // Show the answer
      if (d.answer === 'LEFT') {
        h.drawSprite(52, PET_AREA_Y + 22, SPRITES.arrowLeft);
      } else {
        h.drawSprite(52, PET_AREA_Y + 22, SPRITES.arrowRight);
      }

      // Flash correct/wrong indicator
      if (Math.floor(frameCount / 8) % 2 === 0) {
        if (isCorrect) {
          h.drawSprite(60, PET_AREA_Y + 35, SPRITES.checkMark);
          h.drawText(36, PET_AREA_Y + 35, 'YES!', 1);
        } else {
          h.drawSprite(60, PET_AREA_Y + 35, SPRITES.crossMark);
          h.drawText(36, PET_AREA_Y + 35, 'NOPE', 1);
        }
      }

      gs.pet._textBarOverride = isCorrect ? 'CORRECT!' : 'WRONG!';

    } else if (d.phase === 'done') {
      // Final results
      if (d.won) {
        h.drawText(32, PET_AREA_Y + 20, 'YOU WIN!', 1);
        h.drawSprite(56, PET_AREA_Y + 30, SPRITES.star);
      } else {
        h.drawText(24, PET_AREA_Y + 20, 'NICE TRY!', 1);
      }
      h.drawText(18, PET_AREA_Y + 38, `${d.correct}/${d.totalRounds} CORRECT`, 1);

      gs.pet._textBarOverride = 'PRESS A TO CONTINUE';
    }
  }

  // ===========================================================
  // MEMORY MATCH — Repeat the arrow sequence
  //
  // Show a sequence of LEFT/RIGHT arrows, player repeats.
  // Difficulty (sequence length) scales with pet age.
  // Streak tracking with bonus happiness.
  // ===========================================================

  function initMemoryGame(gs) {
    // Difficulty: 3 base + 1 per 100 ticks of age, max 6
    const seqLen = Math.min(6, 3 + Math.floor(gs.pet.age / 100));

    const sequence = [];
    for (let i = 0; i < seqLen; i++) {
      sequence.push(Math.random() < 0.5 ? 'LEFT' : 'RIGHT');
    }

    gs.pet._minigameData = {
      type:        'memory',
      sequence:    sequence,
      showIndex:   0,         // which arrow is being shown
      inputIndex:  0,         // which arrow the player is inputting
      phase:       'showing', // 'showing' | 'input' | 'result' | 'done'
      showTimer:   0,         // frames for current display
      showDelay:   30,        // frames per arrow shown
      pauseTimer:  20,        // brief pause between show and input
      correct:     true,      // still correct so far?
      streak:      0,         // consecutive correct inputs
      resultTimer: 0,
      complete:    false,
      won:         false,
      reward:      0,
    };
  }

  function memoryHandleInput(button, gs) {
    const d = gs.pet._minigameData;
    if (!d || d.complete) return;

    if (d.phase === 'input') {
      if (button === 'LEFT' || button === 'RIGHT') {
        const expected = d.sequence[d.inputIndex];
        if (button === expected) {
          d.streak++;
          d.inputIndex++;
          hal.playSfx('gameCorrect');

          if (d.inputIndex >= d.sequence.length) {
            // Completed the whole sequence!
            d.phase = 'done';
            d.won = true;
            d.reward = 15 + Math.min(10, d.streak * 2); // bonus for streak
          }
        } else {
          d.correct = false;
          d.phase = 'done';
          d.won = false;
          d.reward = 5 + d.streak; // partial credit
          hal.playSfx('gameWrong');
        }
      } else if (button === 'BACK') {
        d.complete = true;
        d.won = false;
        d.reward = 5;
      }
    } else if (d.phase === 'done') {
      if (button === 'ACTION' || button === 'BACK') {
        d.complete = true;
      }
    }
  }

  function memoryUpdate(frameCount, gs) {
    const d = gs.pet._minigameData;
    if (!d || d.complete) return;

    if (d.phase === 'showing') {
      d.showTimer++;
      if (d.showTimer >= d.showDelay) {
        d.showTimer = 0;
        d.showIndex++;
        if (d.showIndex >= d.sequence.length) {
          d.phase = 'pause';
          d.pauseTimer = 20;
        }
      }
    } else if (d.phase === 'pause') {
      d.pauseTimer--;
      if (d.pauseTimer <= 0) {
        d.phase = 'input';
      }
    }
  }

  function memoryDraw(h, gs, frameCount) {
    const d = gs.pet._minigameData;
    if (!d) return;

    const PET_AREA_Y = 8;

    h.drawText(22, PET_AREA_Y + 1, 'MEMORY MATCH', 1);

    if (d.phase === 'showing') {
      h.drawText(30, PET_AREA_Y + 12, 'WATCH!', 1);

      // Show current arrow
      if (d.showIndex < d.sequence.length) {
        const dir = d.sequence[d.showIndex];
        const sprite = dir === 'LEFT' ? SPRITES.arrowLeft : SPRITES.arrowRight;
        h.drawSprite(52, PET_AREA_Y + 22, sprite);
        h.drawText(42, PET_AREA_Y + 34, dir, 1);
      }

      // Progress dots
      for (let i = 0; i < d.sequence.length; i++) {
        const dotX = 52 + (i - d.sequence.length / 2) * 6;
        h.drawPixel(dotX, PET_AREA_Y + 42, i <= d.showIndex);
        h.drawPixel(dotX + 1, PET_AREA_Y + 42, i <= d.showIndex);
      }

      gs.pet._textBarOverride = `MEMORIZE! ${d.showIndex + 1}/${d.sequence.length}`;

    } else if (d.phase === 'pause') {
      h.drawText(24, PET_AREA_Y + 22, 'YOUR TURN!', 1);
      gs.pet._textBarOverride = 'GET READY...';

    } else if (d.phase === 'input') {
      h.drawText(18, PET_AREA_Y + 12, 'REPEAT IT!', 1);

      // Show progress
      for (let i = 0; i < d.sequence.length; i++) {
        const dotX = 52 + (i - d.sequence.length / 2) * 6;
        h.drawPixel(dotX, PET_AREA_Y + 20, true);
        h.drawPixel(dotX + 1, PET_AREA_Y + 20, true);
        if (i < d.inputIndex) {
          // Filled = completed
          h.drawPixel(dotX, PET_AREA_Y + 21, true);
          h.drawPixel(dotX + 1, PET_AREA_Y + 21, true);
        }
      }

      // Show arrows as hints
      h.drawSprite(20, PET_AREA_Y + 26, SPRITES.arrowLeft);
      h.drawSprite(98, PET_AREA_Y + 26, SPRITES.arrowRight);

      h.drawText(2, PET_AREA_Y + 38, `${d.inputIndex}/${d.sequence.length}`, 1);

      gs.pet._textBarOverride = `INPUT ${d.inputIndex + 1} OF ${d.sequence.length}`;

    } else if (d.phase === 'done') {
      if (d.won) {
        h.drawText(24, PET_AREA_Y + 18, 'PERFECT!', 1);
        h.drawSprite(56, PET_AREA_Y + 28, SPRITES.star);
        h.drawText(22, PET_AREA_Y + 38, `STREAK: ${d.streak}`, 1);
      } else {
        h.drawText(22, PET_AREA_Y + 18, 'SO CLOSE!', 1);
        h.drawText(18, PET_AREA_Y + 30, `GOT ${d.inputIndex}/${d.sequence.length}`, 1);
      }

      gs.pet._textBarOverride = 'PRESS A TO CONTINUE';
    }
  }

  // ===========================================================
  // DODGE GAME — Side-scrolling obstacle avoidance
  //
  // Pet auto-runs right. ACTION to jump over obstacles.
  // Speed increases every 5 obstacles.
  // Survive 10 obstacles = win (+20 happiness), hit = +8.
  // ===========================================================

  function initDodgeGame(gs) {
    gs.pet._minigameData = {
      type:        'dodge',
      petY:        0,        // 0 = ground, positive = in air
      velY:        0,        // vertical velocity
      isJumping:   false,
      obstacles:   [],       // [{x, height}]
      dodged:      0,        // obstacles successfully dodged
      target:      10,       // survive this many to win
      speed:       1.5,      // pixels per frame
      spawnTimer:  0,
      spawnRate:   60,       // frames between obstacles
      groundY:     44,       // ground line y in pet area
      hit:         false,
      phase:       'play',   // 'play' | 'done'
      complete:    false,
      won:         false,
      reward:      0,
    };
  }

  function dodgeHandleInput(button, gs) {
    const d = gs.pet._minigameData;
    if (!d || d.complete) return;

    if (d.phase === 'play') {
      if (button === 'ACTION' && !d.isJumping) {
        d.velY = -4;       // jump force
        d.isJumping = true;
        hal.playSfx('gameJump');
      } else if (button === 'BACK') {
        d.complete = true;
        d.won = false;
        d.reward = Math.min(8, d.dodged * 2);
      }
    } else if (d.phase === 'done') {
      if (button === 'ACTION' || button === 'BACK') {
        d.complete = true;
      }
    }
  }

  function dodgeUpdate(frameCount, gs) {
    const d = gs.pet._minigameData;
    if (!d || d.complete || d.phase !== 'play') return;

    // Gravity
    d.velY += 0.35;
    d.petY += d.velY;
    if (d.petY >= 0) {
      d.petY = 0;
      d.velY = 0;
      d.isJumping = false;
    }

    // Spawn obstacles
    d.spawnTimer++;
    if (d.spawnTimer >= d.spawnRate) {
      d.spawnTimer = 0;
      d.obstacles.push({
        x: 128,
        height: 4 + Math.floor(Math.random() * 5), // 4-8 px tall
        width: 4,
      });
    }

    // Move obstacles
    for (const obs of d.obstacles) {
      obs.x -= d.speed;
    }

    // Check collisions (pet is at x=16..32, y is groundY-16+petY..groundY+petY)
    const petLeft = 16;
    const petRight = 32;
    const petBottom = d.groundY;
    const petTop = d.groundY - 16 + d.petY;

    for (const obs of d.obstacles) {
      if (obs.scored) continue;
      const obsLeft = obs.x;
      const obsRight = obs.x + obs.width;
      const obsTop = d.groundY - obs.height;
      const obsBottom = d.groundY;

      // Check overlap
      if (petRight > obsLeft && petLeft < obsRight) {
        if (petBottom > obsTop && petTop < obsBottom) {
          // HIT!
          d.hit = true;
          d.phase = 'done';
          d.won = false;
          d.reward = 8;
          hal.playSfx('gameWrong');
          return;
        }
      }

      // Score if obstacle has passed the pet
      if (obsRight < petLeft && !obs.scored) {
        obs.scored = true;
        d.dodged++;

        // Speed up every 5 obstacles
        if (d.dodged % 5 === 0) {
          d.speed += 0.5;
          d.spawnRate = Math.max(30, d.spawnRate - 5);
        }

        if (d.dodged >= d.target) {
          d.phase = 'done';
          d.won = true;
          d.reward = 20;
          return;
        }
      }
    }

    // Remove off-screen obstacles
    d.obstacles = d.obstacles.filter(o => o.x + o.width > -5);
  }

  function dodgeDraw(h, gs, frameCount) {
    const d = gs.pet._minigameData;
    if (!d) return;

    const PET_AREA_Y = 8;
    const groundScreenY = PET_AREA_Y + d.groundY;

    // Title & score
    h.drawText(42, PET_AREA_Y + 1, 'DODGE!', 1);
    h.drawText(90, PET_AREA_Y + 1, `${d.dodged}/${d.target}`, 1);

    if (d.phase === 'play') {
      // Draw ground line
      for (let x = 0; x < 128; x++) {
        h.drawPixel(x, groundScreenY, true);
      }

      // Draw pet (simple 8x8 version on the left side)
      const petScreenY = groundScreenY - 8 + Math.round(d.petY);
      h.drawSprite(20, petScreenY, SPRITES.miniPet);

      // Draw obstacles
      for (const obs of d.obstacles) {
        for (let oy = 0; oy < obs.height; oy++) {
          for (let ox = 0; ox < obs.width; ox++) {
            h.drawPixel(Math.round(obs.x) + ox, groundScreenY - obs.height + oy, true);
          }
        }
      }

      // Jump hint
      if (!d.isJumping && frameCount % 60 < 30) {
        h.drawText(2, PET_AREA_Y + 38, 'A=JUMP', 1);
      }

      gs.pet._textBarOverride = `DODGE! ${d.dodged}/${d.target}`;

    } else if (d.phase === 'done') {
      if (d.won) {
        h.drawText(20, PET_AREA_Y + 18, 'AMAZING!', 1);
        h.drawSprite(56, PET_AREA_Y + 28, SPRITES.star);
        h.drawText(10, PET_AREA_Y + 38, `DODGED ALL ${d.target}!`, 1);
      } else {
        h.drawText(28, PET_AREA_Y + 18, 'BONK!', 1);
        h.drawText(10, PET_AREA_Y + 30, `DODGED ${d.dodged}/${d.target}`, 1);
      }

      gs.pet._textBarOverride = 'PRESS A TO CONTINUE';
    }
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------
  return {
    startGame,
    handleInput,
    update,
    draw,
    isComplete,
    endGame,
    // Expose game types for dev tools
    GAME_TYPES: ['guess', 'memory', 'dodge'],
  };

})();
