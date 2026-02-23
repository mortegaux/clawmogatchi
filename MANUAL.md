# Clawmogatchi User Manual

## Getting Started

Open `index.html` in any modern browser. Your pet Claw will appear on screen, ready to be cared for.

If this is your first time, you'll start with a healthy newborn pet. If you've played before, your save will load automatically.

## Controls

Four buttons control everything:

- **LEFT** (Z key or left arrow) — Navigate left through menus and food, choose left in minigames
- **RIGHT** (X key or right arrow) — Navigate right through menus and food, choose right in minigames
- **ACTION** (A key or Enter) — Select, confirm, pet your creature (when idle), jump (in dodge game)
- **BACK** (S key or Escape) — Cancel, go back, dismiss dialogue

You can also click/tap the on-screen buttons below the display.

## The Display

The screen is split into three areas:

- **Top bar** (icons) — Seven menu icons you can scroll through
- **Middle** (pet area) — Where Claw lives, eats, plays, and poops
- **Bottom bar** (text) — Status messages, food names, and hints

## Stats

Your pet has five needs that decay over time:

| Stat | What it means | How to restore |
|------|--------------|----------------|
| Hunger | How full Claw is | Feed food from the menu |
| Happiness | Claw's mood | Play minigames, pet (press A when idle), talk |
| Energy | How awake Claw is | Let Claw sleep (auto-sleeps when exhausted) |
| Hygiene | Cleanliness | Clean from the menu (removes poop too) |
| Social | Loneliness | Talk, play, or pet Claw |

Stats are shown in the right sidebar with colored bars. If any stat gets critically low, bad things happen.

## Menu

Press LEFT or RIGHT from the idle screen to open the menu. The seven icons are:

1. **Feed** — Opens the food carousel. Scroll with LEFT/RIGHT, press ACTION to feed.
2. **Play** — Starts a random minigame (see Minigames below).
3. **Clean** — Cleans up poop and boosts hygiene.
4. **Talk** — Claw says something based on its current mood. If AI is enabled, Claw generates personality-driven responses via Ollama or Claude API (see AI Dialogue below).
5. **Sleep** — Puts Claw to bed (or wakes it up, but waking costs happiness).
6. **Medicine** — Only works when Claw is sick. Cures sickness.
7. **Stats** — Shows a stat summary on the display.

The menu auto-closes after 10 seconds of inactivity.

## Food

There are 11 foods in three categories:

**Meals** (fill hunger, small happiness boost):
- Pizza Slice (+20 hunger)
- Ramen Bowl (+25 hunger, best meal)
- Tacos (+20 hunger)
- Mac & Cheese (+15 hunger)

**Candy** (big happiness, but watch out for sugar rush):
- Gummy Bears (+20 happiness, -5 hygiene)
- Ice Cream (+25 happiness, -5 energy)
- Chocolate Bar (+15 happiness)
- Sour Candy (+20 happiness, funny face reaction)
- Lollipop (+15 happiness)

**Special** (rare):
- Birthday Cake — Only available every 288 ticks (one "birthday"). Fills happiness to 100! Confetti!
- Mystery Food — 50/50 chance of being amazing or gross.

### Sugar Rush

Feed 3+ candy items within 6 ticks and Claw enters a **sugar rush** — bouncing around with stars, extra energy and happiness. But after 3 ticks it turns into a **sugar crash** — droopy, low energy, unhappy. Then there's a 6-tick cooldown where Claw refuses candy entirely.

## Minigames

Press PLAY from the menu to start a random minigame. You can also force a specific game from the dev panel dropdown.

### Guessing Game
- Claw thinks of LEFT or RIGHT. You guess!
- Best of 5 rounds
- Get 3+ right: WIN (+20 happiness)
- Get fewer: consolation prize (+8 happiness)
- Press BACK to quit early (partial credit)

### Memory Match
- Watch a sequence of LEFT/RIGHT arrows
- Repeat the sequence back with LEFT/RIGHT
- Sequence length scales with pet age (3 to 6 arrows)
- Perfect recall = big happiness bonus
- One wrong = game over, but you still get partial credit
- Press BACK to quit early

