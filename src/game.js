import { Application, Assets, Container, Sprite, Graphics } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs';
import { clampCamera } from './camera.js';
import { denormalizePois, nearestPoi, pointInPoi } from './poi-logic.js';

const WORLD = { w: 0, h: 0 };
const player = { x: 0, y: 0 };
const camera = { x: 0, y: 0 };
const zoom = 1.4;
const SPEED = 280; // 世界像素/秒
const keys = new Set();

function makePlayer() {
  // 平涂手绘风小人：青灰底座 + 朱红长袍 + 肤色头
  const g = new Graphics();
  g.ellipse(0, 2, 12, 5).fill({ color: 0x000000, alpha: 0.25 });      // 影子
  g.moveTo(-9, 0).lineTo(9, 0).lineTo(6, -22).lineTo(-6, -22).closePath().fill(0xb22222); // 长袍
  g.circle(0, -28, 7).fill(0xf0d2a8);                                  // 头
  g.ellipse(0, -34, 9, 4).fill(0x2f2f3a);                              // 官帽（扁平帽檐，坐在头顶不遮脸）
  g.circle(0, -38, 2).fill(0xc0392b);                                  // 帽顶珠
  return g;
}

async function main() {
  const app = new Application();
  await app.init({ resizeTo: window, background: '#1a1410', antialias: true });
  document.getElementById('app').appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  const mapTex = await Assets.load('./assets/map.png');
  const map = new Sprite(mapTex);
  world.addChild(map);
  WORLD.w = map.width;
  WORLD.h = map.height;

  player.x = WORLD.w / 2;
  player.y = WORLD.h * 0.6;
  const playerSprite = makePlayer();
  world.addChild(playerSprite);

  // 加载热点
  const rawPois = await fetch('./assets/pois.json').then((r) => r.json());
  const pois = denormalizePois(rawPois, WORLD.w, WORLD.h);
  const HILITE_RADIUS = WORLD.h * 0.06;

  const highlight = new Graphics();
  world.addChild(highlight);

  function showCard(p) {
    document.getElementById('poi-name').textContent = p.name;
    document.getElementById('poi-intro').textContent = p.intro;
    document.getElementById('poi-card').style.display = 'block';
  }
  document.getElementById('poi-close').onclick = () => {
    document.getElementById('poi-card').style.display = 'none';
  };

  // 点击/触摸：换算世界坐标，命中矩形则弹卡
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointertap', (e) => {
    const wp = world.toLocal(e.global);
    const hit = pois.find((p) => pointInPoi(wp.x, wp.y, p));
    if (hit) showCard(hit);
  });

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) e.preventDefault();
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    let dx = 0, dy = 0;
    if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
    if (keys.has('arrowright') || keys.has('d')) dx += 1;
    if (keys.has('arrowup') || keys.has('w')) dy -= 1;
    if (keys.has('arrowdown') || keys.has('s')) dy += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      player.x = Math.max(0, Math.min(WORLD.w, player.x + (dx / len) * SPEED * dt));
      player.y = Math.max(0, Math.min(WORLD.h, player.y + (dy / len) * SPEED * dt));
    }
    playerSprite.position.set(player.x, player.y);

    const cam = clampCamera(player.x, player.y, window.innerWidth, window.innerHeight, WORLD.w, WORLD.h, zoom);
    camera.x = cam.x; camera.y = cam.y;
    world.scale.set(zoom);
    world.position.set(-cam.x * zoom, -cam.y * zoom);

    const near = nearestPoi(player.x, player.y, pois, HILITE_RADIUS);
    highlight.clear();
    if (near) {
      highlight.rect(near.x, near.y, near.w, near.h)
        .stroke({ width: 3, color: 0xf0c869, alpha: 0.9 });
    }
  });
}

main();

export { WORLD, player, camera, zoom };
