/*
 * Source-adapted local renderer for selected Garden motion recipes.
 * Upstream identity: garden-skills, commit 2b9a89340b70f632d31c0f1c69fce94a7912423e, MIT.
 * The recipe bodies and helper semantics are adapted from the pinned recipes.md and motion.js;
 * this file keeps the actual browser consumer local and has no network/cache dependency.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../../scripts/motion-ops.js"), root);
  } else {
    root.LaohuMotionRecipes = factory(root.MotionOps, root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (motionOps, root) {
  "use strict";

  const OBJECT_TYPE = "custom:laohu-motion-recipes";
  const POST_RENDERER = "custom:laohu-motion-postprocess";
  const SOURCE_ID = "garden-motion-showreel";
  const SOURCE_COMMIT = "2b9a89340b70f632d31c0f1c69fce94a7912423e";
  const METHOD_IDS = Object.freeze([
    "masked-text-replacement", "leading-trailing-stretch", "shape-state-chain", "cursor-driven",
    "zoom-through", "wipe-reveal", "particle-text", "stateless-emitter", "counter-impact",
    "svg-stroke", "seamless-loop", "webgl-crt-post", "temporal-ghosts", "canonical-beat-reveal",
    "canvas-perspective-boxes",
  ]);
  const TYPE_BY_RECIPE = Object.freeze(Object.fromEntries(METHOD_IDS.map((id) => [id, id === "webgl-crt-post" ? POST_RENDERER : OBJECT_TYPE])));
  const PARAMETER_KEYS = Object.freeze({
    "masked-text-replacement": ["items"],
    "leading-trailing-stretch": ["moves", "y", "width", "height", "color"],
    "shape-state-chain": ["states", "times", "colors", "labels", "labelColor", "labelFont", "labelSize"],
    "cursor-driven": ["points", "pressIntervals", "track", "snapSec", "color", "outline", "trackColor"],
    "zoom-through": ["startSec", "durationSec", "targetX", "targetY", "zoom", "from", "to"],
    "wipe-reveal": ["startSec", "durationSec", "slant", "from", "to"],
    "particle-text": ["text", "font", "width", "height", "step", "formSec", "burstSec", "color", "particleSize"],
    "stateless-emitter": ["origin", "rate", "life", "speed", "gravity", "seed", "startSec", "endSec", "color", "size"],
    "counter-impact": ["startSec", "durationSec", "from", "to", "x", "y", "font", "fontSize", "color", "impactDecaySec"],
    "svg-stroke": ["pathData", "startSec", "durationSec", "x", "y", "lineWidth", "color", "lineCap"],
    "seamless-loop": ["durationSec", "count", "radius", "size", "harmonic", "centerX", "centerY", "color", "ellipseY"],
    "webgl-crt-post": ["hitEventIds", "hitDecaySec"],
    "temporal-ghosts": ["mover", "samples", "stepSec", "opacity"],
    "canonical-beat-reveal": ["eventIds", "revealOnEventId", "transitionDurationSec", "revealProgress", "from", "to", "centerX", "centerY", "punchScale", "punchDecaySec"],
    "canvas-perspective-boxes": ["boxes", "camera"],
  });
  const EVIDENCE_KEY = "MOTION_RECIPE_EVIDENCE";
  const sampledTextCache = new WeakMap();
  const postprocessCache = new WeakMap();
  const audioEventCache = new WeakMap();
  const svgBitmapCache = new Map();
  const sourceFrameBitmapCache = new Map();
  const MAX_SOURCE_SEQUENCE_BITMAP_BYTES = 64 * 1024 * 1024;
  const sourceSequenceBitmapLRU = new Map();
  let sourceSequenceDecodedBytes = 0;
  let sourceSequencePeakDecodedBytes = 0;
  let sourceSequenceCacheHits = 0;
  let sourceSequenceCacheMisses = 0;
  let sourceSequenceEvictions = 0;
  let sourceSequencePinnedKeys = null;
  const TAU = Math.PI * 2;
  // TRANSITIONS.iris has an inner B radius of 19 + 2451*p - 411.
  // Map the canonical hit to a 2px radius so the center pixel is fully inside
  // B after Canvas antialiasing; the previous encoded frame remains below zero.
  const SOURCE_IRIS_HIT_PROGRESS = (411 + 2 - 19) / (1159 - 19 + 3 * 137 + 900);
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (t, a, b) => { const d = b - a; return d > 0 && Number.isFinite(d) ? clamp((t - a) / d) : (t >= a ? 1 : 0); };
  const ease = {
    linear: (x) => x,
    inCubic: (x) => x ** 3,
    outCubic: (x) => 1 - (1 - x) ** 3,
    inOutCubic: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
    inExpo: (x) => (x <= 0 ? 0 : 2 ** (10 * x - 10)),
    outExpo: (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
    inOutExpo: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2),
  };

  // These are the source motion.js response functions: spring input is elapsed seconds;
  // springTo starts from keys[0][1] and adds each later target delta independently.
  function spring(x, { freq = 2.4, damp = 0.75 } = {}) {
    if (x <= 0) return 0;
    const w = TAU * freq;
    if (damp >= 1) return 1 - Math.exp(-w * x) * (1 + w * x);
    const wd = w * Math.sqrt(1 - damp * damp);
    return 1 - Math.exp(-damp * w * x) * (Math.cos(wd * x) + (damp * w / wd) * Math.sin(wd * x));
  }
  function springTo(t, keys, opts) {
    const arrayValue = Array.isArray(keys[0][1]);
    let value = arrayValue ? keys[0][1].slice() : keys[0][1];
    for (let i = 1; i < keys.length; i += 1) {
      const [ti, target, options] = keys[i];
      const amount = spring(t - ti, options || opts);
      const previous = keys[i - 1][1];
      if (arrayValue) for (let index = 0; index < value.length; index += 1) value[index] += (target[index] - previous[index]) * amount;
      else value += (target - previous) * amount;
    }
    return value;
  }
  function tween(t, keys, defaultEase = ease.inOutCubic) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i += 1) {
      const [t1, v1, e1] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        const amount = (e1 || defaultEase)(seg(t, t0, t1));
        return Array.isArray(v0) ? v0.map((value, index) => lerp(value, v1[index], amount)) : lerp(v0, v1, amount);
      }
    }
    return keys[keys.length - 1][1];
  }
  function pulse(t, times, decay = 0.18, attack = 0.012) {
    let value = 0;
    for (const hit of Array.isArray(times) ? times : [times]) {
      const delta = t - hit;
      if (delta >= -attack && delta < decay * 6) value += delta < 0 ? 1 + delta / attack : Math.exp(-delta / decay);
    }
    return value;
  }
  function hash(n, seed = 0) {
    let value = Math.imul((n | 0) ^ Math.imul(seed | 0, 0x9E3779B1), 0x85EBCA6B);
    value ^= value >>> 13; value = Math.imul(value, 0xC2B2AE35); value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
  }
  const fade5 = (x) => x * x * x * (x * (x * 6 - 15) + 10);
  function noise1(x, seed = 0) {
    const index = Math.floor(x), fraction = x - index;
    return lerp(hash(index, seed), hash(index + 1, seed), fade5(fraction));
  }
  function rng(seed = 1) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
      value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }
  function mixHex(a, b, amount) {
    const parse = (value) => {
      const raw = value.replace(/^#/, "");
      const expanded = raw.length === 3 ? [...raw].map((char) => char + char).join("") : raw;
      return [0, 2, 4].map((index) => parseInt(expanded.slice(index, index + 2), 16) / 255);
    };
    const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const gamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
    const toLab = ([r, g, b]) => {
      [r, g, b] = [r, g, b].map(linear);
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
      const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969568 * b);
      const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
      return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
    };
    const fromLab = ([L, A, B]) => {
      const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
      const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
      const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
      return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((c) => clamp(gamma(c)));
    };
    const A = toLab(parse(a)), B = toLab(parse(b));
    const rgb = fromLab(A.map((value, index) => lerp(value, B[index], clamp(amount)))).map((value) => Math.round(value * 255));
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }
  function finite(value, label, min = -Infinity, max = Infinity) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new TypeError(`${label} must be a finite number in [${min}, ${max}]`);
    return value;
  }
  function stableId(value, label) {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) throw new TypeError(`${label} must be a stable ID`);
    return value;
  }
  function hex(value, label) {
    if (typeof value !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) throw new TypeError(`${label} must be a #RGB or #RRGGBB color`);
  }
  function array(value, label, min = 1) {
    if (!Array.isArray(value) || value.length < min) throw new TypeError(`${label} must be an array with at least ${min} item(s)`);
    return value;
  }
  function onlyKeys(value, allowed, label) {
    const set = allowed instanceof Set ? allowed : new Set(allowed);
    for (const key of Object.keys(value)) if (!set.has(key)) throw new Error(`${label}.${key} is not consumed by this Garden recipe`);
  }
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = (u) => ((ax * u + bx) * u + cx) * u;
    const Y = (u) => ((ay * u + by) * u + cy) * u;
    const dX = (u) => (3 * ax * u + 2 * bx) * u + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let u = x;
      for (let index = 0; index < 6; index += 1) {
        const derivative = dX(u);
        if (Math.abs(derivative) < 1e-6) break;
        u -= (X(u) - x) / derivative;
      }
      return Y(clamp(u));
    };
  }
  const snap = bezier(0.7, 0, 0.2, 1);
  function timeKeys(keys, label, min = 1, maxWidth = 2) {
    array(keys, label, min);
    let previous = -Infinity;
    for (const [index, row] of keys.entries()) {
      if (!Array.isArray(row) || row.length < 2 || row.length > maxWidth) throw new TypeError(`${label}[${index}] must be a [time,value${maxWidth > 2 ? ",optionalEase" : ""}] row`);
      finite(row[0], `${label}[${index}][0]`, 0);
      if (row[0] <= previous) throw new RangeError(`${label} times must be strictly increasing`);
      previous = row[0];
    }
  }
  function collectAudioEvents(scene) {
    if (!motionOps?.findSceneAudioEvents) throw new Error("Garden beat/post recipes require the canonical MotionOps event resolver");
    if (!audioEventCache.has(scene)) audioEventCache.set(scene, motionOps.findSceneAudioEvents(scene));
    return audioEventCache.get(scene);
  }
  function instanceRows(scene) {
    const rows = [];
    for (const object of scene.objects || []) {
      if (object?.type !== OBJECT_TYPE) continue;
      const instances = object.data?.motionRecipes;
      array(instances, `${object.id}.data.motionRecipes`);
      for (const instance of instances) rows.push({ ownerId: object.id, instance });
    }
    return rows;
  }
  function validateInstance(instance, owner, scene) {
    if (!instance || typeof instance !== "object" || Array.isArray(instance)) throw new TypeError(`${owner} garden recipe must be an object`);
    onlyKeys(instance, ["id", "recipeId", "parameters"], `${owner}.motionRecipes[]`);
    const id = stableId(instance.id, `${owner}.motionRecipes[].id`);
    const recipeId = stableId(instance.recipeId, `${owner}.${id}.recipeId`);
    if (!METHOD_IDS.includes(recipeId)) throw new Error(`${owner}.${id}.recipeId is not a known source recipe: ${recipeId}`);
    if (recipeId === "webgl-crt-post") throw new Error(`${owner}.${id} must declare scene.motionPostProcessing[] so WebGL runs after MotionCore and before frame capture`);
    const parameters = instance.parameters;
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw new TypeError(`${owner}.${id}.parameters must be an object`);
    onlyKeys(parameters, PARAMETER_KEYS[recipeId], `${owner}.${id}.parameters`);
    if (recipeId === "masked-text-replacement") {
      array(parameters.items, `${id}.items`);
      for (const [index, item] of parameters.items.entries()) {
        onlyKeys(item, ["text", "x", "baseY", "size", "font", "color", "startSec", "gap", "exitSec"], `${id}.items[${index}]`);
        if (!item || typeof item.text !== "string" || !item.text.length) throw new TypeError(`${id}.items[${index}].text must be non-empty text`);
        for (const key of ["x", "baseY", "size", "startSec"]) finite(item[key], `${id}.items[${index}].${key}`, key === "size" ? 1 : 0);
        if (item.exitSec != null) finite(item.exitSec, `${id}.items[${index}].exitSec`, item.startSec);
        if (item.gap != null) finite(item.gap, `${id}.items[${index}].gap`, 0, 1);
        if (item.font != null && (typeof item.font !== "string" || !item.font.trim())) throw new TypeError(`${id}.items[${index}].font must be a Canvas font shorthand`);
        hex(item.color || "#111111", `${id}.items[${index}].color`);
      }
      const sorted = [...parameters.items].sort((a, b) => a.startSec - b.startSec);
      for (let index = 1; index < sorted.length; index += 1) {
        const prior = sorted[index - 1], priorChars = [...prior.text].length;
        if (prior.exitSec == null) throw new Error(`${id}.items[${index - 1}] must exit before a replacement item begins`);
        const exitEnd = prior.exitSec + Math.max(0, priorChars - 1) * (prior.gap || 0.045) * 0.6 + 0.25;
        if (sorted[index].startSec < exitEnd) throw new Error(`${id} old text exit must finish before new text enters; overlapping text is rejected`);
      }
    } else if (recipeId === "leading-trailing-stretch") {
      timeKeys(parameters.moves, `${id}.moves`, 2);
      for (const [index, move] of parameters.moves.entries()) finite(move[1], `${id}.moves[${index}][1]`);
      for (const key of ["y", "width", "height"]) finite(parameters[key], `${id}.${key}`, key === "width" || key === "height" ? 0.01 : -Infinity);
      hex(parameters.color || "#111111", `${id}.color`);
    } else if (recipeId === "shape-state-chain") {
      array(parameters.states, `${id}.states`, 2); array(parameters.times, `${id}.times`, 2);
      let previousTime = -Infinity;
      for (const [index, time] of parameters.times.entries()) {
        finite(time, `${id}.times[${index}]`, 0);
        if (time <= previousTime) throw new RangeError(`${id}.times must be strictly increasing`);
        previousTime = time;
      }
      if (parameters.states.length !== parameters.times.length || parameters.colors?.length !== parameters.states.length) throw new Error(`${id} requires one time and color per shape state`);
      parameters.states.forEach((state, index) => {
        if (!Array.isArray(state) || state.length !== 5) throw new TypeError(`${id}.states[${index}] must be [x,y,width,height,radius]`);
        state.forEach((value, field) => finite(value, `${id}.states[${index}][${field}]`));
      });
      parameters.colors.forEach((color, index) => hex(color, `${id}.colors[${index}]`));
      if (parameters.labels != null && (!Array.isArray(parameters.labels) || parameters.labels.length !== parameters.states.length || parameters.labels.some((label) => typeof label !== "string"))) throw new TypeError(`${id}.labels must contain one string per shape state`);
      if (parameters.labelColor != null) hex(parameters.labelColor, `${id}.labelColor`);
      if (parameters.labelFont != null && (typeof parameters.labelFont !== "string" || !parameters.labelFont.trim())) throw new TypeError(`${id}.labelFont must be a Canvas font shorthand`);
      if (parameters.labelSize != null) finite(parameters.labelSize, `${id}.labelSize`, 1);
    } else if (recipeId === "cursor-driven") {
      timeKeys(parameters.points, `${id}.points`, 2, 3);
      parameters.points.forEach((point, index) => {
        if (!Array.isArray(point[1]) || point[1].length !== 2) throw new TypeError(`${id}.points[${index}][1] must be [x,y]`);
        point[1].forEach((value, axis) => finite(value, `${id}.points[${index}][1][${axis}]`));
        if (point[2] != null && !ease[point[2]]) throw new Error(`${id}.points[${index}] uses an unsupported ease`);
      });
      array(parameters.pressIntervals || [], `${id}.pressIntervals`, 0);
      for (const [index, interval] of (parameters.pressIntervals || []).entries()) {
        if (!Array.isArray(interval) || interval.length !== 2 || finite(interval[1], `${id}.pressIntervals[${index}][1]`, 0) <= finite(interval[0], `${id}.pressIntervals[${index}][0]`, 0)) throw new TypeError(`${id}.pressIntervals[${index}] must be [start,end]`);
      }
      if (parameters.track) {
        onlyKeys(parameters.track, ["x", "y", "width", "height"], `${id}.track`);
        for (const key of ["x", "y", "width", "height"]) finite(parameters.track[key], `${id}.track.${key}`);
        if (parameters.track.width <= 0 || parameters.track.height <= 0) throw new RangeError(`${id}.track size must be positive`);
      }
    } else if (recipeId === "zoom-through") {
      for (const key of ["startSec", "durationSec", "targetX", "targetY", "zoom"]) finite(parameters[key], `${id}.${key}`, key === "durationSec" || key === "zoom" ? 0.001 : -Infinity);
      if (parameters.zoom <= 1) throw new RangeError(`${id}.zoom must exceed one`);
      validatePanel(parameters.from, `${id}.from`); validatePanel(parameters.to, `${id}.to`);
    } else if (recipeId === "wipe-reveal") {
      for (const key of ["startSec", "durationSec", "slant"]) finite(parameters[key], `${id}.${key}`, key === "durationSec" ? 0.001 : -Infinity);
      validatePanel(parameters.from, `${id}.from`); validatePanel(parameters.to, `${id}.to`);
    } else if (recipeId === "particle-text") {
      if (typeof parameters.text !== "string" || !parameters.text.length) throw new TypeError(`${id}.text must be non-empty text`);
      for (const key of ["font", "width", "height", "step"]) {
        if (key === "font" && (typeof parameters.font !== "string" || !parameters.font.trim())) throw new TypeError(`${id}.font must be a Canvas font shorthand`);
        else if (key !== "font") {
          finite(parameters[key], `${id}.${key}`, 1);
          if (!Number.isInteger(parameters[key])) throw new TypeError(`${id}.${key} must be an integer pixel count`);
        }
      }
      for (const key of ["formSec", "burstSec"]) finite(parameters[key], `${id}.${key}`, 0);
      if (parameters.particleSize != null) finite(parameters.particleSize, `${id}.particleSize`, 0.1);
      hex(parameters.color || "#111111", `${id}.color`);
    } else if (recipeId === "stateless-emitter") {
      if (!Array.isArray(parameters.origin) || parameters.origin.length !== 2) throw new TypeError(`${id}.origin must be [x,y]`);
      parameters.origin.forEach((value, index) => finite(value, `${id}.origin[${index}]`));
      for (const key of ["rate", "life", "speed", "gravity", "seed", "startSec"]) finite(parameters[key], `${id}.${key}`, key === "rate" || key === "life" ? 0.001 : 0);
      if (parameters.rate > 1200) throw new RangeError(`${id}.rate may not exceed 1200 particles per second`);
      if (parameters.endSec != null) finite(parameters.endSec, `${id}.endSec`, parameters.startSec);
      hex(parameters.color || "#111111", `${id}.color`);
    } else if (recipeId === "counter-impact") {
      for (const key of ["startSec", "durationSec", "from", "to", "x", "y", "fontSize"]) finite(parameters[key], `${id}.${key}`, key === "durationSec" || key === "fontSize" ? 0.001 : -Infinity);
      if (!Number.isSafeInteger(parameters.from) || !Number.isSafeInteger(parameters.to)) throw new TypeError(`${id}.from and .to must be safe integers`);
      if (typeof parameters.font !== "string" || !parameters.font.trim()) throw new TypeError(`${id}.font must be a Canvas font shorthand`);
      if (parameters.impactDecaySec != null) finite(parameters.impactDecaySec, `${id}.impactDecaySec`, 0.001);
      hex(parameters.color || "#111111", `${id}.color`);
    } else if (recipeId === "svg-stroke") {
      if (typeof parameters.pathData !== "string" || !parameters.pathData.trim()) throw new TypeError(`${id}.pathData must be an SVG path d string`);
      for (const key of ["startSec", "durationSec", "x", "y", "lineWidth"]) finite(parameters[key], `${id}.${key}`, key === "durationSec" || key === "lineWidth" ? 0.001 : -Infinity);
      if (parameters.lineCap != null && !["butt", "round", "square"].includes(parameters.lineCap)) throw new TypeError(`${id}.lineCap must be butt, round, or square`);
      hex(parameters.color || "#111111", `${id}.color`);
    } else if (recipeId === "seamless-loop") {
      for (const key of ["durationSec", "count", "radius", "size", "harmonic"]) finite(parameters[key], `${id}.${key}`, 0.001);
      if (!Number.isInteger(parameters.count) || parameters.count > 1000 || !Number.isInteger(parameters.harmonic)) throw new TypeError(`${id}.count and .harmonic must be bounded integers`);
      finite(parameters.centerX, `${id}.centerX`); finite(parameters.centerY, `${id}.centerY`); hex(parameters.color || "#111111", `${id}.color`);
    } else if (recipeId === "canonical-beat-reveal") {
      array(parameters.eventIds, `${id}.eventIds`);
      parameters.eventIds.forEach((eventId, index) => stableId(eventId, `${id}.eventIds[${index}]`));
      stableId(parameters.revealOnEventId, `${id}.revealOnEventId`);
      if (!parameters.eventIds.includes(parameters.revealOnEventId)) throw new Error(`${id}.revealOnEventId must be one of its canonical eventIds`);
      validatePanel(parameters.from, `${id}.from`); validatePanel(parameters.to, `${id}.to`);
      if (parameters.from.type !== "source-frame" || parameters.to.type !== "source-frame") throw new Error(`${id} requires explicit frozen full-stage source-frame PNG inputs for the pinned TRANSITIONS.iris consumer`);
      for (const key of ["transitionDurationSec", "revealProgress", "punchScale", "punchDecaySec"]) {
        finite(parameters[key], `${id}.${key}`, key === "transitionDurationSec" || key === "punchDecaySec" ? 0.001 : 0);
      }
      if (parameters.revealProgress >= 1 || parameters.punchScale > 0.2) throw new RangeError(`${id} requires revealProgress in [0,1) and a restrained punchScale <= 0.2`);
      finite(parameters.centerX, `${id}.centerX`, 0, scene.width); finite(parameters.centerY, `${id}.centerY`, 0, scene.height);
      const audioEvents = collectAudioEvents(scene);
      for (const eventId of parameters.eventIds) {
        const event = audioEvents.get(eventId);
        if (!event) throw new Error(`${id}.eventIds references missing canonical audio event ${eventId}`);
        if (event.timeBasis !== "scene-local") throw new Error(`${id} can only consume scene-local canonical events; resolve film-global events through the existing timeMap first`);
        if (event.timeSec >= scene.duration) throw new RangeError(`${id} canonical event ${eventId} must fall within the scene-local duration`);
      }
      const revealHit = audioEvents.get(parameters.revealOnEventId).timeSec;
      const revealStart = revealHit - parameters.transitionDurationSec * parameters.revealProgress;
      if (revealStart < 0 || revealStart + parameters.transitionDurationSec > scene.duration) throw new RangeError(`${id} reveal window must stay inside the existing scene-local duration`);
    } else if (recipeId === "temporal-ghosts") {
      const mover = parameters.mover;
      onlyKeys(mover || {}, ["type", "color", "keyframes", "width", "height", "radius"], `${id}.mover`);
      if (!mover || typeof mover !== "object" || !new Set(["rect", "circle"]).has(mover.type)) throw new TypeError(`${id}.mover.type must be rect or circle`);
      if (mover.type === "circle") finite(mover.radius, `${id}.mover.radius`, 0.1);
      else { finite(mover.width, `${id}.mover.width`, 0.1); finite(mover.height, `${id}.mover.height`, 0.1); }
      hex(mover.color, `${id}.mover.color`);
      timeKeys(mover.keyframes, `${id}.mover.keyframes`, 2);
      for (const [index, frame] of mover.keyframes.entries()) {
        if (!Array.isArray(frame[1]) || frame[1].length !== 2) throw new TypeError(`${id}.mover.keyframes[${index}][1] must be [x,y]`);
        frame[1].forEach((value, axis) => finite(value, `${id}.mover.keyframes[${index}][1][${axis}]`));
      }
      for (const key of ["samples", "stepSec", "opacity"]) finite(parameters[key], `${id}.${key}`, 0);
      if (!Number.isInteger(parameters.samples) || parameters.samples > 12 || parameters.stepSec <= 0 || parameters.opacity > 1) throw new RangeError(`${id} requires 0–12 ghost samples, a positive stepSec, and opacity in [0,1]`);
    } else if (recipeId === "canvas-perspective-boxes") {
      array(parameters.boxes, `${id}.boxes`);
      if (parameters.boxes.length > 1000) throw new RangeError(`${id}.boxes may not exceed 1000 boxes`);
      for (const [index, box] of parameters.boxes.entries()) {
        onlyKeys(box, ["x", "z", "w", "d", "h", "y", "color"], `${id}.boxes[${index}]`);
        for (const key of ["x", "z", "w", "h"]) finite(box[key], `${id}.boxes[${index}].${key}`);
        if (box.d != null) finite(box.d, `${id}.boxes[${index}].d`, 0.001);
        if (box.y != null) finite(box.y, `${id}.boxes[${index}].y`);
        if (box.w <= 0 || box.h < 0) throw new RangeError(`${id}.boxes[${index}] requires positive w and non-negative h`);
        onlyKeys(box.color || {}, ["top", "px", "nx", "pz", "nz"], `${id}.boxes[${index}].color`);
        for (const face of ["top", "px", "nx", "pz", "nz"]) hex(box.color?.[face], `${id}.boxes[${index}].color.${face}`);
      }
      if (parameters.camera != null) {
        onlyKeys(parameters.camera, ["pitch", "yaw", "dist", "focal", "target", "cx", "cy"], `${id}.camera`);
        for (const key of ["pitch", "yaw", "dist", "focal", "cx", "cy"]) if (parameters.camera[key] != null) finite(parameters.camera[key], `${id}.camera.${key}`, key === "dist" || key === "focal" ? 1 : -Infinity);
        if (parameters.camera.target != null) {
          if (!Array.isArray(parameters.camera.target) || parameters.camera.target.length !== 3) throw new TypeError(`${id}.camera.target must be [x,y,z]`);
          parameters.camera.target.forEach((value, index) => finite(value, `${id}.camera.target[${index}]`));
        }
      }
    }
    if ([parameters.from, parameters.to].some((panel) => panel?.type === "source-frame-sequence")
        && !["zoom-through", "wipe-reveal"].includes(recipeId)) {
      throw new Error(`${id} source-frame-sequence inputs are implemented only for zoom-through and wipe-reveal`);
    }
    return { ownerId: owner, id, recipeId, renderer: TYPE_BY_RECIPE[recipeId], parameters };
  }
  function validatePanel(panel, label) {
    if (!panel || typeof panel !== "object" || Array.isArray(panel)) throw new TypeError(`${label} must be a panel descriptor`);
    if (panel.type === "source-frame") {
      onlyKeys(panel, ["type", "path"], label);
      if (typeof panel.path !== "string" || !panel.path.trim() || panel.path.startsWith("/") || panel.path.includes("\\")
          || panel.path.split("/").some((part) => !part || part === "." || part === "..") || !/\.png$/i.test(panel.path)) {
        throw new TypeError(`${label}.path must be a project-local relative PNG path with no dot, parent, or backslash components`);
      }
      return;
    }
    if (panel.type === "source-frame-sequence") {
      onlyKeys(panel, ["type", "path", "clock"], label);
      if (typeof panel.path !== "string" || !panel.path.trim() || panel.path.startsWith("/") || panel.path.includes("\\")
          || panel.path.split("/").some((part) => !part || part === "." || part === "..") || !/\.json$/i.test(panel.path)) {
        throw new TypeError(`${label}.path must be a project-local relative JSON sequence manifest with no dot, parent, or backslash components`);
      }
      const clock = panel.clock;
      if (!clock || typeof clock !== "object" || Array.isArray(clock)) throw new TypeError(`${label}.clock must explicitly map scene-local time to source-sequence time`);
      onlyKeys(clock, ["kind", "sourceStartSec", "playbackRate", "endBehavior"], `${label}.clock`);
      if (clock.kind !== "scene-local") throw new Error(`${label}.clock.kind must be scene-local`);
      finite(clock.sourceStartSec, `${label}.clock.sourceStartSec`, 0);
      finite(clock.playbackRate, `${label}.clock.playbackRate`, 0.001, 8);
      if (clock.endBehavior !== "clamp") throw new Error(`${label}.clock.endBehavior must be clamp; other sequence-end behavior is not implemented`);
      return;
    }
    onlyKeys(panel, ["color", "text", "textColor", "font", "fontSize", "x", "y"], label);
    hex(panel.color, `${label}.color`);
    if (panel.text != null && typeof panel.text !== "string") throw new TypeError(`${label}.text must be a string`);
    if (panel.textColor != null) hex(panel.textColor, `${label}.textColor`);
    if (panel.font != null && (typeof panel.font !== "string" || !panel.font.trim())) throw new TypeError(`${label}.font must be a Canvas font shorthand`);
    if (panel.fontSize != null) finite(panel.fontSize, `${label}.fontSize`, 1);
    for (const key of ["x", "y"]) if (panel[key] != null) finite(panel[key], `${label}.${key}`);
  }
  function sourceSequenceFrameIndex(panel, asset, sceneTimeSec) {
    const sourceTimeSec = panel.clock.sourceStartSec + sceneTimeSec * panel.clock.playbackRate;
    return {sourceTimeSec, frameIndex: clamp(Math.floor(sourceTimeSec * asset.fps + 1e-9), 0, asset.frames.length - 1)};
  }
  function sourceSequenceKey(recordId, side, asset, frameIndex, frame) {
    return `${recordId}\u001f${side}\u001f${asset.manifestSha256}\u001f${frameIndex}\u001f${frame.sha256}`;
  }
  function updateSourceSequenceCacheEvidence() {
    const evidence = root[EVIDENCE_KEY] || (root[EVIDENCE_KEY] = {sourceId: SOURCE_ID, sourceCommit: SOURCE_COMMIT, calls: {}});
    evidence.sourceSequences ||= {clock: "frameIndex = clamp(floor((sceneLocalSec * playbackRate + sourceStartSec) * sequenceFps), 0, frameCount - 1)", loaded: {}};
    evidence.sourceSequences.cache = {
      budgetBytes: MAX_SOURCE_SEQUENCE_BITMAP_BYTES,
      residentDecodedRgbaBytes: sourceSequenceDecodedBytes,
      peakResidentDecodedRgbaBytes: sourceSequencePeakDecodedBytes,
      hits: sourceSequenceCacheHits,
      misses: sourceSequenceCacheMisses,
      evictions: sourceSequenceEvictions,
    };
  }
  function removeSourceSequenceBitmap(key, {evicted = false} = {}) {
    const entry = sourceSequenceBitmapLRU.get(key);
    if (!entry) return;
    sourceSequenceBitmapLRU.delete(key);
    entry.ownerCache.loadedFrames.delete(entry.frameIndex);
    sourceSequenceDecodedBytes = Math.max(0, sourceSequenceDecodedBytes - entry.bytes);
    entry.bitmap.close();
    if (evicted) sourceSequenceEvictions += 1;
  }
  function releaseSourceSequenceCache(cache) {
    for (const row of cache?.loadedFrames?.values?.() || []) removeSourceSequenceBitmap(row.key);
  }
  async function loadSourceSequenceBitmap(record, side, cache, frameIndex) {
    const frame = cache.frames[frameIndex];
    const key = sourceSequenceKey(record.id, side, cache.asset, frameIndex, frame);
    const hit = sourceSequenceBitmapLRU.get(key);
    if (hit) {
      sourceSequenceBitmapLRU.delete(key);
      sourceSequenceBitmapLRU.set(key, hit);
      sourceSequenceCacheHits += 1;
      updateSourceSequenceCacheEvidence();
      return hit.bitmap;
    }
    if (cache.loadingFrames.has(frameIndex)) return cache.loadingFrames.get(frameIndex);
    const pending = (async () => {
      if (typeof frame.dataUrl !== "string" || !frame.dataUrl.startsWith("data:image/png;base64,")) throw new Error(`source sequence frame ${frameIndex} has no PNG data URL`);
      const response = await fetch(frame.dataUrl);
      if (!response.ok) throw new Error(`could not load frame ${frameIndex}: HTTP ${response.status}`);
      const bitmap = await createImageBitmap(await response.blob());
      if (bitmap.width !== cache.asset.width || bitmap.height !== cache.asset.height) {
        bitmap.close();
        throw new Error(`frame ${frameIndex} must match stage dimensions ${cache.asset.width}x${cache.asset.height}`);
      }
      const bytes = bitmap.width * bitmap.height * 4;
      if (!Number.isSafeInteger(bytes) || bytes > MAX_SOURCE_SEQUENCE_BITMAP_BYTES) {
        bitmap.close();
        throw new Error(`one decoded source frame would use ${bytes} RGBA bytes; the browser LRU cache budget is ${MAX_SOURCE_SEQUENCE_BITMAP_BYTES} bytes`);
      }
      const pinned = sourceSequencePinnedKeys || new Set();
      while (sourceSequenceDecodedBytes + bytes > MAX_SOURCE_SEQUENCE_BITMAP_BYTES) {
        const oldest = [...sourceSequenceBitmapLRU.keys()].find((candidate) => !pinned.has(candidate));
        if (!oldest) {
          bitmap.close();
          throw new Error(`current Garden draw needs more than ${MAX_SOURCE_SEQUENCE_BITMAP_BYTES} decoded RGBA bytes for source frames`);
        }
        removeSourceSequenceBitmap(oldest, {evicted: true});
      }
      const loaded = {bitmap, bytes, key, path: frame.path, sha256: frame.sha256};
      cache.loadedFrames.set(frameIndex, loaded);
      sourceSequenceBitmapLRU.set(key, {bitmap, bytes, ownerCache: cache, frameIndex});
      sourceSequenceDecodedBytes += bytes;
      sourceSequencePeakDecodedBytes = Math.max(sourceSequencePeakDecodedBytes, sourceSequenceDecodedBytes);
      sourceSequenceCacheMisses += 1;
      updateSourceSequenceCacheEvidence();
      return bitmap;
    })();
    cache.loadingFrames.set(frameIndex, pending);
    try { return await pending; }
    finally { cache.loadingFrames.delete(frameIndex); }
  }
  function closeSourceFrameSide(cache, side) {
    const prior = cache?.[side];
    if (!prior) return;
    if (prior.type === "source-frame-sequence") releaseSourceSequenceCache(prior);
    else prior.bitmap?.close();
    delete cache[side];
  }
  async function prepareSourceFrame(record, side, panel, scene, timeSec) {
    if (panel.type === "source-frame-sequence") {
      const asset = root.MOTION_RECIPE_SOURCE_FRAMES?.[record.id]?.[side];
      if (!asset || asset.type !== "source-frame-sequence" || asset.path !== panel.path || !Array.isArray(asset.frames)) {
        throw new Error(`Motion recipe ${record.id}.${side} requires its scene-relative source-frame sequence in render.mjs sourceFrames`);
      }
      const cache = sourceFrameBitmapCache.get(record.id) || {};
      if (cache[side]?.type === "source-frame-sequence" && cache[side].manifestSha256 !== asset.manifestSha256) closeSourceFrameSide(cache, side);
      else if (cache[side] && cache[side].type !== "source-frame-sequence") closeSourceFrameSide(cache, side);
      if (!cache[side]) cache[side] = {
        type: "source-frame-sequence", path: panel.path, manifestSha256: asset.manifestSha256,
        fps: asset.fps, frames: asset.frames, asset, loadedFrames: new Map(), loadingFrames: new Map(),
      };
      sourceFrameBitmapCache.set(record.id, cache);
      const {frameIndex} = sourceSequenceFrameIndex(panel, asset, timeSec);
      try { await loadSourceSequenceBitmap(record, side, cache[side], frameIndex); }
      catch (error) { throw new Error(`Could not prepare source-frame sequence ${record.id}.${side}: ${error.message}`); }
      const evidence = root[EVIDENCE_KEY] || (root[EVIDENCE_KEY] = { sourceId: SOURCE_ID, sourceCommit: SOURCE_COMMIT, calls: {} });
      evidence.sourceSequences ||= {clock: "frameIndex = clamp(floor((sceneLocalSec * playbackRate + sourceStartSec) * sequenceFps), 0, frameCount - 1)", loaded: {}};
      evidence.sourceSequences.loaded[`${record.id}.${side}`] = {
        path: asset.path, manifestSha256: asset.manifestSha256, fps: asset.fps,
        frameCount: asset.frameCount, totalEncodedBytes: asset.totalEncodedBytes,
        decodedFrameBytes: asset.decodedFrameBytes, decodedCacheBudgetBytes: asset.decodedCacheBudgetBytes,
        frames: asset.frames.map(({path: framePath, sha256, bytes}) => ({path: framePath, sha256, bytes})),
      };
      updateSourceSequenceCacheEvidence();
      return;
    }
    if (panel.type !== "source-frame") return;
    let cache = sourceFrameBitmapCache.get(record.id);
    if (cache?.[side]?.path === panel.path) return;
    const asset = root.MOTION_RECIPE_SOURCE_FRAMES?.[record.id]?.[side];
    if (!asset || asset.path !== panel.path || typeof asset.dataUrl !== "string" || !asset.dataUrl.startsWith("data:image/png;base64,")) {
      throw new Error(`Motion recipe ${record.id}.${side} requires its scene-relative PNG in render.mjs sourceFrames; no source frame was loaded`);
    }
    const response = await fetch(asset.dataUrl);
    if (!response.ok) throw new Error(`Could not decode source frame ${record.id}.${side}: HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    if (bitmap.width !== scene.width || bitmap.height !== scene.height) {
      bitmap.close();
      throw new Error(`Motion recipe ${record.id}.${side} source frame must match stage dimensions ${scene.width}x${scene.height}`);
    }
    cache ||= {};
    closeSourceFrameSide(cache, side);
    cache[side] = { bitmap, path: panel.path, sha256: asset.sha256 };
    sourceFrameBitmapCache.set(record.id, cache);
    const evidence = root[EVIDENCE_KEY] || (root[EVIDENCE_KEY] = { sourceId: SOURCE_ID, sourceCommit: SOURCE_COMMIT, calls: {} });
    evidence.sourceFrames ||= { mechanism: "laohu-transitions-compatible source-frame PNG input → ImageBitmap → existing recipe frame operation", loaded: {} };
    evidence.sourceFrames.loaded[`${record.id}.${side}`] = { path: asset.path, sha256: asset.sha256, bytes: asset.bytes, width: bitmap.width, height: bitmap.height };
  }
  function drawRecipePanel(ctx, record, side, panel, timeSec, width, height) {
    if (panel.type === "source-frame-sequence") {
      const cache = sourceFrameBitmapCache.get(record.id)?.[side];
      if (!cache || cache.type !== "source-frame-sequence" || !cache.frames.length) throw new Error(`${record.id}.${side} source-frame sequence was not prepared before drawFrame`);
      const {sourceTimeSec, frameIndex} = sourceSequenceFrameIndex(panel, cache.asset, timeSec);
      const frame = cache.loadedFrames.get(frameIndex);
      if (!frame) throw new Error(`${record.id}.${side} source sequence frame ${frameIndex} was not retained for drawFrame`);
      ctx.drawImage(frame.bitmap, 0, 0, width, height);
      noteSequenceFrameConsumption(record, side, timeSec, sourceTimeSec, frameIndex, frame, cache);
      return;
    }
    if (panel.type !== "source-frame") {
      drawPanel(ctx, panel, width, height);
      return;
    }
    const cache = sourceFrameBitmapCache.get(record.id)?.[side];
    if (!cache) throw new Error(`Motion recipe ${record.id}.${side} source frame was not prepared before drawFrame`);
    ctx.drawImage(cache.bitmap, 0, 0, width, height);
    noteSourceFrameConsumption(record, side, timeSec, cache);
  }
  function noteSourceFrameConsumption(record, side, timeSec, cache) {
    const evidence = root[EVIDENCE_KEY] || (root[EVIDENCE_KEY] = { sourceId: SOURCE_ID, sourceCommit: SOURCE_COMMIT, calls: {} });
    evidence.sourceFrames ||= { mechanism: "laohu-transitions-compatible source-frame PNG input → ImageBitmap → existing recipe frame operation", loaded: {} };
    const key = `${record.id}.${side}`;
    const row = evidence.sourceFrames.consumed?.[key] || { count: 0, firstTimeSec: timeSec, lastTimeSec: timeSec, path: cache.path, sha256: cache.sha256 };
    row.count += 1; row.lastTimeSec = timeSec;
    evidence.sourceFrames.consumed ||= {};
    evidence.sourceFrames.consumed[key] = row;
  }
  function noteSequenceFrameConsumption(record, side, timeSec, sourceTimeSec, frameIndex, frame, cache) {
    const evidence = root[EVIDENCE_KEY] || (root[EVIDENCE_KEY] = { sourceId: SOURCE_ID, sourceCommit: SOURCE_COMMIT, calls: {} });
    evidence.sourceSequences ||= { clock: "frameIndex = clamp(floor((sceneLocalSec * playbackRate + sourceStartSec) * sequenceFps), 0, frameCount - 1)", loaded: {} };
    evidence.sourceSequences.consumed ||= {};
    const key = `${record.id}.${side}`;
    const row = evidence.sourceSequences.consumed[key] || {
      count: 0, firstSceneTimeSec: timeSec, lastSceneTimeSec: timeSec,
      firstSourceTimeSec: sourceTimeSec, lastSourceTimeSec: sourceTimeSec,
      firstFrameIndex: frameIndex, lastFrameIndex: frameIndex, minFrameIndex: frameIndex, maxFrameIndex: frameIndex,
      manifestSha256: cache.manifestSha256, path: cache.path,
    };
    row.count += 1;
    row.lastSceneTimeSec = timeSec;
    row.lastSourceTimeSec = sourceTimeSec;
    row.lastFrameIndex = frameIndex;
    row.minFrameIndex = Math.min(row.minFrameIndex, frameIndex);
    row.maxFrameIndex = Math.max(row.maxFrameIndex, frameIndex);
    row.lastFrameSha256 = frame.sha256;
    row.frameUseSamples ||= {};
    const sample = row.frameUseSamples[String(frameIndex)] || {
      firstSceneTimeSec: timeSec, lastSceneTimeSec: timeSec,
      firstSourceTimeSec: sourceTimeSec, lastSourceTimeSec: sourceTimeSec, count: 0, sha256: frame.sha256,
    };
    sample.lastSceneTimeSec = timeSec;
    sample.lastSourceTimeSec = sourceTimeSec;
    sample.count += 1;
    row.frameUseSamples[String(frameIndex)] = sample;
    evidence.sourceSequences.consumed[key] = row;
  }
  function validateShape(shape, label) {
    if (!shape || typeof shape !== "object" || Array.isArray(shape)) throw new TypeError(`${label} must be a shape descriptor`);
    if (!new Set(["rect", "circle", "text"]).has(shape.type)) throw new Error(`${label}.type must be rect, circle, or text`);
    for (const key of ["x", "y"]) finite(shape[key], `${label}.${key}`);
    if (shape.type === "circle") finite(shape.radius, `${label}.radius`, 0.1);
    else if (shape.type === "rect") { finite(shape.width, `${label}.width`, 0.1); finite(shape.height, `${label}.height`, 0.1); }
    else { if (typeof shape.text !== "string") throw new TypeError(`${label}.text must be text`); finite(shape.fontSize, `${label}.fontSize`, 1); }
    hex(shape.color, `${label}.color`);
  }
  function validateScene(scene) {
    if (!scene || typeof scene !== "object" || !Number.isFinite(scene.duration) || scene.duration <= 0) throw new TypeError("Garden recipes require a validated Motion scene with positive duration");
    const seen = new Set();
    const records = instanceRows(scene).map(({ ownerId, instance }) => {
      const record = validateInstance(instance, ownerId, scene);
      if (seen.has(record.id)) throw new Error(`Duplicate Garden recipe instance ID ${record.id}`);
      seen.add(record.id);
      return record;
    });
    const posts = scene.motionPostProcessing == null ? [] : scene.motionPostProcessing;
    if (!Array.isArray(posts)) throw new TypeError("scene.motionPostProcessing must be an array when declared");
    if (posts.length > 1) throw new Error("scene.motionPostProcessing supports one WebGL post pass so effect order remains explicit");
    for (const [index, post] of posts.entries()) {
      if (!post || post.recipeId !== "webgl-crt-post" || !post.parameters || typeof post.parameters !== "object" || Array.isArray(post.parameters)) throw new Error(`motionPostProcessing[${index}] must select webgl-crt-post with parameters`);
      onlyKeys(post, ["id", "recipeId", "parameters"], `motionPostProcessing[${index}]`);
      onlyKeys(post.parameters, PARAMETER_KEYS["webgl-crt-post"], `motionPostProcessing[${index}].parameters`);
      const id = stableId(post.id || `motion-post-${index + 1}`, `motionPostProcessing[${index}].id`);
      const hitEventIds = post.parameters.hitEventIds || [];
      array(hitEventIds, `${id}.hitEventIds`, 0);
      const audioEvents = hitEventIds.length ? collectAudioEvents(scene) : new Map();
      for (const eventId of hitEventIds) {
        const event = audioEvents.get(stableId(eventId, `${id}.hitEventIds[]`));
        if (!event || event.timeBasis !== "scene-local") throw new Error(`${id} must bind each hitEventId to an existing scene-local canonical audio event`);
        if (event.timeSec >= scene.duration) throw new RangeError(`${id} hit event ${eventId} must fall within the scene-local duration`);
      }
      finite(post.parameters.hitDecaySec == null ? 0.14 : post.parameters.hitDecaySec, `${id}.hitDecaySec`, 0.001);
      records.push({ ownerId: "scene", id, recipeId: "webgl-crt-post", renderer: POST_RENDERER, parameters: post.parameters });
    }
    return records;
  }

  function drawRoundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(Math.max(0, radius), Math.abs(width) / 2, Math.abs(height) / 2);
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, width, height, r);
    else { ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath(); }
    ctx.fill();
  }
  function setFont(ctx, font, size, weight = 800) { ctx.font = font || `${weight} ${size}px sans-serif`; }
  function drawPanel(ctx, panel, width, height) {
    ctx.fillStyle = panel.color; ctx.fillRect(0, 0, width, height);
    if (panel.text) {
      ctx.fillStyle = panel.textColor || "#ffffff"; setFont(ctx, panel.font, panel.fontSize || 72);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(panel.text, panel.x == null ? width / 2 : panel.x, panel.y == null ? height / 2 : panel.y, width * 0.9);
    }
  }
  function drawMaskedText(ctx, params, timeSec) {
    for (const item of params.items) {
      const chars = [...item.text];
      setFont(ctx, item.font, item.size);
      let cursor = item.x;
      for (const [index, glyph] of chars.entries()) {
        const measured = ctx.measureText(glyph);
        const glyphWidth = measured.width;
        const ascent = measured.actualBoundingBoxAscent || item.size * 0.9;
        const descent = measured.actualBoundingBoxDescent || item.size * 0.25;
        const enterSec = item.startSec + index * (item.gap == null ? 0.045 : item.gap);
        const enter = spring(timeSec - enterSec, { freq: 2.6, damp: 0.72 });
        const exitSec = item.exitSec == null ? null : item.exitSec + index * (item.gap == null ? 0.045 : item.gap) * 0.6;
        const exit = exitSec == null ? 0 : ease.inCubic(seg(timeSec, exitSec, exitSec + 0.25));
        ctx.save(); ctx.beginPath();
        // Actual Canvas metrics keep CJK glyphs inside the moving mask.
        ctx.rect(cursor - 2, item.baseY - ascent - item.size * 0.08, glyphWidth + 4, ascent + descent + item.size * 0.16); ctx.clip();
        ctx.fillStyle = item.color || "#111111"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        ctx.fillText(glyph, cursor, item.baseY + (1 - enter) * item.size * 1.05 - exit * item.size * 1.05);
        ctx.restore(); cursor += glyphWidth;
      }
    }
  }
  function drawStretch(ctx, params, timeSec) {
    const { moves, y, width, height, color = "#111111" } = params;
    const fast = { freq: 3.6, damp: 0.8 }, slow = { freq: 2.2, damp: 0.85 };
    const towardRight = (index) => index === 0 || moves[index][1] >= moves[index - 1][1];
    const right = springTo(timeSec, moves.map(([time, x], index) => [time, x + width, towardRight(index) ? fast : slow]));
    const left = springTo(timeSec, moves.map(([time, x], index) => [time, x, towardRight(index) ? slow : fast]));
    ctx.fillStyle = color; ctx.fillRect(left, y, Math.max(0, right - left), height);
  }
  function drawStateChain(ctx, params, timeSec) {
    const keys = params.states.map((state, index) => [params.times[index], state]);
    const box = springTo(timeSec, keys, { freq: 2.4, damp: 0.78 });
    let stateIndex = -1;
    for (let i = 0; i < params.times.length; i += 1) if (timeSec >= params.times[i]) stateIndex = i;
    const active = Math.max(0, stateIndex), previous = Math.max(0, active - 1);
    const colorMix = active === 0 ? 1 : spring(timeSec - params.times[active], { freq: 2.4, damp: 0.78 });
    ctx.fillStyle = mixHex(params.colors[previous], params.colors[active], colorMix);
    drawRoundRect(ctx, box[0], box[1], box[2], box[3], box[4]);
    if (Array.isArray(params.labels)) {
      const label = params.labels[active];
      if (label) {
        const nextTime = params.times[active + 1] ?? Infinity;
        const enter = clamp((timeSec - (params.times[active] + 0.12)) / 0.1);
        const exit = Number.isFinite(nextTime) ? clamp((timeSec - (nextTime - 0.1)) / 0.1) : 0;
        const opacity = Math.max(0, enter * (1 - exit));
        if (opacity > 0) {
          ctx.save(); ctx.globalAlpha *= opacity; ctx.fillStyle = params.labelColor || "#ffffff";
          setFont(ctx, params.labelFont, params.labelSize || 30); ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.filter = exit > 0 ? "blur(6px)" : "none";
          ctx.fillText(label, box[0] + box[2] / 2, box[1] + box[3] / 2 + (1 - enter) * 14);
          ctx.restore();
        }
      }
    }
  }
  function drawCursor(ctx, params, timeSec) {
    const keys = params.points.map(([time, point, curve]) => [time, point, ease[curve] || ease.inOutCubic]);
    const [x, y] = tween(timeSec, keys);
    const down = (params.pressIntervals || []).some(([start, end]) => timeSec > start && timeSec < end);
    if (params.track) {
      const track = params.track; const raw = clamp((x - track.x) / track.width);
      const value = params.snapSec != null && timeSec >= params.snapSec
        ? springTo(timeSec, [[params.snapSec, raw], [params.snapSec + 0.001, Math.round(raw * 4) / 4]]) : raw;
      ctx.fillStyle = params.trackColor || "#d4d4d4"; ctx.fillRect(track.x, track.y, track.width, track.height);
      ctx.fillStyle = params.color || "#ffcf5c"; ctx.fillRect(track.x, track.y, track.width * value, track.height);
    }
    ctx.save(); ctx.translate(x, y); ctx.scale(down ? 0.88 : 1, down ? 0.88 : 1);
    ctx.fillStyle = params.color || "#111111"; ctx.strokeStyle = params.outline || "#ffffff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 30); ctx.lineTo(8, 23); ctx.lineTo(14, 35); ctx.lineTo(19, 33); ctx.lineTo(13, 21); ctx.lineTo(24, 21); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (down) { ctx.save(); ctx.strokeStyle = params.color || "#ffcf5c"; ctx.globalAlpha *= clamp(1 - (timeSec % 0.4) / 0.4); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + 6, y + 8, 8 + (timeSec % 0.4) * 24, 0, TAU); ctx.stroke(); ctx.restore(); }
  }
  function drawZoomThrough(ctx, record, timeSec, width, height) {
    const params = record.parameters;
    const p = seg(timeSec, params.startSec, params.startSec + params.durationSec); const e = ease.inOutExpo(p);
    if (e < 0.5) {
      const zoom = Math.pow(params.zoom, e * 2);
      ctx.save(); camera(ctx, width, height, { x: params.targetX, y: params.targetY, zoom }); drawRecipePanel(ctx, record, "from", params.from, timeSec, width, height); ctx.restore();
    } else {
      const zoom = Math.pow(params.zoom, (e - 0.5) * 2) / params.zoom;
      ctx.save(); camera(ctx, width, height, { x: width / 2, y: height / 2, zoom }); drawRecipePanel(ctx, record, "to", params.to, timeSec, width, height); ctx.restore();
    }
  }
  function camera(ctx, width, height, { x = width / 2, y = height / 2, zoom = 1, rot = 0 } = {}) {
    ctx.translate(width / 2, height / 2); ctx.rotate(rot); ctx.scale(zoom, zoom); ctx.translate(-x, -y);
  }
  function drawWipe(ctx, record, timeSec, width, height) {
    const params = record.parameters;
    const progress = snap(seg(timeSec, params.startSec, params.startSec + params.durationSec));
    drawRecipePanel(ctx, record, "from", params.from, timeSec, width, height);
    ctx.save(); ctx.beginPath();
    const x = lerp(-width * 0.4, width * 1.2, progress), slant = params.slant;
    ctx.moveTo(-width, 0); ctx.lineTo(x + slant, 0); ctx.lineTo(x, height); ctx.lineTo(-width, height); ctx.closePath(); ctx.clip();
    drawRecipePanel(ctx, record, "to", params.to, timeSec, width, height); ctx.restore();
  }
  function sampleText(text, font, width, height, step) {
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.font = font; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(text, width / 2, height / 2);
    const pixels = context.getImageData(0, 0, width, height).data, points = [];
    for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) if (pixels[(y * width + x) * 4 + 3] > 128) points.push([x, y]);
    return points;
  }
  function drawParticleText(ctx, instance, params, timeSec) {
    let targets = sampledTextCache.get(instance);
    if (!targets) {
      targets = sampleText(params.text, params.font, params.width, params.height, Math.max(1, Math.round(params.step)));
      sampledTextCache.set(instance, targets);
    }
    const color = params.color || "#111111";
    ctx.fillStyle = color;
    targets.forEach(([targetX, targetY], index) => {
      const random = rng(index + (params.seed || 1));
      const startX = random() * params.width, startY = random() * params.height, delay = random() * 0.6;
      const gathered = spring(timeSec - params.formSec - delay, { freq: 1.8, damp: 0.8 });
      const burst = ease.outExpo(seg(timeSec, params.burstSec, params.burstSec + 0.8));
      const angle = random() * TAU, distance = (200 + random() * 600);
      const drift = (noise1(timeSec * 0.7 + index * 0.13) - 0.5) * 30 * (1 - gathered);
      const x = lerp(startX, targetX, gathered) + drift + Math.cos(angle) * distance * burst;
      const y = lerp(startY, targetY, gathered) + drift + Math.sin(angle) * distance * burst;
      ctx.fillRect(x, y, params.particleSize || 3, params.particleSize || 3);
    });
  }
  function drawEmitter(ctx, params, timeSec) {
    const first = Math.max(0, Math.floor((timeSec - params.life - params.startSec) * params.rate));
    const last = Math.floor((Math.min(timeSec, params.endSec == null ? timeSec : params.endSec) - params.startSec) * params.rate);
    ctx.fillStyle = params.color || "#111111";
    for (let index = first; index <= last; index += 1) {
      const born = params.startSec + index / params.rate, age = timeSec - born;
      if (age < 0 || age > params.life) continue;
      const angle = -Math.PI / 2 + (hash(index, params.seed) - 0.5) * 1.2;
      const speed = params.speed * (0.5 + hash(index, params.seed + 1));
      const x = params.origin[0] + Math.cos(angle) * speed * age;
      const y = params.origin[1] + Math.sin(angle) * speed * age + 0.5 * params.gravity * age * age;
      const inheritedAlpha = ctx.globalAlpha;
      ctx.globalAlpha = inheritedAlpha * Math.max(0, 1 - age / params.life);
      ctx.fillRect(x, y, params.size || 4, params.size || 4);
      ctx.globalAlpha = inheritedAlpha;
    }
  }
  function drawCounter(ctx, params, timeSec) {
    const p = ease.outExpo(seg(timeSec, params.startSec, params.startSec + params.durationSec));
    const value = Math.round(lerp(params.from, params.to, p));
    const impact = pulse(timeSec, params.startSec + params.durationSec, params.impactDecaySec || 0.15);
    const scale = 1 + Math.min(1, impact) * 0.08;
    ctx.save(); ctx.translate(params.x, params.y); ctx.scale(scale, scale);
    setFont(ctx, params.font, params.fontSize); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = params.color || "#111111"; ctx.fillText(value.toLocaleString("en-US"), 0, 0); ctx.restore();
  }
  function sourceSequenceSidesForDraw(record, timeSec) {
    if (record.recipeId === "zoom-through") {
      const p = seg(timeSec, record.parameters.startSec, record.parameters.startSec + record.parameters.durationSec);
      return [ease.inOutExpo(p) < 0.5 ? "from" : "to"];
    }
    return ["from", "to"];
  }
  async function prepareFrame(scene, timeSec) {
    if (!Number.isFinite(timeSec)) throw new TypeError("Motion recipe frame time must be finite scene-local seconds");
    const allRecords = root.MOTION_RECIPE_RECORDS || validateScene(scene);
    const sequenceRequests = new Map();
    for (const record of allRecords) {
      const sides = sourceSequenceSidesForDraw(record, timeSec);
      for (const side of sides) {
        const panel = record.parameters[side];
        if (panel?.type !== "source-frame-sequence") continue;
        const asset = root.MOTION_RECIPE_SOURCE_FRAMES?.[record.id]?.[side];
        if (!asset || asset.type !== "source-frame-sequence" || asset.path !== panel.path || !Array.isArray(asset.frames) || !asset.frames.length) {
          throw new Error(`Motion recipe ${record.id}.${side} requires its scene-relative source-frame sequence in render.mjs sourceFrames`);
        }
        if (!Number.isSafeInteger(asset.decodedFrameBytes) || asset.decodedFrameBytes <= 0
            || asset.decodedFrameBytes > MAX_SOURCE_SEQUENCE_BITMAP_BYTES
            || !Number.isFinite(asset.fps) || asset.fps <= 0 || asset.fps > 120) {
          throw new Error(`Motion recipe ${record.id}.${side} source-frame sequence has invalid decoded-frame or fps metadata`);
        }
        const {frameIndex} = sourceSequenceFrameIndex(panel, asset, timeSec);
        const frame = asset.frames[frameIndex];
        if (!frame || typeof frame.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(frame.sha256)
            || typeof frame.dataUrl !== "string" || !frame.dataUrl.startsWith("data:image/png;base64,")) {
          throw new Error(`Motion recipe ${record.id}.${side} source-frame sequence frame ${frameIndex} is missing validated PNG data`);
        }
        const key = sourceSequenceKey(record.id, side, asset, frameIndex, frame);
        sequenceRequests.set(key, {bytes: asset.decodedFrameBytes, recordId: record.id, side, frameIndex});
      }
    }
    const requiredBytes = [...sequenceRequests.values()].reduce((sum, item) => sum + item.bytes, 0);
    if (!Number.isSafeInteger(requiredBytes) || requiredBytes > MAX_SOURCE_SEQUENCE_BITMAP_BYTES) {
      throw new Error(`current Garden draw requires ${requiredBytes} decoded RGBA bytes for source frames; the LRU cache budget is ${MAX_SOURCE_SEQUENCE_BITMAP_BYTES} bytes`);
    }
    sourceSequencePinnedKeys = new Set(sequenceRequests.keys());
    try {
      for (const record of allRecords) {
        const activeSequenceSides = new Set(sourceSequenceSidesForDraw(record, timeSec));
        for (const side of ["from", "to"]) {
          const panel = record.parameters[side];
          if (!panel) continue;
          if (panel.type === "source-frame-sequence" && !activeSequenceSides.has(side)) continue;
          await prepareSourceFrame(record, side, panel, scene, timeSec);
        }
      }
    } finally {
      sourceSequencePinnedKeys = null;
      updateSourceSequenceCacheEvidence();
    }
    const records = allRecords.filter((record) => record.recipeId === "svg-stroke");
    for (const record of records) {
      const prior = svgBitmapCache.get(record.id);
      if (prior?.timeSec === timeSec) continue;
      const p = record.parameters;
      const progress = ease.inOutCubic(seg(timeSec, p.startSec, p.startSec + p.durationSec));
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("width", String(scene.width));
      svg.setAttribute("height", String(scene.height));
      svg.setAttribute("viewBox", `0 0 ${scene.width} ${scene.height}`);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", p.pathData);
      path.setAttribute("pathLength", "1");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", p.color || "#111111");
      path.setAttribute("stroke-width", String(p.lineWidth));
      path.setAttribute("stroke-linecap", p.lineCap || "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-dasharray", "1");
      path.setAttribute("transform", `translate(${p.x} ${p.y})`);
      path.style.strokeDashoffset = String(1 - progress);
      svg.appendChild(path);
      const serialized = new XMLSerializer().serializeToString(svg);
      const objectUrl = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }));
      let bitmap;
      try {
        const image = new Image(); image.src = objectUrl; await image.decode();
        bitmap = await createImageBitmap(image);
      } finally { URL.revokeObjectURL(objectUrl); }
      prior?.bitmap.close();
      svgBitmapCache.set(record.id, { bitmap, timeSec, strokeDashoffset: 1 - progress });
      const evidence = root[EVIDENCE_KEY] || (root[EVIDENCE_KEY] = { sourceId: SOURCE_ID, sourceCommit: SOURCE_COMMIT, calls: {} });
      evidence.svgBridge = {
        mechanism: "source SVG pathLength=1 + stroke-dasharray=1 + CSS stroke-dashoffset; serialized DOM rendered to ImageBitmap before MotionCore frame draw",
        renderer: "SVG DOM → ImageBitmap → Canvas drawImage",
        preparedTimeSec: timeSec,
        preparedInstanceIds: records.map((item) => item.id),
        preparedCount: (evidence.svgBridge?.preparedCount || 0) + 1,
        currentStrokeDashoffset: { [record.id]: 1 - progress },
      };
    }
  }
  function drawSvgStroke(ctx, record, timeSec) {
    const cached = svgBitmapCache.get(record.id);
    if (!cached || cached.timeSec !== timeSec) {
      throw new Error(`SVG recipe ${record.id} was not prepared for scene-local time ${timeSec}; await LaohuMotionRecipes.prepareFrame before drawFrame`);
    }
    ctx.drawImage(cached.bitmap, 0, 0);
    const evidence = root[EVIDENCE_KEY] || (root[EVIDENCE_KEY] = { sourceId: SOURCE_ID, sourceCommit: SOURCE_COMMIT, calls: {} });
    evidence.svgBridge.lastConsumed = { instanceId: record.id, timeSec, strokeDashoffset: cached.strokeDashoffset };
  }
  function drawLoop(ctx, params, timeSec) {
    const theta = TAU * (timeSec % params.durationSec) / params.durationSec;
    ctx.fillStyle = params.color || "#111111";
    for (let index = 0; index < params.count; index += 1) {
      const angle = theta * params.harmonic + index * 0.3;
      const x = params.centerX + Math.cos(angle) * params.radius;
      const y = params.centerY + Math.sin(angle) * params.radius * (params.ellipseY == null ? 1 : params.ellipseY);
      ctx.beginPath(); ctx.arc(x, y, params.size * (0.75 + 0.25 * Math.sin(theta + index)), 0, TAU); ctx.fill();
    }
  }
  function drawShape(ctx, shape, scale = 1) {
    ctx.save(); ctx.translate(shape.x, shape.y); ctx.scale(scale, scale); ctx.fillStyle = shape.color;
    if (shape.type === "rect") ctx.fillRect(-shape.width / 2, -shape.height / 2, shape.width, shape.height);
    else if (shape.type === "circle") { ctx.beginPath(); ctx.arc(0, 0, shape.radius, 0, TAU); ctx.fill(); }
    else { setFont(ctx, shape.font, shape.fontSize); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(shape.text, 0, 0); }
    ctx.restore();
  }
  function drawCanonicalBeat(ctx, record, scene, timeSec) {
    const params = record.parameters;
    const audioEvents = collectAudioEvents(scene);
    const events = params.eventIds.map((eventId) => audioEvents.get(eventId)).sort((a, b) => a.timeSec - b.timeSec);
    const hits = events.map((event) => event.timeSec);
    const beatTimes = [...new Set(hits)];
    const hitIndex = beatTimes.reduce((index, hit, current) => hit <= timeSec ? current : index, -1);
    const previous = hitIndex >= 0 ? beatTimes[hitIndex] : null;
    const next = hitIndex >= 0 ? beatTimes[hitIndex + 1] : null;
    const onBeat = previous == null || next == null ? 0 : clamp((timeSec - previous) / (next - previous));
    const revealHit = audioEvents.get(params.revealOnEventId).timeSec;
    const revealStart = revealHit - params.transitionDurationSec * params.revealProgress;
    const elapsedProgress = seg(timeSec, revealStart, revealStart + params.transitionDurationSec);
    const sourceProgress = params.revealProgress === 0
      ? (timeSec < revealHit ? 0 : SOURCE_IRIS_HIT_PROGRESS + (1 - SOURCE_IRIS_HIT_PROGRESS) * elapsedProgress)
      : (elapsedProgress <= params.revealProgress
        ? SOURCE_IRIS_HIT_PROGRESS * elapsedProgress / params.revealProgress
        : SOURCE_IRIS_HIT_PROGRESS + (1 - SOURCE_IRIS_HIT_PROGRESS)
          * (elapsedProgress - params.revealProgress) / (1 - params.revealProgress));
    const punch = 1 + clamp(pulse(timeSec, hits, params.punchDecaySec)) * params.punchScale;
    const frames = sourceFrameBitmapCache.get(record.id);
    const from = frames?.from, to = frames?.to;
    if (!from || !to) throw new Error(`${record.id} source-frame PNGs must be decoded before TRANSITIONS.iris draws`);
    const sourceTransition = root.LaohuMotionTransitions?.drawIris;
    if (typeof sourceTransition !== "function") throw new Error(`${record.id} requires the pinned laohu-motion-transitions adapter to call TRANSITIONS.iris`);
    noteSourceFrameConsumption(record, "from", timeSec, from);
    noteSourceFrameConsumption(record, "to", timeSec, to);
    ctx.save(); camera(ctx, scene.width, scene.height, { zoom: punch });
    const transitionReceipt = sourceTransition(ctx, {
      instanceId: record.id, timeSec, durationSec: params.transitionDurationSec, progress: sourceProgress,
      A: from.bitmap, B: to.bitmap, width: scene.width, height: scene.height, cx: params.centerX ?? Number.EPSILON,
      cy: params.centerY ?? Number.EPSILON,
    });
    ctx.restore();
    const evidence = root[EVIDENCE_KEY] || (root[EVIDENCE_KEY] = { sourceId: SOURCE_ID, sourceCommit: SOURCE_COMMIT, calls: {} });
    evidence.beatBindings ||= {};
    evidence.beatBindings[params.revealOnEventId] = {
      canonicalHitSec: revealHit, revealStartSec: revealStart, transitionDurationSec: params.transitionDurationSec,
      configuredTransitionFractionAtHit: params.revealProgress,
      sourceTransition: {
        sourceId: transitionReceipt.sourceId,
        sourceMethod: transitionReceipt.sourceMethod,
        mappedSourceProgressAtHit: SOURCE_IRIS_HIT_PROGRESS,
        sourceInnerRadiusAtHitPx: 2,
        lastDraw: { timeSec: transitionReceipt.timeSec, progress: transitionReceipt.progress },
      },
      beatIndex: hitIndex, onBeat,
    };
  }
  function camera3d({ width, height, pitch = Math.PI / 4, yaw = 0, dist = 1400, focal = dist, target = [0, 0, 0], cx = width / 2, cy = height / 2 }) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch), ct = Math.cos(yaw), st = Math.sin(yaw);
    const pos = [target[0] + dist * cp * st, target[1] + dist * sp, target[2] + dist * cp * ct];
    const forward = [-cp * st, -sp, -cp * ct], right = [ct, 0, -st];
    const up = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const project = (point) => {
      const relative = [point[0] - pos[0], point[1] - pos[1], point[2] - pos[2]], depth = dot3(relative, forward);
      return [cx + focal * dot3(relative, right) / depth, cy - focal * dot3(relative, up) / depth, depth];
    };
    return { pos, project };
  }
  // Source drawBoxes painter-sorts separated grid blocks and shades directional faces.
  function drawBoxes(ctx, camera3, boxes) {
    const cameraPos = camera3.pos;
    const sorted = boxes.filter((box) => box.w > 0).map((box) => ({ box, distance: (box.x - cameraPos[0]) ** 2 + (box.z - cameraPos[2]) ** 2 })).sort((a, b) => b.distance - a.distance);
    const quad = (points, color) => {
      const projected = points.map(camera3.project); if (projected.some((point) => point[2] <= 1)) return;
      ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
      projected.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); ctx.stroke();
    };
    for (const { box } of sorted) {
      const { x, z, w, d = w, h = 0, y = 0, color } = box;
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y + h;
      if (h > 0.5) {
        if (cameraPos[2] > z1) quad([[x0, y, z1], [x1, y, z1], [x1, y1, z1], [x0, y1, z1]], color.pz);
        if (cameraPos[2] < z0) quad([[x0, y, z0], [x1, y, z0], [x1, y1, z0], [x0, y1, z0]], color.nz);
        if (cameraPos[0] > x1) quad([[x1, y, z0], [x1, y, z1], [x1, y1, z1], [x1, y1, z0]], color.px);
        if (cameraPos[0] < x0) quad([[x0, y, z0], [x0, y, z1], [x0, y1, z1], [x0, y1, z0]], color.nx);
      }
      if (cameraPos[1] > y1) quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], color.top);
    }
  }
  function drawPerspectiveBoxes(ctx, params, width, height) {
    const spec = params.camera || {};
    const camera3 = camera3d({ width, height, pitch: spec.pitch == null ? Math.PI / 4 : spec.pitch, yaw: spec.yaw || 0,
      dist: spec.dist || 1400, focal: spec.focal || spec.dist || 1400, cx: spec.cx == null ? width / 2 : spec.cx,
      cy: spec.cy == null ? height / 2 : spec.cy, target: spec.target || [0, 0, 0] });
    drawBoxes(ctx, camera3, params.boxes);
  }
  function drawGhost(ctx, params, timeSec) {
    const keys = params.mover.keyframes.map(([time, values]) => [time, values, ease.inOutCubic]);
    for (let k = params.samples; k >= 0; k -= 1) {
      const sampleTime = timeSec - k * params.stepSec;
      const [x, y] = tween(sampleTime, keys);
      ctx.save(); ctx.globalAlpha *= k === 0 ? 1 : params.opacity * (1 - k / (params.samples + 1));
      ctx.fillStyle = params.mover.color;
      if (params.mover.type === "circle") { ctx.beginPath(); ctx.arc(x, y, params.mover.radius, 0, TAU); ctx.fill(); }
      else ctx.fillRect(x, y, params.mover.width, params.mover.height);
      ctx.restore();
    }
  }
  function drawRecipe(ctx, record, timeSec, scene) {
    const { recipeId, parameters: p, id } = record;
    switch (recipeId) {
      case "masked-text-replacement": drawMaskedText(ctx, p, timeSec); break;
      case "leading-trailing-stretch": drawStretch(ctx, p, timeSec); break;
      case "shape-state-chain": drawStateChain(ctx, p, timeSec); break;
      case "cursor-driven": drawCursor(ctx, p, timeSec); break;
      case "zoom-through": drawZoomThrough(ctx, record, timeSec, scene.width, scene.height); break;
      case "wipe-reveal": drawWipe(ctx, record, timeSec, scene.width, scene.height); break;
      case "particle-text": drawParticleText(ctx, record.instance, p, timeSec); break;
      case "stateless-emitter": drawEmitter(ctx, p, timeSec); break;
      case "counter-impact": drawCounter(ctx, p, timeSec); break;
      case "svg-stroke": drawSvgStroke(ctx, record, timeSec); break;
      case "seamless-loop": drawLoop(ctx, p, timeSec); break;
      case "canonical-beat-reveal": drawCanonicalBeat(ctx, record, scene, timeSec); break;
      case "temporal-ghosts": drawGhost(ctx, p, timeSec); break;
      case "canvas-perspective-boxes": drawPerspectiveBoxes(ctx, p, scene.width, scene.height); break;
      default: throw new Error(`Unsupported Garden recipe ${recipeId}`);
    }
    const evidence = root[EVIDENCE_KEY] || (root[EVIDENCE_KEY] = { sourceId: SOURCE_ID, sourceCommit: SOURCE_COMMIT, calls: {} });
    evidence.calls[id] = (evidence.calls[id] || 0) + 1;
  }
  function renderer() {
    return function drawMotionRecipeGroup(ctx, object, timeSec, scene) {
      if (object?.type !== OBJECT_TYPE) throw new TypeError(`Expected ${OBJECT_TYPE}`);
      const records = (root.MOTION_RECIPE_RECORDS || validateScene(scene)).filter((record) => record.ownerId === object.id);
      const byId = new Map(records.map((record) => [record.id, record]));
      for (const instance of object.data.motionRecipes) drawRecipe(ctx, { ...byId.get(instance.id), instance }, timeSec, scene);
    };
  }
  function buildPostprocessor(width, height, parameters) {
    if (typeof document === "undefined") throw new Error("WebGL post-processing requires the real browser renderer");
    const output = document.createElement("canvas"); output.width = width; output.height = height;
    const gl = output.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error("Garden WebGL post-processing requires WebGL2 in the selected browser");
    const vertex = `#version 300 es\nin vec2 p; out vec2 uv; void main(){ uv=p*0.5+0.5; uv.y=1.0-uv.y; gl_Position=vec4(p,0,1); }`;
    const fragment = `#version 300 es\nprecision highp float; in vec2 uv; out vec4 o; uniform sampler2D tex; uniform float hit; uniform vec2 res;\nvec2 curve(vec2 u){ u=u*2.0-1.0; u*=1.0+0.06*dot(u.yx,u.yx); return u*0.5+0.5; }\nvoid main(){ vec2 u=curve(uv); if(u.x<0.0||u.x>1.0||u.y<0.0||u.y>1.0){o=vec4(0,0,0,1);return;} float ca=0.0015+hit*0.008; vec3 c=vec3(texture(tex,u+vec2(ca,0)).r,texture(tex,u).g,texture(tex,u-vec2(ca,0)).b); c*=0.82+0.18*sin(u.y*res.y*3.14159); c*=1.0-0.35*pow(length(uv-0.5)*1.3,2.0); o=vec4(c,1);}`;
    const compile = (type, source) => {
      const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Garden WebGL shader compilation failed: ${gl.getShaderInfoLog(shader)}`);
      return shader;
    };
    const program = gl.createProgram(); gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Garden WebGL program link failed: ${gl.getProgramInfoLog(program)}`);
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { output, gl, program, texture, parameters, width, height };
  }
  function postprocess(canvas, scene, timeSec) {
    if (!scene.motionPostProcessing?.length) return null;
    const post = scene.motionPostProcessing[0]; const params = post.parameters || {};
    let state = postprocessCache.get(canvas);
    if (!state || state.width !== canvas.width || state.height !== canvas.height) {
      state = buildPostprocessor(canvas.width, canvas.height, params); postprocessCache.set(canvas, state);
    }
    const { gl, output, program } = state;
    const hitEvents = params.hitEventIds?.length ? collectAudioEvents(scene) : new Map();
    const hits = (params.hitEventIds || []).map((eventId) => hitEvents.get(eventId).timeSec);
    const hit = clamp(pulse(timeSec, hits, params.hitDecaySec == null ? 0.14 : params.hitDecaySec));
    gl.viewport(0, 0, output.width, output.height); gl.useProgram(program); gl.bindTexture(gl.TEXTURE_2D, state.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.uniform1f(gl.getUniformLocation(program, "hit"), hit);
    gl.uniform2f(gl.getUniformLocation(program, "res"), output.width, output.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3); gl.finish();
    const ctx = canvas.getContext("2d"); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(output, 0, 0); ctx.restore();
    const evidence = root[EVIDENCE_KEY] || (root[EVIDENCE_KEY] = { sourceId: SOURCE_ID, sourceCommit: SOURCE_COMMIT, calls: {} });
    evidence.calls[post.id || "motion-post-1"] = (evidence.calls[post.id || "motion-post-1"] || 0) + 1;
    evidence.webgl = { version: "webgl2", independentOutputCanvas: true, copiedBackBeforeCapture: true, timeSec, hit };
    return evidence.webgl;
  }
  function register(registry) {
    if (!registry || typeof registry !== "object") throw new TypeError("Garden renderer registry is required");
    if (registry[OBJECT_TYPE]) throw new Error(`${OBJECT_TYPE} is already registered`);
    registry[OBJECT_TYPE] = renderer();
    root.LAOHU_MOTION_POSTPROCESS = postprocess;
    root.LAOHU_MOTION_PREPARE_FRAME = prepareFrame;
    return registry;
  }
  function resetEvidence() { delete root[EVIDENCE_KEY]; }
  return Object.freeze({
    OBJECT_TYPE, POST_RENDERER, SOURCE_ID, SOURCE_COMMIT, METHOD_IDS, TYPE_BY_RECIPE,
    validateScene, renderer, register, prepareFrame, postprocess, resetEvidence, spring, springTo, tween, pulse,
    helpers: Object.freeze({ clamp, lerp, seg, ease, snap, hash, noise1, rng, camera3d, drawBoxes }),
  });
});
