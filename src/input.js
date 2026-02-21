// ============================================================
// input.js — Keyboard Input + HTML Button Wiring
//
// Maps keyboard keys to the four game buttons (LEFT, RIGHT,
// ACTION, BACK) and forwards events to the HAL, which then
// dispatches them to registered callbacks.
//
// Keyboard mapping (matches the emulator UI key hints):
//   Z or ArrowLeft  → LEFT
//   X or ArrowRight → RIGHT
//   A or Enter      → ACTION
//   S or Escape     → BACK
//
// HTML buttons (#btn-left, etc.) are wired here too so that
// clicking them on screen has the same effect as key presses.
// ============================================================

const input = (() => {

  // Maps keyboard event.key values → button names
  const KEY_MAP = {
    'z':          'LEFT',
    'Z':          'LEFT',
    'ArrowLeft':  'LEFT',
    'x':          'RIGHT',
    'X':          'RIGHT',
    'ArrowRight': 'RIGHT',
    'a':          'ACTION',
    'A':          'ACTION',
    'Enter':      'ACTION',
    's':          'BACK',
    'S':          'BACK',
    'Escape':     'BACK',
  };

  // Maps button IDs → button names (for HTML click events)
  const BUTTON_ELEMENTS = {
    'btn-left':   'LEFT',
    'btn-right':  'RIGHT',
    'btn-action': 'ACTION',
    'btn-back':   'BACK',
  };

  /**
   * input.init()
   * Registers keyboard listeners and wires up the HTML buttons.
   * Call from main.js after HAL is initialised.
   */
  function init() {
    // --- Keyboard ---
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    // --- HTML buttons ---
    for (const [elementId, buttonName] of Object.entries(BUTTON_ELEMENTS)) {
      const el = document.getElementById(elementId);
      if (!el) continue;

      // Mousedown / touchstart = press
      el.addEventListener('mousedown', () => pressButton(buttonName, el));
      el.addEventListener('touchstart', (e) => {
        e.preventDefault(); // prevent double-fire on mobile
        pressButton(buttonName, el);
      }, { passive: false });

      // Mouseup / touchend = release
      el.addEventListener('mouseup',   () => releaseButton(buttonName, el));
      el.addEventListener('touchend',  () => releaseButton(buttonName, el));
      el.addEventListener('mouseleave', () => releaseButton(buttonName, el));
    }
  }

  function onKeyDown(event) {
    const button = KEY_MAP[event.key];
    if (!button) return;

    // Prevent default browser actions (e.g., arrow keys scrolling the page)
    event.preventDefault();

    const el = getButtonElement(button);
    pressButton(button, el);
  }

  function onKeyUp(event) {
    const button = KEY_MAP[event.key];
    if (!button) return;

    event.preventDefault();

    const el = getButtonElement(button);
    releaseButton(button, el);
  }

  /**
   * pressButton(buttonName, element)
   * Adds the visual 'pressed' CSS class and fires the HAL press event.
   */
  function pressButton(buttonName, element) {
    if (element) element.classList.add('pressed');
    hal._pressButton(buttonName);
  }

  /**
   * releaseButton(buttonName, element)
   * Removes the visual 'pressed' CSS class and fires the HAL release event.
   */
  function releaseButton(buttonName, element) {
    if (element) element.classList.remove('pressed');
    hal._releaseButton(buttonName);
  }

  /**
   * getButtonElement(buttonName)
   * Returns the HTML element for a given button name, or null.
   */
  function getButtonElement(buttonName) {
    for (const [elementId, name] of Object.entries(BUTTON_ELEMENTS)) {
      if (name === buttonName) return document.getElementById(elementId);
    }
    return null;
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------
  return { init };

})();
