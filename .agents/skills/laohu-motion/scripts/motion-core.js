/*
 * Small, dependency-free Canvas 2D scene core for laohu-motion.
 * The implementation is local. Its contracts compile techniques observed in
 * huashu-art-motion@8a0d7d7 (camera, path reveal, semantic styles and layers)
 * and motiontemplates/385712@9dfbe7d (time-addressable scene updates); it does
 * not copy their source, art, names, palettes, timings or object counts.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MotionCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PAINT_KEYS = new Set(["fill", "stroke", "color"]);
  const BLENDS = new Set(["source-over", "multiply", "screen", "overlay", "darken", "lighten", "difference"]);
  const DRAW_TYPES = new Set(["rect", "circle", "ellipse", "line", "path", "polygon", "text", "pixels"]);
  const EASES = new Set(["linear", "smooth", "ease-in-out-cubic", "ease-out-cubic", "ease-in-cubic"]);
  const OPENING_PUNCTUATION = new Set(Array.from("（【〔〈《「『“‘([{〈《"));
  const CLOSING_PUNCTUATION = new Set(Array.from("，。！？；：、）》】〕〉》」』”’％‰℃,.!?;:)]}"));
  const CJK_UNITS = ["千瓦时", "公里", "千米", "公斤", "美元", "分钟", "小时", "秒钟", "毫秒", "毫升", "千瓦", "吨", "升", "度", "年", "月", "日", "时", "分", "秒", "米", "克", "人", "次", "个", "台", "项", "倍", "层", "字", "件", "份", "帧", "亿", "万", "百", "十", "%", "％", "℃", "°C"];
  const morphCacheByScene = new WeakMap();
  let graphemeSegmenter;

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
    return value;
  }

  function finite(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function ease(value, name = "linear") {
    const p = clamp(value, 0, 1);
    if (name === "linear") return p;
    if (name === "smooth") return p * p * (3 - 2 * p);
    if (name === "ease-in-out-cubic") return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    if (name === "ease-out-cubic") return 1 - Math.pow(1 - p, 3);
    if (name === "ease-in-cubic") return p * p * p;
    throw new TypeError(`unsupported ease ${String(name)}; use ${[...EASES].join(", ")}`);
  }

  function interpolate(from, to, amount, property) {
    // Scene events are normalized transitions. Keep their interpolation bounded;
    // overshoot belongs to a purpose-built local renderer, not this shared path.
    const p = clamp(amount, 0, 1);
    if (finite(from) && finite(to)) {
      if (property === "zoom" && from > 0 && to > 0) return Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * p);
      return from + (to - from) * p;
    }
    if (Array.isArray(from) && Array.isArray(to) && from.length === to.length && from.every(finite) && to.every(finite)) {
      return from.map((value, index) => value + (to[index] - value) * p);
    }
    return p < 1 ? from : to;
  }

  function splitGraphemes(text) {
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      if (!graphemeSegmenter) graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      return Array.from(graphemeSegmenter.segment(text), (item) => item.segment);
    }
    const points = Array.from(text);
    const result = [];
    let regionalCount = 0;
    for (const point of points) {
      const combining = /[\p{Mark}\uFE00-\uFE0F\u{E0100}-\u{E01EF}\u{1F3FB}-\u{1F3FF}]/u.test(point);
      const regional = /[\u{1F1E6}-\u{1F1FF}]/u.test(point);
      const joinsPrevious = result.length > 0 && (combining || point === "\u200d" || result[result.length - 1].endsWith("\u200d") || (regional && regionalCount % 2 === 1));
      if (joinsPrevious) result[result.length - 1] += point;
      else result.push(point);
      regionalCount = regional ? regionalCount + 1 : 0;
    }
    return result;
  }

  function isCjkGrapheme(grapheme) {
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(grapheme);
  }

  function isWordGrapheme(grapheme) {
    return /[\p{Letter}\p{Number}\p{Mark}_]/u.test(grapheme) && !isCjkGrapheme(grapheme);
  }

  function isWordConnector(graphemes, index) {
    return [".", ",", "'", "’", "-", "‐", "‑", "/", "%", "％", "+"].includes(graphemes[index])
      && index > 0 && index + 1 < graphemes.length
      && isWordGrapheme(graphemes[index - 1]) && isWordGrapheme(graphemes[index + 1]);
  }

  function consumeCjkUnitSuffix(graphemes, index) {
    let end = index;
    const suffixes = [...CJK_UNITS].sort((a, b) => b.length - a.length);
    while (end < graphemes.length) {
      const remaining = graphemes.slice(end).join("");
      const unit = suffixes.find((candidate) => remaining.startsWith(candidate));
      if (!unit) break;
      end += splitGraphemes(unit).length;
    }
    return end;
  }

  function textAtoms(text) {
    const graphemes = splitGraphemes(text);
    const atoms = [];
    let index = 0;
    let pendingOpen = "";
    while (index < graphemes.length) {
      const grapheme = graphemes[index];
      if (OPENING_PUNCTUATION.has(grapheme)) {
        pendingOpen += grapheme;
        index += 1;
        continue;
      }
      if (/^\s+$/u.test(grapheme)) {
        let whitespace = grapheme;
        index += 1;
        while (index < graphemes.length && /^\s+$/u.test(graphemes[index])) whitespace += graphemes[index++];
        atoms.push({ text: `${pendingOpen}${whitespace}`, whitespace: true });
        pendingOpen = "";
        continue;
      }
      if (CLOSING_PUNCTUATION.has(grapheme)) {
        if (pendingOpen) {
          const paired = `${pendingOpen}${grapheme}`;
          if (atoms.length && !atoms[atoms.length - 1].whitespace) atoms[atoms.length - 1].text += paired;
          else atoms.push({ text: paired, whitespace: false });
        } else if (atoms.length && !atoms[atoms.length - 1].whitespace) atoms[atoms.length - 1].text += grapheme;
        else atoms.push({ text: grapheme, whitespace: false });
        pendingOpen = "";
        index += 1;
        continue;
      }
      if (isWordGrapheme(grapheme)) {
        const start = index;
        index += 1;
        while (index < graphemes.length && (isWordGrapheme(graphemes[index]) || isWordConnector(graphemes, index))) index += 1;
        let end = index;
        const word = graphemes.slice(start, end).join("");
        if (/\p{Number}/u.test(word)) end = consumeCjkUnitSuffix(graphemes, end);
        const value = graphemes.slice(start, end).join("");
        atoms.push({ text: `${pendingOpen}${value}`, whitespace: false });
        pendingOpen = "";
        index = end;
        continue;
      }
      atoms.push({ text: `${pendingOpen}${grapheme}`, whitespace: false });
      pendingOpen = "";
      index += 1;
    }
    if (pendingOpen) {
      if (atoms.length && !atoms[atoms.length - 1].whitespace) atoms[atoms.length - 1].text += pendingOpen;
      else atoms.push({ text: pendingOpen, whitespace: false });
    }
    return atoms;
  }

  function measuredWidth(ctx, text, letterSpacing) {
    let width;
    if ("letterSpacing" in ctx) {
      const previous = ctx.letterSpacing;
      ctx.letterSpacing = "normal";
      try {
        width = ctx.measureText(text).width;
      } finally {
        ctx.letterSpacing = previous;
      }
    } else {
      width = ctx.measureText(text).width;
    }
    return width + letterSpacing * Math.max(0, splitGraphemes(text).length - 1);
  }

  function wrapParagraph(ctx, paragraph, maxWidth, letterSpacing) {
    if (maxWidth == null) return [paragraph];
    const atoms = textAtoms(paragraph);
    if (!atoms.length) return [""];
    const lines = [];
    let current = "";
    let pendingWhitespace = "";
    for (const atom of atoms) {
      if (atom.whitespace) {
        pendingWhitespace += atom.text;
        continue;
      }
      const candidate = `${current}${pendingWhitespace}${atom.text}`;
      if (current && measuredWidth(ctx, candidate, letterSpacing) > maxWidth) {
        lines.push(`${current}${pendingWhitespace}`);
        current = atom.text;
      } else {
        current = candidate;
      }
      pendingWhitespace = "";
    }
    if (pendingWhitespace) current += pendingWhitespace;
    if (current || !lines.length) lines.push(current);
    return lines;
  }

  function fontSizeFromCanvasFont(font) {
    const match = String(font).match(/(?:^|\s)(\d+(?:\.\d+)?)(?:px|pt|pc|in|cm|mm|em|rem|%)(?=\s*(?:\/|$|\s))/i);
    return match ? Number(match[1]) : null;
  }

  function replaceCanvasFontSize(font, size) {
    const pattern = /(^|\s)(\d+(?:\.\d+)?)(?:px|pt|pc|in|cm|mm|em|rem|%)(?=\s*(?:\/|$|\s))/i;
    const match = String(font).match(pattern);
    if (!match) throw new TypeError(`fontSize override requires a Canvas font shorthand with a numeric size: ${font}`);
    return String(font).replace(pattern, `$1${size}px`);
  }

  function configureTextFont(ctx, object) {
    const authoredSize = finite(object.fontSize) ? object.fontSize : null;
    if (authoredSize != null && authoredSize <= 0) throw new TypeError("text fontSize must be positive");
    if (typeof object.font === "string" && object.font.trim()) {
      ctx.font = object.font;
      if (authoredSize != null) ctx.font = replaceCanvasFontSize(ctx.font, authoredSize);
    } else {
      const size = authoredSize == null ? 16 : authoredSize;
      const descriptors = [object.fontStyle, object.fontWeight].filter((value) => typeof value === "string" && value.trim());
      const family = typeof object.fontFamily === "string" && object.fontFamily.trim() ? object.fontFamily : "sans-serif";
      ctx.font = `${[...descriptors, `${size}px`, family].join(" ")}`;
    }
    return fontSizeFromCanvasFont(ctx.font) || authoredSize || 16;
  }

  function layoutText(ctx, text, options = {}) {
    if (!ctx || typeof ctx.measureText !== "function") throw new TypeError("layoutText requires a Canvas 2D context with measureText");
    if (!isObject(options)) throw new TypeError("layoutText options must be an object");
    const maxWidth = options.maxWidth == null ? null : options.maxWidth;
    const lineHeight = options.lineHeight == null ? null : options.lineHeight;
    const letterSpacing = options.letterSpacing == null ? 0 : options.letterSpacing;
    if (maxWidth != null && (!finite(maxWidth) || maxWidth <= 0)) throw new TypeError("text maxWidth must be a positive finite number");
    if (lineHeight != null && (!finite(lineHeight) || lineHeight <= 0)) throw new TypeError("text lineHeight must be a positive finite number");
    if (!finite(letterSpacing)) throw new TypeError("text letterSpacing must be finite");
    const source = String(text == null ? "" : text);
    const hardLines = source.split(/\r\n|\r|\n/);
    const lines = hardLines.flatMap((line) => wrapParagraph(ctx, line, maxWidth, letterSpacing));
    const fontSize = fontSizeFromCanvasFont(ctx.font) || 16;
    const baselineGap = lineHeight == null ? fontSize * 1.2 : lineHeight;
    const widths = lines.map((line) => measuredWidth(ctx, line, letterSpacing));
    return { lines, widths, lineHeight: baselineGap, height: lines.length * baselineGap };
  }

  function getPath(object, path) {
    return String(path).split(".").reduce((value, key) => value == null ? undefined : value[key], object);
  }

  function setPath(object, path, value) {
    const parts = String(path).split(".");
    let cursor = object;
    for (const part of parts.slice(0, -1)) {
      if (!isObject(cursor[part])) cursor[part] = {};
      cursor = cursor[part];
    }
    cursor[parts[parts.length - 1]] = value;
  }

  function indexById(items, label, errors) {
    const result = new Map();
    if (!Array.isArray(items)) {
      errors.push({ path: label, message: "must be an array" });
      return result;
    }
    items.forEach((item, index) => {
      const path = `${label}[${index}]`;
      if (!isObject(item) || typeof item.id !== "string" || !item.id.trim()) {
        errors.push({ path, message: "requires a non-empty string id" });
      } else if (result.has(item.id)) {
        errors.push({ path: `${path}.id`, message: `duplicate id ${item.id}` });
      } else {
        result.set(item.id, item);
      }
    });
    return result;
  }

  const OBJECT_EVENT_PROPERTIES = new Set([
    "x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "angle", "rotation",
    "translateX", "translateY", "scale", "scaleX", "scaleY", "anchorX", "anchorY",
    "opacity", "visible", "progress", "morphProgress", "fill", "stroke", "lineWidth",
    "fontSize", "text", "style", "closed",
  ]);
  const LAYER_EVENT_PROPERTIES = new Set(["opacity", "transform.x", "transform.y", "transform.rotation", "transform.scale", "transform.scaleX", "transform.scaleY"]);
  const CAMERA_EVENT_PROPERTIES = new Set(["x", "y", "zoom", "rotation"]);

  function validEventProperty(kind, property) {
    if (kind === "object") return OBJECT_EVENT_PROPERTIES.has(property) || /^styleOverrides\.(fill|stroke|color)$/.test(property);
    if (kind === "layer") return LAYER_EVENT_PROPERTIES.has(property);
    if (kind === "camera") return CAMERA_EVENT_PROPERTIES.has(property);
    return kind === "variable" && property === "value";
  }

  function validPoints(points, minimum) {
    return Array.isArray(points) && points.length >= minimum && points.every((point) => isObject(point) && finite(point.x) && finite(point.y));
  }

  function effectiveLayerSpace(layerId, layerMap) {
    let layer = layerMap.get(layerId);
    while (layer && layer.parent != null) layer = layerMap.get(layer.parent);
    return layer && layer.space || "world";
  }

  function intervalsOverlap(a, b) {
    const aEnd = a.start + a.duration;
    const bEnd = b.start + b.duration;
    if (a.duration === 0 && b.duration === 0) return a.start === b.start;
    if (a.duration === 0) return a.start >= b.start && a.start < bEnd;
    if (b.duration === 0) return b.start >= a.start && b.start < aEnd;
    return a.start < bEnd && b.start < aEnd;
  }

  function validateScene(scene) {
    const errors = [];
    if (!isObject(scene)) return [{ path: "$", message: "scene must be an object" }];
    if (scene.version !== 1) errors.push({ path: "version", message: "must be 1" });
    if (!finite(scene.duration) || scene.duration <= 0) errors.push({ path: "duration", message: "must be a positive number of seconds" });
    if (!finite(scene.fps) || scene.fps <= 0) errors.push({ path: "fps", message: "must be a positive number" });
    if (!Number.isInteger(scene.width) || scene.width <= 0) errors.push({ path: "width", message: "must be a positive integer" });
    if (!Number.isInteger(scene.height) || scene.height <= 0) errors.push({ path: "height", message: "must be a positive integer" });
    if (finite(scene.duration) && finite(scene.fps) && Math.abs(scene.duration * scene.fps - Math.round(scene.duration * scene.fps)) > 1e-6) {
      errors.push({ path: "duration", message: "duration × fps must resolve to a whole frame count" });
    }

    const layers = Array.isArray(scene.layers) ? scene.layers : [];
    const objects = Array.isArray(scene.objects) ? scene.objects : [];
    const layerMap = indexById(layers, "layers", errors);
    const objectMap = indexById(objects, "objects", errors);
    const events = Array.isArray(scene.events) ? scene.events : [];
    const variables = isObject(scene.variables) ? scene.variables : {};
    if (scene.events != null && !Array.isArray(scene.events)) errors.push({ path: "events", message: "must be an array" });
    if (scene.bindings != null && !Array.isArray(scene.bindings)) errors.push({ path: "bindings", message: "must be an array" });
    if (scene.objects != null && !Array.isArray(scene.objects)) errors.push({ path: "objects", message: "must be an array" });
    if (scene.layers != null && !Array.isArray(scene.layers)) errors.push({ path: "layers", message: "must be an array" });
    if (scene.variables != null && !isObject(scene.variables)) errors.push({ path: "variables", message: "must be an object" });
    if (scene.camera != null && !isObject(scene.camera)) errors.push({ path: "camera", message: "must be an object" });
    for (const key of ["x", "y", "zoom", "rotation"]) {
      if (scene.camera && scene.camera[key] != null && !finite(scene.camera[key])) errors.push({ path: `camera.${key}`, message: "must be finite" });
    }
    if (scene.camera && scene.camera.zoom != null && scene.camera.zoom <= 0) errors.push({ path: "camera.zoom", message: "must be positive" });
    if (scene.styles != null && !isObject(scene.styles)) errors.push({ path: "styles", message: "must be an object of named style objects" });

    for (const [index, layer] of layers.entries()) {
      const path = `layers[${index}]`;
      if (!isObject(layer)) continue;
      if (layer.parent != null && !layerMap.has(layer.parent)) errors.push({ path: `${path}.parent`, message: `unknown layer ${layer.parent}` });
      if (layer.space != null && layer.space !== "world" && layer.space !== "screen") errors.push({ path: `${path}.space`, message: "must be world or screen" });
      if (layer.blendMode != null && !BLENDS.has(layer.blendMode)) errors.push({ path: `${path}.blendMode`, message: `unsupported blend mode ${layer.blendMode}` });
      if (layer.style != null && !(scene.styles && isObject(scene.styles[layer.style]))) errors.push({ path: `${path}.style`, message: `unknown style ${layer.style}` });
      if (layer.clip != null && !["rect", "polygon"].includes(layer.clip.type)) errors.push({ path: `${path}.clip.type`, message: "must be rect or polygon" });
      if (layer.transform != null && !isObject(layer.transform)) errors.push({ path: `${path}.transform`, message: "must be an object" });
      if (layer.transform) for (const key of ["x", "y", "rotation", "scale", "scaleX", "scaleY"]) {
        if (layer.transform[key] != null && !finite(layer.transform[key])) errors.push({ path: `${path}.transform.${key}`, message: "must be finite" });
      }
      if (layer.clip && layer.clip.type === "polygon" && (!Array.isArray(layer.clip.points) || layer.clip.points.length < 3)) errors.push({ path: `${path}.clip.points`, message: "polygon clip needs at least three points" });
    }

    for (const layer of layers) {
      if (!isObject(layer)) continue;
      const seen = new Set([layer.id]);
      let parent = layer.parent;
      while (parent != null && layerMap.has(parent)) {
        if (seen.has(parent)) {
          errors.push({ path: `layers.${layer.id}.parent`, message: "layer parent cycle" });
          break;
        }
        seen.add(parent);
        parent = layerMap.get(parent).parent;
      }
      if (layer.parent != null && layerMap.has(layer.parent)) {
        const parentSpace = effectiveLayerSpace(layer.parent, layerMap);
        if (layer.space != null && layer.space !== parentSpace) errors.push({ path: `layers.${layer.id}.space`, message: "child layers inherit parent coordinate space" });
      }
    }

    for (const [index, object] of objects.entries()) {
      const path = `objects[${index}]`;
      if (!isObject(object)) continue;
      if (typeof object.type !== "string" || (!DRAW_TYPES.has(object.type) && !object.type.startsWith("custom:"))) {
        errors.push({ path: `${path}.type`, message: `unsupported type ${object.type}` });
      }
      if (object.layer != null && !layerMap.has(object.layer)) errors.push({ path: `${path}.layer`, message: `unknown layer ${object.layer}` });
      if (object.style != null && !(scene.styles && isObject(scene.styles[object.style]))) errors.push({ path: `${path}.style`, message: `unknown style ${object.style}` });
      if (object.space != null && object.space !== "world" && object.space !== "screen") errors.push({ path: `${path}.space`, message: "must be world or screen" });
      if (object.layer != null && object.space != null && layerMap.has(object.layer) && object.space !== effectiveLayerSpace(object.layer, layerMap)) errors.push({ path: `${path}.space`, message: "layer objects inherit their layer coordinate space" });
      if ((object.type === "path" || object.type === "polygon") && !object.morph) {
        const minimum = object.type === "polygon" ? 3 : 2;
        if (!validPoints(object.points, minimum)) {
          errors.push({ path: `${path}.points`, message: "requires at least two finite {x,y} points" });
        }
      }
      if (object.morph != null) {
        try {
          if (object.type !== "path" && object.type !== "polygon") throw new TypeError("morph is supported for path and polygon objects");
          if (!isObject(object.morph) || !validPoints(object.morph.from, 2) || !validPoints(object.morph.to, 2)) throw new TypeError("requires finite from/to point paths");
          prepareMorph(object.morph.from, object.morph.to, object.morph);
        } catch (error) {
          errors.push({ path: `${path}.morph`, message: error.message });
        }
      }
      if (object.type === "pixels" && (!Array.isArray(object.cells) || !finite(object.pixelSize) || object.pixelSize <= 0)) {
        errors.push({ path, message: "pixel objects require cells and a positive pixelSize" });
      }
      if (object.type === "text") {
        if (object.font != null && (typeof object.font !== "string" || !object.font.trim())) errors.push({ path: `${path}.font`, message: "must be a non-empty Canvas font shorthand string" });
        if (object.fontSize != null && (!finite(object.fontSize) || object.fontSize <= 0)) errors.push({ path: `${path}.fontSize`, message: "must be a positive finite number" });
        if (object.maxWidth != null && (!finite(object.maxWidth) || object.maxWidth <= 0)) errors.push({ path: `${path}.maxWidth`, message: "must be a positive finite number" });
        if (object.lineHeight != null && (!finite(object.lineHeight) || object.lineHeight <= 0)) errors.push({ path: `${path}.lineHeight`, message: "must be a positive finite number" });
        if (object.letterSpacing != null && !finite(object.letterSpacing)) errors.push({ path: `${path}.letterSpacing`, message: "must be finite" });
        for (const key of ["fontFamily", "fontStyle", "fontWeight"]) {
          if (object[key] != null && typeof object[key] !== "string") errors.push({ path: `${path}.${key}`, message: "must be a string" });
        }
      }
      if (typeof object.type === "string" && object.type.startsWith("custom:") && object.type.length <= 7) errors.push({ path: `${path}.type`, message: "custom type must be named custom:<name>" });
    }

    const eventWrites = new Map();
    events.forEach((event, index) => {
      const path = `events[${index}]`;
      if (!isObject(event) || !isObject(event.target)) {
        errors.push({ path, message: "requires a target object" });
        return;
      }
      const { kind, id } = event.target;
      const property = event.property || (kind === "variable" ? "value" : null);
      if (!property || typeof property !== "string") errors.push({ path: `${path}.property`, message: "requires a property" });
      if (!["object", "layer", "camera", "variable"].includes(kind)) errors.push({ path: `${path}.target.kind`, message: "must be object, layer, camera or variable" });
      if (property && !validEventProperty(kind, property)) errors.push({ path: `${path}.property`, message: `unsupported animated property ${kind}.${property}` });
      if (kind === "object" && !objectMap.has(id)) errors.push({ path: `${path}.target.id`, message: `unknown object ${id}` });
      if (kind === "layer" && !layerMap.has(id)) errors.push({ path: `${path}.target.id`, message: `unknown layer ${id}` });
      if (kind === "variable" && !Object.prototype.hasOwnProperty.call(variables, id)) errors.push({ path: `${path}.target.id`, message: `unknown variable ${id}` });
      if (kind === "camera" && id !== "camera") errors.push({ path: `${path}.target.id`, message: "camera target id must be camera" });
      if (!finite(event.start) || event.start < 0 || !finite(event.duration) || event.duration < 0) errors.push({ path, message: "start and duration must be non-negative seconds" });
      if (event.ease != null && (typeof event.ease !== "string" || !EASES.has(event.ease))) errors.push({ path: `${path}.ease`, message: `unsupported ease ${String(event.ease)}; use ${[...EASES].join(", ")}` });
      if (finite(scene.duration) && finite(event.start) && (event.start >= scene.duration || event.start + (finite(event.duration) ? event.duration : 0) > scene.duration + 1e-9)) {
        errors.push({ path, message: "event must begin before scene end and finish within it" });
      }
      if (!("from" in event) || !("to" in event)) errors.push({ path, message: "requires explicit from and to values" });
      if (kind === "object" && property === "fontSize" && (!finite(event.from) || event.from <= 0 || !finite(event.to) || event.to <= 0)) errors.push({ path, message: "fontSize event values must be positive finite numbers" });
      if (kind === "camera" && property === "zoom" && ((finite(event.from) && event.from <= 0) || (finite(event.to) && event.to <= 0))) errors.push({ path, message: "camera zoom values must be positive" });

      if (property) {
        const key = `${kind}:${id}:${property}`;
        const prior = eventWrites.get(key) || [];
        for (const other of prior) {
          if (intervalsOverlap(event, other.event)) errors.push({ path: `${path}.property`, message: `overlaps event ${other.id} on ${key}` });
        }
        prior.push({ id: event.id || `events[${index}]`, event });
        eventWrites.set(key, prior);
      }
    });

    const bindingTargets = new Map();
    const bindings = Array.isArray(scene.bindings) ? scene.bindings : [];
    bindings.forEach((binding, index) => {
      const path = `bindings[${index}]`;
      if (!isObject(binding) || !isObject(binding.target)) {
        errors.push({ path, message: "requires a target object" });
        return;
      }
      if (typeof binding.source !== "string" || !Object.prototype.hasOwnProperty.call(variables, binding.source)) errors.push({ path: `${path}.source`, message: `unknown variable ${binding.source}` });
      const { kind, id } = binding.target;
      if (kind === "object" && !objectMap.has(id)) errors.push({ path: `${path}.target.id`, message: `unknown object ${id}` });
      else if (kind === "layer" && !layerMap.has(id)) errors.push({ path: `${path}.target.id`, message: `unknown layer ${id}` });
      else if (kind !== "object" && kind !== "layer") errors.push({ path: `${path}.target.kind`, message: "must be object or layer" });
      if (typeof binding.target.property !== "string" || !binding.target.property) errors.push({ path: `${path}.target.property`, message: "requires a property" });
      const key = `${kind}:${id}:${binding.target.property}`;
      if (bindingTargets.has(key)) errors.push({ path: `${path}.target`, message: `multiple bindings control ${key}` });
      bindingTargets.set(key, path);
      if (eventWrites.has(key)) errors.push({ path: `${path}.target`, message: `binding conflicts with an event on ${key}` });
      if (binding.input != null && (!Array.isArray(binding.input) || binding.input.length !== 2 || !binding.input.every(finite))) errors.push({ path: `${path}.input`, message: "must be two finite numbers" });
      if (binding.output != null && (!Array.isArray(binding.output) || binding.output.length !== 2 || !binding.output.every(finite))) errors.push({ path: `${path}.output`, message: "must be two finite numbers" });
    });

    return errors;
  }

  function assertValidScene(scene) {
    const errors = validateScene(scene);
    if (errors.length) {
      const message = errors.map((error) => `${error.path}: ${error.message}`).join("\n");
      const error = new Error(`Invalid motion scene:\n${message}`);
      error.validationErrors = errors;
      throw error;
    }
    return scene;
  }

  function eventValue(event, time) {
    const elapsed = time - event.start;
    const raw = event.duration === 0 ? 1 : clamp(elapsed / event.duration, 0, 1);
    const amount = ease(raw, event.ease == null ? "linear" : event.ease);
    return interpolate(event.from, event.to, amount, event.property);
  }

  function textStartX(ctx, x, width) {
    const align = ctx.textAlign || "start";
    const direction = ctx.direction === "rtl" ? "rtl" : "ltr";
    if (align === "center") return x - width / 2;
    if (align === "right" || (align === "end" && direction === "ltr") || (align === "start" && direction === "rtl")) return x - width;
    return x;
  }

  function drawTextLine(ctx, line, x, y, mode, letterSpacing) {
    const draw = mode === "fill" ? "fillText" : "strokeText";
    if (letterSpacing === 0) {
      ctx[draw](line, x, y);
      return;
    }
    if ("letterSpacing" in ctx) {
      ctx.letterSpacing = `${letterSpacing}px`;
      ctx[draw](line, x, y);
      return;
    }
    if (ctx.direction === "rtl") throw new Error("letterSpacing fallback requires native Canvas letterSpacing for right-to-left text");
    const clusters = splitGraphemes(line);
    const totalWidth = measuredWidth(ctx, line, letterSpacing);
    const startX = textStartX(ctx, x, totalWidth);
    let cursor = startX;
    const originalAlign = ctx.textAlign;
    ctx.textAlign = "left";
    let prefix = "";
    try {
      for (let index = 0; index < clusters.length; index += 1) {
        const cluster = clusters[index];
        ctx[draw](cluster, cursor, y);
        prefix += cluster;
        cursor = startX + ctx.measureText(prefix).width + letterSpacing * (index + 1);
      }
    } finally {
      ctx.textAlign = originalAlign;
    }
  }

  function drawTextObject(ctx, object) {
    configureTextFont(ctx, object);
    ctx.textAlign = object.align || "left";
    ctx.textBaseline = object.baseline || "alphabetic";
    const letterSpacing = object.letterSpacing == null ? 0 : object.letterSpacing;
    const layout = layoutText(ctx, object.text == null ? "" : object.text, {
      maxWidth: object.maxWidth,
      lineHeight: object.lineHeight,
      letterSpacing,
    });
    const x = object.x || 0;
    const y = object.y || 0;
    for (let index = 0; index < layout.lines.length; index += 1) {
      const line = layout.lines[index];
      const lineY = y + index * layout.lineHeight;
      if (object.fill != null && object.fill !== "none") {
        ctx.fillStyle = object.fill;
        drawTextLine(ctx, line, x, lineY, "fill", letterSpacing);
      }
      if (object.stroke != null && object.stroke !== "none") {
        ctx.strokeStyle = object.stroke;
        ctx.lineWidth = object.lineWidth || 1;
        drawTextLine(ctx, line, x, lineY, "stroke", letterSpacing);
      }
    }
  }

  function evaluateScene(scene, time, alreadyValidated) {
    if (!alreadyValidated) assertValidScene(scene);
    if (!finite(time)) throw new TypeError("time must be a finite number of seconds");
    const t = clamp(time, 0, scene.duration);
    const state = {
      time: t,
      variables: cloneValue(scene.variables || {}),
      objects: Object.fromEntries((scene.objects || []).map((object) => [object.id, cloneValue(object)])),
      layers: Object.fromEntries((scene.layers || []).map((layer) => [layer.id, cloneValue(layer)])),
      camera: cloneValue({ ...(scene.camera || {}), zoom: scene.camera && finite(scene.camera.zoom) ? scene.camera.zoom : 1 }),
    };
    if (!finite(state.camera.x)) state.camera.x = scene.width / 2;
    if (!finite(state.camera.y)) state.camera.y = scene.height / 2;
    if (!finite(state.camera.rotation)) state.camera.rotation = 0;
    const events = [...(scene.events || [])].sort((a, b) => a.start - b.start);
    for (const event of events) {
      if (t < event.start) continue;
      const target = event.target;
      const property = event.property || "value";
      if (target.kind === "variable") state.variables[target.id] = eventValue(event, t);
      else if (target.kind === "object") setPath(state.objects[target.id], property, eventValue(event, t));
      else if (target.kind === "layer") setPath(state.layers[target.id], property, eventValue(event, t));
      else setPath(state.camera, property, eventValue(event, t));
    }

    for (const binding of scene.bindings || []) {
      const value = state.variables[binding.source];
      let mapped = value;
      if (finite(value) && Array.isArray(binding.input) && Array.isArray(binding.output)) {
        const [fromMin, fromMax] = binding.input;
        const [toMin, toMax] = binding.output;
        const p = fromMax === fromMin ? 0 : (value - fromMin) / (fromMax - fromMin);
        const bounded = binding.clamp === false ? p : clamp(p, 0, 1);
        mapped = toMin + (toMax - toMin) * bounded;
      }
      const destination = binding.target.kind === "object" ? state.objects[binding.target.id] : state.layers[binding.target.id];
      setPath(destination, binding.target.property, mapped);
    }
    return state;
  }

  function pathMetrics(points, closed) {
    if (!Array.isArray(points) || points.length < 2) throw new TypeError("path needs at least two points");
    const segments = [];
    let total = 0;
    const count = closed ? points.length : points.length - 1;
    for (let index = 0; index < count; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      segments.push({ a, b, length, start: total, end: total + length });
      total += length;
    }
    return { segments, length: total };
  }

  function pointAt(points, progress, closed) {
    const metrics = pathMetrics(points, Boolean(closed));
    if (!metrics.length) return { ...points[0] };
    const distance = clamp(progress, 0, 1) * metrics.length;
    const segment = metrics.segments.find((item) => distance <= item.end) || metrics.segments[metrics.segments.length - 1];
    const local = segment.length === 0 ? 1 : clamp((distance - segment.start) / segment.length, 0, 1);
    return { x: segment.a.x + (segment.b.x - segment.a.x) * local, y: segment.a.y + (segment.b.y - segment.a.y) * local };
  }

  function drawPathProgress(ctx, points, progress, options) {
    const opts = options || {};
    const closed = Boolean(opts.closed);
    const metrics = pathMetrics(points, closed);
    const p = clamp(progress, 0, 1);
    const target = p * metrics.length;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const segment of metrics.segments) {
      if (target <= segment.start) break;
      if (target >= segment.end) {
        ctx.lineTo(segment.b.x, segment.b.y);
      } else {
        const local = segment.length === 0 ? 1 : (target - segment.start) / segment.length;
        ctx.lineTo(segment.a.x + (segment.b.x - segment.a.x) * local, segment.a.y + (segment.b.y - segment.a.y) * local);
        break;
      }
    }
    if (closed && p >= 1) ctx.closePath();
    if (opts.stroke != null && opts.stroke !== "none") {
      ctx.strokeStyle = opts.stroke;
      if (finite(opts.lineWidth)) ctx.lineWidth = opts.lineWidth;
      if (opts.lineCap) ctx.lineCap = opts.lineCap;
      if (opts.lineJoin) ctx.lineJoin = opts.lineJoin;
      ctx.stroke();
    }
    if (closed && p >= 1 && opts.fill && opts.fill !== "none") ctx.fill();
    return pointAt(points, p, closed);
  }

  function prepareMorph(fromPoints, toPoints, options) {
    const opts = options || {};
    const anchors = opts.anchors;
    if (!Array.isArray(anchors) || anchors.length < 2) throw new TypeError("morph requires explicit ordered {from,to} correspondence anchors");
    const tolerance = 1e-9;
    if (Math.abs(anchors[0].from) > tolerance || Math.abs(anchors[0].to) > tolerance || Math.abs(anchors[anchors.length - 1].from - 1) > tolerance || Math.abs(anchors[anchors.length - 1].to - 1) > tolerance) {
      throw new TypeError("morph anchors must begin at {from:0,to:0} and end at {from:1,to:1}");
    }
    for (let index = 0; index < anchors.length; index += 1) {
      const anchor = anchors[index];
      if (!finite(anchor.from) || !finite(anchor.to) || anchor.from < 0 || anchor.from > 1 || anchor.to < 0 || anchor.to > 1) throw new TypeError("morph anchors must be normalized finite positions");
      if (index && (anchor.from <= anchors[index - 1].from || anchor.to <= anchors[index - 1].to)) throw new TypeError("morph anchors must preserve order in both paths");
    }
    pathMetrics(fromPoints, Boolean(opts.closed));
    pathMetrics(toPoints, Boolean(opts.closed));
    const steps = Number.isInteger(opts.samplesPerAnchor) && opts.samplesPerAnchor >= 1 ? opts.samplesPerAnchor : 8;
    const pairedFrom = [];
    const pairedTo = [];
    for (let anchorIndex = 0; anchorIndex < anchors.length - 1; anchorIndex += 1) {
      const a = anchors[anchorIndex];
      const b = anchors[anchorIndex + 1];
      for (let step = 0; step <= steps; step += 1) {
        if (anchorIndex > 0 && step === 0) continue;
        const p = step / steps;
        pairedFrom.push(pointAt(fromPoints, a.from + (b.from - a.from) * p, opts.closed));
        pairedTo.push(pointAt(toPoints, a.to + (b.to - a.to) * p, opts.closed));
      }
    }
    return { from: pairedFrom, to: pairedTo, closed: Boolean(opts.closed), anchors: anchors.map((anchor) => ({ from: anchor.from, to: anchor.to })) };
  }

  function morphAt(morph, progress) {
    if (!morph || !Array.isArray(morph.from) || morph.from.length !== morph.to.length) throw new TypeError("invalid prepared morph");
    const p = clamp(progress, 0, 1);
    const points = morph.from.map((point, index) => ({
      x: point.x + (morph.to[index].x - point.x) * p,
      y: point.y + (morph.to[index].y - point.y) * p,
    }));
    return points;
  }

  function rotate(point, degrees) {
    const radians = degrees * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    return { x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine };
  }

  function worldToScreen(point, camera, width, height) {
    const view = normalizeCamera(camera, width, height);
    const rotated = rotate({ x: point.x - view.x, y: point.y - view.y }, view.rotation);
    const zoom = view.zoom;
    return { x: width / 2 + rotated.x * zoom, y: height / 2 + rotated.y * zoom };
  }

  function screenToWorld(point, camera, width, height) {
    const view = normalizeCamera(camera, width, height);
    const zoom = view.zoom;
    const unscaled = { x: (point.x - width / 2) / zoom, y: (point.y - height / 2) / zoom };
    const unrotated = rotate(unscaled, -view.rotation);
    return { x: unrotated.x + view.x, y: unrotated.y + view.y };
  }

  function normalizeCamera(camera, width, height) {
    const value = camera || {};
    return {
      x: finite(value.x) ? value.x : width / 2,
      y: finite(value.y) ? value.y : height / 2,
      zoom: finite(value.zoom) && value.zoom > 0 ? value.zoom : 1,
      rotation: finite(value.rotation) ? value.rotation : 0,
    };
  }

  function cameraForAnchor(worldAnchor, screenAnchor, zoom, width, height, rotation) {
    if (!finite(zoom) || zoom <= 0) throw new TypeError("camera zoom must be positive");
    const screenOffset = { x: (screenAnchor.x - width / 2) / zoom, y: (screenAnchor.y - height / 2) / zoom };
    const worldOffset = rotate(screenOffset, -(rotation || 0));
    return { x: worldAnchor.x - worldOffset.x, y: worldAnchor.y - worldOffset.y, zoom, rotation: rotation || 0 };
  }

  function canvasFor(ctx) {
    const source = ctx.canvas;
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(source.width, source.height);
    const canvas = source.ownerDocument.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    return canvas;
  }

  function matrixMultiply(a, b) {
    return [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];
  }

  function layerMatrix(transform) {
    const value = transform || {};
    const radians = (value.rotation || 0) * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const scaleX = finite(value.scaleX) ? value.scaleX : (finite(value.scale) ? value.scale : 1);
    const scaleY = finite(value.scaleY) ? value.scaleY : (finite(value.scale) ? value.scale : 1);
    return [cosine * scaleX, sine * scaleX, -sine * scaleY, cosine * scaleY, value.x || 0, value.y || 0];
  }

  function cameraMatrix(camera, width, height) {
    const view = normalizeCamera(camera, width, height);
    const radians = view.rotation * Math.PI / 180;
    const cosine = Math.cos(radians) * view.zoom;
    const sine = Math.sin(radians) * view.zoom;
    const linear = [cosine, sine, -sine, cosine, 0, 0];
    return matrixMultiply(matrixMultiply([1, 0, 0, 1, width / 2, height / 2], linear), [1, 0, 0, 1, -view.x, -view.y]);
  }

  function applyObjectTransform(ctx, object) {
    const scaleX = finite(object.scaleX) ? object.scaleX : (finite(object.scale) ? object.scale : 1);
    const scaleY = finite(object.scaleY) ? object.scaleY : (finite(object.scale) ? object.scale : 1);
    const anchorX = finite(object.anchorX) ? object.anchorX : (finite(object.x) && finite(object.width) ? object.x + object.width / 2 : (finite(object.cx) ? object.cx : 0));
    const anchorY = finite(object.anchorY) ? object.anchorY : (finite(object.y) && finite(object.height) ? object.y + object.height / 2 : (finite(object.cy) ? object.cy : 0));
    ctx.translate(object.translateX || 0, object.translateY || 0);
    ctx.translate(anchorX, anchorY);
    if (object.rotation) ctx.rotate(object.rotation * Math.PI / 180);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-anchorX, -anchorY);
  }

  function styleByName(scene, name) {
    if (!name) return {};
    const value = scene.styles && scene.styles[name];
    if (!isObject(value)) throw new Error(`Unknown style ${name}`);
    return value;
  }

  function resolvePaint(value, palette) {
    if (typeof value === "string" && value.startsWith("@")) {
      const role = value.slice(1);
      if (!Object.prototype.hasOwnProperty.call(palette, role)) throw new Error(`Unknown palette role @${role}`);
      return palette[role];
    }
    return value;
  }

  function resolvedAttributes(scene, inheritedStyle, object) {
    const attrs = Object.assign({}, inheritedStyle, styleByName(scene, object.style), object.styleOverrides || {}, object);
    for (const key of PAINT_KEYS) if (attrs[key] != null) attrs[key] = resolvePaint(attrs[key], scene.palette || {});
    return attrs;
  }

  function objectTransformMatrix(object) {
    const scaleX = finite(object.scaleX) ? object.scaleX : (finite(object.scale) ? object.scale : 1);
    const scaleY = finite(object.scaleY) ? object.scaleY : (finite(object.scale) ? object.scale : 1);
    const anchorX = finite(object.anchorX) ? object.anchorX : (finite(object.x) && finite(object.width) ? object.x + object.width / 2 : (finite(object.cx) ? object.cx : 0));
    const anchorY = finite(object.anchorY) ? object.anchorY : (finite(object.y) && finite(object.height) ? object.y + object.height / 2 : (finite(object.cy) ? object.cy : 0));
    const radians = (object.rotation || 0) * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const translate = (x, y) => [1, 0, 0, 1, x, y];
    let matrix = translate(object.translateX || 0, object.translateY || 0);
    matrix = matrixMultiply(matrix, translate(anchorX, anchorY));
    matrix = matrixMultiply(matrix, [cosine, sine, -sine, cosine, 0, 0]);
    matrix = matrixMultiply(matrix, [scaleX, 0, 0, scaleY, 0, 0]);
    matrix = matrixMultiply(matrix, translate(-anchorX, -anchorY));
    return matrix;
  }

  function projectRectObject(scene, state, targetId) {
    const rawObject = state && state.objects && state.objects[targetId];
    if (!rawObject || rawObject.type !== "rect") throw new Error(`projectRectObject requires an evaluated rect object ${targetId}`);
    const layers = new Map((scene.layers || []).map((layer) => [layer.id, layer]));
    const chain = [];
    let layerId = rawObject.layer;
    while (layerId != null) {
      const layer = layers.get(layerId);
      if (!layer) throw new Error(`projectRectObject found missing layer ${layerId} for ${targetId}`);
      chain.unshift(layerId);
      layerId = layer.parent;
    }
    const space = chain.length ? (layers.get(chain[0]).space || "world") : (rawObject.space || "world");
    let matrix = space === "screen" ? [1, 0, 0, 1, 0, 0] : cameraMatrix(state.camera, scene.width, scene.height);
    let inheritedStyle = {};
    let effectiveOpacity = 1;
    for (const id of chain) {
      const original = layers.get(id);
      const value = state.layers[id] || original;
      matrix = matrixMultiply(matrix, layerMatrix(value.transform));
      inheritedStyle = blendStyle(inheritedStyle, styleByName(scene, original.style || value.style));
      effectiveOpacity *= finite(value.opacity) ? clamp(value.opacity, 0, 1) : 1;
    }
    const object = resolvedAttributes(scene, inheritedStyle, rawObject);
    matrix = matrixMultiply(matrix, objectTransformMatrix(object));
    effectiveOpacity *= finite(object.opacity) ? clamp(object.opacity, 0, 1) : 1;
    const x = finite(object.x) ? object.x : 0;
    const y = finite(object.y) ? object.y : 0;
    const width = finite(object.width) ? object.width : 0;
    const height = finite(object.height) ? object.height : 0;
    const transformPoint = (px, py) => ({
      x: matrix[0] * px + matrix[2] * py + matrix[4],
      y: matrix[1] * px + matrix[3] * py + matrix[5],
    });
    return {
      object,
      effectiveOpacity,
      visible: object.visible !== false && effectiveOpacity > 0,
      screenCorners: [
        transformPoint(x, y),
        transformPoint(x + width, y),
        transformPoint(x + width, y + height),
        transformPoint(x, y + height),
      ],
    };
  }

  function pathFor(ctx, points, closed) {
    if (!Array.isArray(points) || points.length < 2) return false;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    if (closed) ctx.closePath();
    return true;
  }

  function paintShape(ctx, object, drawPath) {
    if (object.fill != null && object.fill !== "none") {
      ctx.fillStyle = object.fill;
      ctx.fill();
    }
    if (object.stroke != null && object.stroke !== "none") {
      ctx.strokeStyle = object.stroke;
      ctx.lineWidth = finite(object.lineWidth) ? object.lineWidth : 1;
      ctx.lineCap = object.lineCap || "round";
      ctx.lineJoin = object.lineJoin || "round";
      if (drawPath) drawPath();
      ctx.stroke();
    }
  }

  function drawPrimitive(ctx, object, t, renderers, scene, preparedMorphs, evaluatedState) {
    if (object.visible === false || (finite(object.opacity) && object.opacity <= 0)) return;
    if (object.morph) {
      const morph = preparedMorphs.get(object.id) || prepareMorph(object.morph.from, object.morph.to, object.morph);
      object = { ...object, points: morphAt(morph, object.morphProgress == null ? 1 : object.morphProgress), closed: morph.closed };
    }
    ctx.save();
    ctx.globalAlpha *= finite(object.opacity) ? clamp(object.opacity, 0, 1) : 1;
    applyObjectTransform(ctx, object);
    switch (object.type) {
      case "rect":
        if (object.fill != null && object.fill !== "none") { ctx.fillStyle = object.fill; ctx.fillRect(object.x || 0, object.y || 0, object.width || 0, object.height || 0); }
        if (object.stroke != null && object.stroke !== "none") { ctx.strokeStyle = object.stroke; ctx.lineWidth = object.lineWidth || 1; ctx.strokeRect(object.x || 0, object.y || 0, object.width || 0, object.height || 0); }
        break;
      case "circle":
        ctx.beginPath(); ctx.arc(object.cx || 0, object.cy || 0, Math.max(0, object.r || 0), 0, Math.PI * 2);
        paintShape(ctx, object);
        break;
      case "ellipse":
        ctx.beginPath(); ctx.ellipse(object.cx || 0, object.cy || 0, Math.max(0, object.rx || 0), Math.max(0, object.ry || 0), object.angle || 0, 0, Math.PI * 2);
        paintShape(ctx, object);
        break;
      case "line": {
        const points = [{ x: object.x1 || 0, y: object.y1 || 0 }, { x: object.x2 || 0, y: object.y2 || 0 }];
        drawPathProgress(ctx, points, object.progress == null ? 1 : object.progress, { stroke: object.stroke, lineWidth: object.lineWidth || 1, lineCap: object.lineCap || "round" });
        break;
      }
      case "path":
      case "polygon": {
        const closed = Boolean(object.closed || object.type === "polygon");
        const progress = object.progress == null ? 1 : clamp(object.progress, 0, 1);
        if (closed && progress >= 1) {
          if (pathFor(ctx, object.points, true)) paintShape(ctx, object);
        } else {
          drawPathProgress(ctx, object.points, progress, { closed, stroke: object.stroke, lineWidth: object.lineWidth || 1, lineCap: object.lineCap || "round", lineJoin: object.lineJoin || "round" });
        }
        break;
      }
      case "text":
        drawTextObject(ctx, object);
        break;
      case "pixels":
        ctx.imageSmoothingEnabled = false;
        for (const cell of object.cells || []) {
          const x = object.x || 0; const y = object.y || 0; const size = object.pixelSize;
          const color = resolvePaint(cell.color == null ? object.fill : cell.color, scene.palette || {});
          if (color == null || color === "none") continue;
          ctx.fillStyle = color;
          ctx.fillRect(x + cell.x * size, y + cell.y * size, size, size);
        }
        break;
      default: {
        const renderer = renderers && renderers[object.type];
        if (typeof renderer !== "function") throw new Error(`No renderer registered for ${object.type}`);
        renderer(ctx, object, t, scene, evaluatedState);
      }
    }
    ctx.restore();
  }

  function drawClip(ctx, clip) {
    if (!clip) return;
    ctx.beginPath();
    if (clip.type === "rect") ctx.rect(clip.x || 0, clip.y || 0, clip.width || 0, clip.height || 0);
    else if (clip.type === "polygon") pathFor(ctx, clip.points, true);
    ctx.clip();
  }

  function blendStyle(parent, child) {
    return Object.assign({}, parent || {}, child || {});
  }

  function preparedMorphsFor(scene) {
    if (morphCacheByScene.has(scene)) return morphCacheByScene.get(scene);
    const prepared = new Map();
    for (const object of scene.objects || []) {
      if (isObject(object) && object.morph && object.id) prepared.set(object.id, prepareMorph(object.morph.from, object.morph.to, object.morph));
    }
    morphCacheByScene.set(scene, prepared);
    return prepared;
  }

  function drawFrame(canvasOrContext, scene, time, renderers, alreadyValidated) {
    if (!alreadyValidated) assertValidScene(scene);
    const ctx = canvasOrContext && typeof canvasOrContext.getContext === "function" ? canvasOrContext.getContext("2d") : canvasOrContext;
    if (!ctx || !ctx.canvas) throw new TypeError("drawFrame requires a Canvas or 2D context");
    const state = evaluateScene(scene, time, true);
    const preparedMorphs = preparedMorphsFor(scene);
    const width = scene.width; const height = scene.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (scene.background && scene.background !== "transparent") {
      ctx.fillStyle = resolvePaint(scene.background, scene.palette || {});
      ctx.fillRect(0, 0, width, height);
    }

    const objects = state.objects;
    const layers = state.layers;
    const layerList = scene.layers || [];
    const layerMap = new Map(layerList.map((layer) => [layer.id, layer]));
    const children = new Map();
    for (const layer of layerList) {
      const key = layer.parent == null ? null : layer.parent;
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(layer.id);
    }
    const objectsByLayer = new Map();
    for (const object of Object.values(objects)) {
      const key = object.layer == null ? null : object.layer;
      if (!objectsByLayer.has(key)) objectsByLayer.set(key, []);
      objectsByLayer.get(key).push(object);
    }
    const registry = renderers || {};

    function renderObjects(targetCtx, layerId, inheritedStyle, matrix) {
      for (const object of objectsByLayer.get(layerId) || []) {
        const attrs = resolvedAttributes(scene, inheritedStyle, object);
        targetCtx.save();
        targetCtx.setTransform(...matrix);
        drawPrimitive(targetCtx, attrs, state.time, registry, scene, preparedMorphs, state);
        targetCtx.restore();
      }
    }

    function layerStyle(layerId, inheritedStyle) {
      const original = layerMap.get(layerId);
      const value = layers[layerId];
      return blendStyle(inheritedStyle, styleByName(scene, original.style || value.style));
    }

    function renderLayerGroup(destination, layerId, inheritedStyle, parentMatrix) {
      const original = layerMap.get(layerId);
      const layer = layers[layerId];
      const matrix = matrixMultiply(parentMatrix, layerMatrix(layer.transform));
      const group = canvasFor(ctx);
      const groupCtx = group.getContext("2d");
      const mergedStyle = layerStyle(layerId, inheritedStyle);
      renderObjects(groupCtx, layerId, mergedStyle, matrix);
      for (const childId of children.get(layerId) || []) renderLayerGroup(groupCtx, childId, mergedStyle, matrix);

      destination.save();
      destination.setTransform(...matrix);
      drawClip(destination, original.clip);
      destination.setTransform(1, 0, 0, 1, 0, 0);
      destination.globalAlpha *= finite(layer.opacity) ? clamp(layer.opacity, 0, 1) : 1;
      destination.globalCompositeOperation = original.blendMode || "source-over";
      destination.drawImage(group, 0, 0);
      destination.restore();
    }

    function drawRoots(space, rootMatrix) {
      for (const rootId of children.get(null) || []) {
        const original = layerMap.get(rootId);
        const rootSpace = original.space || "world";
        if (rootSpace !== space) continue;
        renderLayerGroup(ctx, rootId, {}, rootMatrix);
      }
    }

    for (const object of objectsByLayer.get(null) || []) {
      ctx.save();
      const matrix = object.space === "screen" ? [1, 0, 0, 1, 0, 0] : cameraMatrix(state.camera, width, height);
      ctx.setTransform(...matrix);
      drawPrimitive(ctx, resolvedAttributes(scene, {}, object), state.time, registry, scene, preparedMorphs, state);
      ctx.restore();
    }
    drawRoots("world", cameraMatrix(state.camera, width, height));
    drawRoots("screen", [1, 0, 0, 1, 0, 0]);
    ctx.restore();
    return state;
  }

  return {
    version: 1,
    validateScene,
    assertValidScene,
    evaluateScene,
    drawFrame,
    pointAt,
    drawPathProgress,
    prepareMorph,
    morphAt,
    worldToScreen,
    screenToWorld,
    cameraForAnchor,
    projectRectObject,
    layoutText,
  };
});
