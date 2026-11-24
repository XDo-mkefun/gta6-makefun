// Palma Sol's rules and state — no drawing, no browser in it. A top-down open
// world: a road-grid city, traffic, pedestrians, police, missions, combat and
// a wanted system. step() advances one fixed step and returns what happened
// as bit flags, so the caller can react without the world knowing screens.
import { BULLET_SPEED, CAR, PALETTE, PED_COUNT, PLAYER, TRAFFIC_COUNT, WANTED_DECAY_SECONDS, WANTED_MAX, WORLD } from './config.js';

export const EVENT_HIT = 1;
export const EVENT_PICKUP = 2;
export const EVENT_OVER = 4;
export const EVENT_MISSION = 8;
export const EVENT_WANTED = 16;
export const EVENT_SHOT = 32;

const MISSIONS = [
  { title: 'A Ride for Dex', text: "Steal a car (E) and drive to Dex's garage", target: { x: 600, y: 600 }, reward: 150, needCar: true },
  { title: 'The Docks Pickup', text: 'Drive to the docks and pick up the package', target: { x: 2600, y: 2200 }, reward: 250, needCar: false },
  { title: 'Delivery to Club Neon', text: 'Deliver the package to Club Neon', target: { x: 1000, y: 1800 }, reward: 400, needCar: false },
  { title: 'Lose the Heat', text: 'Get to 3 stars, lose the cops, then reach the hideout', target: { x: 300, y: 1800 }, reward: 500, needCar: false },
  { title: 'Free Roam', text: 'Story complete! Collect cash drops around Palma Sol', target: { x: 1600, y: 1200 }, reward: 0, needCar: false },
];

