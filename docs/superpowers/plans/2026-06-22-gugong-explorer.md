# 故宫漫游 2.5D 网页探索 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 浏览器里操控一个手绘风小人在故宫地图上自由行走，走近/点击宫殿弹出名称与介绍。

**Architecture:** 纯静态页面 + PixiJS（CDN ESM，无构建步骤）。纯逻辑（镜头钳制、热点判定、坐标换算）抽成无依赖模块，用 `node:test` 做 TDD；Pixi 渲染/输入/UI 部分用浏览器手动验证。热点位置以归一化分数(0–1)存储，与分辨率解耦。

**Tech Stack:** HTML5 + ES Modules + PixiJS v8 (CDN) + Node `node:test`（仅测纯逻辑，零依赖）。资产用 `sips` 降采样。本地用 `python3 -m http.server` 跑（ES modules / fetch 需 http，不能 file://）。

## Global Constraints

- 无构建步骤、无 npm 依赖用于运行时；PixiJS 仅通过 CDN ESM 引入：`https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs`（**版本固定**，勿用浮动 `@8`：避免 CDN 在 8.x 内静默换码的供应链风险）
- 纯逻辑模块（`src/camera.js`、`src/poi-logic.js`）不得 import 任何 DOM/Pixi，必须能在 Node 下被 `node:test` 直接导入。
- 项目根放一个 `package.json`，仅含 `{"type":"module"}`，让 Node 以 ESM 解析 `.js`。
- 热点坐标一律用归一化分数 `fx,fy,fw,fh`（0–1），加载时乘世界宽高换算为像素。
- 角色为平涂手绘风（朱红/金黄/青灰调色板），用 Pixi Graphics 画，不引外部图、不使用 PixelLab。
- 本地运行命令统一：`python3 -m http.server 8000`，浏览器开 `http://localhost:8000/`。

---

### Task 1: 项目骨架 + 背景图降采样 + 地图显示

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/game.js`
- Create: `assets/map.png`（由 `gugong-full-map-z5.png` 降采样生成）

**Interfaces:**
- Consumes: 无
- Produces: 全局世界尺寸约定——`map.png` 渲染后 `app.WORLD`（`{w,h}`，世界像素尺寸）挂在模块作用域，供后续任务使用。Pixi 结构：`app.stage` → `world`(Container, 承载地图与角色) → 地图 Sprite。

- [ ] **Step 1: 降采样背景图**

Run:
```bash
cd /Users/qushuang/projects/gugong
sips -Z 3072 gugong-full-map-z5.png --out assets/map.png
sips -g pixelWidth -g pixelHeight assets/map.png
```
Expected: 输出宽约 1843、高 3072（4608×7680 等比缩到高 3072）。记下实际宽高备用。

- [ ] **Step 2: 写 package.json**

```json
{
  "type": "module"
}
```

- [ ] **Step 3: 写 index.html**

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>故宫漫游</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #1a1410; }
    #app canvas { display: block; }
    #error { position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
             color: #f5e6c8; font: 16px/1.6 system-ui, sans-serif; padding: 24px; text-align: center; }
  </style>
</head>
<body>
  <div id="app"></div>
  <div id="error"></div>
  <script type="module" src="./src/game.js"></script>
</body>
</html>
```

- [ ] **Step 4: 写 src/game.js（仅地图显示）**

```js
import { Application, Assets, Container, Sprite } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs';

const WORLD = { w: 0, h: 0 };

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

  // 临时：缩放使整图可见，便于本步验证
  const fit = Math.min(window.innerWidth / WORLD.w, window.innerHeight / WORLD.h);
  world.scale.set(fit);
}

main();

export { WORLD };
```

- [ ] **Step 5: 起服务并在浏览器验证**

Run:
```bash
cd /Users/qushuang/projects/gugong && python3 -m http.server 8000
```
浏览器打开 `http://localhost:8000/`。
Expected: 看到完整故宫手绘地图、清晰、无报错（DevTools Console 无红字）。

