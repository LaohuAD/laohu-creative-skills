export const SCREEN_TEXT_MAP_FORMAT = 'laohu.motion.screen-text-map/1';

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

/**
 * Controlled text consumers for Canvas, DOM/SVG and Canvas-backed Three.js textures.
 * The function is self-contained so the wrapper can install the same contract in a page
 * before its real render(t) entrypoint runs. Trace statuses prove a bound draw/write call,
 * not that the resulting pixels are legible or visually correct.
 */
export function createBriefTextRuntime(map, {host = globalThis, allowCaptionCalibration = false, guardCanvasText = false} = {}) {
  const targets = new Set(['canvas', 'dom', 'svg', 'three-texture', 'glyph-path', 'caption-overlay', 'external-image']);
  const failRuntime = (code, message) => { const error = new Error(message); error.code = code; throw error; };
  const directionMatches = (entry, direction) => entry.direction === '共用' || entry.direction === direction;
  if (!map || map.format !== 'laohu.motion.screen-text-map/1' || !Array.isArray(map.entries)
    || !/^[a-f0-9]{64}$/u.test(map.briefSha256 ?? '')) {
    failRuntime('invalid-brief-text-map', 'expected a map compiled from the project brief.md');
  }
  const ids = new Set();
  for (const entry of map.entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)
      || typeof entry.exact !== 'string' || !entry.exact || !entry.object || !entry.scene
      || typeof entry.direction !== 'string' || !entry.direction.trim()
      || !Number.isFinite(entry.visibleStart) || !Number.isFinite(entry.visibleEnd) || entry.visibleEnd <= entry.visibleStart
      || !(entry.readableStart == null || Number.isFinite(entry.readableStart))
      || !(entry.readableEnd == null || Number.isFinite(entry.readableEnd))
      || (entry.readableStart != null && entry.readableEnd != null && entry.readableEnd <= entry.readableStart)
      || typeof entry.mustDisplay !== 'boolean') {
      failRuntime('invalid-brief-text-entry', `compiled brief text entry is malformed or repeats ID ${entry?.id ?? '(missing)'}`);
    }
    ids.add(entry.id);
  }
  const entries = new Map(map.entries.map((entry) => [entry.id, entry]));
  const useLog = new Map();
  const imageDeclarations = new Map();
  const captionSource = map.captionSource;
  let liveCaptionBinding = null;
  const faces = new Map();
  for (const face of map.typefaces ?? []) {
    const {name, id, family, style, weight, weightRange, assetPath, sha256} = face ?? {};
    const fileHash = /^fonts\/brief\/([a-f0-9]{64})\.(?:ttf|otf|woff2?)$/u.exec(assetPath ?? '')?.[1];
    if (!name || faces.has(name) || !id?.startsWith('font:') || typeof family !== 'string' || !family
      || !['normal', 'italic', 'oblique'].includes(style)
      || !Number.isInteger(weight) || !Number.isInteger(weightRange?.min) || !Number.isInteger(weightRange?.max)
      || weightRange.min < 1 || weightRange.max > 1000 || weight < weightRange.min || weight > weightRange.max
      || !fileHash || sha256 !== fileHash) {
      failRuntime('brief-typeface-map-invalid', `Typeface ${name ?? '(missing)'} must be compiled with its project-local font file.`);
    }
    faces.set(name, {...face, cssFamily: `LaohuBrief_${sha256}_${weightRange.min}_${weightRange.max}_${style}`});
  }
  for (const entry of map.entries) {
    if (entry.typeface !== undefined && (!faces.has(entry.typeface) || entry.caption || entry.imageText)) {
      failRuntime('brief-typeface-entry-invalid', `Screen text ${entry.id} has an invalid typeface binding.`);
    }
  }
  const loaded = new Map();
  const priorElementStyles = new WeakMap();
  let typefacePreparation;
  let captionProfile = null;
  let observingCanvasText = false;
  let controlledCanvasText;
  if (guardCanvasText) {
    const prototypes = [host?.CanvasRenderingContext2D?.prototype, host?.OffscreenCanvasRenderingContext2D?.prototype];
    for (const prototype of new Set(prototypes.filter(Boolean))) {
      for (const method of ['fillText', 'strokeText']) {
        const original = prototype[method];
        prototype[method] = function (text, ...args) {
          if (observingCanvasText && String(text).trim() && text !== controlledCanvasText) {
            failRuntime('uncontrolled-render-text', `${method} bypasses the registered screen-text consumer: ${JSON.stringify(String(text).slice(0, 80))}`);
          }
          return original.call(this, text, ...args);
        };
      }
    }
  }

  function prepareTypefaces() {
    if (!faces.size) return Promise.resolve();
    typefacePreparation ??= (async () => {
      if (!host?.document?.fonts || !host.document.baseURI || !host?.crypto?.subtle || typeof host.FontFace !== 'function') {
        failRuntime('brief-typeface-host-invalid', 'The scene needs a local browser page to load and verify its selected font files.');
      }
      const files = new Map();
      const browserFaces = new Map();
      for (const face of faces.values()) {
        if (browserFaces.has(face.cssFamily)) continue;
        if (!files.has(face.assetPath)) {
          files.set(face.assetPath, (async () => {
            const url = new URL(face.assetPath, host.document.baseURI);
            if (url.origin !== host.origin) failRuntime('brief-typeface-cross-origin', `Serve ${face.id} from the scene's own project.`);
            const response = await host.fetch(url);
            if (!response.ok) failRuntime('brief-typeface-file-unavailable', `Could not load ${face.id} from ${face.assetPath}.`);
            const bytes = await response.arrayBuffer();
            const digest = await host.crypto.subtle.digest('SHA-256', bytes);
            const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
            if (actual !== face.sha256) failRuntime('brief-typeface-file-changed', `Browser font bytes differ from the catalog for ${face.id}.`);
            return bytes;
          })());
        }
        browserFaces.set(face.cssFamily, (async () => {
          const bytes = await files.get(face.assetPath);
          const {min, max} = face.weightRange;
          const weight = min === max ? String(min) : `${min} ${max}`;
          const browserFace = new host.FontFace(face.cssFamily, bytes, {weight, style: face.style});
          try { await browserFace.load(); }
          catch { failRuntime('brief-typeface-load-failed', `The browser could not load ${face.id} at weight ${face.weight}.`); }
          return browserFace;
        })());
      }
      for (const browserFace of await Promise.all(browserFaces.values())) {
        host.document.fonts.add(browserFace);
        loaded.set(browserFace.family, browserFace);
      }
    })();
    return typefacePreparation;
  }

  function resolvedTypeface(entry, weight) {
    if (!entry.typeface) {
      if (weight !== undefined) failRuntime('brief-typeface-not-bound', `Register a real typeface before adjusting the weight of ${entry.id}.`);
      return null;
    }
    const face = faces.get(entry.typeface);
    if (!loaded.has(face.cssFamily)) failRuntime('brief-typeface-not-ready', `Await screenText.prepareTypefaces() before measuring or drawing ${entry.id}.`);
    const actualWeight = weight ?? face.weight;
    if (typeof actualWeight !== 'number' || !Number.isFinite(actualWeight)
      || actualWeight < face.weightRange.min || actualWeight > face.weightRange.max) {
      failRuntime('brief-typeface-weight', `${entry.id} requests weight ${actualWeight}, but ${face.id} supplies ${face.weightRange.min}–${face.weightRange.max}.`);
    }
    return {face, actualWeight};
  }

  function withCanvasTypeface(entry, drawingContext, weight, action) {
    const resolved = resolvedTypeface(entry, weight);
    if (!resolved) return action();
    const {face, actualWeight} = resolved;
    const previous = drawingContext.font;
    const size = /(?:^|\s)((?:\d+(?:\.\d+)?|\.\d+)px)(?=\s|\/)/u.exec(previous ?? '')?.[1];
    if (!size) failRuntime('brief-typeface-size-required', `Set the designed CSS pixel font size on the Canvas context before drawing ${entry.id}.`);
    drawingContext.font = `${face.style} ${actualWeight} ${size} ${face.cssFamily}`;
    try {
      if (!drawingContext.font.includes(face.cssFamily)) failRuntime('brief-typeface-canvas-not-applied', `Canvas did not accept the selected font for ${entry.id}.`);
      return action(actualWeight);
    } finally {
      drawingContext.font = previous;
    }
  }

  function applyElementTypeface(entry, element, weight) {
    const resolved = resolvedTypeface(entry, weight);
    if (!resolved) {
      const original = priorElementStyles.get(element);
      if (!original) return;
      for (const [name, value, priority] of original) element.style.setProperty(name, value, priority);
      priorElementStyles.delete(element);
      return;
    }
    const {face, actualWeight} = resolved;
    const css = element.style;
    if (!css?.setProperty) failRuntime('brief-typeface-element-required', `${entry.id} needs a styleable DOM or SVG element.`);
    const declarations = [
      ['font-family', face.cssFamily],
      ['font-weight', String(actualWeight)],
      ['font-style', face.style],
      ['font-synthesis', 'none'],
      ['font-variation-settings', 'normal'],
    ];
    if (!priorElementStyles.has(element)) {
      priorElementStyles.set(element, declarations.map(([name]) => [name, css.getPropertyValue(name), css.getPropertyPriority(name)]));
    }
    for (const [name, value] of declarations) css.setProperty(name, value, 'important');
    return actualWeight;
  }

  function entryFor(id) {
    const entry = entries.get(id);
    if (!entry) failRuntime('unknown-brief-text-id', `brief.md has no registered screen text ID ${String(id)}`);
    return entry;
  }

  function validateContext(entry, context, target) {
    if (!context || typeof context !== 'object') failRuntime('brief-text-context-required', `screen text ${entry.id} needs renderer context`);
    for (const key of ['direction', 'scene', 'object']) {
      if (typeof context[key] !== 'string' || !context[key]) failRuntime('brief-text-context-required', `screen text ${entry.id} needs ${key}`);
    }
    if (!directionMatches(entry, context.direction)) failRuntime('brief-text-direction-mismatch', `screen text ${entry.id} belongs to ${entry.direction}, received ${context.direction}`);
    if (entry.scene !== context.scene) failRuntime('brief-text-scene-mismatch', `screen text ${entry.id} belongs to scene ${entry.scene}, received ${context.scene}`);
    if (entry.object !== context.object) failRuntime('brief-text-object-mismatch', `screen text ${entry.id} belongs to object ${entry.object}, received ${context.object}`);
    if (!targets.has(target)) failRuntime('brief-text-target-invalid', `unsupported text target ${target} for ${entry.id}`);
    const legacyCaptionTolerance = entry.caption && !captionSource ? 1e-6 : 0;
    if (!Number.isFinite(context.time) || context.time < entry.visibleStart - legacyCaptionTolerance || context.time >= entry.visibleEnd) {
      failRuntime('brief-text-time-out-of-scope', `screen text ${entry.id} is visible from ${entry.visibleStart} to ${entry.visibleEnd}, received ${context.time}`);
    }
    if (entry.caption && target !== 'caption-overlay') failRuntime('brief-caption-target-mismatch', `caption ${entry.id} must use the caption overlay consumer`);
    if (!entry.caption && target === 'caption-overlay') failRuntime('brief-text-target-mismatch', `${entry.id} is not registered as a caption`);
    if (entry.imageText && target !== 'external-image') failRuntime('brief-image-text-target-mismatch', `image text ${entry.id} must be declared against its external asset`);
  }

  function record(entry, context, target, fontWeight) {
    const uses = useLog.get(entry.id) ?? [];
    uses.push({time: context.time, direction: context.direction, scene: context.scene, object: context.object, target, fontWeight});
    useLog.set(entry.id, uses);
  }

  function resolve(id, context, target) {
    const entry = entryFor(id);
    validateContext(entry, context, target);
    return {entry, exact: entry.exact};
  }

  function validateCaptionManifest(manifest) {
    if (!manifest || !Array.isArray(manifest.cues) || !Array.isArray(manifest.displayLanguages)) {
      failRuntime('invalid-caption-registry-input', 'caption manifest needs cues and displayLanguages');
    }
    const sampleRate = manifest.sourceClock?.sampleRateHz;
    if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) failRuntime('invalid-caption-registry-input', 'caption manifest needs its source sample rate');
    if (captionSource && (manifest.format !== captionSource.manifest.format
      || manifest.integrity?.manifestSha256 !== captionSource.manifest.integrity?.manifestSha256
      || (captionSource.kind === 'srt' && (manifest.source?.path !== captionSource.path || manifest.source?.sha256 !== captionSource.sha256)))) {
      failRuntime('stale-brief-caption-source', `native captions must consume the source checked against <inputs>: ${captionSource.path}`);
    }
    const problems = [];
    for (const cue of manifest.cues) {
      for (const language of manifest.displayLanguages) {
        const isSource = language === manifest.sourceLanguage;
        const translation = (cue.translations ?? []).find((row) => row.language === language);
        const lines = isSource ? cue.lines : translation?.lines;
        const id = `cue:${cue.id}:${language}`;
        const entry = entries.get(id);
        if (!entry) { problems.push(`${id}: missing from the current Brief text map`); continue; }
        if (!entry.caption || entry.cueId !== cue.id || entry.language !== language || !entry.mustDisplay) {
          problems.push(`${id}: cue/language binding mismatch or caption is not marked 必显`); continue;
        }
        if (!Array.isArray(lines) || entry.exact !== lines.join('\n')) problems.push(`${id}: exact caption text differs from the caption manifest`);
        const display = cue.displayWindow;
        if (!Number.isSafeInteger(display?.startSample) || !Number.isSafeInteger(display?.endSample) || display.endSample <= display.startSample) {
          problems.push(`${id}: actual caption display window is invalid`);
          continue;
        }
        const actualStart = display.startSample / sampleRate, actualEnd = display.endSample / sampleRate;
        const tolerance = captionSource ? 0 : 1 / sampleRate;
        if (Math.abs(entry.visibleStart - actualStart) > tolerance || Math.abs(entry.visibleEnd - actualEnd) > tolerance) {
          problems.push(`${id}: brief display window differs from the manifest cue window`);
        }
        if (entry.readableStart == null || entry.readableEnd == null
          || Math.abs(entry.readableStart - actualStart) > tolerance || Math.abs(entry.readableEnd - actualEnd) > tolerance) {
          problems.push(`${id}: complete-reading window differs from the actual caption cue window`);
        }
      }
    }
    const expectedIds = new Set(manifest.cues.flatMap((cue) => manifest.displayLanguages.map((language) => `cue:${cue.id}:${language}`)));
    for (const entry of map.entries) if (entry.caption && !expectedIds.has(entry.id)) problems.push(`${entry.id}: no current cue in the caption manifest`);
    if (problems.length) failRuntime('caption-brief-binding-mismatch', problems.join('; '));
    if (captionSource) liveCaptionBinding = {kind: captionSource.kind, path: captionSource.path, sha256: captionSource.sha256,
      manifestSha256: manifest.integrity.manifestSha256};
    return {status: 'PASS', briefSha256: map.briefSha256, cues: manifest.cues.length,
      languages: manifest.displayLanguages.length, sourceClockHz: sampleRate};
  }

  function drawCanvas(context, id, drawingContext, x, y, {stroke = false, maxWidth, weight} = {}, target = 'canvas') {
    const {entry, exact} = resolve(id, context, target);
    const method = stroke ? 'strokeText' : 'fillText';
    if (!drawingContext || typeof drawingContext[method] !== 'function' || !Number.isFinite(x) || !Number.isFinite(y)) {
      failRuntime('brief-text-canvas-consumer-required', `${id} requires a real Canvas 2D context and finite draw coordinates`);
    }
    if (maxWidth !== undefined && (!Number.isFinite(maxWidth) || maxWidth <= 0)) {
      failRuntime('brief-text-canvas-width-invalid', `${id} needs a positive maxWidth`);
    }
    withCanvasTypeface(entry, drawingContext, weight, actualWeight => {
      const previous = controlledCanvasText;
      controlledCanvasText = exact;
      try {
        if (maxWidth === undefined) drawingContext[method](exact, x, y);
        else {
          if (entry.typeface && drawingContext.measureText(exact).width > maxWidth) {
            failRuntime('brief-typeface-canvas-overflow', `Selected font for ${id} exceeds maxWidth. Measure and adjust its layout before drawing.`);
          }
          drawingContext[method](exact, x, y, maxWidth);
        }
      } finally {
        controlledCanvasText = previous;
      }
      record(entry, context, target, actualWeight);
    });
    return exact;
  }

  function writeElement(context, id, element, target, {weight} = {}) {
    const {entry, exact} = resolve(id, context, target);
    if (!element || typeof element !== 'object' || !('textContent' in element)) {
      failRuntime('brief-text-element-required', `${id} requires a real DOM or SVG text element`);
    }
    const actualWeight = applyElementTypeface(entry, element, weight);
    element.textContent = exact;
    record(entry, context, target, actualWeight);
    return exact;
  }

  function runGlyphDraw(context, id, draw, target) {
    const {entry, exact} = resolve(id, context, target);
    if (entry.typeface) {
      failRuntime('brief-typeface-target-unsupported', `Typeface-bound text ${id} needs a controlled DOM, SVG or Canvas consumer; the outline callback cannot verify its font.`);
    }
    if (target === 'caption-overlay' && !captionProfile) {
      failRuntime('brief-caption-profile-required', `caption ${id} needs a verified aspect-ratio profile before it can be rendered`);
    }
    if (target === 'caption-overlay' && captionSource && !liveCaptionBinding) {
      failRuntime('brief-caption-source-not-consumed', `caption ${id} needs the verified source from <inputs>`);
    }
    if (typeof draw !== 'function') failRuntime('brief-text-draw-required', `${id} needs the actual glyph/caption drawing callback`);
    const result = draw(exact);
    if (result && typeof result.then === 'function') return result.then(value => { record(entry, context, target); return value; });
    record(entry, context, target);
    return result;
  }

  function frameAtOrAfter(time, start, fps) {
    const frame = Math.max(0, Math.ceil((time - start) * fps));
    if (frame > 0 && start + (frame - 1) / fps >= time) return frame - 1;
    return start + frame / fps < time ? frame + 1 : frame;
  }

  function lowerBound(values, minimum) {
    let start = 0, end = values.length;
    while (start < end) {
      const middle = Math.floor((start + end) / 2);
      if (values[middle] < minimum) start = middle + 1;
      else end = middle;
    }
    return start;
  }

  function readableGrid(entry, start, end, fps) {
    const {readableStart, readableEnd, visibleStart, visibleEnd} = entry;
    if (readableStart == null || readableEnd == null) return null;
    const from = Math.max(start, readableStart, visibleStart), to = Math.min(end, readableEnd, visibleEnd);
    if (to <= from) return null;
    const firstFrame = frameAtOrAfter(from, start, fps), endFrame = frameAtOrAfter(to, start, fps);
    return {firstFrame, endFrame};
  }

  function validateRenderWindow(start, end, fps, direction) {
    if (![start, end, fps].every(Number.isFinite) || start < 0 || end <= start || fps <= 0 || fps > 240
      || !Number.isSafeInteger(Math.ceil((end - start) * fps))) {
      failRuntime('invalid-brief-text-window', 'coverage needs a positive, finite render window and frame rate');
    }
    if (typeof direction !== 'string' || !direction.trim() || direction === '共用') {
      failRuntime('brief-text-direction-required', 'coverage must name the selected concrete direction');
    }
  }

  function planFrames({start, end, fps, direction, shots = [], points, exhaustiveFrames = false}) {
    validateRenderWindow(start, end, fps, direction);
    if (points !== undefined) {
      if (!Array.isArray(points) || !points.length || points.some(time => !Number.isFinite(time) || time < start || time >= end)) {
        failRuntime('invalid-brief-text-points', 'still preflight requires each actual requested time inside the renderer duration');
      }
      const times = [...new Set(points)].sort((a, b) => a - b);
      return {mode: 'still-points', times};
    }
    const gridFrames = frameAtOrAfter(end, start, fps);
    if (exhaustiveFrames) return {mode: 'exhaustive-frames', gridFrames, frames: Array.from({length: gridFrames}, (_, frame) => frame)};
    const selected = new Set();
    const select = frame => { if (frame >= 0 && frame < gridFrames) selected.add(frame); };
    select(0);
    select(gridFrames - 1);
    for (let time = Math.ceil(start / 5) * 5; time < end; time += 5) select(frameAtOrAfter(time, start, fps));
    let shotWindows = 0;
    for (const {t0, t1} of shots) {
      if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= start || t0 >= end || t1 <= t0) continue;
      const first = frameAtOrAfter(Math.max(start, t0), start, fps), limit = frameAtOrAfter(Math.min(end, t1), start, fps);
      if (first >= limit) continue;
      select(first);
      select(limit - 1);
      shotWindows++;
    }
    for (const entry of entries.values()) {
      if (!entry.mustDisplay || entry.imageText || !directionMatches(entry, direction) || entry.visibleStart >= end || entry.visibleEnd <= start) continue;
      const window = readableGrid(entry, start, end, fps);
      if (window && window.firstFrame < window.endFrame) {
        const {firstFrame, endFrame} = window;
        select(firstFrame);
        select(Math.floor((firstFrame + endFrame - 1) / 2));
        select(endFrame - 1);
      }
      // Visit the surrounding frames too so an incorrect early/stale draw is observable.
      select(frameAtOrAfter(entry.visibleStart, start, fps) - 1);
      select(frameAtOrAfter(entry.visibleEnd, start, fps));
    }
    return {mode: 'keyframes', gridFrames, shotWindows, patrolIntervalSeconds: 5, frames: [...selected].sort((a, b) => a - b)};
  }

  const api = {
    format: 'laohu.motion.screen-text-map/1',
    briefSha256: map.briefSha256,
    calibrationProbe: allowCaptionCalibration === true,
    captionInput(direction, {profileId = 'native-16x9-standard'} = {}) {
      if (!captionSource) failRuntime('brief-caption-source-required', 'Declare caption-source in <inputs> before creating the bound subtitle track.');
      if (typeof direction !== 'string' || !direction.trim() || direction === '共用') {
        failRuntime('brief-text-direction-required', 'captionInput needs the renderer\'s concrete direction name');
      }
      const manifest = structuredClone(captionSource.manifest);
      const expectedBinding = captionSource.kind === 'srt'
        ? {sourcePath: captionSource.path, sourceSha256: captionSource.sha256, manifestSha256: manifest.integrity.manifestSha256}
        : {projectId: manifest.project.id, revision: manifest.project.revision, planSha256: manifest.editPlan.planSha256,
          timelineSha256: manifest.timeline.sha256, manifestSha256: manifest.integrity.manifestSha256};
      return {manifest, expectedBinding, expectedBriefSha256: map.briefSha256, textRuntime: api, profileId,
        fontUrl: new URL('fonts/captions/SourceHanSansCN-700.ttf', host.document.baseURI).href,
        captionContext: ({cue, language}) => {
          const {scene, object} = entryFor(`cue:${cue.id}:${language}`);
          return {direction, scene, object};
        }};
    },
    resetUseTrace() { useLog.clear(); imageDeclarations.clear(); },
    async traceRender(action) {
      observingCanvasText = true;
      try { return await action(); }
      finally { observingCanvasText = false; }
    },
    planFrames,
    prepareTypefaces,
    measureCanvas(id, drawingContext, {weight} = {}) {
      const entry = entryFor(id);
      if (typeof drawingContext?.measureText !== 'function') {
        failRuntime('brief-text-canvas-consumer-required', `${id} requires Canvas 2D measureText.`);
      }
      return withCanvasTypeface(entry, drawingContext, weight, () => drawingContext.measureText(entry.exact));
    },
    validateCaptionManifest,
    recordCaptionProfile(profile) {
      if (!profile || profile.format !== 'laohu.motion.caption-profile/1' || typeof profile.id !== 'string'
        || !['locked', 'calibration-candidate'].includes(profile.mode) || !profile.integrity?.sha256
        || !profile.style || !profile.aspectRatio) {
        failRuntime('invalid-caption-profile', 'caption consumer must register the verified profile it actually uses');
      }
      if (profile.mode === 'calibration-candidate' && !allowCaptionCalibration) {
        failRuntime('caption-profile-not-locked', `caption profile ${profile.id} is a calibration candidate and this render is not an explicitly scoped technical probe`);
      }
      const next = {id: profile.id, mode: profile.mode, aspectRatio: structuredClone(profile.aspectRatio),
        maxLinesPerLanguage: structuredClone(profile.maxLinesPerLanguage), values: structuredClone(profile.style),
        integritySha256: profile.integrity.sha256};
      if (captionProfile && JSON.stringify(captionProfile) !== JSON.stringify(next)) {
        failRuntime('brief-caption-profile-conflict', 'one render cannot mix caption profiles or per-scene values');
      }
      captionProfile = next;
      return structuredClone(captionProfile);
    },
    assertBriefSha256(expected) {
      if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/u.test(expected) || map.briefSha256 !== expected) {
        failRuntime('stale-brief-text-map', `renderer consumer map ${map.briefSha256} does not match current brief ${String(expected)}`);
      }
      return map.briefSha256;
    },
    exact(context, id, target = entryFor(id).caption ? 'caption-overlay' : 'canvas') {
      const {exact} = resolve(id, context, target);
      return exact; // Lookup validates the scope but intentionally does not count as screen use.
    },
    canvas(context, id, drawingContext, x, y, options) { return drawCanvas(context, id, drawingContext, x, y, options); },
    dom(context, id, element, options) { return writeElement(context, id, element, 'dom', options); },
    svg(context, id, element, options) { return writeElement(context, id, element, 'svg', options); },
    texture(context, id, drawingContext, x, y, options) { return drawCanvas(context, id, drawingContext, x, y, options, 'three-texture'); },
    glyphPath(context, id, draw) { return runGlyphDraw(context, id, draw, 'glyph-path'); },
    caption(context, id, draw) { return runGlyphDraw(context, id, draw, 'caption-overlay'); },
    externalImage(context, id, assetPath) {
      const entry = entryFor(id);
      if (!entry.imageText || typeof assetPath !== 'string' || !assetPath || entry.assetPath !== assetPath) {
        failRuntime('brief-image-asset-mismatch', `image text ${id} must match its exact registered external asset path`);
      }
      validateContext(entry, context, 'external-image');
      imageDeclarations.set(id, {assetPath, context: {time: context.time, direction: context.direction, scene: context.scene, object: context.object}});
      return {exact: entry.exact, assetPath, status: 'OBSERVE_IMAGE_TEXT_REQUIRES_VISUAL_REVIEW'};
    },
    assertExact(id, actual, context, target = 'canvas') {
      const {exact} = resolve(id, context, target);
      if (actual !== exact) failRuntime('brief-text-content-mismatch', `renderer text for ${id} differs from the exact wording registered in brief.md`);
      return exact; // Content assertion alone is not a draw or DOM-write trace.
    },
    coverage({start, end, direction, scene, fps = 30, strict = true, allowNotCovered = false, samplePlan, fullDuration = false} = {}) {
      validateRenderWindow(start, end, fps, direction);
      const points = samplePlan?.mode === 'still-points' ? samplePlan.times : null;
      const frameCount = frameAtOrAfter(end, start, fps);
      const intersects = entry => points ? points.some(time => entry.visibleStart <= time && time < entry.visibleEnd)
        : entry.visibleStart < end && entry.visibleEnd > start;
      const notCovered = (id, reason) => ({id, status: 'NOT_COVERED_ENTRY', reason});
      const active = [...entries.values()].filter((entry) => entry.mustDisplay && directionMatches(entry, direction)
        && (!scene || entry.scene === scene) && (fullDuration || intersects(entry)));
      const statuses = active.map((entry) => {
        if (fullDuration && (!intersects(entry) || frameAtOrAfter(entry.visibleEnd, start, fps) > frameCount)) {
          return notCovered(entry.id, 'required appearance lies outside the full renderer duration');
        }
        if (entry.imageText) return {id: entry.id, status: 'OBSERVE_IMAGE_TEXT_REQUIRES_VISUAL_REVIEW'};
        const calls = (useLog.get(entry.id) ?? []).filter(call => call.direction === direction && call.scene === entry.scene
          && call.object === entry.object).map(call => call.time).sort((a, b) => a - b);
        const missingAt = time => Math.abs((calls[lowerBound(calls, time - 1e-7)] ?? Infinity) - time) > 1e-7;
        if (points) {
          const {readableStart, readableEnd} = entry;
          const checked = points.filter(time => readableStart != null && readableEnd != null && readableStart <= time && time < readableEnd);
          if (!checked.length) return notCovered(entry.id, 'no requested still falls in this complete-reading interval');
          const missingSeconds = checked.filter(missingAt);
          return missingSeconds.length ? {id: entry.id, status: 'FAIL', missingSeconds}
            : {id: entry.id, status: 'PASS_STILL_RENDER_TRACE', checkedFrames: checked.length};
        }
        const window = readableGrid(entry, start, end, fps);
        if (!window) return notCovered(entry.id, 'no complete-reading interval in this render window');
        const {firstFrame, endFrame} = window;
        if (endFrame <= firstFrame) return notCovered(entry.id, 'complete-reading interval contains no frame on this render grid');
        const frames = samplePlan ? samplePlan.frames.slice(lowerBound(samplePlan.frames, firstFrame), lowerBound(samplePlan.frames, endFrame))
          : Array.from({length: endFrame - firstFrame}, (_, index) => firstFrame + index);
        if (!frames.length) return notCovered(entry.id, 'no selected preflight frame falls in this complete-reading interval');
        const missingFrames = frames.filter(frame => missingAt(start + frame / fps));
        return missingFrames.length ? {id: entry.id, status: 'FAIL', missingFrames}
          : {id: entry.id, status: samplePlan?.mode === 'keyframes' ? 'PASS_SAMPLED_RENDER_TRACE' : 'PASS_RENDER_TRACE',
            checkedFrames: frames.length, availableFrames: endFrame - firstFrame};
      });
      const blocking = statuses.filter((item) => item.status === 'FAIL' || (item.status === 'NOT_COVERED_ENTRY' && !allowNotCovered));
      const report = {format: 'laohu.motion.screen-text-coverage/1', evidence: 'controlled-render-call-trace-only',
        briefSha256: map.briefSha256, direction, scene: scene ?? null, start, end, fps, statuses,
        samplingMode: samplePlan?.mode ?? 'exhaustive-frames', coverageScope: points ? 'requested-stills' : fullDuration ? 'full-duration' : 'bounded-window',
        captionProfile: captionProfile ? structuredClone(captionProfile) : null,
        imageText: [...imageDeclarations.entries()].map(([id, use]) => ({id, ...use, status: 'OBSERVE_IMAGE_TEXT_REQUIRES_VISUAL_REVIEW'}))};
      if (strict && blocking.length) failRuntime('brief-required-text-not-covered', `required screen text lacks its own in-window render trace: ${blocking.map((item) => `${item.id}=${item.status}${item.reason ? ` (${item.reason})` : ''}`).join(', ')}`);
      return report;
    },
    report() {
      return {format: 'laohu.motion.screen-text-usage/1', evidence: 'controlled-render-call-trace-only', briefSha256: map.briefSha256,
        used: [...useLog.entries()].map(([id, uses]) => {
          const face = faces.get(entries.get(id).typeface);
          const weightRange = face ? uses.reduce(({min, max}, {fontWeight}) =>
            ({min: Math.min(min, fontWeight), max: Math.max(max, fontWeight)}), {min: Infinity, max: -Infinity}) : null;
          return {id, calls: uses.length, targets: [...new Set(uses.map(call => call.target))],
            ...(face ? {typeface: {id: face.id, name: face.name, family: face.family, weight: face.weight, weightRange, sha256: face.sha256}} : {})};
        }),
        captionProfile: captionProfile ? structuredClone(captionProfile) : null,
        captionSource: liveCaptionBinding ? {...liveCaptionBinding} : null,
        imageText: [...imageDeclarations.entries()].map(([id, use]) => ({id, ...use, status: 'OBSERVE_IMAGE_TEXT_REQUIRES_VISUAL_REVIEW'}))};
    },
  };
  if (host && typeof host === 'object') host.__laohuBriefText = api;
  return api;
}

export function validateCaptionTextAgainstBrief(manifest, map) {
  if (!map || map.format !== SCREEN_TEXT_MAP_FORMAT || !Array.isArray(map.entries)) fail('invalid-brief-text-map', `expected ${SCREEN_TEXT_MAP_FORMAT} compiled from brief.md`);
  return createBriefTextRuntime(map, {host: null}).validateCaptionManifest(manifest);
}
