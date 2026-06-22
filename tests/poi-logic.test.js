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
