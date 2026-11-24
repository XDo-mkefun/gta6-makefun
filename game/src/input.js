// Keyboard and mouse input for Palma Sol. Held keys steer and drive; one-shot
// presses (confirm, pause, enter a car, shoot) are queued as bit flags and
// taken once by the loop, so a press between frames is never lost or doubled.
// Mouse position is kept in canvas pixels; the renderer converts it to world.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_SHOOT = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false };

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
      return;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      held.add(event.code);
      return;
    }
    if (event.repeat) return;
    if (event.code === 'Space' || event.code === 'Enter') actions |= ACTION_CONFIRM;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyE') actions |= ACTION_ENTER;
    else if (event.code === 'KeyF') actions |= ACTION_SHOOT;
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => held.clear());

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    mouse.down = true;
    actions |= ACTION_SHOOT;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  function axis(neg, pos) {
    let hasNeg = false;
    let hasPos = false;
    for (const code of held) {
      if (neg.has(code)) hasNeg = true;
      if (pos.has(code)) hasPos = true;
    }
    return (hasPos ? 1 : 0) - (hasNeg ? 1 : 0);
  }

  return {
    // Steering / movement: -1, 0 or 1 on each axis.
    moveX() { return axis(LEFT, RIGHT); },
    moveY() { return axis(UP, DOWN); },
    running() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    mouse,
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