### Dodge
- Claw auto-runs right. Obstacles appear.
- Press ACTION to jump over them
- Speed increases every 5 obstacles dodged
- Survive 10 obstacles: WIN (+20 happiness)
- Hit one: game over (+8 happiness)
- Press BACK to quit early

## Sickness

Claw gets sick if:
- Hunger stays at 0 for too long (12+ ticks)
- Happiness stays at 0 for too long (24+ ticks)
- Hygiene drops below 15 for too long (6+ ticks)
- Random bad luck when stats are low

When sick, use **Medicine** from the menu to cure Claw. Medicine has a 6-tick cooldown between uses.

If Claw stays sick for 36 ticks without medicine, it dies.

## Death and Rebirth

When Claw dies, the death screen shows its age and cause of death. If AI is enabled, Claw gets a personalized eulogy reflecting its life and personality. Otherwise, a pre-written eulogy is displayed. Press ACTION to start a new pet — the generation counter goes up, so you can track how many pets you've raised.

## Poop

Claw poops randomly (about once every 12 ticks, more often after eating). Poop appears in the bottom-left of the screen. Use **Clean** from the menu to remove it and boost hygiene. Up to 3 poops can pile up.

## Day/Night Cycle

Claw follows a real-time schedule:
- Awake: 7am to 10pm
- Asleep: 10pm to 7am

During sleep, stat decay is halved (except energy, which restores). You can manually put Claw to sleep or wake it up, but waking it costs happiness.

## Saving

The game auto-saves every 5 ticks. When you close and reopen the page, Claw picks up where it left off — including catching up on missed ticks (capped at 24 hours of decay).

Use the Save/Load buttons at the bottom for manual control. Reset starts a completely new pet.

## Sound

All game events have sound effects — feeding, cleaning, poop, sickness, menus, minigames, and more. Sounds are generated using Web Audio oscillators (no audio files needed).

Check the **Mute** checkbox in the dev panel to silence everything.

## AI Dialogue

Claw can talk using real AI! Connect to a local Ollama server or the Claude API to give Claw personality-driven conversation.

**Setup (in dev panel → AI Settings):**
1. Check **Enable AI** to turn it on
2. For Ollama (local, free): set the URL (default `http://localhost:11434`) and model name
3. For Claude API: paste your API key
4. Use **Prefer Ollama** to choose which backend to try first

**How it works:**
- Press TALK from the menu — a "thinking..." animation plays while Claw generates a response
- Claw builds context from its personality traits, current stats, care history, and recent events
- Responses are capped at 140 characters to fit the display
- If AI is unavailable, Claw falls back to ~50 pre-written offline responses that match its mood and personality
- Press BACK during "thinking..." to cancel the request
- Claw also initiates conversation on its own occasionally (about once every 24 ticks)

## Personality

Claw has five personality traits that evolve based on how you care for it:

| Trait | Low (0) | High (100) |
|-------|---------|------------|
| Sass | Earnest, sincere | Sarcastic, witty |
| Curiosity | Content, chill | Asks questions, shares facts |
| Affection | Independent | Clingy, warm |
| Energy | Zen, calm | Hyperactive, excitable |
| Philosophical | Practical | Deep, existential |

**How traits evolve:**
- Feed regularly → higher affection, lower sass
- Neglect → higher sass, lower affection
- Play often → higher energy
- Talk often → higher curiosity and philosophical
- Balanced care → traits drift toward center

**Personality affects the game:**
- Claw's dominant trait (highest value above 40) triggers unique idle animations — a sassy pet does side-eye, a curious pet looks around, an affectionate pet reaches toward you
- AI dialogue is flavored by personality — a high-sass Claw might guilt-trip you, while a high-affection Claw is warm and clingy
- Offline responses are also personality-aware

You can manually adjust traits in the dev panel's **Personality Editor** sliders.

## Tips

- Feed meals regularly to keep hunger up. Don't overfeed — stuffing Claw costs happiness.
- Play minigames for the biggest happiness boosts.
- Clean up poop promptly to avoid sickness.
- Don't feed too much candy in a row unless you want to see the sugar rush (it's fun but costs energy).
- If a stat gets critical, the text bar at the bottom will warn you.
- Talk to Claw often to boost the social stat and develop its personality.
- The speed slider lets you fast-forward time for testing — crank it to 100x to see the full lifecycle quickly.
