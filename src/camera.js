export function clampCamera(playerX, playerY, viewW, viewH, worldW, worldH, zoom) {
  const visW = viewW / zoom;
  const visH = viewH / zoom;
  let x = playerX - visW / 2;
  let y = playerY - visH / 2;
  x = worldW <= visW ? (worldW - visW) / 2 : Math.max(0, Math.min(x, worldW - visW));
  y = worldH <= visH ? (worldH - visH) / 2 : Math.max(0, Math.min(y, worldH - visH));
  return { x, y };
}
