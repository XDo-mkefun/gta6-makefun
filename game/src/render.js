// Drawing only: the world's state and the current screen in, pixels out.
// Top-down 2D city with a camera that follows the player, a HUD with a
// minimap, wanted stars, health, cash and the mission tracker.
import { FONT, PALETTE, VIEW, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    const key = size;
    if (!fonts.has(key)) fonts.set(key, `bold ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }
  function plainText(value, x, y, size, color, align, baseline) {
    const key = `p${size}`;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }
  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawCity(state, camX, camY) {
    // Ground.
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    // Beach and water, south.
    context.fillStyle = PALETTE.sand;
    context.fillRect(0, WORLD.beachY, WORLD.width, WORLD.waterY - WORLD.beachY);
    context.fillStyle = PALETTE.water;
    context.fillRect(0, WORLD.waterY, WORLD.width, WORLD.height - WORLD.waterY);
    context.fillStyle = PALETTE.waterDeep;
    context.fillRect(0, WORLD.waterY + 40, WORLD.width, 8);
    // Parks.
    context.fillStyle = PALETTE.park;
    for (let bx = 0; bx < WORLD.roadsX.length - 1; bx += 1) {
      for (let by = 0; by < WORLD.roadsY.length - 1; by += 1) {
        if ((bx === 2 && by === 1) || (bx === 5 && by === 3)) {
          context.fillRect(WORLD.roadsX[bx] + WORLD.roadWidth / 2, WORLD.roadsY[by] + WORLD.roadWidth / 2,
            WORLD.roadsX[bx + 1] - WORLD.roadsX[bx] - WORLD.roadWidth, WORLD.roadsY[by + 1] - WORLD.roadsY[by] - WORLD.roadWidth);
        }
      }
    }
    // Roads.
    context.fillStyle = PALETTE.road;
    for (const rx of WORLD.roadsX) context.fillRect(rx - WORLD.roadWidth / 2, 0, WORLD.roadWidth, WORLD.beachY);
    for (const ry of WORLD.roadsY) context.fillRect(0, ry - WORLD.roadWidth / 2, WORLD.width, WORLD.roadWidth);
    // Lane dashes.
    context.fillStyle = PALETTE.roadLine;
    for (const rx of WORLD.roadsX) {
      for (let y = 40; y < WORLD.beachY; y += 80) context.fillRect(rx - 3, y, 6, 36);
    }
    for (const ry of WORLD.roadsY) {
      for (let x = 40; x < WORLD.width; x += 80) context.fillRect(x, ry - 3, 36, 6);
    }
    // Buildings.
    for (const b of state.buildings) {
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = PALETTE.roof;
      context.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      context.fillStyle = 'rgba(255,255,255,0.35)';
      for (let wx = b.x + 16; wx < b.x + b.w - 12; wx += 26) {
        for (let wy = b.y + 16; wy < b.y + b.h - 12; wy += 26) context.fillRect(wx, wy, 10, 12);
      }
    }
    // Trees.
    for (const t of state.trees) {
      context.fillStyle = PALETTE.tree;
      context.beginPath(); context.arc(t.x, t.y, t.r, 0, Math.PI * 2); context.fill();
      context.fillStyle = PALETTE.treeLight;
      context.beginPath(); context.arc(t.x - 3, t.y - 3, t.r * 0.55, 0, Math.PI * 2); context.fill();
    }
    // Mission marker.
    const mission = state.missionTarget;
    if (mission) {
      const pulse = 1 + Math.sin(state.elapsed * 4) * 0.12;
      context.save();
      context.translate(mission.x, mission.y);
      context.scale(pulse, pulse);
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 4;
      context.beginPath(); context.arc(0, 0, 30, 0, Math.PI * 2); context.stroke();
      context.fillStyle = PALETTE.gold;
      context.beginPath(); context.arc(0, 0, 8, 0, Math.PI * 2); context.fill();
      context.restore();
      // Flag pole.
      context.fillStyle = '#222';
      context.fillRect(mission.x - 2, mission.y - 52, 4, 52);
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.moveTo(mission.x + 2, mission.y - 52); context.lineTo(mission.x + 30, mission.y - 42); context.lineTo(mission.x + 2, mission.y - 32);
      context.closePath(); context.fill();
    }
  }

  function drawCar(car, isPlayer) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    if (car.wrecked) {
      context.fillStyle = '#3a3a3a';
      roundRect(-27, -13, 54, 26, 7); context.fill();
      context.fillStyle = 'rgba(90,90,90,0.8)';
      context.beginPath(); context.arc(-8, -6, 10, 0, Math.PI * 2); context.fill();
    } else {
      context.fillStyle = 'rgba(0,0,0,0.3)';
      roundRect(-25, -11, 54, 26, 8); context.fill();
      context.fillStyle = car.color;
      roundRect(-27, -13, 54, 26, 8); context.fill();
      context.fillStyle = '#20262e';
      roundRect(-6, -11, 18, 22, 4); context.fill();
      context.fillStyle = '#cfe8ff';
      roundRect(10, -10, 10, 20, 3); context.fill();
      context.fillStyle = '#fff8c0';
      context.fillRect(25, -11, 3, 6); context.fillRect(25, 5, 3, 6);
      if (car.kind === 'police') {
        const flash = Math.floor(car.siren * 6) % 2 === 0;
        context.fillStyle = flash ? '#ff3b30' : '#2f6fd0';
        context.fillRect(-14, -13, 12, 5);
        context.fillStyle = flash ? '#2f6fd0' : '#ff3b30';
        context.fillRect(-14, 8, 12, 5);
        context.fillStyle = '#fff';
        plainText('PD', -4, 4, 11, '#fff', 'center', 'middle');
      }
      if (car.kind === 'taxi') {
        context.fillStyle = '#222';
        plainText('TAXI', -2, 4, 9, '#222', 'center', 'middle');
      }
    }
    context.restore();
    if (isPlayer) {
      context.strokeStyle = '#fff';
      context.lineWidth = 2;
      context.beginPath(); context.arc(car.x, car.y, 34, 0, Math.PI * 2); context.stroke();
    }
  }

  function drawWorld(state) {
    const p = state.player;
    const camX = clamp(p.x, VIEW.width / 2, WORLD.width - VIEW.width / 2);
    const camY = clamp(p.y, VIEW.height / 2, WORLD.height - VIEW.height / 2);
    context.setTransform(view.scale, 0, 0, view.scale, view.x + (VIEW.width / 2 - camX) * view.scale, view.y + (VIEW.height / 2 - camY) * view.scale);
    drawCity(state, camX, camY);
    // Pickups.
    for (const pk of state.pickups) {
      const bob = Math.sin(pk.bob) * 3;
      if (pk.kind === 'cash') {
        context.fillStyle = '#1f9d55';
        context.beginPath(); context.arc(pk.x, pk.y + bob, 13, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#fff';
        plainText('$', pk.x, pk.y + bob, 16, '#fff', 'center', 'middle');
      } else if (pk.kind === 'health') {
        context.fillStyle = '#fff';
        context.fillRect(pk.x - 12, pk.y - 12 + bob, 24, 24);
        context.fillStyle = '#e5534b';
        context.fillRect(pk.x - 3, pk.y - 9 + bob, 6, 18);
        context.fillRect(pk.x - 9, pk.y - 3 + bob, 18, 6);
      } else {
        context.fillStyle = '#f2c230';
        context.fillRect(pk.x - 11, pk.y - 8 + bob, 22, 16);
        context.fillStyle = '#222';
        plainText('AMMO', pk.x, pk.y + bob, 8, '#222', 'center', 'middle');
      }
    }
    // Pedestrians.
    for (const ped of state.peds) {
      if (ped.down) {
        context.fillStyle = '#888';
        context.beginPath(); context.arc(ped.x, ped.y, 12, 0, Math.PI * 2); context.fill();
        continue;
      }
      context.fillStyle = ped.color;
      context.beginPath(); context.arc(ped.x, ped.y, 11, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#e8c39a';
      context.beginPath(); context.arc(ped.x, ped.y - 3, 5, 0, Math.PI * 2); context.fill();
    }
    // Foot cops.
    for (const cop of state.cops) {
      context.fillStyle = PALETTE.cop;
      context.beginPath(); context.arc(cop.x, cop.y, 12, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#fff';
      plainText('P', cop.x, cop.y, 12, '#fff', 'center', 'middle');
    }
    // Cars (traffic + police + player car).
    for (const car of state.cars) {
      if (car === p.inCar) continue;
      drawCar(car, false);
    }
    if (p.inCar) drawCar(p.inCar, true);
    else {
      // Player on foot.
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.angle);
      context.fillStyle = PALETTE.player;
      context.beginPath(); context.arc(0, 0, 13, 0, Math.PI * 2); context.fill();
      context.fillStyle = PALETTE.playerShirt;
      context.beginPath(); context.arc(0, 0, 8, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#222';
      context.fillRect(8, -2, 16, 4);
      context.restore();
      context.strokeStyle = '#fff';
      context.lineWidth = 2;
      context.beginPath(); context.arc(p.x, p.y, 19, 0, Math.PI * 2); context.stroke();
    }
    // Bullets and particles.
    context.fillStyle = '#ffe14d';
    for (const b of state.bullets) {
      context.beginPath(); context.arc(b.x, b.y, 4, 0, Math.PI * 2); context.fill();
    }
    for (const pt of state.particles) {
      context.globalAlpha = Math.max(0, pt.life * 2);
      context.fillStyle = pt.color;
      context.beginPath(); context.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = 1;
    // Off-screen mission arrow.
    const mission = state.missionTarget;
    if (mission) {
      const dx = mission.x - p.x;
      const dy = mission.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 420) {
        const ax = clamp(p.x + (dx / d) * 300, camX - 560, camX + 560);
        const ay = clamp(p.y + (dy / d) * 220, camY - 300, camY + 300);
        context.save();
        context.translate(ax, ay);
        context.rotate(Math.atan2(dy, dx));
        context.fillStyle = PALETTE.gold;
        context.beginPath();
        context.moveTo(18, 0); context.lineTo(-10, -12); context.lineTo(-10, 12);
        context.closePath(); context.fill();
        context.restore();
        plainText(`${Math.round(d)}m`, ax, ay - 18, 13, PALETTE.gold, 'center', 'middle');
      }
    }
    return { camX, camY };
  }

  function drawMinimap(state) {
    const mw = 196;
    const mh = 148;
    const mx = VIEW.width - mw - 14;
    const my = 14;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    context.fillStyle = 'rgba(10,14,20,0.82)';
    roundRect(mx - 6, my - 6, mw + 12, mh + 12, 8); context.fill();
    context.fillStyle = '#5d8a4a';
    context.fillRect(mx, my, mw, mh);
    context.fillStyle = '#2f7fb8';
    context.fillRect(mx, my + WORLD.waterY * sy, mw, mh - WORLD.waterY * sy);
    context.fillStyle = '#3a3f47';
    for (const rx of WORLD.roadsX) context.fillRect(mx + rx * sx - 2, my, 4, mh);
    for (const ry of WORLD.roadsY) context.fillRect(mx, my + ry * sy, mw, 4);
    const mission = state.missionTarget;
    if (mission) {
      context.fillStyle = PALETTE.gold;
      context.beginPath(); context.arc(mx + mission.x * sx, my + mission.y * sy, 5, 0, Math.PI * 2); context.fill();
    }
    context.fillStyle = '#fff';
    for (const car of state.cars) {
      if (car.kind === 'police') continue;
      context.fillRect(mx + car.x * sx - 1, my + car.y * sy - 1, 2, 2);
    }
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      context.fillStyle = Math.floor(state.elapsed * 4) % 2 ? '#ff3b30' : '#2f6fd0';
      context.beginPath(); context.arc(mx + car.x * sx, my + car.y * sy, 3, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#fff';
    }
    const p = state.player;
    context.fillStyle = '#2ecc71';
    context.beginPath(); context.arc(mx + p.x * sx, my + p.y * sy, 5, 0, Math.PI * 2); context.fill();
    context.strokeStyle = '#fff';
    context.lineWidth = 1.5;
    context.beginPath(); context.arc(mx + p.x * sx, my + p.y * sy, 5, 0, Math.PI * 2); context.stroke();
    plainText('PALMA SOL', mx + mw / 2, my + mh + 18, 11, PALETTE.muted, 'center', 'top');
  }

  function drawHud(state, mission) {
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    // Top-left status panel.
    context.fillStyle = PALETTE.panel;
    roundRect(14, 14, 300, 96, 10); context.fill();
    const p = state.player;
    plainText('MARA REYES', 28, 34, 15, PALETTE.text, 'left', 'top');
    plainText(`$${state.cash}`, 28, 56, 20, PALETTE.gold, 'left', 'top');
    plainText(`Ammo ${p.inCar ? '—' : p.ammo}`, 210, 56, 15, PALETTE.text, 'left', 'top');
    // Health bar.
    context.fillStyle = '#222';
    roundRect(28, 82, 180, 12, 6); context.fill();
    context.fillStyle = p.health > 40 ? '#2ecc71' : '#e5534b';
    roundRect(28, 82, 180 * Math.max(0, p.health / 100), 12, 6); context.fill();
    plainText(`${Math.round(p.health)}`, 216, 94, 13, PALETTE.text, 'left', 'middle');
    // Wanted stars, top centre.
    for (let i = 0; i < 5; i += 1) {
      text('★', VIEW.width / 2 - 70 + i * 30, 44, 26, i < state.wanted ? '#ffd21f' : 'rgba(255,255,255,0.25)', 'center', 'middle');
    }
    // Clock.
    const minutes = 9 * 60 + Math.floor(state.elapsed / 6);
    const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    plainText(`${hh}:${mm}`, VIEW.width / 2, 72, 14, PALETTE.muted, 'center', 'top');
    // Mission box, bottom-left.
    context.fillStyle = PALETTE.panel;
    roundRect(14, VIEW.height - 86, 460, 72, 10); context.fill();
    context.fillStyle = PALETTE.gold;
    context.fillRect(14, VIEW.height - 86, 5, 72);
    text(mission.title, 30, VIEW.height - 58, 17, PALETTE.gold, 'left', 'top');
    plainText(mission.text, 30, VIEW.height - 34, 14, PALETTE.text, 'left', 'top');
    if (state.storyDone) plainText('STORY COMPLETE — FREE ROAM', 30, VIEW.height - 14, 12, '#2ecc71', 'left', 'top');
    // Speed, bottom-right.
    if (p.inCar) {
      const kmh = Math.round(Math.abs(p.inCar.speed) * 0.36);
      text(`${kmh}`, VIEW.width - 30, VIEW.height - 72, 34, PALETTE.text, 'right', 'top');
      plainText('km/h', VIEW.width - 30, VIEW.height - 36, 13, PALETTE.muted, 'right', 'top');
    }
    // Message toast.
    if (state.messageTimer > 0 && state.message) {
      context.fillStyle = PALETTE.panel;
      const w = Math.min(640, 30 + state.message.length * 8);
      roundRect((VIEW.width - w) / 2, 96, w, 36, 10); context.fill();
      plainText(state.message, VIEW.width / 2, 114, 15, PALETTE.text, 'center', 'middle');
    }
    drawMinimap(state);
  }

  function drawPanel(title, lines, prompt) {
    const width = 640;
    const height = 150 + lines.length * 32;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = 'rgba(8,10,14,0.86)';
    roundRect(x, y, width, height, 14); context.fill();
    context.strokeStyle = PALETTE.gold;
    context.lineWidth = 2;
    roundRect(x, y, width, height, 14); context.stroke();
    text(title, VIEW.width / 2, y + 62, 44, PALETTE.gold, 'center', 'top');
    for (let i = 0; i < lines.length; i += 1) {
      plainText(lines[i], VIEW.width / 2, y + 118 + i * 32, 17, PALETTE.text, 'center', 'top');
    }
    plainText(prompt, VIEW.width / 2, y + height - 26, 15, PALETTE.gold, 'center', 'top');
  }

  function draw(state, screen, best, mission) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0c1016';
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Mission target is derived by the caller and stashed on state for the
    // renderer; the world keeps the mission list itself.
    drawWorld(state);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      context.fillStyle = 'rgba(6,8,12,0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('PALMA SOL', [
        'An open-world crime story — by Mara Reyes.',
        'Steal cars, lose the cops, run missions for Dex.',
        'WASD / arrows to move & drive  •  E to steal a car',
        'Mouse click to shoot  •  Shift to run  •  P to pause',
        best > 0 ? `Best score: ${best}` : 'A sun-soaked city, yours to take.',
      ], 'Press Enter or click to start');
      return;
    }
    drawHud(state, mission);
    if (screen === SCREEN_PAUSED) {
      context.fillStyle = 'rgba(6,8,12,0.6)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('PAUSED', ['The city waits for you.', `Cash $${state.cash}  •  Missions done: ${state.missionIndex}`], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      context.fillStyle = 'rgba(20,4,6,0.62)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('BUSTED', [`Mara is down. Cash kept: $${state.cash}`, `Score ${state.score}  •  Best ${best}`], 'Press Enter or click to play again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
