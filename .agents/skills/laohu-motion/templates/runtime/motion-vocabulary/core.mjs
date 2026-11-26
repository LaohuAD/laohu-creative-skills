/** Shared adapter contract for the MIT Motion Prompt source packs.
 * Source cells stay isolated in one module per pack; this file only supplies
 * time mapping and aspect-preserving placement.
 */

export function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

export function mapLocalTime(localSeconds, cycleSeconds, timing = {}) {
  if (!Number.isFinite(localSeconds) || !Number.isFinite(cycleSeconds) || cycleSeconds <= 0) {
    throw new TypeError("localSeconds and a positive cycleSeconds must be finite numbers");
  }
  const mode = timing.mode ?? "loop";
  const lastCycleTime = Math.max(0, cycleSeconds - 1e-6);
  const t = Math.max(0, localSeconds);

  if (mode === "loop") return positiveModulo(t, cycleSeconds);
  if (mode === "once") return Math.min(t, lastCycleTime);
  if (mode === "hold") {
    const holdAt = timing.holdAtSeconds;
    if (!Number.isFinite(holdAt) || holdAt < 0 || holdAt >= cycleSeconds) {
      throw new TypeError("hold mode requires holdAtSeconds within the source cycle");
    }
    return Math.min(t, holdAt);
  }
  if (mode === "hold-exit") {
    const holdAt = timing.holdAtSeconds;
    const exitAt = timing.exitAtSeconds;
    const exitSource = timing.exitSourceSeconds;
    if (!Number.isFinite(holdAt) || !Number.isFinite(exitAt) || !Number.isFinite(exitSource)
        || holdAt < 0 || holdAt >= cycleSeconds || exitAt < holdAt || exitSource < holdAt || exitSource >= cycleSeconds) {
      throw new TypeError("hold-exit requires valid holdAtSeconds, exitAtSeconds and exitSourceSeconds");
    }
    const sourceTime = t < holdAt ? t : t < exitAt ? holdAt : exitSource + (t - exitAt);
    return Math.min(sourceTime, lastCycleTime);
  }
  throw new TypeError(`unsupported timing mode: ${mode}`);
}

export function drawContained(ctx, sourceWidth, sourceHeight, width, height, paint) {
  if (!ctx || typeof ctx.save !== "function" || typeof ctx.restore !== "function") {
    throw new TypeError("draw requires a CanvasRenderingContext2D-like context");
  }
  if (![sourceWidth, sourceHeight, width, height].every(Number.isFinite)
      || sourceWidth <= 0 || sourceHeight <= 0 || width <= 0 || height <= 0) {
    throw new TypeError("source and output dimensions must be positive finite numbers");
  }
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const left = (width - sourceWidth * scale) / 2;
  const top = (height - sourceHeight * scale) / 2;
  ctx.save();
  try {
    ctx.translate(left, top);
    ctx.scale(scale, scale);
    paint(ctx, sourceWidth, sourceHeight);
  } finally {
    ctx.restore();
  }
  return { scale, left, top, width: sourceWidth * scale, height: sourceHeight * scale };
}

export function createElementAdapter({ pack, elements, width, height, cycleSeconds, cells }) {
  const byNumber = new Map(elements.map((item) => [String(item.number).padStart(2, "0"), item]));
  return function createElement(number) {
    const key = String(number).padStart(2, "0");
    const item = byNumber.get(key);
    const cell = item && cells[Number(key) - 1];
    if (!item || typeof cell !== "function") throw new RangeError(`unknown ${pack} element: ${number}`);
    const draw = (ctx, outputWidth, outputHeight, localSeconds, timing = {}) => {
      const sourceSeconds = mapLocalTime(localSeconds, cycleSeconds, timing);
      return drawContained(ctx, width, height, outputWidth, outputHeight,
        (target, sourceWidth, sourceHeight) => {
          target.save();
          try {
            cell(target, sourceWidth, sourceHeight, sourceSeconds);
          } finally {
            target.restore();
          }
        });
    };
    return Object.freeze({
      id: item.id,
      pack,
      number: key,
      cycleSeconds,
      sourceSize: Object.freeze({ width, height }),
      draw,
    });
  };
}