- [ ] **Step 6: Commit**

```bash
git add package.json index.html src/game.js assets/map.png
git commit -m "feat: scaffold gugong explorer, render downscaled map"
```

---

### Task 2: 镜头钳制逻辑（纯函数，TDD）

**Files:**
- Create: `src/camera.js`
- Test: `tests/camera.test.js`

**Interfaces:**
- Consumes: 无
- Produces: `clampCamera(playerX, playerY, viewW, viewH, worldW, worldH, zoom) -> {x, y}` 返回镜头视口左上角的世界坐标。世界比视口小时居中（结果可为负）。

- [ ] **Step 1: 写失败测试**

`tests/camera.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampCamera } from '../src/camera.js';

test('居中跟随：玩家在大世界中间', () => {
  const cam = clampCamera(1000, 1000, 800, 600, 5000, 5000, 1);
  assert.deepEqual(cam, { x: 600, y: 700 });
});

test('左上边界钳制', () => {
  const cam = clampCamera(10, 10, 800, 600, 5000, 5000, 1);
  assert.deepEqual(cam, { x: 0, y: 0 });
});

test('右下边界钳制', () => {
  const cam = clampCamera(4990, 4990, 800, 600, 5000, 5000, 1);
  assert.deepEqual(cam, { x: 4200, y: 4400 });
});

test('世界比视口窄时水平居中', () => {
  const cam = clampCamera(100, 1000, 800, 600, 400, 5000, 1);
  assert.equal(cam.x, -200); // (400 - 800) / 2
});

test('缩放影响可见范围', () => {
  // zoom=2 时可见世界宽 = 800/2 = 400，半宽 200
  const cam = clampCamera(1000, 1000, 800, 600, 5000, 5000, 2);
  assert.equal(cam.x, 800); // 1000 - 200
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/camera.test.js`
Expected: FAIL（`clampCamera` 未定义 / 模块找不到）。

- [ ] **Step 3: 写实现**

`src/camera.js`:
```js
export function clampCamera(playerX, playerY, viewW, viewH, worldW, worldH, zoom) {
  const visW = viewW / zoom;
  const visH = viewH / zoom;
  let x = playerX - visW / 2;
  let y = playerY - visH / 2;
  x = worldW <= visW ? (worldW - visW) / 2 : Math.max(0, Math.min(x, worldW - visW));
  y = worldH <= visH ? (worldH - visH) / 2 : Math.max(0, Math.min(y, worldH - visH));
  return { x, y };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/camera.test.js`
Expected: PASS（5 个测试全过）。

- [ ] **Step 5: Commit**

```bash
git add src/camera.js tests/camera.test.js
git commit -m "feat: add camera clamp logic with tests"
```

---

### Task 3: 角色 + 键盘移动 + 镜头跟随

**Files:**
- Modify: `src/game.js`（替换 Task 1 的临时缩放为镜头跟随，加入角色与输入）

**Interfaces:**
- Consumes: `clampCamera` from `src/camera.js`；`WORLD`。
- Produces: 模块作用域 `player`（`{x, y}` 世界坐标）、`camera`（当前 `{x,y}`）、常量 `zoom`，供 Task 5 点击换算使用。`world` 容器变换：`world.scale=zoom`、`world.position=(-camera.x*zoom, -camera.y*zoom)`。

- [ ] **Step 1: 重写 src/game.js**

```js
import { Application, Assets, Container, Sprite, Graphics } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.19.0/dist/pixi.min.mjs';
import { clampCamera } from './camera.js';

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
  g.circle(0, -33, 8).fill(0x2f2f3a);                                  // 帽
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

  window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
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
  });
}

main();

export { WORLD, player, camera, zoom };
```

- [ ] **Step 2: 浏览器验证**

