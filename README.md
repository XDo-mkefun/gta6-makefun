# Palma Sol — Open World Crime

An original top-down open-world crime game, built for the Make GTA 6 bounty.
You are Mara Reyes, new in the sun-soaked city of Palma Sol. Steal cars,
lose the police, and run missions for the fixer Dex — then take the city
for yourself in free roam.

## What is in the game

- A 3200×2400 city to explore on foot and by car: roads, buildings, parks,
  a beach and the sea to the south
- Traffic and pedestrians, cars to steal and drive, parked cars to take
- A wanted system (0–5 stars) with police cars and foot cops who chase,
  ram and arrest you — lose them to cool off
- A four-mission story: get a ride for Dex, pick up a package at the docks,
  deliver it to Club Neon, then lose a three-star heat and reach the hideout
- Combat on foot (mouse to shoot), cash and ammo/health pickups, free roam
  after the story with repeatable cash drops
- HUD with health, cash, ammo, wanted stars, a clock, a mission tracker
  with a distance arrow, and a live minimap
- Start screen, pause, game over, and auto-save of cash and mission
  progress in the browser (continue from the title screen)
- Synthesized sound effects (shots, pickups, sirens, mission jingle) — no
  audio files, no network requests

## How to run it

Serve `game/` with any static server and open `index.html` in desktop
Chrome. From this repository:

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no dependencies, no network: every file the game loads
lives under `game/`.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move on foot, drive a car |
| Shift | Run |
| E | Steal / enter a car, get out |
| Mouse click | Shoot (on foot) |
| P / Esc | Pause (saves progress) |
| Enter / click | Start, continue, restart |

## Files

- `game/index.html` — the page
- `game/src/main.js` — boot, loop, save, sound
- `game/src/world.js` — city, traffic, police, missions, combat, wanted
- `game/src/render.js` — drawing, HUD, minimap, screens
- `game/src/config.js` — tuning and palette
- `game/src/input.js` — keyboard and mouse
- `game/src/random.js` — seeded random
- `game/src/shots.js` — the `?shot=` screenshot scenes
- `main.ts` — hands `game/` and `screenshots/` to the grader
- `shots.json` — the four screenshot scenes
