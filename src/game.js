import { Application, Assets, Container, Sprite } from 'https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.mjs';

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
