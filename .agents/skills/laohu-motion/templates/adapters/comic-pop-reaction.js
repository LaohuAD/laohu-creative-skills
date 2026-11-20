(() => {
  const TYPE = "custom:comic-pop-reaction";
  const SOURCE_SCENE_ID = "13_pop";
  const FONTS = {
    caption: '900 32px "NotoSansSC-900"',
    impact: '900 56px "NotoSansSC-900"',
  };
  const CAPTION_MAX_WIDTH = 236;
  const IMPACT_MAX_WIDTH = 230;
  const PANELS = [[372, 132], [585, 132], [372, 350], [585, 350]];
  const SCHEMES = [
    { bg: '#9ccf3a', face: '#e0302a' },
    { bg: '#e0359a', face: '#f0902a' },
    { bg: '#2fc0b0', face: '#f27fb2' },
    { bg: '#f08a2a', face: '#f8d830' },
  ];
  const images = new Map();

  function fontWidth(ctx, value, font, spacing = 0) {
    ctx.save();
    ctx.font = font;
    const width = ctx.measureText(value).width + Math.max(0, [...value].length - 1) * spacing;
    ctx.restore();
    return width;
  }

  function loadImage(dataUrl) {
    if (images.has(dataUrl)) return Promise.resolve(images.get(dataUrl));
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0
        ? resolve(image)
        : reject(new Error("comic-pop-reaction poster image has empty dimensions"));
      image.onerror = () => reject(new Error("comic-pop-reaction poster image could not be decoded"));
      image.src = dataUrl;
    });
    images.set(dataUrl, promise);
    return promise.then((image) => {
      images.set(dataUrl, image);
      return image;
    });
  }

  function assertShortText(value, label, ctx, font, maxWidth, spacing = 0) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be non-empty text`);
    if (/[\r\n\u2028\u2029]/u.test(value)) throw new Error(`${label} must be one line`);
    const measuredWidthPx = fontWidth(ctx, value, font, spacing);
    if (measuredWidthPx > maxWidth) {
      throw new Error(`${label} measures ${measuredWidthPx.toFixed(1)}px; the fixed original layout allows at most ${maxWidth}px`);
    }
    return { text: value, measuredWidthPx, maxWidthPx: maxWidth, font };
  }

  function burst(cx, cy, r0, r1, n, seed) {
    const points = [];
    for (let index = 0; index < n * 2; index += 1) {
      const angle = index / (n * 2) * Math.PI * 2 + 0.1;
      const radius = index % 2
        ? r0 * (0.92 + window.U.hash(index, seed) * 0.12)
        : r1 * (0.85 + window.U.hash(index, seed + 1) * 0.3);
      points.push([cx + Math.cos(angle) * radius * 1.12, cy + Math.sin(angle) * radius * 0.8]);
    }
    return window.U.poly(points);
  }

  function drawImagePanels(ctx, image, timeSec) {
    const step = Math.floor(window.U.clamp(timeSec, 0, 9) * 11);
    for (let index = 0; index < PANELS.length; index += 1) {
      const [x, y] = PANELS[index];
      const scheme = SCHEMES[(index + step) % SCHEMES.length];
      const inner = { x: x + 4, y: y + 4, width: 198, height: 204 };
      const scale = Math.max(inner.width / image.naturalWidth, inner.height / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(inner.x, inner.y, inner.width, inner.height);
      ctx.clip();
      ctx.drawImage(image, inner.x + (inner.width - width) / 2, inner.y + (inner.height - height) / 2, width, height);
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = scheme.face;
      ctx.fillRect(inner.x, inner.y, inner.width, inner.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.strokeStyle = "#141414";
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, 206, 212);
    }
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(712, 140); ctx.lineTo(660, 222);
    ctx.moveTo(736, 140); ctx.lineTo(684, 222);
    ctx.stroke();
  }

  function drawCaption(ctx, caption) {
    ctx.save();
    ctx.fillStyle = "#f7d52c";
    ctx.fillRect(32, 32, 272, 70);
    ctx.strokeStyle = "#141414";
    ctx.lineWidth = 5;
    ctx.strokeRect(32, 32, 272, 70);
    ctx.font = FONTS.caption;
    ctx.fillStyle = "#141414";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(caption, 50, 70);
    ctx.restore();
  }

  function drawImpactWord(ctx, text, timeSec) {
    const cx = 222, cy = 690;
    const step = Math.floor(timeSec * 30);
    const jx = (window.U.hash(step, 3) - 0.5) * 16;
    const jy = (window.U.hash(step, 7) - 0.5) * 12;
    const rotation = (window.U.hash(step, 11) - 0.5) * 0.06;
    ctx.save();
    ctx.translate(cx + jx, cy + jy);
    ctx.rotate(rotation);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = "#f7d52c";
    ctx.fill(burst(cx, cy, 104, 140, 12, 5));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.08);
    ctx.font = FONTS.impact;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.letterSpacing = "2px";
    for (const [row, y] of [[0, -34], [1, 40]]) {
      ctx.lineWidth = 12;
      ctx.strokeStyle = "#141414";
      ctx.strokeText(text, row * 14 - 4, y + 5);
      ctx.fillStyle = "#141414";
      ctx.fillText(text, row * 14, y + 9);
      ctx.fillStyle = "#d8232a";
      ctx.fillText(text, row * 14 - 4, y + 5);
    }
    ctx.restore();
    ctx.restore();
  }

  async function ready() {
    const fontChecks = [
      document.fonts.check(FONTS.caption),
      document.fonts.check(FONTS.impact),
    ];
    if (fontChecks.some((loaded) => !loaded)) throw new Error("comic-pop-reaction requires its pinned local Noto Sans SC 900 font");
    const measureCtx = document.createElement("canvas").getContext("2d");
    const metrics = [];
    for (const object of (window.MOTION_SCENE?.objects || [])) {
      if (object.type !== TYPE) continue;
      const data = object.data || {};
      if (data.caption != null) metrics.push(assertShortText(data.caption, "parameters.caption", measureCtx, FONTS.caption, CAPTION_MAX_WIDTH));
      if (data.impactWord != null) metrics.push(assertShortText(data.impactWord, "parameters.impactWord", measureCtx, FONTS.impact, IMPACT_MAX_WIDTH, 2));
      if (data.posterImageDataUrl != null) {
        if (!/^data:image\/(?:png|jpeg|webp);base64,/u.test(data.posterImageDataUrl)) throw new Error("posterImage must be a prepared local PNG, JPEG, or WebP asset");
        await loadImage(data.posterImageDataUrl);
      }
    }
    window.MOTION_EVIDENCE ||= {};
    window.MOTION_EVIDENCE.comicPopReaction = {
      renderer: TYPE,
      originalFunction: `SCENES.${SOURCE_SCENE_ID}.draw`,
      fontMetrics: metrics,
      adaptations: { caption: "bounded measured single-line text", impactWord: "bounded measured single-line text", posterImage: "local image replacing each Warhol panel while retaining source panel timing and palette cycle" },
      calls: 0,
    };
    return { renderer: TYPE, loadedFonts: ["Bangers-400", "NotoSansSC-900"], posterImagesLoaded: images.size, fontMetrics: metrics };
  }

  const renderers = window.MOTION_RENDERERS || (window.MOTION_RENDERERS = {});
  if (renderers[TYPE]) throw new Error(`${TYPE} is already registered`);
  if (!window.SCENES?.[SOURCE_SCENE_ID] || typeof window.SCENES[SOURCE_SCENE_ID].draw !== "function") {
    throw new Error("comic-pop-reaction exact source scene was not loaded from its local closure");
  }
  renderers[TYPE] = (ctx, object, timeSec) => {
    const localTime = timeSec + (Number(object.data?.timeOffsetSec) || 0);
    const original = window.SCENES[SOURCE_SCENE_ID];
    original.draw(ctx, localTime, localTime);
    const data = object.data || {};
    if (data.posterImageDataUrl) {
      const image = images.get(data.posterImageDataUrl);
      if (!image || typeof image.then === "function") throw new Error("comic-pop-reaction poster image was not prepared before drawing");
      drawImagePanels(ctx, image, localTime);
    }
    if (data.caption != null) drawCaption(ctx, data.caption);
    if (data.impactWord != null) drawImpactWord(ctx, data.impactWord, localTime);
    if (window.MOTION_EVIDENCE?.comicPopReaction) window.MOTION_EVIDENCE.comicPopReaction.calls += 1;
  };
  window.MOTION_READY = ready;
})();
