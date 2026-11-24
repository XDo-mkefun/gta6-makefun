// Palma Sol — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// Screens: title, play, paused, game over. Progress auto-saves to
// localStorage on every mission and on pause, and the title screen offers
// to continue it.
//
// ?seed=N fixes the city. ?shot=start|play|chase|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_MISSION, EVENT_OVER, EVENT_WANTED } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_PAUSE, ACTION_SHOOT, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

// ---- tiny synthesized sound: no audio files, no network ----
let audio = null;
function ensureAudio() {
  if (!audio) {
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; }
  }
  if (audio && audio.state === 'suspended') audio.resume();
}
function blip(freq, dur, type, gain) {
  if (!audio) return;
  try {
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(gain || 0.06, audio.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    osc.connect(amp).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + dur);
  } catch { /* sound is optional */ }
}
function jingle() {
  blip(523, 0.12, 'triangle', 0.08);
  setTimeout(() => blip(659, 0.12, 'triangle', 0.08), 110);
  setTimeout(() => blip(784, 0.22, 'triangle', 0.08), 220);
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number') return null;
    return data;
  } catch { return null; }
}
function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: world.state.cash,
      missionIndex: world.state.missionIndex,
      score: world.state.score,
      savedAt: new Date().toISOString(),
    }));
  } catch { /* storage can be off */ }
}
function readBest() {
  try { return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0; } catch { return 0; }
}
function saveBest(value) {
  try { window.localStorage.setItem(BEST_KEY, String(value)); } catch { /* ignore */ }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const mission = world.currentMission();
  world.state.missionTarget = mission.target;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, mission);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let sirenTimer = 0;
  const saved = readSave();

  function announce(message) {
    status.textContent = message;
  }

  function startGame(continueSaved) {
    world.reset();
    if (continueSaved && saved) {
      world.state.cash = saved.cash;
      world.state.missionIndex = Math.min(saved.missionIndex || 0, 4);
      world.state.score = saved.score || saved.cash;
      if (world.state.missionIndex >= 4) world.state.storyDone = true;
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    ensureAudio();
    announce('Playing. Steal a car with E, follow the mission.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    announce(`Busted. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      startGame(true);
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused. Progress saved.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    const mission = world.currentMission();
    world.state.missionTarget = mission.target;
    const shootPressed = (input.takeActions() & ACTION_SHOOT) !== 0;
    // Mouse aim: the camera sits on the player, so the direction from the
    // middle of the screen to the cursor is the aim direction.
    const aimAngle = Math.atan2(input.mouse.y - window.innerHeight / 2, input.mouse.x - window.innerWidth / 2);
    const events = world.step(STEP, {
      mx: input.moveX(),
      my: input.moveY(),
      run: input.running(),
      enter: false,
      shoot: shootPressed || (screen === SCREEN_PLAY && false),
      shootAngle: aimAngle,
    });
    // E is a one-shot action: read it separately so holding it does nothing.
    // (createInput queues it as ACTION_ENTER; takeActions above already
    // cleared the queue, so enter is handled in handleActions instead.)
    if (events & EVENT_MISSION) { jingle(); writeSave(); }
    else if (events & EVENT_WANTED) { blip(220, 0.2, 'sawtooth', 0.05); }
    if (events & EVENT_OVER) endGame();
    // Siren while wanted.
    sirenTimer -= STEP;
    if (world.state.wanted > 0 && sirenTimer <= 0) {
      sirenTimer = 0.9;
      blip(660, 0.18, 'sine', 0.04);
      setTimeout(() => blip(880, 0.18, 'sine', 0.04), 200);
    }
  }

  // Enter-car and Space-to-shoot need the action queue, so poll it here
  // once per frame before the fixed steps run.
  let pendingEnter = false;
  let pendingShoot = false;
  const originalTake = input.takeActions.bind(input);

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Drain one-shot actions once per frame.
    const queued = originalTake();
    if (queued & ACTION_ENTER) pendingEnter = true;
    if (queued & ACTION_SHOOT) pendingShoot = true;
    if (queued & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame(true);
    else if (queued & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused. Progress saved.');
    } else if (queued & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        const mission = world.currentMission();
        world.state.missionTarget = mission.target;
        const aimAngle = Math.atan2(input.mouse.y - window.innerHeight / 2, input.mouse.x - window.innerWidth / 2);
        const events = world.step(STEP, {
          mx: input.moveX(),
          my: input.moveY(),
          run: input.running(),
          enter: pendingEnter,
          shoot: pendingShoot,
          shootAngle: aimAngle,
        });
        pendingEnter = false;
        pendingShoot = false;
        accumulator -= STEP;
        if (events & EVENT_MISSION) { jingle(); writeSave(); }
        else if (events & EVENT_WANTED) { blip(220, 0.2, 'sawtooth', 0.05); }
        if (events & EVENT_OVER) { endGame(); break; }
        sirenTimer -= STEP;
        if (world.state.wanted > 0 && sirenTimer <= 0) {
          sirenTimer = 0.9;
          blip(660, 0.18, 'sine', 0.04);
          setTimeout(() => blip(880, 0.18, 'sine', 0.04), 200);
        }
      }
    } else {
      accumulator = 0;
      pendingEnter = false;
      pendingShoot = false;
    }
    const mission = world.currentMission();
    world.state.missionTarget = mission.target;
    renderer.draw(world.state, screen, best, mission);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused.');
    }
  });
  canvas.addEventListener('pointerdown', ensureAudio);
  window.addEventListener('keydown', ensureAudio, { once: true });

  announce(saved ? `Palma Sol. Press Enter to continue — $${saved.cash}, mission ${saved.missionIndex + 1}.` : 'Palma Sol. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
