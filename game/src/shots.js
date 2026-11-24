// The screenshot scenes behind ?shot=start|play|chase|end. Each one stages a
// real world with the game's own rules — a title screen over the city, a
// drive to the docks, a three-star police chase, and a busted ending — then
// the renderer paints it. Same seed, same frame.
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

export function stageShot(name, world) {
  const screen = world.stageScenario(name === 'play' || name === 'chase' || name === 'end' ? name : 'start');
  if (screen === 'title') return { screen: SCREEN_TITLE, best: 0 };
  if (screen === 'over') return { screen: SCREEN_OVER, best: world.state.score };
  return { screen: SCREEN_PLAY, best: world.state.cash };
}
