/*
 * Local transition renderer for the pinned huashu-art-motion transitions.
 * The source function remains authoritative for its own progress curve and
 * Canvas algorithm. This adapter only restores JSON-safe inputs such as lens
 * profiles, supplies per-instance scratch canvases, and records actual calls.
 */
(function (root) {
  "use strict";
  const RENDERER = "custom:laohu-motion-transition";
  const GROUPS = {
    "laohu-motion-fade": ["crossfade", "cut"],
    "laohu-motion-wipe": ["tiles", "cube", "mosaic", "pageTurn", "organic", "zigzag", "pixelate", "iris", "irisFilm", "flareSweep", "bands"],
    "laohu-motion-matchcut": ["matchCut"],
    "laohu-motion-whip": ["whip"],
    "laohu-motion-zoom": ["fillZoom", "zoomThrough", "blurPush"],
    "laohu-motion-shared": ["same", "lensReveal", "expandRect"],
    "laohu-motion-materialcut": ["godRays", "wave", "dabs", "swirl", "shards", "bauhaus", "wireframe", "goldLeaf", "screamWarp", "apsara", "dotBloom", "ripple", "pointill", "cutouts", "radiant", "lampGlow", "blueBrush", "melt", "sunShaft", "bleed", "vhs", "inkBloom", "redWedge", "comicPanels", "chiaroscuro"],
    "laohu-motion-impact": ["smash"],
    "laohu-motion-push": ["push", "slidePush", "fadeShift"],
  };
  const conditional = new Set(["same", "lensReveal", "matchCut", "fillZoom", "zoomThrough", "expandRect"]);
  const sourceOnly = {
    comicPanels: "TRANSITIONS.comicPanels calls PAINT.dotPattern, which is absent from the pinned PAINT closure.",
  };
  const easing = {
    smooth: () => root.MO.smooth,
    sineInOut: () => root.MO.sineInOut,
    expoOut: () => root.MO.expoOut,
    expoInOut: () => root.MO.expoInOut,
    appleOut: () => root.MO.appleOut,
    longTail: () => root.MO.longTail,
  };
  const frames = new Map();
  const scratch = new Map();
  const evidence = {
    schema: "laohu-transition-render/1",
    renderer: RENDERER,
    sourceFunctionReceiver: "window.TRANSITIONS",
    renderedInstances: [],
    calls: Object.create(null),
    callsByInstance: Object.create(null),
  };

  function fail(message) { throw new Error("Laohu transition: " + message); }
  function finite(value, label, minimum = -Infinity) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) fail(label + " must be finite and >= " + minimum);
    return value;
  }
  function object(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(label + " must be an object");
    return value;
  }
  function loadImage(dataUrl, label) {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) fail(label + " must be an embedded PNG data URL");
    const image = new Image();
    image.src = dataUrl;
    return image.decode().then(() => image);
  }
  function profileAt(profile, p) {
    if (!Array.isArray(profile) || profile.length < 2) fail("lensProfile requires at least two sampled circles");
    const rows = profile.map((item, index) => {
      object(item, "lensProfile[" + index + "]");
      const at = finite(item.at, "lensProfile[" + index + "].at", 0);
      const x = finite(item.x, "lensProfile[" + index + "].x");
      const y = finite(item.y, "lensProfile[" + index + "].y");
      const r = finite(item.r, "lensProfile[" + index + "].r", 0);
      return { at, x, y, r };
    });
    if (rows[0].at > 0 || rows.at(-1).at < 1) fail("lensProfile must cover normalized time [0,1]");
    for (let index = 1; index < rows.length; index += 1) if (rows[index].at <= rows[index - 1].at) fail("lensProfile.at values must increase strictly");
    return function lensAt(timeSec) {
      const q = Math.max(0, Math.min(1, timeSec / Math.max(1e-9, this.dur)));
      let right = rows.findIndex((row) => row.at >= q);
      if (right < 0) right = rows.length - 1;
      if (right === 0) return { x: rows[0].x, y: rows[0].y, r: rows[0].r };
      const a = rows[right - 1], b = rows[right], t = (q - a.at) / (b.at - a.at);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, r: a.r + (b.r - a.r) * t };
    };
  }
  function validateSpecial(method, parameters) {
    if (method === "same" && !(typeof parameters.continuityEvidence === "string" && parameters.continuityEvidence.trim())) {
      fail("same requires continuityEvidence describing why A and B are one continuous world/camera");
    }
    if (method === "matchCut" && !(typeof parameters.matchedCutEvidence === "string" && parameters.matchedCutEvidence.trim())) {
      fail("matchCut requires matchedCutEvidence that the A/B color or shape is matched across the cut");
    }
    if (method === "lensReveal" && !Array.isArray(parameters.lensProfile)) fail("lensReveal requires a lensProfile; no camera callback is synthesized");
    if (["fillZoom", "zoomThrough"].includes(method)) {
      finite(parameters.cx, method + ".cx"); finite(parameters.cy, method + ".cy");
    }
    if (method === "zoomThrough") {
      if (parameters.live === true) fail("zoomThrough live:true requires a live source-scene callback; only the source bitmap branch is connected");
      if (parameters.ease != null) {
        if (typeof parameters.ease !== "string" || !easing[parameters.ease]) fail("zoomThrough.ease must name one of " + Object.keys(easing).join(", "));
      }
    }
    if (method === "expandRect") {
      const rect = object(parameters.rect, "expandRect.rect");
      for (const key of ["x", "y", "w", "h"]) finite(rect[key], "expandRect.rect." + key, key === "w" || key === "h" ? Number.EPSILON : -Infinity);
    }
    if (method === "matchCut" && parameters.width != null) finite(parameters.width, "matchCut.width", Number.EPSILON);
  }
  function getScratch(id, width, height) {
    let canvas = scratch.get(id);
    if (!canvas) {
      canvas = document.createElement("canvas");
      scratch.set(id, canvas);
    }
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (typeof ctx.reset === "function") ctx.reset();
    else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height); }
    return canvas;
  }
  async function prepare(scene) {
    if (!root.TRANSITIONS || typeof root.TRANSITIONS !== "object") fail("pinned source library did not load window.TRANSITIONS");
    const rows = [];
    for (const row of scene.objects || []) {
      if (row.type !== RENDERER) continue;
      const data = object(row.data, "transition object data");
      const group = GROUPS[data.groupId];
      if (!group) fail("unknown canonical group ID " + data.groupId);
      if (!group.includes(data.method)) fail(data.method + " is not in " + data.groupId);
      if (sourceOnly[data.method]) fail(data.method + " remains source-only: " + sourceOnly[data.method]);
      if (typeof root.TRANSITIONS[data.method] !== "function") fail("original TRANSITIONS." + data.method + " did not load");
      const parameters = object(data.parameters || {}, data.method + ".parameters");
      validateSpecial(data.method, parameters);
      const source = object(data.sourceFrames, "sourceFrames");
      const [A, B] = await Promise.all([loadImage(source.A, "sourceFrames.A"), loadImage(source.B, "sourceFrames.B")]);
      if (A.width !== scene.width || A.height !== scene.height || B.width !== scene.width || B.height !== scene.height) fail("A/B source frame dimensions must exactly match the transition stage");
      frames.set(data.instanceId, { A, B });
      rows.push({ instanceId: data.instanceId, groupId: data.groupId, method: data.method, availability: conditional.has(data.method) ? "conditional" : "available", sourceMethod: "TRANSITIONS." + data.method });
    }
    evidence.renderedInstances = rows;
    return true;
  }
  function drawIris(ctx, { instanceId, timeSec, durationSec, progress, A, B, width, height, cx, cy }) {
    if (!root.TRANSITIONS || typeof root.TRANSITIONS.iris !== "function") fail("pinned source method TRANSITIONS.iris did not load");
    const id = typeof instanceId === "string" && instanceId ? instanceId : "laohu-motion-canonical-beat-iris";
    const stageWidth = finite(width, "iris stage width", 1), stageHeight = finite(height, "iris stage height", 1);
    const duration = finite(durationSec, "iris transitionDurationSec", Number.EPSILON);
    const sourceProgress = Math.max(0, Math.min(1, finite(progress, "iris source progress", 0)));
    const options = {
      W: stageWidth,
      H: stageHeight,
      lt: sourceProgress * duration,
      t: sourceProgress * duration,
      dur: duration,
      id,
      tmp: getScratch(id, stageWidth, stageHeight),
      cx,
      cy,
    };
    Reflect.apply(root.TRANSITIONS.iris, root.TRANSITIONS, [ctx, A, B, sourceProgress, options]);
    evidence.calls.iris = (evidence.calls.iris || 0) + 1;
    const instanceCalls = evidence.callsByInstance[id] || (evidence.callsByInstance[id] = { method: "iris", calls: 0, timeSec: [] });
    instanceCalls.calls += 1;
    instanceCalls.timeSec.push(timeSec);
    return { sourceId: "huashu-art-motion", sourceMethod: "TRANSITIONS.iris", timeSec, progress: sourceProgress, instanceId: id };
  }
  function register(renderers) {
    if (!renderers || typeof renderers !== "object") fail("renderer registry must be an object");
    renderers[RENDERER] = function renderTransition(ctx, objectRow, timeSec, scene) {
      const data = object(objectRow.data, "transition object data");
      const pair = frames.get(data.instanceId);
      if (!pair) fail("no decoded source frames for " + data.instanceId);
      const outputFrameIndex = data.outputFrameIndex;
      if (outputFrameIndex != null && Math.round(timeSec * scene.fps) !== outputFrameIndex) return;
      const duration = finite(data.transitionDurationSec, "transitionDurationSec", Number.EPSILON);
      const p = Math.max(0, Math.min(1, finite(data.progress, "transition frame progress", 0)));
      const parameters = { ...(data.parameters || {}) };
      const options = {
        ...parameters,
        W: scene.width,
        H: scene.height,
        lt: p * duration,
        t: p * duration,
        dur: parameters.dur == null ? duration : parameters.dur,
        id: data.instanceId,
        tmp: getScratch(data.instanceId, scene.width, scene.height),
      };
      if (data.method === "lensReveal") {
        const lens = profileAt(parameters.lensProfile, p);
        options.lens = (t) => lens.call({ dur: duration }, t);
        options.ring = parameters.ring;
        options.ring2 = parameters.ring2;
      }
      if (data.method === "zoomThrough" && typeof parameters.ease === "string") options.ease = easing[parameters.ease]();
      const method = root.TRANSITIONS[data.method];
      method(ctx, pair.A, pair.B, p, options);
      evidence.calls[data.method] = (evidence.calls[data.method] || 0) + 1;
      const instanceCalls = evidence.callsByInstance[data.instanceId] || (evidence.callsByInstance[data.instanceId] = { method: data.method, calls: 0, timeSec: [] });
      instanceCalls.calls += 1;
      instanceCalls.timeSec.push(timeSec);
    };
    root.LaohuMotionTransitions = {
      id: "laohu-motion-transitions",
      sourceId: "huashu-art-motion",
      sourceMethodCount: Object.keys(root.TRANSITIONS || {}).length,
      groupIds: Object.keys(GROUPS),
      register,
      prepare,
      drawIris,
      evidence,
    };
    root.MOTION_RENDERERS = renderers;
    root.MOTION_EVIDENCE ||= {};
    const previousReady = root.MOTION_READY;
    root.MOTION_READY = async function () {
      if (previousReady != null) {
        const previous = typeof previousReady === "function" ? previousReady() : previousReady;
        if (await previous === false) return false;
      }
      return prepare(root.MOTION_SCENE);
    };
    root.MOTION_TRANSITION_EVIDENCE = evidence;
    return { renderer: RENDERER, methods: Object.keys(GROUPS) };
  }
  root.LaohuMotionTransitions = { id: "laohu-motion-transitions", sourceId: "huashu-art-motion", groupIds: Object.keys(GROUPS), register, drawIris };
})(typeof window !== "undefined" ? window : globalThis);