Run: `python3 -m http.server 8000`（若已在跑则刷新页面）。
Expected:
- 小人出现在地图中下部，WASD/方向键可移动。
- 镜头跟随小人，移动到地图边缘时镜头停在边界（不露出黑边以外的空白）。
- 斜向移动速度与直行一致（已归一化）。

- [ ] **Step 3: Commit**

```bash
git add src/game.js
git commit -m "feat: player sprite, keyboard movement, camera follow"
```

---

### Task 4: 热点判定逻辑（纯函数，TDD）

**Files:**
- Create: `src/poi-logic.js`
- Test: `tests/poi-logic.test.js`

**Interfaces:**
- Consumes: 无
- Produces:
  - `denormalizePois(pois, worldW, worldH) -> [{...poi, x, y, w, h}]`（把 `fx,fy,fw,fh` 换算为像素 `x,y,w,h`）
  - `poiCenter(poi) -> {x, y}`
  - `nearestPoi(px, py, pois, radius) -> poi | null`（中心在半径内且最近者；像素 poi）
  - `pointInPoi(px, py, poi) -> boolean`（像素 poi 矩形命中）

- [ ] **Step 1: 写失败测试**

`tests/poi-logic.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { denormalizePois, poiCenter, nearestPoi, pointInPoi } from '../src/poi-logic.js';

const raw = [{ id: 'a', name: 'A', fx: 0.0, fy: 0.0, fw: 0.5, fh: 0.5, intro: '' }];

test('denormalizePois 换算像素', () => {
  const [p] = denormalizePois(raw, 1000, 2000);
  assert.deepEqual({ x: p.x, y: p.y, w: p.w, h: p.h }, { x: 0, y: 0, w: 500, h: 1000 });
});

test('poiCenter 取矩形中心', () => {
  assert.deepEqual(poiCenter({ x: 100, y: 200, w: 40, h: 60 }), { x: 120, y: 230 });
});

test('nearestPoi 半径外返回 null', () => {
  const pois = [{ x: 0, y: 0, w: 10, h: 10 }]; // center (5,5)
  assert.equal(nearestPoi(500, 500, pois, 50), null);
});

test('nearestPoi 返回最近者', () => {
  const near = { id: 'near', x: 100, y: 100, w: 10, h: 10 };
  const far = { id: 'far', x: 300, y: 300, w: 10, h: 10 };
  const hit = nearestPoi(108, 108, [far, near], 100);
  assert.equal(hit.id, 'near');
});

test('pointInPoi 命中与未命中', () => {
  const p = { x: 100, y: 100, w: 50, h: 50 };
  assert.equal(pointInPoi(120, 120, p), true);
  assert.equal(pointInPoi(160, 120, p), false);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/poi-logic.test.js`
Expected: FAIL（模块/函数未定义）。

- [ ] **Step 3: 写实现**

`src/poi-logic.js`:
```js
export function denormalizePois(pois, worldW, worldH) {
  return pois.map((p) => ({
    ...p,
    x: p.fx * worldW,
    y: p.fy * worldH,
    w: p.fw * worldW,
    h: p.fh * worldH,
  }));
}

export function poiCenter(p) {
  return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
}

export function nearestPoi(px, py, pois, radius) {
  let best = null;
  let bestD = radius * radius;
  for (const p of pois) {
    const c = poiCenter(p);
    const dx = c.x - px;
    const dy = c.y - py;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function pointInPoi(px, py, p) {
  return px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/poi-logic.test.js`
Expected: PASS（5 个测试全过）。

- [ ] **Step 5: Commit**

```bash
git add src/poi-logic.js tests/poi-logic.test.js
git commit -m "feat: add POI hit-detection logic with tests"
```

---

### Task 5: 热点数据 + 走近高亮 + 点击介绍卡

**Files:**
- Create: `assets/pois.json`
- Modify: `src/game.js`（加载热点、每帧高亮、点击弹卡）
- Modify: `index.html`（加入介绍卡 DOM 与样式）

