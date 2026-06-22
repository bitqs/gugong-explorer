import { Application, Assets, Container, Sprite, Graphics } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs';
import { clampCamera } from './camera.js';
import { denormalizePois, nearestPoi, pointInPoi } from './poi-logic.js';

const input = { x: 0, y: 0 };
const WORLD = { w: 0, h: 0 };
const player = { x: 0, y: 0 };
const camera = { x: 0, y: 0 };
const zoom = 0.78;        // 全分辨率世界下的屏幕放大倍数（≈ 旧 1843px 世界的 3.0 视感）
const SPEED = 1400;       // 世界像素/秒（随大世界等比放大）
const keys = new Set();

function makePlayer() {
  // 平涂手绘风小人：瘦长身形、头身比约 1:5，贴近真人比例
  const g = new Graphics();
  g.ellipse(0, 1, 6, 2.2).fill({ color: 0x000000, alpha: 0.22 });      // 影子
  g.moveTo(-5.5, 0).lineTo(5.5, 0).lineTo(2.4, -19).lineTo(-2.4, -19).closePath().fill(0xb22222); // 长袍（A字下摆）
  g.moveTo(-2.4, -19).lineTo(2.4, -19).lineTo(1.6, -21).lineTo(-1.6, -21).closePath().fill(0xf0d2a8); // 脖颈/领口
  g.circle(0, -23.5, 3).fill(0xf0d2a8);                                // 头
  g.ellipse(0, -26, 4, 1.6).fill(0x2f2f3a);                            // 官帽（扁平帽檐，坐头顶不遮脸）
  g.circle(0, -27.8, 1).fill(0xc0392b);                                // 帽顶珠
  return g;
}

async function main() {
  const app = new Application();
  await app.init({ resizeTo: window, background: '#1a1410', antialias: true });
  document.getElementById('app').appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  // 地图元数据：世界尺寸取全分辨率原图尺寸
  const metaRes = await fetch('./assets/tiles/meta.json');
  if (!metaRes.ok) throw new Error('meta.json ' + metaRes.status);
  const meta = await metaRes.json();
  WORLD.w = meta.W;
  WORLD.h = meta.H;
  const T = meta.tile;

  // 低清底图：秒开、永不空白，拉伸铺满世界，作为高清瓦片的兜底
  const baseTex = await Assets.load('./assets/map.png');
  const base = new Sprite(baseTex);
  base.width = WORLD.w;
  base.height = WORLD.h;
  world.addChild(base);

  // 高清瓦片层：按视野动态加载/卸载（slippy-map）
  const tileLayer = new Container();
  world.addChild(tileLayer);
  const tiles = new Map(); // key "tx_ty" -> Sprite | null(加载中)
  function updateTiles() {
    const visW = window.innerWidth / zoom, visH = window.innerHeight / zoom;
    const x0 = Math.max(0, Math.floor(camera.x / T) - 1);
    const x1 = Math.min(meta.cols - 1, Math.ceil((camera.x + visW) / T));
    const y0 = Math.max(0, Math.floor(camera.y / T) - 1);
    const y1 = Math.min(meta.rows - 1, Math.ceil((camera.y + visH) / T));
    const need = new Set();
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const key = tx + '_' + ty;
      need.add(key);
      if (!tiles.has(key)) {
        tiles.set(key, null); // 标记加载中
        const px = tx * T, py = ty * T;
        Assets.load(`./assets/tiles/${key}.webp`).then((tex) => {
          if (!tiles.has(key)) return;      // 加载完成前已移出视野
          const sp = new Sprite(tex);
          sp.x = px; sp.y = py;
          tileLayer.addChild(sp);
          tiles.set(key, sp);
        }).catch(() => tiles.delete(key));
      }
    }
    for (const [key, sp] of tiles) {
      if (!need.has(key)) {
        if (sp) { tileLayer.removeChild(sp); sp.destroy(); }
        tiles.delete(key);
      }
    }
  }

  player.x = WORLD.w / 2;
  player.y = WORLD.h * 0.6;
  const playerSprite = makePlayer();
  playerSprite.scale.set(2.4); // 大世界下放大小人，保证可见可控（比例不变）
  world.addChild(playerSprite);

  // 加载热点
  const res = await fetch('./assets/pois.json');
  if (!res.ok) throw new Error('pois.json ' + res.status);
  const rawPois = await res.json();
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

  const joy = document.getElementById('joy');
  const knob = document.getElementById('joy-knob');
  let joyId = null;
  const R = 35; // 摇杆半径
  function joyStart(e) {
    if (joyId !== null) return; // 已有手指控制摇杆时，忽略第二根手指（避免劫持）
    joyId = e.changedTouches[0].identifier; joyMove(e);
  }
  function joyMove(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      const r = joy.getBoundingClientRect();
      let dx = t.clientX - (r.left + r.width / 2);
      let dy = t.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, R);
      input.x = (dx / len); input.y = (dy / len);
      knob.style.left = `${35 + (dx / len) * cl}px`;
      knob.style.top = `${35 + (dy / len) * cl}px`;
    }
    e.preventDefault();
  }
  function joyEnd() { joyId = null; input.x = 0; input.y = 0; knob.style.left = '35px'; knob.style.top = '35px'; }
  joy.addEventListener('touchstart', joyStart, { passive: false });
  joy.addEventListener('touchmove', joyMove, { passive: false });
  joy.addEventListener('touchend', joyEnd);
  joy.addEventListener('touchcancel', joyEnd); // 触摸被系统取消时复位，避免卡住移动

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) e.preventDefault();
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    let dx = input.x, dy = input.y;
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

    updateTiles();

    const near = nearestPoi(player.x, player.y, pois, HILITE_RADIUS);
    highlight.clear();
    if (near) {
      highlight.rect(near.x, near.y, near.w, near.h)
        .stroke({ width: 8, color: 0xf0c869, alpha: 0.9 });
    }
  });
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById('error');
  el.textContent = '加载失败：地图或数据未能载入。请确认通过 http 服务打开（而非直接双击文件），并重试。';
  el.style.display = 'flex';
});

export { WORLD, player, camera, zoom };
