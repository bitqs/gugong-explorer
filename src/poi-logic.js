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