**Interfaces:**
- Consumes: `denormalizePois, nearestPoi, pointInPoi` from `src/poi-logic.js`；`player, camera, zoom, WORLD`；`world` 容器（用 `world.toLocal(e.global)` 把点击换算为世界坐标）。
- Produces: 无（终端功能）。

注：`pois.json` 坐标为**估计值**，需在浏览器用 Step 4 的标定方法校准。坐标系：南在下（午门在底部），北在上（神武门在顶）。

- [ ] **Step 1: 写 assets/pois.json（中轴线 12 座，归一化估计坐标）**

```json
[
  { "id": "shenwu",   "name": "神武门",   "fx": 0.40, "fy": 0.02, "fw": 0.20, "fh": 0.05, "intro": "故宫北门，明代称玄武门，清代避康熙帝玄烨讳改称神武门，设钟鼓报时。" },
  { "id": "yuhuayuan","name": "御花园",   "fx": 0.36, "fy": 0.08, "fw": 0.28, "fh": 0.07, "intro": "帝后游憩的宫廷花园，古柏奇石、亭台楼阁，中心为钦安殿。" },
  { "id": "kunning",  "name": "坤宁宫",   "fx": 0.40, "fy": 0.16, "fw": 0.20, "fh": 0.05, "intro": "内廷后三宫之一，明代皇后寝宫，清代改为祭神与帝后大婚洞房。" },
  { "id": "jiaotai",  "name": "交泰殿",   "fx": 0.43, "fy": 0.21, "fw": 0.14, "fh": 0.04, "intro": "乾清宫与坤宁宫之间的小殿，存放二十五方宝玺，象征天地交泰。" },
  { "id": "qianqing", "name": "乾清宫",   "fx": 0.40, "fy": 0.25, "fw": 0.20, "fh": 0.06, "intro": "内廷后三宫之首，明至清初皇帝寝宫与日常理政之所，悬‘正大光明’匾。" },
  { "id": "qianqingmen","name":"乾清门",  "fx": 0.42, "fy": 0.32, "fw": 0.16, "fh": 0.03, "intro": "内廷正门，清代‘御门听政’之地，前为外朝后为内廷的分界。" },
  { "id": "baohe",    "name": "保和殿",   "fx": 0.39, "fy": 0.37, "fw": 0.22, "fh": 0.06, "intro": "外朝三大殿之一，清代除夕赐宴、殿试之所。" },
  { "id": "zhonghe",  "name": "中和殿",   "fx": 0.43, "fy": 0.43, "fw": 0.14, "fh": 0.05, "intro": "三大殿居中的方形小殿，皇帝大典前在此休憩、接受朝拜。" },
  { "id": "taihe",    "name": "太和殿",   "fx": 0.36, "fy": 0.49, "fw": 0.28, "fh": 0.09, "intro": "俗称金銮殿，紫禁城等级最高的建筑，登基、大婚、册封等国家大典在此举行。" },
  { "id": "taihemen", "name": "太和门",   "fx": 0.40, "fy": 0.60, "fw": 0.20, "fh": 0.04, "intro": "外朝正门，前有金水河与五座石桥，清初曾在此‘御门听政’。" },
  { "id": "wumen",    "name": "午门",     "fx": 0.40, "fy": 0.70, "fw": 0.20, "fh": 0.07, "intro": "紫禁城正门，平面呈凹形，五凤楼高耸，颁朔、献俘等典礼在此举行。" },
  { "id": "duanmen",  "name": "端门",     "fx": 0.43, "fy": 0.88, "fw": 0.14, "fh": 0.06, "intro": "午门以南的城门，明清存放皇帝仪仗，连接天安门与紫禁城。" }
]
```

- [ ] **Step 2: index.html 加入介绍卡 DOM + 样式**

