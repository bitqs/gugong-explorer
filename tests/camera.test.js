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
