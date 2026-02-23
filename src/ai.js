// ============================================================
// ai.js — AI Personality Integration
//
// Handles communication with LLM backends (Ollama local,
// Claude API fallback) to generate personality-driven dialogue.
//
// This module:
//   1. Builds a system prompt from the pet's current state
//   2. Sends requests to Ollama or Claude API
//   3. Returns response text (max 140 chars)
//   4. Falls back gracefully on failure (returns null)
//
// Dependencies: hal.js (httpPost), state.js (gameState shape)
// Loaded after: state.js, before: engine.js
// ============================================================

const ai = (() => {

  // Track the current in-flight request so it can be cancelled
  let _currentAbortController = null;
  let _lastResponseTime = 0;
  let _lastStatus = 'idle'; // 'idle' | 'requesting' | 'success' | 'error'

  // ----------------------------------------------------------
  // SYSTEM PROMPT BUILDER
  // ----------------------------------------------------------

  /**
   * ai.buildSystemPrompt(state)
   * Constructs the system prompt that tells the LLM who it is
   * and what state the pet is currently in.
   */
  function buildSystemPrompt(state) {
    const pet  = state.pet;
    const s    = state.stats;
    const p    = state.personality;
    const care = state.careHistory;

    // Time of day
    const hour = new Date().getHours();
    let timeOfDay = 'daytime';
    if (hour >= 22 || hour < 6) timeOfDay = 'late night';
    else if (hour >= 18) timeOfDay = 'evening';
    else if (hour >= 12) timeOfDay = 'afternoon';
    else if (hour >= 6) timeOfDay = 'morning';

    // Dominant trait
    const traits = [
      { name: 'sass', val: p.sass },
      { name: 'curiosity', val: p.curiosity },
      { name: 'affection', val: p.affection },
      { name: 'energy', val: p.energy },
      { name: 'philosophical', val: p.philosophical },
    ];
    traits.sort((a, b) => b.val - a.val);
    const dominantTrait = traits[0].name;

    // Recent events summary
    const recentEvents = (state.eventLog || [])
      .slice(0, 5)
      .map(e => e.message)
      .join('; ');

    return `You are ${pet.name}, a small virtual lobster-claw creature living inside a handheld device. You speak in first person. You are generation ${pet.generation}, age ${pet.age} ticks old.

PERSONALITY (0=low, 100=high):
- Sass: ${p.sass} (${p.sass > 60 ? 'sarcastic and cheeky' : p.sass < 30 ? 'earnest and sweet' : 'balanced'})
- Curiosity: ${p.curiosity} (${p.curiosity > 60 ? 'always asking questions' : 'not particularly inquisitive'})
- Affection: ${p.affection} (${p.affection > 60 ? 'clingy and loving' : p.affection < 30 ? 'independent' : 'warm but not needy'})
- Energy: ${p.energy} (${p.energy > 60 ? 'hyperactive and bouncy' : p.energy < 30 ? 'chill and mellow' : 'moderate energy'})
- Philosophical: ${p.philosophical} (${p.philosophical > 60 ? 'deep thinker, existential' : 'practical and grounded'})

Your dominant trait is ${dominantTrait}. Let this strongly color your speech.

CURRENT STATE:
- Hunger: ${s.hunger}/100, Happiness: ${s.happiness}/100, Energy: ${s.energy}/100, Hygiene: ${s.hygiene}/100, Social: ${s.social}/100
- Sick: ${pet.isSick ? 'YES' : 'no'}, Sugar state: ${pet.sugarState}, Poop count: ${pet.poopCount}
- Time of day: ${timeOfDay}
- Sleeping: ${pet.isAsleep ? 'yes' : 'no'}

CARE HISTORY (last 48 ticks): Fed ${care.feedCount}x, Played ${care.playCount}x, Talked ${care.talkCount}x, Cleaned ${care.cleanCount}x, Neglected ${care.neglectTicks} ticks

RECENT EVENTS: ${recentEvents || 'none'}

RULES:
- Respond with ONE short line of dialogue (max 140 characters, fewer is better)
- Stay in character as a cute virtual pet with your personality traits
- React to your current stats: complain if hungry/sad/dirty, be happy if well-cared-for
- Never break character or mention being an AI/LLM
- No markdown, no quotes, just the dialogue text
- Use simple language a 12-year-old would enjoy`;
  }

  // ----------------------------------------------------------
  // OLLAMA CLIENT
  // ----------------------------------------------------------

  /**
   * requestOllama(prompt, config)
   * Sends a generate request to the Ollama API.
   * Returns the response text or throws on failure.
   */
  async function requestOllama(prompt, config) {
    const url = `${config.ollamaUrl}/api/generate`;
    const body = {
      model: config.ollamaModel,
      prompt: prompt,
      stream: false,
      options: {
        num_predict: 60,  // keep responses short
        temperature: 0.8,
      },
    };

    const result = await hal.httpPost(url, body, {}, config.timeoutMs);
    if (result && result.response) {
      return result.response.trim();
    }
    throw new Error('Empty Ollama response');
  }

  // ----------------------------------------------------------
  // CLAUDE API CLIENT
  // ----------------------------------------------------------

  /**
   * requestClaude(systemPrompt, config)
   * Sends a messages request to the Claude API.
   * Returns the response text or throws on failure.
   */
  async function requestClaude(systemPrompt, config) {
    if (!config.claudeApiKey) {
      throw new Error('No Claude API key configured');
    }

    const url = 'https://api.anthropic.com/v1/messages';
    const body = {
      model: config.claudeModel,
      max_tokens: 80,
      system: systemPrompt,
      messages: [
        { role: 'user', content: 'Say something!' },
      ],
    };
    const headers = {
      'x-api-key': config.claudeApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };

    const result = await hal.httpPost(url, body, headers, config.timeoutMs);
    if (result && result.content && result.content[0] && result.content[0].text) {
      return result.content[0].text.trim();
    }
    throw new Error('Empty Claude response');
  }

  // ----------------------------------------------------------
  // PUBLIC: REQUEST AI DIALOGUE
  // ----------------------------------------------------------

  /**
   * ai.requestAIDialogue(state)
   * Main entry point. Tries the preferred backend, falls back to
   * the other, returns null on all failures (caller uses offline).
   *
   * @param {object} state - The full game state
   * @returns {Promise<string|null>} Response text or null
   */
  async function requestAIDialogue(state) {
    const config = state.aiConfig;
    if (!config || !config.enabled) return null;

    _lastStatus = 'requesting';
    const systemPrompt = buildSystemPrompt(state);

    try {
      let response;

      if (config.preferOllama) {
        // Try Ollama first, then Claude
        try {
          response = await requestOllama(systemPrompt, config);
        } catch (e) {
          console.warn('[AI] Ollama failed, trying Claude:', e.message);
          response = await requestClaude(systemPrompt, config);
        }
      } else {
        // Try Claude first, then Ollama
        try {
          response = await requestClaude(systemPrompt, config);
        } catch (e) {
          console.warn('[AI] Claude failed, trying Ollama:', e.message);
          response = await requestOllama(systemPrompt, config);
        }
      }

      // Truncate to 140 chars
      if (response && response.length > 140) {
        response = response.substring(0, 137) + '...';
      }

      // Strip quotes if the LLM wrapped them
      if (response && response.startsWith('"') && response.endsWith('"')) {
        response = response.slice(1, -1);
      }

      _lastResponseTime = Date.now();
      _lastStatus = 'success';
      return response || null;

    } catch (e) {
      console.warn('[AI] All backends failed:', e.message);
      _lastStatus = 'error';
      return null;
    }
  }

  // ----------------------------------------------------------
  // PUBLIC: REQUEST DEATH EULOGY
  // ----------------------------------------------------------

  /**
   * ai.requestDeathEulogy(state)
   * Generates a short eulogy for the dead pet.
   * Returns null on failure (caller uses pre-written fallback).
   */
  async function requestDeathEulogy(state) {
    const config = state.aiConfig;
    if (!config || !config.enabled) return null;

    const pet = state.pet;
    const p   = state.personality;

    const prompt = `You are writing a brief, touching eulogy for a virtual pet named ${pet.name}.
${pet.name} was a lobster-claw creature who lived for ${pet.age} ticks (generation ${pet.generation}).
Cause of death: ${pet.causeOfDeath || 'unknown'}.
Personality: sass ${p.sass}, curiosity ${p.curiosity}, affection ${p.affection}, energy ${p.energy}, philosophical ${p.philosophical}.
Write a 1-2 sentence eulogy. Be touching but keep it light — this is for a kid's game. No markdown, just text. Max 140 characters.`;

    try {
      let response;
      if (config.preferOllama) {
        try {
          response = await requestOllama(prompt, config);
        } catch (e) {
          response = await requestClaude(prompt, config);
        }
      } else {
        try {
          response = await requestClaude(prompt, config);
        } catch (e) {
          response = await requestOllama(prompt, config);
        }
      }

      if (response && response.length > 140) {
        response = response.substring(0, 137) + '...';
      }
      if (response && response.startsWith('"') && response.endsWith('"')) {
        response = response.slice(1, -1);
      }
      return response || null;
    } catch (e) {
      console.warn('[AI] Eulogy generation failed:', e.message);
      return null;
    }
  }

  // ----------------------------------------------------------
  // PUBLIC API
  // ----------------------------------------------------------
  return {
    buildSystemPrompt,
    requestAIDialogue,
    requestDeathEulogy,
    getStatus:          () => _lastStatus,
    getLastResponseTime: () => _lastResponseTime,
  };

})();
