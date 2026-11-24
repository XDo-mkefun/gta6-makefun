// Palma Sol — tuning and palette in one place. The view is a fixed 1280x720
// logical area; the renderer scales it to the window. The city itself is
// 3200x2400 world units, a road grid with blocks, a beach and water south.

export const STEP = 1 / 60;

export const WORLD = {
  width: 3200,
  height: 2400,
  roadWidth: 96,
  roadsX: [200, 600, 1000, 1400, 1800, 2200, 2600, 3000],
  roadsY: [200, 600, 1000, 1400, 1800, 2200],
  waterY: 2300,
  beachY: 2240,
};

export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  radius: 14,
  walkSpeed: 210,
  runSpeed: 330,
  health: 100,
  punchRange: 46,
};

export const CAR = {
  length: 54,
  width: 26,
  radius: 20,
  accel: 420,
  brake: 620,
  maxSpeed: 520,
  reverseMax: 180,
  turnRate: 2.6,
  health: 100,
};

export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 22;
export const BULLET_SPEED = 900;

export const WANTED_MAX = 5;
export const WANTED_DECAY_SECONDS = 22;

export const PALETTE = {
  grass: '#7fae5a',
  grassDark: '#6f9e4e',
  sand: '#e8d39a',
  water: '#2f7fb8',
  waterDeep: '#256b9e',
  road: '#33373f',
  roadLine: '#e8d44d',
  sidewalk: '#9aa0a8',
  building: ['#c96f4a', '#d9a441', '#5b7fa6', '#8a6fb0', '#4f9d7a', '#b0526b', '#7a8a99', '#c98a4b'],
  roof: '#00000022',
  park: '#5d9b4a',
  tree: '#2f6b2a',
  treeLight: '#4a8a3a',
  player: '#2ecc71',
  playerShirt: '#1f9d55',
  cop: '#2f6fd0',
  copCar: '#1e4fa3',
  taxi: '#f2c230',
  text: '#f4f6f8',
  muted: '#b9c0c9',
  panel: 'rgba(12,16,22,0.78)',
  gold: '#f2c230',
  red: '#e5534b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SAVE_KEY = 'palma-sol.save.v1';
export const BEST_KEY = 'palma-sol.best.v1';

export const STORY = {
  hero: 'Mara Reyes',
  city: 'Palma Sol',
  fixer: 'Dex',
};