const CAR_COLORS = ['#d94f3d', '#e8b23a', '#4f7fb0', '#7a5fb0', '#e8e8e8', '#3a3f45', '#4f9d6a', '#c97b2e'];

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createWorld(random) {
  // ---- city layout, built once from the seed ----
  const buildings = [];
  const trees = [];
  const parks = new Set(['2,1', '5,3']);
  for (let bx = 0; bx < WORLD.roadsX.length - 1; bx += 1) {
    for (let by = 0; by < WORLD.roadsY.length - 1; by += 1) {
      const x0 = WORLD.roadsX[bx] + WORLD.roadWidth / 2 + 24;
      const y0 = WORLD.roadsY[by] + WORLD.roadWidth / 2 + 24;
      const x1 = WORLD.roadsX[bx + 1] - WORLD.roadWidth / 2 - 24;
      const y1 = WORLD.roadsY[by + 1] - WORLD.roadWidth / 2 - 24;
      if (y0 > WORLD.beachY - 120) continue;
      if (parks.has(`${bx},${by}`)) {
        for (let i = 0; i < 9; i += 1) {
          trees.push({ x: random.range(x0 + 20, x1 - 20), y: random.range(y0 + 20, y1 - 20), r: random.range(12, 20) });
        }
        continue;
      }
      const count = random.int(2, 4);
      for (let i = 0; i < count; i += 1) {
        const w = random.range(90, 170);
        const h = random.range(70, 130);
        const x = random.range(x0, Math.max(x0 + 1, x1 - w));
        const y = random.range(y0, Math.max(y0 + 1, y1 - h));
        buildings.push({ x, y, w, h, color: random.pick(PALETTE.building) });
      }
      for (let i = 0; i < 2; i += 1) {
        trees.push({ x: random.range(x0, x1), y: random.range(y0, y1), r: random.range(10, 16) });
      }
    }
  }

  const state = {
    buildings, trees,
    player: null, cars: [], peds: [], cops: [], bullets: [], particles: [],
    pickups: [], missionIndex: 0, missionStage: 0, cash: 0, score: 0,
    wanted: 0, wantedTimer: 0, crimeCooldown: 0, elapsed: 0,
    message: '', messageTimer: 0, shotCooldown: 0, pickupTimer: 0,
    gameOver: false, storyDone: false,
  };

  function roadCenterX(x) {
    let best = WORLD.roadsX[0];
    for (const rx of WORLD.roadsX) if (Math.abs(rx - x) < Math.abs(best - x)) best = rx;
    return best;
  }
  function roadCenterY(y) {
    let best = WORLD.roadsY[0];
    for (const ry of WORLD.roadsY) if (Math.abs(ry - y) < Math.abs(best - y)) best = ry;
    return best;
  }
  function onRoad(x, y) {
    for (const rx of WORLD.roadsX) if (Math.abs(x - rx) < WORLD.roadWidth / 2) return true;
    for (const ry of WORLD.roadsY) if (Math.abs(y - ry) < WORLD.roadWidth / 2) return true;
    return false;
  }
  function insideBuilding(x, y, r) {
    for (const b of buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
    }
    return null;
  }
  function pushOutOfBuildings(entity, r) {
    const b = insideBuilding(entity.x, entity.y, r);
    if (!b) return;
    const left = entity.x - (b.x - r);
    const right = (b.x + b.w + r) - entity.x;
    const top = entity.y - (b.y - r);
    const bottom = (b.y + b.h + r) - entity.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) entity.x = b.x - r;
    else if (m === right) entity.x = b.x + b.w + r;
    else if (m === top) entity.y = b.y - r;
    else entity.y = b.y + b.h + r;
  }

  function makeCar(x, y, angle, kind, color) {
    return { x, y, angle, speed: 0, hp: CAR.health, kind, color: color || random.pick(CAR_COLORS), driver: kind === 'traffic', wrecked: false, siren: kind === 'police' ? random.next() * 10 : 0 };
  }
  function spawnTrafficCar() {
    const vertical = random.chance(0.5);
    let car;
    if (vertical) {
      const rx = random.pick(WORLD.roadsX);
      car = makeCar(rx + random.pick([-22, 22]), random.range(100, WORLD.height - 200), random.chance(0.5) ? Math.PI / 2 : -Math.PI / 2, 'traffic');
      car.axis = 'y';
      car.dir = car.angle > 0 ? 1 : -1;
      car.speed = random.range(90, 130);
    } else {
      const ry = random.pick(WORLD.roadsY);
      car = makeCar(random.range(100, WORLD.width - 200), ry + random.pick([-22, 22]), random.chance(0.5) ? 0 : Math.PI, 'traffic');
      car.axis = 'x';
      car.dir = car.angle === 0 ? 1 : -1;
      car.speed = random.range(90, 130);
    }
    car.parked = false;
    return car;
  }
  function spawnPed() {
    const rx = random.pick(WORLD.roadsX);
    const ry = random.pick(WORLD.roadsY);
    const onVertical = random.chance(0.5);
    return {
      x: onVertical ? rx + random.pick([-70, 70]) : random.range(150, WORLD.width - 150),
      y: onVertical ? random.range(150, WORLD.height - 250) : ry + random.pick([-70, 70]),
      angle: random.range(0, Math.PI * 2), speed: random.range(28, 55),
      color: random.pick(['#e8e8e8', '#f2c230', '#d94f3d', '#7a5fb0', '#4f9d6a']),
      down: false, flee: 0, walkPhase: random.next() * 10,
    };
  }
  function spawnPickup(kind) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 20; tries += 1) {
      x = random.range(150, WORLD.width - 150);
      y = random.range(150, WORLD.beachY - 80);
      if (!insideBuilding(x, y, 20) && onRoad(x, y)) break;
    }
    return { x, y, kind, bob: random.next() * 10 };
  }
  function addWanted(amount, events) {
    if (state.wanted >= WANTED_MAX) return events;
    state.wanted = Math.min(WANTED_MAX, state.wanted + amount);
    state.wantedTimer = 0;
    return events | EVENT_WANTED;
  }
  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random.next() * Math.PI * 2;
      state.particles.push({ x, y, vx: Math.cos(a) * random.range(speed * 0.3, speed), vy: Math.sin(a) * random.range(speed * 0.3, speed), life: random.range(0.25, 0.6), color, size: random.range(2, 5) });
    }
  }

  function reset() {
    state.player = { x: 1400, y: 1000, angle: -Math.PI / 2, health: PLAYER.health, ammo: 24, cash: state.cash, inCar: null, invuln: 0, walkPhase: 0 };
    state.cars = [];
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) state.cars.push(spawnTrafficCar());
    // A few parked cars to steal right away.
    state.cars.push(makeCar(1450, 1060, 0, 'parked', '#d94f3d'));
    state.cars.push(makeCar(1350, 940, Math.PI, 'parked', '#e8b23a'));
    state.cars[ state.cars.length - 1].driver = false;
    state.cars[ state.cars.length - 2].driver = false;
    state.peds = [];
    for (let i = 0; i < PED_COUNT; i += 1) state.peds.push(spawnPed());
    state.cops = [];
    state.bullets = [];
    state.particles = [];
    state.pickups = [];
    for (let i = 0; i < 6; i += 1) state.pickups.push(spawnPickup('cash'));
    for (let i = 0; i < 3; i += 1) state.pickups.push(spawnPickup('health'));
    for (let i = 0; i < 2; i += 1) state.pickups.push(spawnPickup('ammo'));
    state.missionIndex = 0;
    state.missionStage = 0;
    state.cash = 0;
    state.score = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.crimeCooldown = 0;
    state.elapsed = 0;
    state.message = 'Welcome to Palma Sol. Steal a car — press E near one.';
    state.messageTimer = 5;
    state.shotCooldown = 0;
    state.pickupTimer = 0;
    state.gameOver = false;
    state.storyDone = false;
  }

  function currentMission() {
    return MISSIONS[Math.min(state.missionIndex, MISSIONS.length - 1)];
  }
  function say(text, seconds) {
    state.message = text;
    state.messageTimer = seconds || 4;
  }
  function completeMission() {
    const m = currentMission();
    state.cash += m.reward;
    state.score = state.cash + state.missionIndex * 100;
    say(`Mission complete: ${m.title}  +$${m.reward}`, 4);
    state.missionIndex += 1;
    state.missionStage = 0;
    if (state.missionIndex >= MISSIONS.length - 1) state.storyDone = true;
    return EVENT_MISSION;
  }

  function spawnPoliceCar() {
    const p = state.player;
    const angle = random.next() * Math.PI * 2;
    const x = clamp(p.x + Math.cos(angle) * 700, 150, WORLD.width - 150);
    const y = clamp(p.y + Math.sin(angle) * 500, 150, WORLD.beachY - 100);
    const car = makeCar(roadCenterX(x), roadCenterY(y), 0, 'police', PALETTE.copCar);
    car.speed = 200;
    state.cars.push(car);
    return car;
  }
  function spawnFootCop() {
    const p = state.player;
    const angle = random.next() * Math.PI * 2;
    state.cops.push({
      x: clamp(p.x + Math.cos(angle) * 260, 100, WORLD.width - 100),
      y: clamp(p.y + Math.sin(angle) * 260, 100, WORLD.beachY - 60),
      angle: 0, speed: 190, hp: 30, hitCooldown: 0,
    });
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic' || !car.driver) continue;
      if (car.axis === 'x') {
        car.x += car.dir * car.speed * dt;
        if (car.x < 120 || car.x > WORLD.width - 120) car.dir *= -1;
        const ry = roadCenterY(car.y);
        if (Math.abs(car.y - ry) > 2) car.y += (ry - car.y) * Math.min(1, dt * 2);
        // Turn at an intersection sometimes.
        if (Math.abs(car.x - roadCenterX(car.x)) < 4 && random.chance(dt * 0.25)) {
          car.axis = 'y';
          car.angle = random.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
          car.dir = car.angle > 0 ? 1 : -1;
          car.y = roadCenterY(car.y);
        }
      } else {
        car.y += car.dir * car.speed * dt;
        if (car.y < 120 || car.y > WORLD.beachY - 120) car.dir *= -1;
        const rx = roadCenterX(car.x);
        if (Math.abs(car.x - rx) > 2) car.x += (rx - car.x) * Math.min(1, dt * 2);
        if (Math.abs(car.y - roadCenterY(car.y)) < 4 && random.chance(dt * 0.25)) {
          car.axis = 'x';
          car.angle = random.chance(0.5) ? 0 : Math.PI;
          car.dir = car.angle === 0 ? 1 : -1;
          car.x = roadCenterX(car.x);
        }
      }
    }
  }

  function stepPolice(dt, events) {
    const p = state.player;
    const wantCars = state.wanted;
    let policeCars = 0;
    for (const car of state.cars) if (car.kind === 'police' && !car.wrecked) policeCars += 1;
    if (policeCars < wantCars && random.chance(dt * 0.8)) spawnPoliceCar();
    if (state.wanted >= 2 && !p.inCar && state.cops.length < 2 && random.chance(dt * 0.5)) spawnFootCop();
    for (const car of state.cars) {
      if (car.kind !== 'police' || car.wrecked) continue;
      const target = p.inCar || p;
      const dx = target.x - car.x;
      const dy = target.y - car.y;
      const wantAngle = Math.atan2(dy, dx);
      let diff = wantAngle - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.angle += clamp(diff, -2.2 * dt, 2.2 * dt);
      car.speed = Math.min(500, car.speed + 260 * dt);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      if (!insideBuilding(nx, ny, 18)) { car.x = nx; car.y = ny; }
      else { car.angle += 1.2 * dt; car.speed *= 0.7; }
      car.x = clamp(car.x, 60, WORLD.width - 60);
      car.y = clamp(car.y, 60, WORLD.beachY - 40);
      const d = dist(car.x, car.y, target.x, target.y);
      if (d < 56) {
        if (p.inCar) {
          p.inCar.hp -= 26 * dt;
          p.inCar.speed *= 0.94;
          if (p.inCar.hp <= 0) {
            p.inCar.wrecked = true;
            p.inCar = null;
            say('Your car is wrecked! Run!', 3);
            events = addWanted(1, events);
          }
        } else if (p.invuln <= 0) {
          p.health -= 22 * dt;
          p.invuln = 0.4;
          burst(p.x, p.y, '#e5534b', 4, 120);
          if (p.health <= 0) { p.health = 0; state.gameOver = true; events |= EVENT_OVER; }
        }
        events |= EVENT_HIT;
      }
    }
    for (const cop of state.cops) {
      const dx = p.x - cop.x;
      const dy = p.y - cop.y;
      const d = Math.hypot(dx, dy);
      if (d > 4) {
        cop.angle = Math.atan2(dy, dx);
        cop.x += (dx / d) * cop.speed * dt;
        cop.y += (dy / d) * cop.speed * dt;
      }
      pushOutOfBuildings(cop, 12);
      cop.hitCooldown -= dt;
      if (d < 34 && cop.hitCooldown <= 0 && !p.inCar && p.invuln <= 0) {
        cop.hitCooldown = 0.9;
        p.health -= 12;
        p.invuln = 0.4;
        if (p.health <= 0) { p.health = 0; state.gameOver = true; events |= EVENT_OVER; }
        events |= EVENT_HIT;
      }
    }
    if (state.wanted === 0) {
      state.cars = state.cars.filter((c) => c.kind !== 'police');
      state.cops = [];
    }
    return events;
  }

  function stepPeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.down) continue;
      ped.walkPhase += dt * 6;
      const threat = p.inCar ? dist(ped.x, ped.y, p.inCar.x, p.inCar.y) : dist(ped.x, ped.y, p.x, p.y);
      if (threat < 130 && (state.shotCooldown > 0.4 || (p.inCar && Math.abs(p.inCar.speed) > 200))) {
        ped.flee = 1.2;
        const dx = ped.x - (p.inCar ? p.inCar.x : p.x);
        const dy = ped.y - (p.inCar ? p.inCar.y : p.y);
        ped.angle = Math.atan2(dy, dx);
      } else if (ped.flee > 0) {
        ped.flee -= dt;
      } else if (random.chance(dt * 0.2)) {
        ped.angle = random.range(0, Math.PI * 2);
      }
      const speed = ped.flee > 0 ? ped.speed * 2.2 : ped.speed;
      ped.x += Math.cos(ped.angle) * speed * dt;
      ped.y += Math.sin(ped.angle) * speed * dt;
      ped.x = clamp(ped.x, 80, WORLD.width - 80);
      ped.y = clamp(ped.y, 80, WORLD.beachY - 50);
      if (insideBuilding(ped.x, ped.y, 8)) ped.angle += Math.PI / 2;
      // Hit by a fast player car.
      if (p.inCar && Math.abs(p.inCar.speed) > 140 && dist(ped.x, ped.y, p.inCar.x, p.inCar.y) < 34) {
        ped.down = true;
        burst(ped.x, ped.y, '#e5534b', 8, 160);
        state.cash += 0;
      }
    }
  }

  function stepBullets(dt, events) {
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      if (insideBuilding(b.x, b.y, 2) || b.x < 0 || b.x > WORLD.width || b.y < 0 || b.y > WORLD.height) {
        b.life = 0;
        burst(b.x, b.y, '#f2c230', 3, 90);
        continue;
      }
      for (const ped of state.peds) {
        if (!ped.down && dist(b.x, b.y, ped.x, ped.y) < 18) {
          ped.down = true;
          b.life = 0;
          burst(ped.x, ped.y, '#e5534b', 8, 160);
          events = addWanted(1, events);
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const cop of state.cops) {
        if (dist(b.x, b.y, cop.x, cop.y) < 18) {
          cop.hp -= 20;
          b.life = 0;
          burst(cop.x, cop.y, '#e5534b', 6, 140);
          events = addWanted(1, events);
          if (cop.hp <= 0) state.cops.splice(state.cops.indexOf(cop), 1);
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const car of state.cars) {
        if (car === state.player.inCar) continue;
        if (dist(b.x, b.y, car.x, car.y) < 26) {
          car.hp -= 14;
          b.life = 0;
          burst(b.x, b.y, '#f2c230', 4, 120);
          if (car.hp <= 0 && !car.wrecked) {
            car.wrecked = true;
            car.speed = 0;
            burst(car.x, car.y, '#555', 12, 180);
          }
          break;
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
    return events;
  }

  function stepMissions(dt, events) {
    const m = currentMission();
    const p = state.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    if (state.missionIndex >= 4) {
      // Free roam: cash drops are the objective.
      return events;
    }
    if (state.missionIndex === 3) {
      if (state.missionStage === 0) {
        if (state.wanted < 3) {
          state.wanted = 3;
          events |= EVENT_WANTED;
          say('3 stars! Now lose the cops, then reach the hideout.', 4);
        }
        state.missionStage = 1;
      } else if (state.wanted === 0 && dist(px, py, m.target.x, m.target.y) < 80) {
        return completeMission() | events;
      }
      return events;
    }
    if (m.needCar && !p.inCar) return events;
    if (dist(px, py, m.target.x, m.target.y) < 80) {
      if (state.missionIndex === 1) {
        say('Package picked up. Cops noticed — go!', 3);
        events = addWanted(1, events);
      }
      return completeMission() | events;
    }
    return events;
  }

  // One fixed step. `input` is {mx, my, run, enter, shoot, shootAngle}.
  function step(dt, input) {
    let events = 0;
    if (state.gameOver) return EVENT_OVER;
    state.elapsed += dt;
    state.crimeCooldown = Math.max(0, state.crimeCooldown - dt);
    state.shotCooldown = Math.max(0, state.shotCooldown - dt);
    if (state.messageTimer > 0) state.messageTimer -= dt;
    const p = state.player;
    p.invuln = Math.max(0, p.invuln - dt);

    // ---- enter / exit car ----
    if (input.enter) {
      if (p.inCar) {
        const car = p.inCar;
        p.inCar = null;
        p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40;
        p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
        p.angle = car.angle;
        pushOutOfBuildings(p, PLAYER.radius);
        car.speed = 0;
      } else {
        let bestCar = null;
        let bestD = 80;
        for (const car of state.cars) {
          if (car.wrecked) continue;
          const d = dist(p.x, p.y, car.x, car.y);
          if (d < bestD) { bestD = d; bestCar = car; }
        }
        if (bestCar) {
          if (bestCar.driver) {
            bestCar.driver = false;
            events = addWanted(1, events);
            say('Car stolen! Wanted level up.', 3);
            burst(bestCar.x, bestCar.y, '#f2c230', 6, 120);
          }
          p.inCar = bestCar;
          p.x = bestCar.x;
          p.y = bestCar.y;
        }
      }
    }

    // ---- movement ----
    if (p.inCar) {
      const car = p.inCar;
      const steering = input.mx;
      const throttle = -input.my;
      car.angle += steering * CAR.turnRate * clamp(car.speed / 220, -1, 1) * dt * (car.speed < 0 ? -1 : 1);
      if (throttle > 0) car.speed += CAR.accel * throttle * dt;
      else if (throttle < 0) car.speed += CAR.brake * throttle * dt;
      else car.speed *= Math.max(0, 1 - 1.4 * dt);
      car.speed = clamp(car.speed, -CAR.reverseMax, CAR.maxSpeed);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      if (!insideBuilding(nx, ny, 18)) { car.x = nx; car.y = ny; }
      else { car.speed *= -0.25; burst(car.x, car.y, '#888', 4, 100); }
      car.x = clamp(car.x, 60, WORLD.width - 60);
      car.y = clamp(car.y, 60, WORLD.beachY - 40);
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      // Knock pedestrians down at speed.
      for (const ped of state.peds) {
        if (!ped.down && Math.abs(car.speed) > 140 && dist(ped.x, ped.y, car.x, car.y) < 34) {
          ped.down = true;
          burst(ped.x, ped.y, '#e5534b', 8, 160);
          if (state.crimeCooldown <= 0) {
            state.crimeCooldown = 3;
            events = addWanted(1, events);
          }
        }
      }
    } else {
      const len = Math.hypot(input.mx, input.my) || 1;
      const speed = (input.run ? PLAYER.runSpeed : PLAYER.walkSpeed);
      const nx = p.x + (input.mx / len) * speed * dt * (input.mx || input.my ? 1 : 0);
      const ny = p.y + (input.my / len) * speed * dt * (input.mx || input.my ? 1 : 0);
      if (input.mx || input.my) {
        p.angle = Math.atan2(input.my, input.mx);
        p.walkPhase += dt * 10;
      }
      if (!insideBuilding(nx, p.y, PLAYER.radius)) p.x = nx;
      if (!insideBuilding(p.x, ny, PLAYER.radius)) p.y = ny;
      p.x = clamp(p.x, 40, WORLD.width - 40);
      p.y = clamp(p.y, 40, WORLD.beachY - 30);
      for (const car of state.cars) {
        const d = dist(p.x, p.y, car.x, car.y);
        if (d < 30 && d > 0.01) {
          p.x += ((p.x - car.x) / d) * (30 - d);
          p.y += ((p.y - car.y) / d) * (30 - d);
        }
      }
      // Shooting on foot.
      if (input.shoot && state.shotCooldown <= 0 && p.ammo > 0) {
        state.shotCooldown = 0.22;
        p.ammo -= 1;
        const a = input.shootAngle;
        state.bullets.push({ x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22, vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED, life: 0.9 });
        burst(p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24, '#f2c230', 3, 120);
        events |= EVENT_SHOT;
        if (state.crimeCooldown <= 0) {
          state.crimeCooldown = 4;
          events = addWanted(1, events);
        }
      }
    }

    stepTraffic(dt);
    events = stepPolice(dt, events);
    stepPeds(dt);
    events = stepBullets(dt, events);
    events = stepMissions(dt, events);

    // ---- pickups ----
    for (const pk of state.pickups) {
      pk.bob += dt * 3;
      const px = p.inCar ? p.inCar.x : p.x;
      const py = p.inCar ? p.inCar.y : p.y;
      if (dist(pk.x, pk.y, px, py) < 44) {
        if (pk.kind === 'cash') { state.cash += 25; say('+$25 cash', 2); }
        else if (pk.kind === 'health') { p.health = Math.min(PLAYER.health, p.health + 40); say('Health +40', 2); }
        else { p.ammo += 18; say('Ammo +18', 2); }
        state.score = state.cash + state.missionIndex * 100;
        pk.taken = true;
        burst(pk.x, pk.y, '#f2c230', 8, 140);
        events |= EVENT_PICKUP;
      }
    }
    state.pickups = state.pickups.filter((pk) => !pk.taken);
    state.pickupTimer += dt;
    if (state.pickupTimer > 25) {
      state.pickupTimer = 0;
      const kinds = ['cash', 'cash', 'health', 'ammo'];
      state.pickups.push(spawnPickup(kinds[Math.floor(random.next() * kinds.length)]));
    }

    // ---- wanted decay ----
    if (state.wanted > 0) {
      state.wantedTimer += dt;
      let policeNear = false;
      for (const car of state.cars) if (car.kind === 'police' && dist(car.x, car.y, p.x, p.y) < 350) policeNear = true;
      if (state.wantedTimer > WANTED_DECAY_SECONDS && !policeNear) {
        state.wanted -= 1;
        state.wantedTimer = 0;
        events |= EVENT_WANTED;
      }
    }
    // Slow health regen when calm.
    if (state.wanted === 0 && p.health > 0 && p.health < PLAYER.health) p.health = Math.min(PLAYER.health, p.health + 2 * dt);
    // Particles.
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    if (p.health <= 0) {
      state.gameOver = true;
      events |= EVENT_OVER;
    }
    return events;
  }

  // Stage a screenshot scene: place the player and the world so the real
  // renderer paints a rich frame. Used only by ?shot= scenes.
  function stageScenario(name) {
    reset();
    state.message = '';
    state.messageTimer = 0;
    const p = state.player;
    if (name === 'start') {
      p.x = 1400; p.y = 1000;
      const car = state.cars[state.cars.length - 2];
      car.x = 1460; car.y = 1000; car.angle = 0;
      return 'title';
    }
    if (name === 'play') {
      const car = state.cars[state.cars.length - 2];
      car.x = 1500; car.y = 1400; car.angle = Math.PI / 2; car.speed = 260;
      p.inCar = car;
      p.x = car.x; p.y = car.y;
      state.missionIndex = 1;
      state.cash = 150;
      state.score = 250;
      state.wanted = 1;
      spawnPoliceCar();
      return 'play';
    }
    if (name === 'chase') {
      // On the road x=1400, driving south, with two police cars closing in.
      const car = makeCar(1400, 1200, Math.PI / 2, 'parked', '#d94f3d');
      car.speed = 320;
      state.cars.push(car);
      p.inCar = car;
      p.x = car.x; p.y = car.y;
      state.missionIndex = 3;
      state.missionStage = 1;
      state.wanted = 3;
      state.cash = 650;
      state.score = 950;
      const cop1 = makeCar(1400, 860, Math.PI / 2, 'police', PALETTE.copCar);
      cop1.speed = 420;
      const cop2 = makeCar(1400, 1560, -Math.PI / 2, 'police', PALETTE.copCar);
      cop2.speed = 420;
      state.cars.push(cop1, cop2);
      return 'play';
    }
    // end: busted / game over.
    p.health = 0;
    state.gameOver = true;
    state.wanted = 2;
    state.cash = 400;
    state.score = 400;
    spawnPoliceCar();
    return 'over';
  }

  reset();
  return { state, reset, step, currentMission, stageScenario, say };
}