在 `<div id="error"></div>` 后加：
```html
  <div id="poi-card" style="display:none">
    <button id="poi-close" aria-label="关闭">×</button>
    <h2 id="poi-name"></h2>
    <p id="poi-intro"></p>
  </div>
```
在 `<style>` 内追加：
```css
    #poi-card { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
      width: min(520px, calc(100% - 32px)); background: rgba(28,20,16,.94); color: #f5e6c8;
      border: 1px solid #8a6a3a; border-radius: 12px; padding: 16px 20px;
      font: 15px/1.7 system-ui, sans-serif; box-shadow: 0 8px 32px rgba(0,0,0,.5); }
    #poi-card h2 { margin: 0 0 6px; font-size: 20px; color: #f0c869; }
    #poi-card p { margin: 0; }
    #poi-close { position: absolute; top: 8px; right: 12px; background: none; border: none;
      color: #f5e6c8; font-size: 22px; cursor: pointer; line-height: 1; }
```

- [ ] **Step 3: src/game.js 加载热点、高亮、点击弹卡**

在 import 行加入 poi-logic：
```js
import { denormalizePois, nearestPoi, pointInPoi } from './poi-logic.js';
```
在 `main()` 内、`WORLD` 赋值之后、ticker 之前加入：
```js
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
```
在 ticker 回调末尾（设置 world 变换之后）加入高亮重绘：
```js
    const near = nearestPoi(player.x, player.y, pois, HILITE_RADIUS);
    highlight.clear();
    if (near) {
      highlight.rect(near.x, near.y, near.w, near.h)
        .stroke({ width: 3, color: 0xf0c869, alpha: 0.9 });
    }
```

- [ ] **Step 4: 浏览器验证 + 坐标标定**

临时在 `pointertap` 回调首行加一行打印世界归一化坐标，用于校准：
```js
    console.log('frac', (wp.x / WORLD.w).toFixed(3), (wp.y / WORLD.h).toFixed(3));
```
Run: `python3 -m http.server 8000`，刷新页面。
Expected / 操作：
- 走到太和殿等建筑附近时，该建筑出现金色高亮框。
- 点击建筑弹出对应名称与介绍卡；点 × 关闭。
- 若高亮框 / 命中区与实际建筑有偏差：点击建筑实际位置，读 Console 打印的 `frac` 值，回填 `assets/pois.json` 的 `fx,fy`（并按建筑大小调 `fw,fh`），刷新再验，直到 12 座基本对齐。
- 校准完成后**删除**这行 `console.log`。

- [ ] **Step 5: Commit**

```bash
git add assets/pois.json index.html src/game.js
git commit -m "feat: POI data, proximity highlight, click info card"
```

---

### Task 6: 手机虚拟摇杆

**Files:**
- Modify: `index.html`（摇杆 DOM + 样式）
- Modify: `src/game.js`（触摸输入接入移动向量）

**Interfaces:**
- Consumes: Task 3 的移动逻辑（改为读 `input` 向量而非仅键盘）。
- Produces: 无（终端功能）。

- [ ] **Step 1: index.html 加摇杆 DOM + 样式**

在 `#poi-card` 之后加：
```html
  <div id="joy"><div id="joy-knob"></div></div>
```
`<style>` 内追加：
```css
    #joy { position: fixed; left: 24px; bottom: 24px; width: 120px; height: 120px;
      border-radius: 50%; background: rgba(245,230,200,.12); border: 1px solid rgba(245,230,200,.3);
      touch-action: none; display: none; }
    #joy-knob { position: absolute; left: 35px; top: 35px; width: 50px; height: 50px;
      border-radius: 50%; background: rgba(240,200,105,.7); }
    @media (pointer: coarse) { #joy { display: block; } }
```

- [ ] **Step 2: src/game.js 接入触摸摇杆**

