(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    const core = require("./motion-core.js");
    module.exports = factory(core);
  } else {
    root.MotionOps = factory(root.MotionCore);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core || typeof core.cameraForAnchor !== "function" || typeof core.worldToScreen !== "function" || typeof core.pointAt !== "function") {
    throw new Error("MotionOps requires the existing MotionCore camera and path APIs");
  }

  function finite(value, label) {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
    return value;
  }

  function stableId(value, label) {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty stable ID`);
    return value;
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function orientation(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function segmentsIntersect(a, b, c, d) {
    const abC = orientation(a, b, c), abD = orientation(a, b, d);
    const cdA = orientation(c, d, a), cdB = orientation(c, d, b);
    const epsilon = 1e-9;
    const onSegment = (start, end, point) => point.x >= Math.min(start.x, end.x) - epsilon
      && point.x <= Math.max(start.x, end.x) + epsilon
      && point.y >= Math.min(start.y, end.y) - epsilon
      && point.y <= Math.max(start.y, end.y) + epsilon;
    if (Math.abs(abC) <= epsilon && onSegment(a, b, c)) return true;
    if (Math.abs(abD) <= epsilon && onSegment(a, b, d)) return true;
    if (Math.abs(cdA) <= epsilon && onSegment(c, d, a)) return true;
    if (Math.abs(cdB) <= epsilon && onSegment(c, d, b)) return true;
    return ((abC < 0 && abD > 0) || (abC > 0 && abD < 0))
      && ((cdA < 0 && cdB > 0) || (cdA > 0 && cdB < 0));
  }

  function pointSegmentDistanceSquared(point, start, end) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const progress = lengthSquared === 0 ? 0 : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
    const nearestX = start.x + progress * dx, nearestY = start.y + progress * dy;
    const offsetX = point.x - nearestX, offsetY = point.y - nearestY;
    return offsetX * offsetX + offsetY * offsetY;
  }

  function segmentDistanceSquared(a, b, c, d) {
    if (segmentsIntersect(a, b, c, d)) return 0;
    return Math.min(
      pointSegmentDistanceSquared(a, c, d), pointSegmentDistanceSquared(b, c, d),
      pointSegmentDistanceSquared(c, a, b), pointSegmentDistanceSquared(d, a, b),
    );
  }

  function strokedPolylineIntersectsViewport(points, width, height, lineWidthPx) {
    const viewport = [
      { x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height },
    ];
    const inside = (point) => point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
    const radiusSquared = (lineWidthPx / 2) ** 2;
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index], end = points[(index + 1) % points.length];
      if (inside(start) || inside(end)) return true;
      for (let edge = 0; edge < viewport.length; edge += 1) {
        const viewportStart = viewport[edge], viewportEnd = viewport[(edge + 1) % viewport.length];
        if (segmentDistanceSquared(start, end, viewportStart, viewportEnd) < radiusSquared) return true;
      }
    }
    return false;
  }

  function smooth(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function easing(value, curve) {
    const t = clamp(value, 0, 1);
    const name = curve == null ? "linear" : curve;
    if (name === "linear") return t;
    if (name === "smooth") return t * t * (3 - 2 * t);
    if (name === "ease-in-out-cubic") return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    if (name === "ease-out-cubic") return 1 - Math.pow(1 - t, 3);
    if (name === "ease-in-cubic") return t * t * t;
    throw new TypeError(`unsupported phase curve ${String(name)}; use linear, smooth, ease-in-out-cubic, ease-out-cubic, or ease-in-cubic`);
  }

  function phaseDuration(phase) {
    if (phase.durationSec != null) return finite(phase.durationSec, "phase.durationSec");
    if (phase.endSec != null) return finite(phase.endSec, "phase.endSec") - finite(phase.startSec, "phase.startSec");
    throw new TypeError("phase.durationSec or phase.endSec is required");
  }

  const LOCAL_EFFECTS_TYPE = "custom:huashu-local-effects";
  const LOCAL_EFFECT_OWNER_TRANSFORM_FIELDS = new Set([
    "translateX", "translateY", "rotation", "scale", "scaleX", "scaleY",
  ]);
  const LOCAL_EFFECT_OWNER_STRUCTURE_FIELDS = new Set(["layer", "space", "morph"]);
  const LOCAL_EFFECT_CONTRACTS = Object.freeze({
    "huashu-dg-draw-partial": Object.freeze({ geometry: "points", parameters: Object.freeze(["color", "lineWidth"]) }),
    "huashu-dg-circumscribe": Object.freeze({ geometry: "rect", parameters: Object.freeze(["color", "lineWidth", "timeWidth"]) }),
    "huashu-dg-brace": Object.freeze({ geometry: "brace", parameters: Object.freeze(["color", "lineWidth", "depth"]) }),
    "huashu-dg-indicate-frame-pulse": Object.freeze({ geometry: "rect", parameters: Object.freeze(["color", "lineWidth", "timeWidth", "scale"]) }),
    "huashu-mo-staggered-target-reveal": Object.freeze({ geometry: "rect", parameters: Object.freeze([]), requiredStagger: true }),
  });

  function assertLocalEffectTarget(target, label) {
    if (target.layer != null || target.space !== "screen" || target.morph) throw new Error(`${label} must identify a static top-level screen-space target; moving targets need their own frame-aware custom renderer`);
    const identityFields = [["translateX", 0], ["translateY", 0], ["scale", 1], ["scaleX", 1], ["scaleY", 1], ["rotation", 0]];
    for (const [key, expected] of identityFields) if (target[key] != null && target[key] !== expected) throw new Error(`${label} ${key} must be neutral so the local effect remains bound to static screen-space geometry`);
  }

  function sameNumber(left, right) {
    return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 1e-7;
  }

  function samePoints(left, right) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((point, index) => Array.isArray(point) && Array.isArray(right[index])
        && sameNumber(point[0], right[index][0]) && sameNumber(point[1], right[index][1]));
  }

  function localTargetAttributes(scene, targetId, timeSec, evaluatedState) {
    const state = evaluatedState || core.evaluateScene(scene, timeSec, true);
    const object = state.objects[targetId];
    if (!object) throw new Error(`Local-effect target disappeared from evaluated scene: ${targetId}`);
    const style = !object.style ? {} : scene.styles && scene.styles[object.style];
    if (object.style && (!style || typeof style !== "object" || Array.isArray(style))) throw new Error(`Unknown style ${object.style}`);
    const overrides = object.styleOverrides == null ? {} : object.styleOverrides;
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) throw new TypeError(`${targetId}.styleOverrides must be an object`);
    return Object.assign({}, style, overrides, object);
  }

  function localTargetGeometry(attributes, label) {
    if (attributes.type === "rect") return { type: "rect", x: attributes.x, y: attributes.y, width: attributes.width, height: attributes.height };
    if (attributes.type === "line") return { type: "line", points: [[attributes.x1 || 0, attributes.y1 || 0], [attributes.x2 || 0, attributes.y2 || 0]] };
    if (attributes.type === "path" || attributes.type === "polygon") {
      return { type: attributes.type, points: (attributes.points || []).map((point) => [point.x, point.y]), closed: Boolean(attributes.closed || attributes.type === "polygon"), progress: attributes.progress == null ? 1 : attributes.progress };
    }
    if (attributes.type === "custom:huashu-local-target") {
      const data = attributes.data;
      if (!data || data.primitive !== "rect" || !data.geometry || typeof data.geometry !== "object" || Array.isArray(data.geometry)) {
        throw new TypeError(`${label} must have a static custom:huashu-local-target rectangle in data.geometry`);
      }
      return { type: attributes.type, primitive: data.primitive, ...data.geometry };
    }
    throw new Error(`${label} uses unsupported local-effect target geometry type ${String(attributes.type)}`);
  }

  function localGeometryBinding(property, target) {
    if (typeof property !== "string" || !property) throw new TypeError("local-effect target binding requires a property path");
    const direct = new Set([
      "type", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "width", "height", "r", "rx", "ry",
      "points", "closed", "progress", "morph", "morphProgress", "angle", "rotation", "translateX", "translateY",
      "scale", "scaleX", "scaleY", "anchorX", "anchorY",
    ]);
    if (direct.has(property) || property === "style") return true;
    if (property === "styleOverrides") return true;
    if (property.startsWith("styleOverrides.")) {
      const leaf = property.slice("styleOverrides.".length);
      return !["opacity", "visible", "fill", "stroke", "color"].includes(leaf);
    }
    if (target.type === "custom:huashu-local-target" && (property === "data" || property === "data.geometry" || property.startsWith("data.geometry."))) return true;
    return false;
  }

  function localTargetGeometrySamples(scene, target, label) {
    const targetBindings = (scene.bindings || []).filter((binding) => binding && binding.target && binding.target.kind === "object" && binding.target.id === target.id);
    for (const binding of targetBindings) {
      if (localGeometryBinding(binding.target.property, target)) throw new Error(`${label} has binding-controlled geometry (${binding.target.property}); local effects require a static target anchor`);
    }
    const geometryEvents = (scene.events || []).filter((event) => event && event.target && event.target.kind === "object" && event.target.id === target.id
      && ["x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "width", "height", "r", "rx", "ry", "points", "closed", "progress", "morphProgress", "angle", "rotation", "translateX", "translateY", "scale", "scaleX", "scaleY", "anchorX", "anchorY"].includes(event.property || "value"));
    if (geometryEvents.length) throw new Error(`${label} has event-controlled geometry; local effects require a static target anchor`);

    const times = new Set([0]);
    for (const event of (scene.events || [])) {
      if (!event || !event.target || event.target.kind !== "object" || event.target.id !== target.id || event.property !== "style") continue;
      const start = finite(event.start, `${label} style event.start`);
      const duration = finite(event.duration, `${label} style event.duration`);
      times.add(clamp(start, 0, scene.duration));
      times.add(clamp(start + duration * 0.5, 0, scene.duration));
      times.add(clamp(start + duration, 0, scene.duration));
    }
    const samples = [...times].sort((a, b) => a - b).map((timeSec) => {
      const attributes = localTargetAttributes(scene, target.id, timeSec);
      assertLocalEffectTarget(attributes, `${label} at ${timeSec}s`);
      const geometry = localTargetGeometry(attributes, label);
      return { timeSec, attributes, geometry };
    });
    const baseline = JSON.stringify(samples[0].geometry);
    const changed = samples.find((sample) => JSON.stringify(sample.geometry) !== baseline);
    if (changed) throw new Error(`${label} changes its resolved geometry through style selection (${samples[0].timeSec}s → ${changed.timeSec}s); local effects require a static target anchor`);
    return samples;
  }

  function localEffectOwnerTransformSamples(scene, owner, label) {
    const transformBindings = (scene.bindings || []).filter((binding) => {
      if (!binding || !binding.target || binding.target.kind !== "object" || binding.target.id !== owner.id) return false;
      const property = binding.target.property;
      return LOCAL_EFFECT_OWNER_TRANSFORM_FIELDS.has(property)
        || LOCAL_EFFECT_OWNER_STRUCTURE_FIELDS.has(property)
        || property === "style"
        || property === "styleOverrides"
        || (typeof property === "string" && property.startsWith("styleOverrides.")
          && (LOCAL_EFFECT_OWNER_TRANSFORM_FIELDS.has(property.slice("styleOverrides.".length))
            || LOCAL_EFFECT_OWNER_STRUCTURE_FIELDS.has(property.slice("styleOverrides.".length))));
    });
    if (transformBindings.length) {
      const properties = transformBindings.map((binding) => binding.target.property).join(", ");
      throw new Error(`${label} has binding-controlled owner transform (${properties}); local effects require a static untransformed screen-space owner`);
    }

    const times = new Set([0]);
    for (const event of (scene.events || [])) {
      if (!event || !event.target || event.target.kind !== "object" || event.target.id !== owner.id) continue;
      const property = event.property || "value";
      if (LOCAL_EFFECT_OWNER_TRANSFORM_FIELDS.has(property)) {
        times.add(clamp(finite(event.start, `${label} ${property} event.start`), 0, scene.duration));
        times.add(clamp(finite(event.start, `${label} ${property} event.start`) + finite(event.duration, `${label} ${property} event.duration`) * 0.5, 0, scene.duration));
        times.add(clamp(finite(event.start, `${label} ${property} event.start`) + finite(event.duration, `${label} ${property} event.duration`), 0, scene.duration));
      }
      if (property === "morphProgress") {
        times.add(clamp(finite(event.start, `${label} morphProgress event.start`), 0, scene.duration));
        times.add(clamp(finite(event.start, `${label} morphProgress event.start`) + finite(event.duration, `${label} morphProgress event.duration`) * 0.5, 0, scene.duration));
        times.add(clamp(finite(event.start, `${label} morphProgress event.start`) + finite(event.duration, `${label} morphProgress event.duration`), 0, scene.duration));
      }
      if (property === "style") {
        const start = finite(event.start, `${label} style event.start`);
        const duration = finite(event.duration, `${label} style event.duration`);
        times.add(clamp(start, 0, scene.duration));
        times.add(clamp(start + duration * 0.5, 0, scene.duration));
        times.add(clamp(start + duration, 0, scene.duration));
      }
    }

    const samples = [...times].sort((a, b) => a - b).map((timeSec) => {
      const attributes = localTargetAttributes(scene, owner.id, timeSec);
      assertLocalEffectTarget(attributes, `${label} resolved at ${timeSec}s`);
      return { timeSec, attributes };
    });
    return samples;
  }

  function localEffectTargetState(scene, targetId, timeSec) {
    const state = core.evaluateScene(scene, timeSec, true);
    const attributes = localTargetAttributes(scene, targetId, timeSec, state);
    const opacity = Number.isFinite(attributes.opacity) ? clamp(attributes.opacity, 0, 1) : 1;
    return Object.freeze({
      targetId,
      timeSec: state.time,
      visible: attributes.visible !== false && opacity > 0,
      targetOpacity: opacity,
      visibilityValue: attributes.visible == null ? true : attributes.visible,
      attributes,
    });
  }

  function validateLocalEffects(scene) {
    if (!scene || typeof scene !== "object" || !Array.isArray(scene.objects)) throw new TypeError("scene.objects is required to validate local effects");
    const objectsById = new Map(scene.objects.map((object) => [object && object.id, object]));
    const phases = indexPhases(scene);
    const seenIds = new Set();
    const groups = new Map();
    const records = [];
    for (const owner of scene.objects) {
      if (!owner || owner.type !== LOCAL_EFFECTS_TYPE) continue;
      const instances = owner.data && owner.data.motionEffects;
      if (!Array.isArray(instances) || instances.length === 0) throw new TypeError(`${owner.id}.data.motionEffects must be a non-empty array`);
      if (owner.space !== "screen" || owner.layer != null) throw new TypeError(`${owner.id} must be a top-level space:"screen" object so local target geometry is expressed in stable canvas coordinates`);
      localEffectOwnerTransformSamples(scene, owner, `${owner.id}.data.motionEffects owner`);
      for (const [index, instance] of instances.entries()) {
        const label = `${owner.id}.data.motionEffects[${index}]`;
        if (!instance || typeof instance !== "object" || Array.isArray(instance)) throw new TypeError(`${label} must be an object`);
        const id = stableId(instance.id, `${label}.id`);
        if (seenIds.has(id)) throw new Error(`Duplicate local effect instance ID: ${id}`);
        seenIds.add(id);
        const effectId = stableId(instance.effectId, `${label}.effectId`);
        const contract = LOCAL_EFFECT_CONTRACTS[effectId];
        if (!contract) throw new Error(`${label}.effectId is unsupported: ${effectId}`);
        const targetId = stableId(instance.targetId, `${label}.targetId`);
        const target = objectsById.get(targetId);
        if (!target) throw new Error(`${label}.targetId does not identify a scene object: ${targetId}`);
        if (target === owner || target.type === LOCAL_EFFECTS_TYPE) throw new Error(`${label}.targetId must identify a non-effect scene object`);
        assertLocalEffectTarget(target, `${label}.targetId=${targetId}`);
        const targetSamples = localTargetGeometrySamples(scene, target, `${label}.targetId=${targetId}`);
        const resolvedTarget = targetSamples[0].attributes;
        const phaseId = stableId(instance.phaseId, `${label}.phaseId`);
        const matches = phases.get(phaseId) || [];
        if (matches.length === 0) throw new Error(`${label}.phaseId references missing shared phase ${phaseId}`);
        if (matches.length > 1) throw new Error(`${label}.phaseId references ambiguous shared phase ${phaseId}`);
        const phase = matches[0];
        if (phase.id !== phaseId) throw new Error(`${label}.phaseId does not match its shared phase record`);
        const startSec = finite(phase.startSec, `${label}.phase.startSec`);
        const durationSec = phaseDuration(phase);
        if (startSec < 0 || durationSec <= 0 || startSec + durationSec > finite(scene.duration, "scene.duration") + 1e-8) {
          throw new RangeError(`${label}.phase must be a positive absolute-time interval inside scene.duration`);
        }
        if (phase.timeBasis !== "scene-local") throw new Error(`${label}.phaseId=${phaseId} must reference a shared scene-local phase so audioEvents can use the same clock`);
        samplePhase(startSec, phase);
        const geometry = instance.geometry;
        if (!geometry || typeof geometry !== "object" || Array.isArray(geometry)) throw new TypeError(`${label}.geometry must contain local canvas coordinates for the identified target`);
        if (contract.geometry === "points") {
          const points = geometry.points;
          if (!Array.isArray(points) || points.length < 2) throw new TypeError(`${label}.geometry.points must contain at least two [x,y] points`);
          points.forEach((point, pointIndex) => {
            if (!Array.isArray(point) || point.length !== 2) throw new TypeError(`${label}.geometry.points[${pointIndex}] must be [x,y]`);
            finite(point[0], `${label}.geometry.points[${pointIndex}][0]`);
            finite(point[1], `${label}.geometry.points[${pointIndex}][1]`);
          });
          const targetPoints = resolvedTarget.type === "path" || resolvedTarget.type === "polygon" ? (resolvedTarget.points || []).map((point) => [point.x, point.y])
            : resolvedTarget.type === "line" ? [[resolvedTarget.x1 || 0, resolvedTarget.y1 || 0], [resolvedTarget.x2 || 0, resolvedTarget.y2 || 0]] : null;
          if (!samePoints(points, targetPoints)) throw new Error(`${label}.geometry.points must match the static screen-space points of target ${targetId}`);
        } else if (contract.geometry === "brace") {
          finite(geometry.x, `${label}.geometry.x`);
          finite(geometry.y0, `${label}.geometry.y0`);
          finite(geometry.y1, `${label}.geometry.y1`);
          if (geometry.y1 <= geometry.y0) throw new RangeError(`${label}.geometry.y1 must be greater than y0`);
          if (resolvedTarget.type !== "rect" || !sameNumber(geometry.y0, resolvedTarget.y) || !sameNumber(geometry.y1, resolvedTarget.y + resolvedTarget.height)
              || (!sameNumber(geometry.x, resolvedTarget.x) && !sameNumber(geometry.x, resolvedTarget.x + resolvedTarget.width))) {
            throw new Error(`${label}.geometry brace endpoints must bind to the top/bottom and left/right edge of target ${targetId}`);
          }
        } else {
          const rect = geometry.rect;
          if (!rect || typeof rect !== "object" || Array.isArray(rect)) throw new TypeError(`${label}.geometry.rect is required for ${effectId}`);
          for (const key of ["x", "y", "width", "height"]) finite(rect[key], `${label}.geometry.rect.${key}`);
          if (rect.width <= 0 || rect.height <= 0) throw new RangeError(`${label}.geometry.rect width and height must be positive`);
          let targetRect = null;
          if (effectId === "huashu-mo-staggered-target-reveal") {
            const data = resolvedTarget.data;
            if (target.type !== "custom:huashu-local-target" || !data || data.primitive !== "rect") {
              throw new Error(`${label}.targetId must identify a custom:huashu-local-target rectangle for ${effectId}`);
            }
            targetRect = data.geometry;
            if (!targetRect || typeof targetRect !== "object" || Array.isArray(targetRect)) throw new TypeError(`${label}.targetId=${targetId}.data.geometry must define a static target rectangle`);
            for (const key of ["x", "y", "width", "height"]) finite(targetRect[key], `${label}.targetId=${targetId}.data.geometry.${key}`);
            if (targetRect.width <= 0 || targetRect.height <= 0) throw new RangeError(`${label}.targetId=${targetId}.data.geometry width and height must be positive`);
            for (const key of ["fill", "stroke"]) if (data[key] != null && typeof data[key] !== "string") throw new TypeError(`${label}.targetId=${targetId}.data.${key} must be a CSS paint string`);
            if ((data.fill == null || data.fill === "none") && (data.stroke == null || data.stroke === "none")) throw new Error(`${label}.targetId=${targetId} needs a visible fill or stroke`);
            if (data.lineWidth != null && (!Number.isFinite(data.lineWidth) || data.lineWidth <= 0)) throw new RangeError(`${label}.targetId=${targetId}.data.lineWidth must be greater than zero`);
          } else if (resolvedTarget.type === "rect") {
            targetRect = resolvedTarget;
          }
          if (!targetRect || !sameNumber(rect.x, targetRect.x) || !sameNumber(rect.y, targetRect.y)
              || !sameNumber(rect.width, targetRect.width) || !sameNumber(rect.height, targetRect.height)) {
            throw new Error(`${label}.geometry.rect must match the static screen-space bounds of target ${targetId}`);
          }
        }
        const parameters = instance.parameters == null ? {} : instance.parameters;
        if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw new TypeError(`${label}.parameters must be an object`);
        const allowed = new Set(contract.parameters);
        for (const key of Object.keys(parameters)) if (!allowed.has(key)) throw new Error(`${label}.parameters.${key} is not consumed by ${effectId}`);
        if (parameters.color != null && (typeof parameters.color !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(parameters.color))) throw new TypeError(`${label}.parameters.color must be a hex color`);
        for (const key of ["lineWidth", "depth", "timeWidth", "scale"]) {
          if (parameters[key] != null && (!Number.isFinite(parameters[key]) || parameters[key] <= 0)) throw new RangeError(`${label}.parameters.${key} must be finite and greater than zero`);
        }
        const stagger = instance.stagger;
        if (contract.requiredStagger && stagger == null) throw new TypeError(`${label}.stagger is required because original MO.lagged controls this target's appearance`);
        if (stagger != null) {
          if (!stagger || typeof stagger !== "object" || Array.isArray(stagger)) throw new TypeError(`${label}.stagger must be an object`);
          const groupId = stableId(stagger.groupId, `${label}.stagger.groupId`);
          const itemIndex = stagger.index;
          const count = stagger.count;
          const ratio = stagger.ratio == null ? 0.08 : finite(stagger.ratio, `${label}.stagger.ratio`);
          if (!Number.isInteger(count) || count < 1 || !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= count || ratio < 0 || ratio > 0.5) throw new RangeError(`${label}.stagger requires 0 <= index < count and 0 <= ratio <= 0.5`);
          const group = groups.get(groupId) || { count, ratio, indexes: new Set() };
          if (group.count !== count || Math.abs(group.ratio - ratio) > 1e-8 || group.indexes.has(itemIndex)) throw new Error(`Local effect stagger group ${groupId} has conflicting count/ratio or duplicate index`);
          group.indexes.add(itemIndex);
          groups.set(groupId, group);
        }
        records.push({ ownerId: owner.id, id, effectId, targetId, phaseId, phase, startSec, durationSec, geometry, parameters, stagger: stagger || null });
      }
    }
    for (const [groupId, group] of groups) {
      if (group.indexes.size !== group.count) throw new Error(`Local effect stagger group ${groupId} declares ${group.count} items but provides ${group.indexes.size}`);
    }
    return records;
  }

  function samplePhase(timeSec, phase) {
    finite(timeSec, "timeSec");
    if (!phase || typeof phase !== "object") throw new TypeError("phase is required");
    const phaseId = stableId(phase.id, "phase.id");
    const startSec = finite(phase.startSec, "phase.startSec");
    const durationSec = phaseDuration(phase);
    if (durationSec <= 0) throw new RangeError(`phase ${phaseId} durationSec must be greater than zero`);
    const rawProgress = (timeSec - startSec) / durationSec;
    const progress = clamp(rawProgress, 0, 1);
    const curvedProgress = easing(progress, phase.curve == null ? phase.ease : phase.curve);
    const from = finite(phase.from == null ? 0 : phase.from, "phase.from");
    const to = finite(phase.to == null ? 1 : phase.to, "phase.to");
    return {
      id: phaseId,
      timeSec,
      startSec,
      durationSec,
      rawProgress,
      progress,
      curvedProgress,
      active: rawProgress >= 0 && rawProgress <= 1,
      value: from + (to - from) * curvedProgress,
    };
  }

  function sampleChannels(timeSec, phase) {
    if (!phase || typeof phase !== "object") throw new TypeError("phase is required");
    const base = samplePhase(timeSec, phase);
    const specs = phase.channels || {};
    if (!specs || typeof specs !== "object" || Array.isArray(specs)) throw new TypeError(`phase ${base.id}.channels must be an object`);
    const channels = {};
    for (const [name, spec] of Object.entries(specs)) {
      if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new TypeError(`phase ${base.id} channel ${name} must be an object`);
      const startSec = spec.startSec == null
        ? base.startSec + finite(spec.offsetSec == null ? 0 : spec.offsetSec, `phase ${base.id} channel ${name}.offsetSec`)
        : finite(spec.startSec, `phase ${base.id} channel ${name}.startSec`);
      const durationSec = spec.durationSec == null ? base.durationSec : finite(spec.durationSec, `phase ${base.id} channel ${name}.durationSec`);
      const value = samplePhase(timeSec, {
        id: spec.id == null ? `${base.id}:${name}` : spec.id,
        startSec,
        durationSec,
        curve: spec.curve == null ? (phase.curve == null ? phase.ease : phase.curve) : spec.curve,
        from: spec.from == null ? 0 : spec.from,
        to: spec.to == null ? 1 : spec.to,
      });
      let anchor = spec.anchor == null ? null : spec.anchor;
      if (anchor && typeof anchor === "object") {
        anchor = { ...anchor };
        if (anchor.x != null) finite(anchor.x, `phase ${base.id} channel ${name}.anchor.x`);
        if (anchor.y != null) finite(anchor.y, `phase ${base.id} channel ${name}.anchor.y`);
      } else if (anchor != null && typeof anchor !== "string") {
        throw new TypeError(`phase ${base.id} channel ${name}.anchor must be a string or object`);
      }
      channels[name] = { ...value, anchor };
    }
    return { phase: base, channels };
  }

  function indexPhases(scene) {
    const phases = new Map();
    const owners = [{ phases: scene && scene.phases, label: "scene.phases" }];
    for (const object of (scene && scene.objects) || []) {
      owners.push({ phases: object && object.data && object.data.phases, label: `objects.${object && object.id || "?"}.data.phases` });
    }
    for (const owner of owners) {
      if (owner.phases == null) continue;
      if (!Array.isArray(owner.phases)) throw new TypeError(`${owner.label} must be an array`);
      for (const phase of owner.phases) {
        // `phases` is existing custom consumer data in some works. Validate a
        // phase's new absolute-time shape only when a shared event explicitly
        // references it; unreferenced legacy records stay opaque here.
        if (!phase || typeof phase !== "object" || typeof phase.id !== "string" || !phase.id.trim()) continue;
        const matches = phases.get(phase.id) || [];
        matches.push(phase);
        phases.set(phase.id, matches);
      }
    }
    return phases;
  }

  function mapLocalTimeToFilm(localTimeSec, mapping) {
    finite(localTimeSec, "localTimeSec");
    if (!mapping || typeof mapping !== "object") throw new TypeError("time mapping is required");
    const localStartSec = finite(mapping.localStartSec, "timeMap.localStartSec");
    const filmStartSec = finite(mapping.filmStartSec, "timeMap.filmStartSec");
    const speed = finite(mapping.speed, "timeMap.speed");
    if (speed < 0.000001) throw new RangeError("timeMap.speed must be at least 0.000001");
    if (localTimeSec < localStartSec - 1e-8) throw new RangeError("local time precedes its declared timeMap segment");
    if (mapping.localEndSec != null && localTimeSec > finite(mapping.localEndSec, "timeMap.localEndSec") + 1e-8) {
      throw new RangeError("local time falls outside its declared timeMap segment");
    }
    return filmStartSec + (localTimeSec - localStartSec) / speed;
  }

  function findSceneAudioEvents(scene) {
    if (!scene || typeof scene !== "object") throw new TypeError("scene is required to resolve shared audio events");
    const phases = indexPhases(scene);
    const found = [];
    if (Array.isArray(scene.audioEvents)) {
      found.push(...scene.audioEvents.map((event) => ({ event, data: scene, owner: "scene.audioEvents" })));
    }
    for (const object of scene.objects || []) {
      const data = object && object.data;
      if (data && Array.isArray(data.audioEvents)) {
        found.push(...data.audioEvents.map((event) => ({ event, data, owner: `objects.${object.id || "?"}.data.audioEvents` })));
      }
    }
    const events = new Map();
    for (const item of found) {
      const eventId = stableId(item.event && item.event.id, `${item.owner} event id`);
      if (events.has(eventId)) throw new Error(`Duplicate shared audio event ID: ${eventId}`);
      const event = item.event;
      let phase = null;
      let rawTime;
      if (event.phaseId != null) {
        const phaseId = stableId(event.phaseId, `shared event ${eventId} phaseId`);
        const matches = phases.get(phaseId) || [];
        if (matches.length === 0) throw new Error(`shared event ${eventId} references missing phaseId ${phaseId}`);
        if (matches.length > 1) throw new Error(`shared event ${eventId} references ambiguous phaseId ${phaseId}`);
        phase = matches[0];
        samplePhase(finite(phase.startSec, `phase ${phaseId}.startSec`), phase);
        const phaseOffsetSec = finite(event.phaseOffsetSec == null ? 0 : event.phaseOffsetSec, `shared event ${eventId}.phaseOffsetSec`);
        rawTime = finite(phase.startSec, `phase ${phaseId}.startSec`) + phaseOffsetSec;
        if (event.filmTimeSec != null || event.timeSec != null || event.time != null) {
          throw new Error(`shared event ${eventId} must not duplicate its phaseId with a separate time`);
        }
      } else {
        rawTime = event.filmTimeSec ?? event.timeSec ?? event.time;
      }
      finite(rawTime, `shared event ${eventId} time`);
      if (rawTime < 0) throw new RangeError(`shared event ${eventId} time must be non-negative`);
      let timeBasis = event.timeBasis || (event.filmTimeSec != null ? "film-global" : null)
        || (phase && phase.timeBasis) || item.data.timeBasis || scene.timeBasis;
      if (typeof timeBasis === "string") {
        timeBasis = timeBasis.trim().toLowerCase().replace(/_/g, "-");
        if (timeBasis !== "film-global" && timeBasis !== "scene-local") timeBasis = "unknown";
      } else timeBasis = "unknown";
      if (event.filmTimeSec != null && timeBasis !== "film-global") throw new Error(`shared event ${eventId} has conflicting filmTimeSec and timeBasis`);
      events.set(eventId, { id: eventId, timeSec: rawTime, timeBasis, owner: item.owner, source: event, phaseId: phase && phase.id || null });
    }
    return events;
  }

  function mapSceneEvents(plan, scene, maps) {
    const shared = findSceneAudioEvents(scene);
    let tolerance = 0.0005;
    if (scene.fps) {
      const fps = finite(scene.fps, "scene.fps");
      if (fps < 0.001) throw new RangeError("scene.fps must be at least 0.001");
      tolerance = 0.5 / fps;
    }
    return (plan.events || []).map((cue) => {
      const eventId = cue.eventId || cue.id;
      const sourceEvent = shared.get(eventId);
      if (!sourceEvent) throw new Error(`cue ${cue.id} does not refer to a shared scene audio event: ${eventId}`);
      let filmTimeSec = sourceEvent.timeSec;
      if (sourceEvent.timeBasis === "scene-local") {
        if (!cue.timeMapId) throw new Error(`cue ${cue.id} references a scene-local event and requires timeMapId`);
        filmTimeSec = mapLocalTimeToFilm(filmTimeSec, maps.get(cue.timeMapId));
      } else if (sourceEvent.timeBasis === "film-global") {
        if (cue.timeMapId) throw new Error(`cue ${cue.id} references a film-global event and cannot apply a local timeMapId`);
      } else {
        throw new Error(`shared event ${eventId} has an unknown time basis; use filmTimeSec or declare timeBasis as film-global/scene-local`);
      }
      filmTimeSec += cue.offsetSec || 0;
      finite(filmTimeSec, `cue ${cue.id} mapped film time`);
      if (filmTimeSec < 0) throw new RangeError(`cue ${cue.id} mapped film time must be non-negative`);
      if (cue.filmTimeSec != null && Math.abs(cue.filmTimeSec - filmTimeSec) > tolerance) {
        throw new Error(`cue ${cue.id} filmTimeSec disagrees with shared event/time map (wrong units or stale timing)`);
      }
      if (filmTimeSec > plan.durationSec + tolerance) throw new Error(`cue ${cue.id} film time is beyond durationSec`);
      return { cue, eventId, sourceEvent, filmTimeSec };
    });
  }

  function filmToLocalTime(time, mapping) {
    finite(time, "time");
    if (!mapping || typeof mapping !== "object") throw new TypeError("mapping is required");
    const filmStartSec = finite(mapping.filmStartSec, "filmStartSec");
    const filmEndSec = finite(mapping.filmEndSec, "filmEndSec");
    const localStartSec = mapping.localStartSec == null ? 0 : finite(mapping.localStartSec, "localStartSec");
    const localEndSec = finite(mapping.localEndSec, "localEndSec");
    if (filmEndSec <= filmStartSec) throw new RangeError("filmEndSec must be greater than filmStartSec");
    if (localEndSec < localStartSec) throw new RangeError("localEndSec must not precede localStartSec");
    const raw = localStartSec + ((time - filmStartSec) / (filmEndSec - filmStartSec)) * (localEndSec - localStartSec);
    return mapping.clamp === false ? raw : clamp(raw, localStartSec, localEndSec);
  }

  function hash32(value) {
    const text = String(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededUnit(seed, index) {
    finite(index, "index");
    let value = (hash32(seed) ^ Math.imul((index | 0) + 1, 0x9e3779b1)) >>> 0;
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }

  function stableParticles(seed, count, bounds) {
    if (!Number.isInteger(count) || count < 0) throw new RangeError("count must be a non-negative integer");
    const area = bounds || {};
    const x = finite(area.x == null ? 0 : area.x, "bounds.x");
    const y = finite(area.y == null ? 0 : area.y, "bounds.y");
    const width = finite(area.width == null ? 1 : area.width, "bounds.width");
    const height = finite(area.height == null ? 1 : area.height, "bounds.height");
    const minRadius = finite(area.minRadius == null ? 0 : area.minRadius, "bounds.minRadius");
    const maxRadius = finite(area.maxRadius == null ? minRadius : area.maxRadius, "bounds.maxRadius");
    if (width < 0 || height < 0 || minRadius < 0 || maxRadius < minRadius) throw new RangeError("particle bounds are invalid");
    return Array.from({ length: count }, (_, index) => {
      const r0 = seededUnit(seed, index * 4);
      const r1 = seededUnit(seed, index * 4 + 1);
      const r2 = seededUnit(seed, index * 4 + 2);
      const r3 = seededUnit(seed, index * 4 + 3);
      return {
        id: `${String(seed)}:${index}`,
        x: x + r0 * width,
        y: y + r1 * height,
        radius: minRadius + r2 * (maxRadius - minRadius),
        phase: r3 * Math.PI * 2,
      };
    });
  }

  function emphasisEnvelope(time, config) {
    finite(time, "time");
    const value = config || {};
    const start = finite(value.startSec, "startSec");
    const attack = Math.max(0, finite(value.attackSec == null ? 0 : value.attackSec, "attackSec"));
    const hold = Math.max(0, finite(value.holdSec == null ? 0 : value.holdSec, "holdSec"));
    const decay = Math.max(0, finite(value.decaySec == null ? 0 : value.decaySec, "decaySec"));
    const baseline = finite(value.baseline == null ? 0 : value.baseline, "baseline");
    const peak = finite(value.peak == null ? 1 : value.peak, "peak");
    const overshoot = finite(value.overshoot == null ? 0 : value.overshoot, "overshoot");
    if (overshoot < 0 || overshoot > 0.5) throw new RangeError("local overshoot must be between 0 and 0.5");
    if (time < start) return baseline;
    if (attack > 0 && time < start + attack) {
      const progress = (time - start) / attack;
      const approach = smooth(Math.min(1, progress / 0.75));
      const bump = progress > 0.75 ? overshoot * Math.sin(Math.PI * ((progress - 0.75) / 0.25)) : 0;
      return baseline + (peak - baseline) * (approach + bump);
    }
    const decayStart = start + attack + hold;
    if (time < decayStart || decay === 0) return time < start + attack + hold + decay ? peak : baseline;
    const progress = clamp((time - decayStart) / decay, 0, 1);
    return peak + (baseline - peak) * smooth(progress);
  }

  function withLocalMask(ctx, buildMaskPath, draw) {
    if (!ctx || typeof ctx.save !== "function" || typeof ctx.clip !== "function") throw new TypeError("a Canvas2D context is required");
    if (typeof buildMaskPath !== "function" || typeof draw !== "function") throw new TypeError("mask path and draw callbacks are required");
    ctx.save();
    try {
      ctx.beginPath();
      buildMaskPath(ctx);
      ctx.clip();
      return draw(ctx);
    } finally {
      ctx.restore();
    }
  }

  function textMetrics(ctx, text, style) {
    if (!ctx || typeof ctx.measureText !== "function") throw new TypeError("a Canvas2D text context is required");
    const config = style || {};
    const supportsDirection = "direction" in ctx;
    const supportsLetterSpacing = "letterSpacing" in ctx;
    const previous = {
      font: ctx.font, textAlign: ctx.textAlign, textBaseline: ctx.textBaseline,
      direction: ctx.direction, letterSpacing: ctx.letterSpacing,
    };
    const alignValue = config.align == null ? "left" : String(config.align);
    const baseline = config.baseline == null ? "alphabetic" : String(config.baseline);
    const requestedDirection = config.direction == null ? (ctx.direction || "ltr") : String(config.direction);
    let direction = requestedDirection;
    const letterSpacing = config.letterSpacing == null ? 0 : finite(Number(config.letterSpacing), "letterSpacing");
    if (!["left", "right", "center", "start", "end"].includes(alignValue)) throw new TypeError("text align must be left, right, center, start, or end");
    if (!["top", "hanging", "middle", "alphabetic", "ideographic", "bottom"].includes(baseline)) throw new TypeError("text baseline is not a supported CanvasTextBaseline");
    if (direction === "inherit") {
      // Canvas inherits direction from its element. Read its computed direction when
      // available; OffscreenCanvas and detached test contexts have no DOM direction,
      // so use an explicit LTR default and return it for the paired draw call.
      const canvas = ctx.canvas;
      const view = canvas && canvas.ownerDocument && canvas.ownerDocument.defaultView;
      if (view && typeof view.getComputedStyle === "function") {
        const inherited = view.getComputedStyle(canvas).direction;
        direction = inherited === "rtl" ? "rtl" : "ltr";
      } else direction = "ltr";
    }
    if (!["ltr", "rtl"].includes(direction)) throw new TypeError("text direction must be ltr or rtl");
    if (config.direction != null && !supportsDirection) throw new Error("Canvas2D direction is unavailable; measurement must use the final renderer's text direction");
    if (letterSpacing !== 0 && !supportsLetterSpacing) {
      throw new Error("Canvas2D letterSpacing is unavailable; use the same letter-spacing implementation as the final renderer");
    }
    try {
      if (config.font != null) ctx.font = String(config.font);
      ctx.textAlign = alignValue;
      ctx.textBaseline = baseline;
      if (supportsDirection) ctx.direction = direction;
      if (supportsLetterSpacing) ctx.letterSpacing = `${letterSpacing}px`;
      const effectiveAlign = alignValue === "start" ? (direction === "rtl" ? "right" : "left")
        : alignValue === "end" ? (direction === "rtl" ? "left" : "right") : alignValue;
      const source = String(text == null ? "" : text);
      // Use the same line-breaking and baseline spacing as MotionCore's text renderer.
      const layout = core.layoutText(ctx, source, {
        maxWidth: config.maxWidth == null ? null : Number(config.maxWidth),
        lineHeight: config.lineHeight == null ? null : Number(config.lineHeight),
        letterSpacing,
      });
      const stroke = finite(config.lineWidth == null ? 0 : Number(config.lineWidth), "lineWidth");
      const blur = finite(config.blurPx == null ? 0 : Number(config.blurPx), "blurPx");
      const padding = finite(config.padding == null ? 0 : Number(config.padding), "padding");
      if (stroke < 0 || blur < 0 || padding < 0) throw new RangeError("lineWidth, blurPx, and padding must not be negative");
      const expand = (box, amount) => ({ x: box.x - amount, y: box.y - amount, width: box.width + amount * 2, height: box.height + amount * 2 });
      const sizeMatch = String(ctx.font || "").match(/(?:^|\s)(\d+(?:\.\d+)?)px(?:\s|\/|$)/);
      const fallbackSize = sizeMatch ? Number(sizeMatch[1]) : 16;
      const measuredLines = layout.lines.map((line, index) => {
        const measured = ctx.measureText(line);
        const metric = (name) => Number.isFinite(measured[name]) ? measured[name] : null;
        const width = layout.widths[index];
        const actualLeft = metric("actualBoundingBoxLeft");
        const actualRight = metric("actualBoundingBoxRight");
        const actualAscent = metric("actualBoundingBoxAscent");
        const actualDescent = metric("actualBoundingBoxDescent");
        const advanceLeft = effectiveAlign === "center" ? -width / 2 : effectiveAlign === "right" ? -width : 0;
        const advanceRight = advanceLeft + width;
        const ascent = actualAscent == null ? fallbackSize * 0.8 : actualAscent;
        const descent = actualDescent == null ? fallbackSize * 0.25 : actualDescent;
        const inkLeft = actualLeft == null ? advanceLeft : -actualLeft;
        const inkRight = actualRight == null ? advanceRight : actualRight;
        const lineBounds = (x, y, boxWidth, boxHeight) => ({ x, y: y + index * layout.lineHeight, width: boxWidth, height: boxHeight });
        const inkBounds = lineBounds(inkLeft, -ascent, Math.max(0, inkRight - inkLeft), Math.max(0, ascent + descent));
        const advanceBounds = lineBounds(advanceLeft, -ascent, width, Math.max(0, ascent + descent));
        const paintBounds = expand(inkBounds, stroke / 2 + Math.ceil(blur * 3));
        return {
          text: line, advanceWidth: width, advanceBounds, inkBounds, paintBounds,
          occupiedBounds: expand(paintBounds, padding),
          actual: { left: actualLeft, right: actualRight, ascent: actualAscent, descent: actualDescent },
          actualMetricsAvailable: { left: actualLeft != null, right: actualRight != null, ascent: actualAscent != null, descent: actualDescent != null },
        };
      });
      const unionOf = (key) => measuredLines.reduce((box, line) => {
        const next = line[key];
        if (!box) return { ...next };
        const left = Math.min(box.x, next.x), top = Math.min(box.y, next.y);
        const right = Math.max(box.x + box.width, next.x + next.width);
        const bottom = Math.max(box.y + box.height, next.y + next.height);
        return { x: left, y: top, width: right - left, height: bottom - top };
      }, null) || { x: 0, y: 0, width: 0, height: 0 };
      const missingMetrics = [...new Set(measuredLines.flatMap((line) => Object.entries(line.actualMetricsAvailable)
        .filter(([, available]) => !available).map(([name]) => name)))];
      return {
        schema: "motion-text-occupancy/v1",
        text: source,
        font: String(ctx.font || ""),
        align: alignValue,
        baseline,
        direction,
        letterSpacing: `${letterSpacing}px`,
        measurement: {
          kind: missingMetrics.length ? "mixed-or-fallback" : "canvas-actual-bounds",
          advanceWidth: Math.max(0, ...layout.widths),
          missingActualMetrics: missingMetrics,
          // Zero and negative bearings are real Canvas metrics. Never replace them with guessed nonzero values.
          lines: measuredLines.map((line) => ({ text: line.text, advanceWidth: line.advanceWidth, actual: line.actual, actualMetricsAvailable: line.actualMetricsAvailable })),
        },
        advanceBounds: unionOf("advanceBounds"),
        inkBounds: unionOf("inkBounds"),
        paintBounds: unionOf("paintBounds"),
        occupiedBounds: unionOf("occupiedBounds"),
        blockBounds: unionOf("occupiedBounds"),
        lineHeight: layout.lineHeight,
        lineCount: layout.lines.length,
        perLine: measuredLines,
      };
    } finally {
      ctx.font = previous.font;
      ctx.textAlign = previous.textAlign;
      ctx.textBaseline = previous.textBaseline;
      if (supportsDirection) ctx.direction = previous.direction;
      if (supportsLetterSpacing) ctx.letterSpacing = previous.letterSpacing;
    }
  }

  function finiteBox(value, label) {
    if (!value || typeof value !== "object") throw new TypeError(`${label} must be a rectangle`);
    const box = {
      x: finite(value.x, `${label}.x`), y: finite(value.y, `${label}.y`),
      width: finite(value.width, `${label}.width`), height: finite(value.height, `${label}.height`),
    };
    if (box.width < 0 || box.height < 0) throw new RangeError(`${label} width and height must not be negative`);
    return box;
  }

  function explicitNumber(value, label) {
    if (typeof value !== "number") throw new TypeError(`${label} must be a finite number`);
    return finite(value, label);
  }

  function unionBoxes(values, label) {
    if (!Array.isArray(values) || values.length === 0) throw new TypeError(`${label} needs at least one rectangle`);
    const boxes = values.map((value, index) => finiteBox(value, `${label}[${index}]`));
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function offsetBox(box, x, y) {
    return { x: box.x + x, y: box.y + y, width: box.width, height: box.height };
  }

  function composeLabelGeometry(input) {
    const config = input || {};
    const measured = config.measuredText;
    if (!measured || typeof measured !== "object") throw new TypeError("measuredText from measureTextOccupancy is required");
    const textPaintBounds = finiteBox(measured.paintBounds, "measuredText.paintBounds");
    const textOccupiedBounds = finiteBox(measured.occupiedBounds, "measuredText.occupiedBounds");
    const partInputs = config.parts == null ? [] : config.parts;
    if (!Array.isArray(partInputs)) throw new TypeError("parts must be an array of actual paint rectangles");
    const seen = new Set();
    const parts = partInputs.map((part, index) => {
      const id = stableId(part && part.id, `parts[${index}].id`);
      if (seen.has(id)) throw new Error(`duplicate label geometry part ID ${id}`);
      seen.add(id);
      const drawBounds = finiteBox(part.drawBounds, `parts[${index}].drawBounds`);
      const paintBounds = finiteBox(part.paintBounds == null ? drawBounds : part.paintBounds, `parts[${index}].paintBounds`);
      return { id, drawBounds, paintBounds };
    });

    let background = null;
    if (config.background != null) {
      const inputBackground = config.background;
      const id = stableId(inputBackground.id, "background.id");
      if (seen.has(id)) throw new Error(`duplicate label geometry part ID ${id}`);
      const padding = inputBackground.innerPadding;
      if (!padding || typeof padding !== "object") throw new TypeError("background.innerPadding must explicitly provide top, right, bottom, and left");
      const inset = {
        top: explicitNumber(padding.top, "background.innerPadding.top"),
        right: explicitNumber(padding.right, "background.innerPadding.right"),
        bottom: explicitNumber(padding.bottom, "background.innerPadding.bottom"),
        left: explicitNumber(padding.left, "background.innerPadding.left"),
      };
      if (Object.values(inset).some((value) => value < 0)) throw new RangeError("background inner padding must not be negative");
      const contentPartIds = inputBackground.contentPartIds == null ? [] : inputBackground.contentPartIds;
      if (!Array.isArray(contentPartIds)) throw new TypeError("background.contentPartIds must be an array");
      const uniqueContentIds = [...new Set(contentPartIds.map((partId, index) => stableId(partId, `background.contentPartIds[${index}]`)))];
      if (uniqueContentIds.length !== contentPartIds.length) throw new Error("background.contentPartIds must not contain duplicate IDs");
      const contentParts = uniqueContentIds.map((partId) => {
        const part = parts.find((item) => item.id === partId);
        if (!part) throw new Error(`background references missing content part ${partId}`);
        return part.paintBounds;
      });
      const content = unionBoxes([textPaintBounds, ...contentParts], "background content");
      background = {
        id,
        contentPartIds: uniqueContentIds,
        innerPadding: inset,
        drawBounds: {
          x: content.x - inset.left,
          y: content.y - inset.top,
          width: content.width + inset.left + inset.right,
          height: content.height + inset.top + inset.bottom,
        },
      };
      // This helper only describes a plain filled rectangle. Add shadow/filter
      // extents in the caller's actual draw path before registering coverage.
      background.paintBounds = { ...background.drawBounds };
      seen.add(id);
    }

    const clearanceValue = config.clearance == null ? 0 : config.clearance;
    const clearance = typeof clearanceValue === "number"
      ? { x: explicitNumber(clearanceValue, "clearance"), y: explicitNumber(clearanceValue, "clearance") }
      : { x: explicitNumber(clearanceValue.x, "clearance.x"), y: explicitNumber(clearanceValue.y, "clearance.y") };
    if (clearance.x < 0 || clearance.y < 0) throw new RangeError("clearance must not be negative");

    const visible = [textPaintBounds, ...parts.map((part) => part.paintBounds)];
    if (background) visible.push(background.paintBounds);
    const visual = unionBoxes(visible, "visible label group");
    const occupied = unionBoxes([textOccupiedBounds, ...visible], "occupied label group");
    occupied.x -= clearance.x;
    occupied.y -= clearance.y;
    occupied.width += clearance.x * 2;
    occupied.height += clearance.y * 2;
    const toGroup = (box) => offsetBox(box, -occupied.x, -occupied.y);

    return {
      schema: "motion-label-geometry/v1",
      measurementKind: measured.measurement && measured.measurement.kind || "unspecified",
      textAnchorOffset: { x: -occupied.x, y: -occupied.y },
      textPaintBounds: toGroup(textPaintBounds),
      parts: parts.map((part) => ({ id: part.id, drawBounds: toGroup(part.drawBounds), paintBounds: toGroup(part.paintBounds) })),
      background: background ? { id: background.id, drawBounds: toGroup(background.drawBounds), paintBounds: toGroup(background.paintBounds) } : null,
      visualBounds: toGroup(visual),
      occupiedBounds: { x: 0, y: 0, width: occupied.width, height: occupied.height },
      clearance,
      limits: "Local component rectangles only; the caller must project every component in the same real coordinate space and separately inspect leader endpoints or unrepresented effects.",
    };
  }

  function transformBounds(bounds, transform) {
    const box = finiteBox(bounds, "bounds");
    const matrix = Array.isArray(transform) ? transform : transform && [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f];
    if (!matrix || matrix.length !== 6) throw new TypeError("transform must be a Canvas2D affine matrix [a,b,c,d,e,f]");
    const [a, b, c, d, e, f] = matrix.map((value, index) => finite(value, `transform[${index}]`));
    const points = [
      [box.x, box.y], [box.x + box.width, box.y],
      [box.x, box.y + box.height], [box.x + box.width, box.y + box.height],
    ].map(([x, y]) => ({ x: a * x + c * y + e, y: b * x + d * y + f }));
    const left = Math.min(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const right = Math.max(...points.map((point) => point.x));
    const bottom = Math.max(...points.map((point) => point.y));
    return { x: left, y: top, width: right - left, height: bottom - top, coordinateSpace: "screen", boundsKind: "conservative-aabb" };
  }

  function boxesIntersect(leftValue, rightValue) {
    const left = finiteBox(leftValue, "left box"), right = finiteBox(rightValue, "right box");
    const x = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
    const y = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
    return { intersects: x > 0 && y > 0, intersection: { x: Math.max(left.x, right.x), y: Math.max(left.y, right.y), width: x, height: y, area: x * y } };
  }

  function intervalsOverlap(left, right) {
    if (!left || !right) return true;
    return finite(left[0], "interval.start") < finite(right[1], "interval.end")
      && finite(right[0], "interval.start") < finite(left[1], "interval.end");
  }

  function chooseLabelPlacement(input) {
    const config = input || {};
    const id = stableId(config.id, "layout request id");
    const targetId = stableId(config.targetId, "layout targetId");
    if (typeof config.relation !== "string" || !config.relation.trim()) throw new TypeError("layout relation must explain what the label identifies or describes");
    const readingInterval = config.readingInterval;
    if (!Array.isArray(readingInterval) || readingInterval.length !== 2 || !Number.isFinite(readingInterval[0]) || !Number.isFinite(readingInterval[1]) || readingInterval[1] <= readingInterval[0]) {
      throw new TypeError("readingInterval must be [startSec,endSec] with positive duration");
    }
    const candidates = config.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) throw new TypeError("at least one director-supplied candidate is required");
    const viewport = config.viewport == null ? null : finiteBox(config.viewport, "viewport");
    const protectedAreas = config.protectedAreas || [];
    if (!Array.isArray(protectedAreas)) throw new TypeError("protectedAreas must be an array");
    const ranked = candidates.map((candidate, index) => ({ candidate, index, priority: finite(candidate.priority == null ? 0 : candidate.priority, `candidates[${index}].priority`) }))
      .sort((left, right) => left.priority - right.priority || left.index - right.index);
    const rejected = [];
    for (const entry of ranked) {
      const candidate = entry.candidate;
      const candidateId = stableId(candidate.id, `candidates[${entry.index}].id`);
      const box = finiteBox(candidate.box, `candidate ${candidateId}.box`);
      const issues = [];
      if (viewport && (box.x < viewport.x || box.y < viewport.y || box.x + box.width > viewport.x + viewport.width || box.y + box.height > viewport.y + viewport.height)) {
        issues.push({ type: "outside-viewport", viewport });
      }
      for (const area of protectedAreas) {
        if (!area || area.visible === false || !intervalsOverlap(readingInterval, area.visibleInterval)) continue;
        const areaId = stableId(area.id, "protected area id");
        if ((candidate.allowOverlapIds || []).includes(areaId)) continue;
        const overlap = boxesIntersect(box, area.box);
        if (overlap.intersects) issues.push({ type: "protected-area-intersection", areaId, role: area.role || "unspecified", intersection: overlap.intersection });
      }
      if (!issues.length) {
        return {
          schema: "motion-label-placement/v1", status: "placed", id, targetId, relation: config.relation,
          readingInterval: [...readingInterval], candidateId, box, anchorId: candidate.anchorId || null,
          checkedProtectedIds: protectedAreas.filter((area) => area && area.visible !== false && intervalsOverlap(readingInterval, area.visibleInterval)).map((area) => area.id),
          rejected,
          placementBasis: "director-ranked supplied boxes; interval metadata does not sample motion",
        };
      }
      rejected.push({ candidateId, issues });
    }
    return { schema: "motion-label-placement/v1", status: "unresolved", id, targetId, relation: config.relation, readingInterval: [...readingInterval], placementBasis: "director-ranked supplied boxes; interval metadata does not sample motion", rejected };
  }

  function diagnoseLayout(input) {
    const config = input || {};
    const timeSec = finite(config.timeSec, "layout timeSec");
    const viewport = finiteBox(config.viewport, "layout viewport");
    const items = config.items || [];
    if (!Array.isArray(items)) throw new TypeError("layout items must be an array");
    const scope = typeof config.scope === "string" && config.scope.trim() ? config.scope.trim() : "unspecified-producer-scope";
    const seen = new Set();
    const boxes = items.map((item, index) => {
      const id = stableId(item && item.id, `items[${index}].id`);
      if (seen.has(id)) throw new Error(`duplicate layout item ID ${id}`);
      seen.add(id);
      const opacity = finite(item.opacity == null ? 1 : Number(item.opacity), `item ${id}.opacity`);
      return { id, role: item.role || "unspecified", visible: item.visible !== false && opacity > 0, opacity, box: finiteBox(item.box, `item ${id}.box`) };
    });
    const expectedIds = config.expectedIds == null ? null : [...new Set(config.expectedIds.map((value, index) => stableId(value, `expectedIds[${index}]`)))];
    const missingIds = expectedIds ? expectedIds.filter((id) => !seen.has(id)) : [];
    const allowOverlaps = config.allowOverlaps || [];
    if (!Array.isArray(allowOverlaps)) throw new TypeError("allowOverlaps must be an array");
    const allowedPairs = new Set(allowOverlaps.map((pair, index) => {
      if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError(`allowOverlaps[${index}] must be a pair of IDs`);
      const [left, right] = pair.map((id) => stableId(id, `allowOverlaps[${index}]`));
      return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
    }));
    const intersections = [], conflicts = [];
    for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
      const left = boxes[leftIndex];
      if (!left.visible) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
        const right = boxes[rightIndex];
        if (!right.visible) continue;
        const overlap = boxesIntersect(left.box, right.box);
        if (!overlap.intersects) continue;
        const key = left.id < right.id ? `${left.id}\u0000${right.id}` : `${right.id}\u0000${left.id}`;
        const entry = { ids: [left.id, right.id], roles: [left.role, right.role], intersection: overlap.intersection, allowed: allowedPairs.has(key) };
        intersections.push(entry);
        if (!entry.allowed) conflicts.push(entry);
      }
    }
    const outOfFrame = boxes.filter((item) => item.visible && (item.box.x < viewport.x || item.box.y < viewport.y || item.box.x + item.box.width > viewport.x + viewport.width || item.box.y + item.box.height > viewport.y + viewport.height)).map((item) => item.id);
    return {
      schema: "motion-layout-snapshot/v1", timeSec, scope, coordinateSpace: "screen",
      boundsKind: "conservative-aabb", viewport, status: items.length ? (missingIds.length ? "partial" : "checked") : "not-checked",
      coverage: { registeredIds: boxes.map((item) => item.id), expectedIds, missingIds, producerDeclaredScopeOnly: true },
      items: boxes, allowOverlaps: allowOverlaps.map((pair) => [...pair]), intersections, conflicts, outOfFrame,
      limits: "Bounding-box diagnostics only; do not infer pixel occlusion, semantic correctness, unregistered coverage, or visual quality.",
    };
  }

  function createTextBitmapCache(options) {
    const config = options || {};
    const fontSet = config.fontSet || (typeof document !== "undefined" ? document.fonts : null);
    const createCanvas = config.createCanvas || (() => {
      if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(1, 1);
      if (typeof document !== "undefined") return document.createElement("canvas");
      throw new Error("Text bitmap cache needs OffscreenCanvas or a document canvas factory");
    });
    const maxEntries = config.maxEntries == null ? 128 : config.maxEntries;
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new RangeError("maxEntries must be a positive integer");
    const cache = new Map();
    let fontGeneration = 0;
    const invalidate = () => { cache.clear(); fontGeneration += 1; };
    if (fontSet && typeof fontSet.addEventListener === "function") {
      fontSet.addEventListener("loadingdone", invalidate);
      fontSet.addEventListener("loadingerror", invalidate);
    }

    async function get(text, style) {
      const value = style || {};
      const content = String(text);
      const font = String(value.font || "16px sans-serif");
      const align = value.align || "left";
      const baseline = value.baseline || "alphabetic";
      if (!["left", "center", "right"].includes(align)) throw new TypeError("text cache align must be left, center, or right");
      if (baseline !== "alphabetic") throw new TypeError("text cache currently uses an alphabetic baseline");
      const blurPx = finite(value.blurPx == null ? 0 : value.blurPx, "blurPx");
      if (blurPx < 0 || blurPx > 64) throw new RangeError("blurPx must be between 0 and 64");
      if (fontSet && fontSet.ready) await fontSet.ready;
      let loadedFaces = null;
      if (fontSet && typeof fontSet.load === "function") {
        loadedFaces = await fontSet.load(font, content);
        if (value.requireFont && (!Array.isArray(loadedFaces) || loadedFaces.length === 0)) {
          throw new Error(`Required font did not load: ${font}`);
        }
      } else if (value.requireFont) {
        throw new Error(`Font loading cannot be verified for required font: ${font}`);
      }
      if (fontSet && typeof fontSet.check === "function" && !fontSet.check(font, content)) {
        throw new Error(`Font set reports the requested font unavailable: ${font}`);
      }

      const normalized = {
        font,
        fillStyle: value.fillStyle == null ? "#fff" : String(value.fillStyle),
        strokeStyle: value.strokeStyle == null ? null : String(value.strokeStyle),
        lineWidth: value.lineWidth == null ? 0 : finite(value.lineWidth, "lineWidth"),
        padding: value.padding == null ? 2 : finite(value.padding, "padding"),
        blurPx,
        align,
      };
      const key = JSON.stringify([fontGeneration, content, normalized]);
      if (cache.has(key)) {
        const existing = cache.get(key);
        cache.delete(key);
        cache.set(key, existing);
        return existing;
      }

      const canvas = createCanvas();
      const ctx = canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
      if (!ctx || typeof ctx.measureText !== "function") throw new Error("Canvas factory did not return a 2D text canvas");
      ctx.font = normalized.font;
      ctx.textAlign = normalized.align;
      ctx.textBaseline = "alphabetic";
      const measured = ctx.measureText(content);
      const sizeMatch = normalized.font.match(/(?:^|\s)(\d+(?:\.\d+)?)px(?:\s|\/|$)/);
      const fallbackSize = sizeMatch ? Number(sizeMatch[1]) : 16;
      const metric = (name, fallback) => Number.isFinite(measured[name]) ? measured[name] : fallback;
      const ascent = metric("actualBoundingBoxAscent", fallbackSize * 0.8);
      const descent = metric("actualBoundingBoxDescent", fallbackSize * 0.25);
      const width = measured.width;
      const pad = Math.max(0, normalized.padding);
      const strokePad = normalized.strokeStyle && normalized.lineWidth > 0 ? normalized.lineWidth / 2 : 0;
      const blurPad = Math.ceil(normalized.blurPx * 3);
      const outerPad = pad + strokePad + blurPad;
      const inkLeft = -metric("actualBoundingBoxLeft", 0);
      const inkRight = metric("actualBoundingBoxRight", width);
      const inkWidth = Math.max(0, inkRight - inkLeft);
      canvas.width = Math.max(1, Math.ceil(normalized.align === "center"
        ? 2 * (Math.max(-inkLeft, inkRight) + outerPad)
        : inkWidth + outerPad * 2));
      canvas.height = Math.max(1, Math.ceil(ascent + descent + outerPad * 2));
      const drawCtx = canvas.getContext("2d");
      drawCtx.font = normalized.font;
      drawCtx.textBaseline = "alphabetic";
      drawCtx.textAlign = normalized.align;
      if (normalized.blurPx > 0) {
        if (!("filter" in drawCtx)) throw new Error("Canvas2D filter is required for a soft text bitmap");
        drawCtx.filter = `blur(${normalized.blurPx}px)`;
        if (drawCtx.filter === "none") throw new Error("Canvas2D rejected the requested text blur filter");
      }
      const textX = normalized.align === "left" ? outerPad - inkLeft
        : normalized.align === "center" ? canvas.width / 2
          : canvas.width - outerPad - inkRight;
      const textY = outerPad + ascent;
      if (normalized.lineWidth > 0 && normalized.strokeStyle) {
        drawCtx.lineWidth = normalized.lineWidth;
        drawCtx.strokeStyle = normalized.strokeStyle;
        drawCtx.strokeText(content, textX, textY);
      }
      drawCtx.fillStyle = normalized.fillStyle;
      drawCtx.fillText(content, textX, textY);
      const bitmap = {
        canvas,
        width,
        height: canvas.height,
        ascent,
        descent,
        anchorX: textX,
        align: normalized.align,
        variant: normalized.blurPx > 0 ? "soft" : "clear",
        blurPx: normalized.blurPx,
        draw(target, x, y) {
          target.drawImage(canvas, x - textX, y - textY);
        },
      };
      cache.set(key, bitmap);
      while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
      return bitmap;
    }

    async function getVariants(text, style, softBlurPx) {
      const source = style || {};
      const blur = finite(softBlurPx == null ? 2 : softBlurPx, "softBlurPx");
      if (blur <= 0 || blur > 64) throw new RangeError("softBlurPx must be greater than zero and no more than 64");
      const clearStyle = { ...source, blurPx: 0 };
      const softStyle = { ...source, blurPx: blur };
      const [clear, soft] = await Promise.all([get(text, clearStyle), get(text, softStyle)]);
      return { clear, soft };
    }

    return { get, getVariants, invalidate, dispose() {
      invalidate();
      if (fontSet && typeof fontSet.removeEventListener === "function") {
        fontSet.removeEventListener("loadingdone", invalidate);
        fontSet.removeEventListener("loadingerror", invalidate);
      }
    }, get size() { return cache.size; } };
  }

  const MOTION_FOLLOW_BOX_ID = "laohu.motion-follow-box/1";
  const MOTION_OPERATION_RENDERER = "custom:laohu-motion-operation";
  let motionFrameContext = null;

  function objectTransformIsNeutral(object) {
    return (object.translateX == null || object.translateX === 0)
      && (object.translateY == null || object.translateY === 0)
      && (object.rotation == null || object.rotation === 0)
      && (object.scale == null || object.scale === 1)
      && (object.scaleX == null || object.scaleX === 1)
      && (object.scaleY == null || object.scaleY === 1);
  }

  function layerTransformIsNeutral(transform) {
    const value = transform || {};
    return (value.x == null || value.x === 0) && (value.y == null || value.y === 0)
      && (value.rotation == null || value.rotation === 0)
      && (value.scale == null || value.scale === 1)
      && (value.scaleX == null || value.scaleX === 1)
      && (value.scaleY == null || value.scaleY === 1);
  }

  function validateMotionOperations(scene) {
    if (!scene || typeof scene !== "object" || Array.isArray(scene)) throw new TypeError("scene is required to validate motion operations");
    const objects = new Map((scene.objects || []).map((object) => [object.id, object]));
    const layers = new Map((scene.layers || []).map((layer) => [layer.id, layer]));
    const phases = indexPhases(scene);
    const instances = new Map();
    const claims = [];
    const records = [];
    function layerChain(layerId, label) {
      const chain = [];
      const seen = new Set();
      let currentId = layerId;
      while (currentId != null) {
        if (seen.has(currentId)) throw new Error(`${label} has a layer parent cycle`);
        seen.add(currentId);
        const layer = layers.get(currentId);
        if (!layer) throw new Error(`${label} references missing layer ${currentId}`);
        chain.unshift(layer);
        currentId = layer.parent;
      }
      return chain;
    }
    function assertUnclippedSourceOver(chain, label, requireNeutralTransform = false) {
      for (const layer of chain) {
        if (layer.clip != null) throw new Error(`${label} does not support clipped ancestor layer ${layer.id}`);
        if (layer.blendMode != null && layer.blendMode !== "source-over") throw new Error(`${label} requires source-over ancestor layers; ${layer.id} uses ${layer.blendMode}`);
        if (requireNeutralTransform && !layerTransformIsNeutral(layer.transform)) throw new Error(`${label} screen overlay layer ${layer.id} must have a neutral transform`);
      }
    }
    for (const owner of scene.objects || []) {
      const data = owner && owner.data;
      if (!data || data.motionOperations == null) continue;
      if (!Array.isArray(data.motionOperations)) throw new TypeError(`objects.${owner.id}.data.motionOperations must be an array`);
      if (owner.type !== MOTION_OPERATION_RENDERER) throw new Error(`objects.${owner.id}.data.motionOperations requires ${MOTION_OPERATION_RENDERER}`);
      if (owner.layer == null || (owner.space != null && owner.space !== "screen") || !objectTransformIsNeutral(owner)) throw new Error(`motion operation renderer ${owner.id} must be a neutral instance in a screen-space overlay layer`);
      const overlayChain = layerChain(owner.layer, `motion operation renderer ${owner.id}`);
      if (!overlayChain.length || (overlayChain[0].space || "world") !== "screen") throw new Error(`motion operation renderer ${owner.id} must be inside a screen-space overlay layer`);
      assertUnclippedSourceOver(overlayChain, `motion operation renderer ${owner.id}`, true);
      const ownerStyle = owner.style == null ? {} : scene.styles && scene.styles[owner.style];
      if (owner.style != null && (!ownerStyle || typeof ownerStyle !== "object" || Array.isArray(ownerStyle))) {
        throw new Error(`motion operation renderer ${owner.id} references unknown style ${owner.style}`);
      }
      const paint = Object.assign({}, ownerStyle || {}, owner.styleOverrides || {}, owner);
      if (paint.stroke == null || paint.stroke === "none") throw new Error(`motion operation renderer ${owner.id} must declare a visible stroke for the projected target box`);
      if (paint.stroke != null && paint.stroke !== "none" && paint.lineWidth != null && (!Number.isFinite(paint.lineWidth) || paint.lineWidth <= 0)) {
        throw new Error(`motion operation renderer ${owner.id}.lineWidth must be positive when stroke is used`);
      }
      for (let index = 0; index < data.motionOperations.length; index += 1) {
        const row = data.motionOperations[index];
        const label = `objects.${owner.id}.data.motionOperations[${index}]`;
        if (!row || typeof row !== "object" || Array.isArray(row)) throw new TypeError(`${label} must be an object`);
        const allowed = new Set(["instanceId", "entityId", "operationId", "targetId", "phaseId", "nativeParameters", "controlledAttributes"]);
        for (const key of Object.keys(row)) if (!allowed.has(key)) throw new Error(`${label} has unsupported field ${key}`);
        const instanceId = stableId(row.instanceId, `${label}.instanceId`);
        const entityId = stableId(row.entityId, `${label}.entityId`);
        const operationId = stableId(row.operationId, `${label}.operationId`);
        const targetId = stableId(row.targetId, `${label}.targetId`);
        const phaseId = stableId(row.phaseId, `${label}.phaseId`);
        if (operationId !== MOTION_FOLLOW_BOX_ID) throw new Error(`${label} operation ${operationId} is unsupported or source-only; only ${MOTION_FOLLOW_BOX_ID} is callable locally`);
        if (instanceId !== owner.id) throw new Error(`${label}.instanceId must equal its actual custom draw object ID ${owner.id}`);
        if (instances.has(instanceId)) throw new Error(`Duplicate motion operation instanceId ${instanceId}`);
        const target = objects.get(targetId);
        if (!target) throw new Error(`${label}.targetId references missing scene object ${targetId}`);
        if (target.type !== "rect" || target.morph) throw new Error(`${label}.targetId must reference a non-morphing rect`);
        const targetChain = target.layer == null ? [] : layerChain(target.layer, `${label}.targetId`);
        const targetSpace = targetChain.length ? (targetChain[0].space || "world") : (target.space || "world");
        if (targetSpace !== "world") throw new Error(`${label}.targetId must be a world-space rect so the operation follows the scene camera`);
        assertUnclippedSourceOver(targetChain, `${label}.targetId`);
        const parameters = row.nativeParameters;
        if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw new TypeError(`${label}.nativeParameters must be an object`);
        const parameterKeys = Object.keys(parameters).sort();
        const expectedKeys = ["fromLineWidthPx", "toLineWidthPx"];
        if (JSON.stringify(parameterKeys) !== JSON.stringify(expectedKeys)) throw new Error(`${label}.nativeParameters must contain exactly fromLineWidthPx and toLineWidthPx`);
        const fromLineWidthPx = finite(parameters.fromLineWidthPx, `${label}.nativeParameters.fromLineWidthPx`);
        const toLineWidthPx = finite(parameters.toLineWidthPx, `${label}.nativeParameters.toLineWidthPx`);
        if (fromLineWidthPx <= 0 || fromLineWidthPx > 64 || toLineWidthPx <= 0 || toLineWidthPx > 64) throw new RangeError(`${label} line widths must be in (0,64] screen pixels`);
        if (!Array.isArray(row.controlledAttributes) || row.controlledAttributes.length !== 2
          || row.controlledAttributes[0] !== "projected-target-frame" || row.controlledAttributes[1] !== "screen-space-line-width") {
          throw new Error(`${label}.controlledAttributes must be exactly ["projected-target-frame","screen-space-line-width"]`);
        }
        const matches = phases.get(phaseId) || [];
        if (matches.length !== 1) throw new Error(`${label} must reference one unambiguous phaseId ${phaseId}`);
        const phase = matches[0];
        const startSec = finite(phase.startSec, `${label}.phase.startSec`);
        const durationSec = phaseDuration(phase);
        if (durationSec <= 0 || startSec < 0 || startSec + durationSec > scene.duration + 1e-8) throw new RangeError(`${label} phase must have a positive duration inside the scene`);
        samplePhase(startSec, phase);
        const record = {
          ownerId: owner.id, instanceId, entityId, operationId, targetId, phaseId,
          phase: JSON.parse(JSON.stringify(phase)), startSec, endSec: startSec + durationSec,
          overlayLayerIds: overlayChain.map((layer) => layer.id),
          fromLineWidthPx, toLineWidthPx,
          controlledAttributes: ["projected-target-frame", "screen-space-line-width"],
        };
        instances.set(instanceId, record);
        claims.push(record);
        records.push(record);
      }
    }
    for (let left = 0; left < claims.length; left += 1) {
      for (let right = left + 1; right < claims.length; right += 1) {
        const a = claims[left], b = claims[right];
        if (a.targetId === b.targetId && a.controlledAttributes[0] === b.controlledAttributes[0]
          && a.startSec < b.endSec - 1e-9 && b.startSec < a.endSec - 1e-9) {
          throw new Error(`Motion operations ${a.instanceId} and ${b.instanceId} overlap on ${a.targetId}.projected-target-frame without a registered composition`);
        }
      }
    }
    return records;
  }

  function sampleMotionFollowBox(scene, timeSec, record, state) {
    finite(timeSec, "timeSec");
    const phase = samplePhase(timeSec, record.phase);
    if (timeSec < record.startSec || timeSec >= record.endSec) {
      return { status: "not-drawn", reason: "outside-half-open-phase", phaseId: record.phaseId };
    }
    if (!state || state.time !== timeSec || !state.objects || !state.layers || !state.camera) return { status: "unsupported", reason: "same-frame-evaluated-state-unavailable", phaseId: record.phaseId };
    const overlayOpacity = record.overlayLayerIds.reduce((opacity, layerId) => {
      const layer = state.layers[layerId];
      return opacity * (layer && Number.isFinite(layer.opacity) ? clamp(layer.opacity, 0, 1) : 1);
    }, 1);
    if (record.overlayLayerIds.some((layerId) => !layerTransformIsNeutral(state.layers[layerId]?.transform))) {
      return { status: "unsupported", reason: "screen-overlay-transform-changed", phaseId: record.phaseId };
    }
    if (overlayOpacity <= 0) return { status: "not-drawn", reason: "screen-overlay-not-visible", phaseId: record.phaseId };
    const projection = core.projectRectObject(scene, state, record.targetId);
    const target = projection.object;
    if (![target.x, target.y, target.width, target.height].every(Number.isFinite) || target.width <= 0 || target.height <= 0) {
      return { status: "unsupported", reason: "target-rectangle-is-not-positive-finite", phaseId: record.phaseId };
    }
    if (!projection.visible) {
      return { status: "not-drawn", reason: "target-not-visible", phaseId: record.phaseId };
    }
    const screenCorners = projection.screenCorners;
    const lineWidthPx = record.fromLineWidthPx + (record.toLineWidthPx - record.fromLineWidthPx) * phase.curvedProgress;
    if (!strokedPolylineIntersectsViewport(screenCorners, scene.width, scene.height, lineWidthPx)) {
      return { status: "not-drawn", reason: "target-outline-outside-viewport", phaseId: record.phaseId };
    }
    const xs = screenCorners.map((point) => point.x);
    const ys = screenCorners.map((point) => point.y);
    const screenBounds = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    if (!Object.values(screenBounds).every(Number.isFinite) || screenBounds.width <= 0 || screenBounds.height <= 0) {
      return { status: "unsupported", reason: "projected-geometry-invalid", phaseId: record.phaseId };
    }
    const visibleLeft = clamp(screenBounds.x, 0, scene.width);
    const visibleTop = clamp(screenBounds.y, 0, scene.height);
    const visibleRight = clamp(screenBounds.x + screenBounds.width, 0, scene.width);
    const visibleBottom = clamp(screenBounds.y + screenBounds.height, 0, scene.height);
    return {
      status: "drawn", phaseId: record.phaseId, phaseProgress: phase.curvedProgress,
      lineWidthPx,
      effectiveOpacity: projection.effectiveOpacity,
      worldBounds: { x: target.x, y: target.y, width: target.width, height: target.height },
      screenCorners, screenBounds,
      visibleBounds: { x: visibleLeft, y: visibleTop, width: Math.max(0, visibleRight - visibleLeft), height: Math.max(0, visibleBottom - visibleTop) },
      clippedToViewport: visibleLeft > screenBounds.x + 1e-8 || visibleTop > screenBounds.y + 1e-8
        || visibleRight < screenBounds.x + screenBounds.width - 1e-8 || visibleBottom < screenBounds.y + screenBounds.height - 1e-8,
    };
  }

  function beginMotionFrame(frameIndex, timeSec, scene, canvas) {
    if (!Number.isInteger(frameIndex) || frameIndex < 0) throw new TypeError("motion frameIndex must be a non-negative integer");
    finite(timeSec, "motion timeSec");
    if (!scene || !canvas) throw new TypeError("motion frame requires its scene and canvas from the active draw");
    motionFrameContext = { frameIndex, timeSec, scene, canvas, traces: [], seen: new Set() };
  }

  function recordMotionOperationDraw(trace) {
    // Preview/probe draws are real renders but are outside the encoded-frame
    // receipt. The runner opens a collector only for the canonical frame pass.
    if (!motionFrameContext) return false;
    if (!trace || typeof trace !== "object" || Array.isArray(trace)) throw new TypeError("motion operation draw trace must be an object");
    const instanceId = stableId(trace.instanceId, "motion trace instanceId");
    if (motionFrameContext.seen.has(instanceId)) throw new Error(`Duplicate motion operation sample ${instanceId} in frame ${motionFrameContext.frameIndex}`);
    motionFrameContext.seen.add(instanceId);
    motionFrameContext.traces.push(JSON.parse(JSON.stringify(trace)));
  }

  function captureMotionFrame(frameIndex, timeSec, scene, canvas) {
    const context = motionFrameContext;
    if (!context) return { schema: "motion-frame-trace/1", status: "missing", reason: "no-active-motion-frame" };
    motionFrameContext = null;
    const viewportMatches = canvas.width === scene.width && canvas.height === scene.height;
    const expectedFrameTime = frameIndex / scene.fps;
    const inputMatches = frameIndex === context.frameIndex && Math.abs(timeSec - context.timeSec) <= 1e-9
      && scene === context.scene && canvas === context.canvas;
    const requirementRows = [];
    for (const object of scene.objects || []) {
      const evidence = object && object.data && object.data.motionEvidence;
      if (evidence && Array.isArray(evidence.motionRequirements)) requirementRows.push(...evidence.motionRequirements);
    }
    const activeRequirements = requirementRows.filter((row) => timeSec >= row.startSec && timeSec < row.endSec);
    const expected = activeRequirements.flatMap((row) => row.expected || []);
    const observed = context.traces;
    const observedByInstance = new Map(observed.map((row) => [row.instanceId, row]));
    const missingIds = expected.filter((row) => {
      const actual = observedByInstance.get(row.instanceId);
      return !actual || actual.status !== "drawn" || actual.entityId !== row.entityId
        || actual.operationId !== row.operationId || actual.targetId !== row.targetId || actual.phaseId !== row.phaseId;
    }).map((row) => row.instanceId);
    const unsupportedIds = observed.filter((row) => row.status === "unsupported").map((row) => row.instanceId);
    return {
      schema: "motion-frame-trace/1",
      status: inputMatches && viewportMatches ? "observed" : "stale",
      frameIndex, timeSec, expectedFrameTime, fps: scene.fps,
      viewport: { x: 0, y: 0, width: canvas.width, height: canvas.height },
      clock: { timeBasis: "scene-local", durationSec: scene.duration, frameCount: Math.round(scene.duration * scene.fps) },
      expected: expected.map(({ entityId, instanceId, operationId, targetId, phaseId }) => ({ entityId, instanceId, operationId, targetId, phaseId })),
      observed, missingIds, unsupportedIds,
      requirementIds: activeRequirements.map((row) => row.id),
    };
  }

  function registerMotionOperations(renderers, records) {
    if (!renderers || typeof renderers !== "object") throw new TypeError("motion renderers registry is required");
    if (Object.prototype.hasOwnProperty.call(renderers, MOTION_OPERATION_RENDERER)) throw new Error(`${MOTION_OPERATION_RENDERER} is reserved by the local motion operation provider`);
    const byInstance = new Map((records || []).map((record) => [record.instanceId, record]));
    renderers[MOTION_OPERATION_RENDERER] = function drawMotionOperation(ctx, object, timeSec, scene, state) {
      const instanceId = object && object.id;
      const record = byInstance.get(instanceId);
      if (!record) throw new Error(`No validated motion operation instance is registered for ${instanceId}`);
      const result = sampleMotionFollowBox(scene, timeSec, record, state);
      if (result.status === "drawn") {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha *= result.effectiveOpacity;
        ctx.strokeStyle = object.stroke;
        ctx.lineWidth = result.lineWidthPx;
        ctx.lineCap = object.lineCap || "round";
        ctx.lineJoin = object.lineJoin || "round";
        ctx.beginPath();
        ctx.moveTo(result.screenCorners[0].x, result.screenCorners[0].y);
        for (const point of result.screenCorners.slice(1)) ctx.lineTo(point.x, point.y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      recordMotionOperationDraw({
        entityId: record.entityId, instanceId: record.instanceId, operationId: record.operationId,
        targetId: record.targetId, phaseId: record.phaseId, status: result.status,
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.status === "drawn" ? {
          phaseProgress: result.phaseProgress, lineWidthPx: result.lineWidthPx,
          effectiveOpacity: result.effectiveOpacity, clippedToViewport: result.clippedToViewport,
          worldBounds: result.worldBounds, screenCorners: result.screenCorners, screenBounds: result.screenBounds, visibleBounds: result.visibleBounds,
        } : {}),
      });
    };
    return renderers;
  }

  return Object.freeze({
    core,
    clamp,
    filmToLocalTime,
    samplePhase,
    sampleChannels,
    indexPhases,
    mapLocalTimeToFilm,
    findSceneAudioEvents,
    mapSceneEvents,
    seededUnit,
    stableParticles,
    emphasisEnvelope,
    withLocalMask,
    measureTextOccupancy: textMetrics,
    composeLabelGeometry,
    transformBounds,
    chooseLabelPlacement,
    diagnoseLayout,
    createTextBitmapCache,
    validateLocalEffects,
    localEffectTargetState,
    localEffectContracts: LOCAL_EFFECT_CONTRACTS,
    MOTION_FOLLOW_BOX_ID,
    MOTION_OPERATION_RENDERER,
    validateMotionOperations,
    sampleMotionFollowBox,
    beginMotionFrame,
    recordMotionOperationDraw,
    captureMotionFrame,
    registerMotionOperations,
  });
});