在模块作用域加共享输入向量：
```js
const input = { x: 0, y: 0 };
```
在 `main()` 内（事件监听附近）加摇杆逻辑：
```js
  const joy = document.getElementById('joy');
  const knob = document.getElementById('joy-knob');
  let joyId = null;
  const R = 35; // 摇杆半径
  function joyStart(e) {
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
```
修改 ticker 内移动段，让键盘与摇杆合并：
```js
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
```

- [ ] **Step 3: 验证（桌面用 DevTools 设备模拟）**

Run: `python3 -m http.server 8000`，DevTools 开启移动设备模拟（触摸）。
Expected: 左下出现摇杆；拖动摇杆小人朝对应方向移动；松手回中、停止；点击建筑仍能弹卡。

- [ ] **Step 4: Commit**

```bash
git add index.html src/game.js
git commit -m "feat: mobile virtual joystick"
```

---

### Task 7: 资产加载错误处理

**Files:**
- Modify: `src/game.js`（`main()` 包 try/catch，失败显示错误横幅）

**Interfaces:**
- Consumes: `#error` DOM（Task 1 已建）。
- Produces: 无。

- [ ] **Step 1: 包裹 main() 错误处理**

把 `main();` 改为：
```js
main().catch((err) => {
  console.error(err);
  const el = document.getElementById('error');
  el.textContent = '加载失败：地图或数据未能载入。请确认通过 http 服务打开（而非直接双击文件），并重试。';
  el.style.display = 'flex';
});
```
并在 `fetch('./assets/pois.json')` 后加状态校验：
```js
  const res = await fetch('./assets/pois.json');
  if (!res.ok) throw new Error('pois.json ' + res.status);
  const rawPois = await res.json();
```
（替换 Task 5 中直接 `.then(r=>r.json())` 的那行。）

- [ ] **Step 2: 验证**

临时把 `Assets.load('./assets/map.png')` 改成不存在的路径，刷新。
Expected: 页面中央显示中文错误横幅，不是空白。验证后改回正确路径。

- [ ] **Step 3: Commit**

```bash
git add src/game.js
git commit -m "feat: graceful asset load error handling"
```

---

## Self-Review

**Spec coverage：**
- 美术/性能（单图降采样 3072）→ Task 1 ✓
- 移动 + 镜头跟随 + 边界 → Task 2（逻辑）+ Task 3（集成）✓
- 缩放：spec 列了滚轮/双指缩放，但 v1 固定 `zoom=1.4` 已足够漫游；**可变缩放降级为 v2**（见下），在此显式标注以免被当成遗漏。
- 12 座中轴线热点 + 走近高亮 + 点击弹卡 → Task 4（逻辑）+ Task 5（集成）✓
- 手机摇杆 → Task 6 ✓
- 手绘风小人（不用 PixelLab）→ Task 3 的 `makePlayer()`（Pixi Graphics 平涂）✓
- 数据驱动 `pois.json` → Task 5 ✓
- 错误处理（加载失败提示、缺字段不崩）→ Task 7（加载失败）✓；缺字段：`denormalizePois`/渲染对缺失 `intro` 等只会显示空字符串，不崩溃 ✓

**与 spec 的一处偏差（已决策）：** spec 第 2 节列了滚轮/双指缩放。为保 v1 最小可玩且避免缩放与镜头钳制/摇杆交互的复杂度，v1 用固定缩放 `zoom=1.4`，**可变缩放并入 v2**（与深度缩放瓦片一起做更自然）。其余 v1 范围全覆盖。

**Placeholder scan：** 无 TBD/TODO；每个代码步骤含完整代码；`pois.json` 给了真实估计坐标 + 明确的浏览器标定方法（非占位）。

**Type consistency：** `clampCamera` 七参签名在 Task 2 定义、Task 3 调用一致；`denormalizePois/nearestPoi/pointInPoi/poiCenter` 在 Task 4 定义、Task 5 按签名调用一致；`player/camera/zoom/WORLD` 由 Task 3 导出、Task 5 使用一致；`world.toLocal` 用于点击换算与容器变换自洽。
