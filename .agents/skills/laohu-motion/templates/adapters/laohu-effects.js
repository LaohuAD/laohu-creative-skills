(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../../scripts/motion-ops.js"), require("../../scripts/motion-core.js"), root);
  } else {
    root.LaohuMotionEffects = factory(root.MotionOps, root.MotionCore, root);
    root.HuashuLocalEffects = root.LaohuMotionEffects;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (ops, core, root) {
  "use strict";

  const EFFECT_TYPE = "custom:laohu-motion-effects";
  const LEGACY_EFFECT_TYPE = "custom:huashu-local-effects";
  const TARGET_TYPE = "custom:laohu-motion-target";
  const LEGACY_TARGET_TYPE = "custom:huashu-local-target";
  if (!ops || !ops.localEffectAliases) throw new Error("Laohu local-effects adapter requires the canonical MotionOps alias map");
  const EFFECT_ALIASES = ops.localEffectAliases;
  const DEFINITION = Object.freeze({
    "laohu-motion-dg-draw-partial": { sourceFunction: "DG.drawPartial", end: "complete-path" },
    "laohu-motion-dg-circumscribe": { sourceFunction: "DG.circumscribe", end: "source-one-shot-disappears-at-progress-1" },
    "laohu-motion-dg-brace": { sourceFunction: "DG.brace", end: "brace-remains-at-progress-1" },
    "laohu-motion-dg-indicate-frame-pulse": { sourceFunction: "DG.indicate", end: "pulse-returns-to-neutral" },
    "laohu-motion-mo-staggered-target-reveal": { sourceFunction: "MO.lagged", end: "target-reaches-full-opacity-and-remains-visible" },
  });

  function finite(value, label) {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
    return value;
  }

  function targetSkipReason(targetState, label) {
    if (targetState.visibilityValue === false) return "target-visible-false";
    if (targetState.targetObjectOpacity <= 0) return "target-opacity-zero";
    if (targetState.targetLayerOpacity <= 0) return "target-layer-opacity-zero";
    throw new Error(`${label} was reported invisible without a Core-supported object visibility or opacity cause`);
  }

  function multiplySourceAlphaByInherited(context, inheritedAlpha) {
    return new Proxy(context, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set(target, property, value) {
        if (property === "globalAlpha") value *= inheritedAlpha;
        return Reflect.set(target, property, value, target);
      },
    });
  }

  function renderer(registration) {
    return function drawHuashuLocalEffects(ctx, object, timeSec, scene, evaluatedState) {
      if (!object || !new Set([EFFECT_TYPE, LEGACY_EFFECT_TYPE]).has(object.type)) throw new TypeError(`Expected ${EFFECT_TYPE} custom object`);
      if (!root.DG || !root.MO || !ops || typeof ops.validateLocalEffects !== "function") throw new Error("Huashu local-effects renderer requires the pinned DG/MO source closure and MotionOps");
      const instances = object.data && object.data.motionEffects;
      if (!Array.isArray(instances) || !instances.length) throw new Error(`${object.id}.data.motionEffects must be a non-empty array`);
      if (!registration && instances.some((instance) => instance && instance.geometryMode === "followTarget")) {
        throw new Error("followTarget local effects require prevalidated scene records at register time; draw callbacks cannot re-evaluate the scene");
      }
      if (registration && scene !== registration.scene) throw new Error("local-effects renderer received a different scene from its prevalidated registration");
      const records = registration ? registration.records : ops.validateLocalEffects(scene);
      const known = new Map(records.map((record) => [record.id, record]));
      const evidence = root.MOTION_LOCAL_EFFECT_EVIDENCE || (root.MOTION_LOCAL_EFFECT_EVIDENCE = { renderer: EFFECT_TYPE, instances: {}, targetObjects: {} });
      evidence.instances ||= {};
      evidence.targetObjects ||= {};
      for (const instance of instances) {
        const record = known.get(instance.id);
        if (!record || record.ownerId !== object.id) throw new Error(`Local effect ${instance.id} was not validated for owner ${object.id}`);
        const effectId = record.effectId;
        if (effectId === "laohu-motion-mo-staggered-target-reveal") continue;
        const phaseSample = ops.samplePhase(timeSec, record.phase);
        const progress = instance.stagger
          ? root.MO.lagged(instance.stagger.index, instance.stagger.count, phaseSample.curvedProgress, instance.stagger.ratio == null ? 0.08 : instance.stagger.ratio)
          : phaseSample.curvedProgress;
        const key = instance.id;
        const row = evidence.instances[key] || {
          id: instance.id,
          effectId,
          targetId: instance.targetId,
          phase: { id: record.phase.id, startSec: record.phase.startSec, durationSec: record.phase.durationSec || null, endSec: record.phase.endSec || null, timeBasis: record.phase.timeBasis, curve: record.phase.curve || "linear" },
          sourceFunction: DEFINITION[effectId].sourceFunction,
          sourceEndBehavior: DEFINITION[effectId].end,
          parameters: { ...(instance.parameters || {}) },
          stagger: instance.stagger || null,
          evaluations: 0,
          targetInvisibleSkips: 0,
          calls: 0,
        };
        row.evaluations += 1;
        const p = Math.min(1, progress);
        if (progress <= 0) {
          row.lastCall = { timeSec, progress: p, drawn: false, skipReason: "phase-not-active-yet" };
          evidence.instances[key] = row;
          continue;
        }
        const targetState = ops.localEffectTargetState(scene, instance.targetId, timeSec, evaluatedState, record.geometryMode);
        const targetOpacity = targetState.targetOpacity;
        if (!targetState.visible) {
          row.targetInvisibleSkips += 1;
          row.lastCall = {
            timeSec,
            progress: p,
            targetVisible: false,
            targetOpacity,
            targetObjectOpacity: targetState.targetObjectOpacity,
            targetLayerOpacity: targetState.targetLayerOpacity,
            drawn: false,
            skipReason: targetSkipReason(targetState, instance.id),
          };
          evidence.instances[key] = row;
          continue;
        }
        const parameters = instance.parameters || {};
        const color = parameters.color || "#ffd23f";
        const lineWidth = parameters.lineWidth == null ? 4 : finite(parameters.lineWidth, `${instance.id}.parameters.lineWidth`);
        const inheritedAlpha = ctx.globalAlpha;
        const targetComposedAlpha = inheritedAlpha * targetOpacity;
        let sourceAlphaMultiplier = 1;
        let sourceArguments;
        const followedRect = record.geometryMode === "followTarget" ? targetState.projected.screenRect : null;
        ctx.save();
        try {
          ctx.globalAlpha = targetComposedAlpha;
          if (effectId === "laohu-motion-dg-draw-partial") {
            const points = instance.geometry.points;
            const cumulative = root.DG.cum(points);
            const distance = cumulative[cumulative.length - 1] * p;
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            const tip = root.DG.drawPartial(ctx, points, cumulative, distance);
            sourceArguments = { points, cumulativeLength: cumulative[cumulative.length - 1], distance, tip };
          } else if (effectId === "laohu-motion-dg-circumscribe") {
            const { x, y, width, height } = followedRect || instance.geometry.rect;
            const timeWidth = parameters.timeWidth == null ? 0.3 : parameters.timeWidth;
            root.DG.circumscribe(ctx, x, y, width, height, p, { col: color, lw: lineWidth, tw: timeWidth });
            sourceArguments = { rect: { x, y, width, height }, geometryMode: record.geometryMode, progress: p, color, lineWidth, timeWidth };
          } else if (effectId === "laohu-motion-dg-brace") {
            let { x, y0, y1 } = instance.geometry;
            if (record.geometryMode === "followTarget") {
              if (!targetState.projected.verticalWorldEdgesStayVertical) throw new Error(`${instance.id} DG.brace cannot follow a target whose projected left/right edges are not vertical`);
              ({ x, y0, y1 } = targetState.projected.verticalWorldEdges[record.braceSide]);
            }
            const depth = parameters.depth == null ? 22 : parameters.depth;
            sourceAlphaMultiplier = Math.max(0, Math.min(1, p * 1.5));
            root.DG.brace(multiplySourceAlphaByInherited(ctx, targetComposedAlpha), x, y0, y1, { col: color, lw: lineWidth, depth, p });
            sourceArguments = { x, y0, y1, geometryMode: record.geometryMode, progress: p, color, lineWidth, depth };
          } else if (effectId === "laohu-motion-dg-indicate-frame-pulse") {
            const { x, y, width, height } = followedRect || instance.geometry.rect;
            const indication = root.DG.indicate(p);
            const scale = 1 + (indication.s - 1) * (parameters.scale == null ? 1 : parameters.scale);
            const cx = x + width / 2, cy = y + height / 2;
            const scaled = { x: cx - width * scale / 2, y: cy - height * scale / 2, width: width * scale, height: height * scale };
            const outlineDrawn = p < 1;
            if (outlineDrawn) {
              root.DG.circumscribe(ctx, scaled.x, scaled.y, scaled.width, scaled.height, p, {
                col: color,
                lw: lineWidth * (1 + indication.k * 0.25),
                tw: parameters.timeWidth == null ? 0.3 : parameters.timeWidth,
              });
            }
            sourceArguments = { rect: { x, y, width, height }, geometryMode: record.geometryMode, progress: p, returnedScale: indication.s, returnedHighlight: indication.k, appliedScale: scale, outlineDrawn, color, lineWidth };
          } else {
            throw new Error(`Unsupported local effect ${effectId}`);
          }
          row.calls += 1;
          row.lastCall = {
            timeSec,
            progress: p,
            targetVisible: true,
            targetOpacity,
            drawn: true,
            arguments: sourceArguments,
            alphaComposition: {
              incomingCanvasAlpha: inheritedAlpha,
              ownerOpacity: object.opacity == null ? 1 : object.opacity,
              ownerOpacityAppliedByMotionCore: true,
              targetOpacity,
            targetObjectOpacity: targetState.targetObjectOpacity,
            targetLayerOpacity: targetState.targetLayerOpacity,
              targetOpacityAppliedByAdapter: true,
              sourceAlphaMultiplier,
              effectiveSourceAlpha: inheritedAlpha * targetOpacity * sourceAlphaMultiplier,
            },
          };
          evidence.instances[key] = row;
        } finally {
          ctx.restore();
        }
      }
    };
  }

  function targetRenderer(registration) {
    return function drawStaggeredLocalTarget(ctx, object, timeSec, scene, evaluatedState) {
      if (!object || !new Set([TARGET_TYPE, LEGACY_TARGET_TYPE]).has(object.type)) throw new TypeError("Expected custom local target object");
      if (!root.MO || !ops || typeof ops.validateLocalEffects !== "function") throw new Error("Huashu local target renderer requires the pinned MO source closure and MotionOps");
      if (registration && scene !== registration.scene) throw new Error("local target renderer received a different scene from its prevalidated registration");
      if (!registration && scene.objects.some((candidate) => candidate && candidate.data && Array.isArray(candidate.data.motionEffects)
        && candidate.data.motionEffects.some((instance) => instance && instance.targetId === object.id && instance.geometryMode === "followTarget"))) {
        throw new Error("followTarget MO.lagged targets require prevalidated scene records at register time; draw callbacks cannot re-evaluate the scene");
      }
      const sourceRecords = registration ? registration.records : ops.validateLocalEffects(scene);
      const records = sourceRecords.filter((record) => record.targetId === object.id && record.effectId === "laohu-motion-mo-staggered-target-reveal");
      if (records.length !== 1) throw new Error(`${object.id} must be bound to exactly one laohu-motion-mo-staggered-target-reveal instance`);
      const record = records[0];
      const targetState = ops.localEffectTargetState(scene, object.id, timeSec, evaluatedState, record.geometryMode);
      if (!targetState.visible) return;
      const phaseSample = ops.samplePhase(timeSec, record.phase);
      const stagger = record.stagger;
      const progress = root.MO.lagged(stagger.index, stagger.count, phaseSample.curvedProgress, stagger.ratio == null ? 0.08 : stagger.ratio);
      const data = object.data;
      const rect = data.geometry;
      const evidence = root.MOTION_LOCAL_EFFECT_EVIDENCE || (root.MOTION_LOCAL_EFFECT_EVIDENCE = { renderer: EFFECT_TYPE, instances: {}, targetObjects: {} });
      evidence.targetObjects ||= {};
      const row = evidence.targetObjects[object.id] || {
        targetId: object.id,
        effectId: record.effectId,
        instanceId: record.id,
        phaseId: record.phaseId,
        sourceFunction: "MO.lagged",
        stagger: { ...stagger },
        geometry: { ...rect },
        calls: 0,
      };
      row.calls += 1;
      row.lastCall = {
        timeSec, phaseProgress: phaseSample.curvedProgress, targetOpacity: progress,
        coreTargetOpacity: record.geometryMode === "followTarget" ? targetState.targetOpacity : null,
        geometryMode: record.geometryMode, projectedRect: record.geometryMode === "followTarget" ? targetState.projected.screenRect : null,
        drawn: progress > 0,
      };
      evidence.targetObjects[object.id] = row;
      if (progress <= 0) return;
      ctx.save();
      try {
        ctx.globalAlpha *= Math.max(0, Math.min(1, progress));
        if (data.fill != null && data.fill !== "none") {
          ctx.fillStyle = data.fill;
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        }
        if (data.stroke != null && data.stroke !== "none") {
          ctx.strokeStyle = data.stroke;
          ctx.lineWidth = data.lineWidth == null ? 1 : finite(data.lineWidth, `${object.id}.data.lineWidth`);
          ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        }
      } finally {
        ctx.restore();
      }
    };
  }

  function register(registry, scene, validatedRecords) {
    if (!registry || typeof registry !== "object") throw new TypeError("renderer registry is required");
    const suppliedScene = scene != null || validatedRecords != null;
    if (suppliedScene && (!scene || !Array.isArray(validatedRecords))) throw new TypeError("prevalidated local effects require both the original scene and its validated records");
    const registration = suppliedScene ? { scene, records: validatedRecords } : null;
    for (const type of [EFFECT_TYPE, LEGACY_EFFECT_TYPE, TARGET_TYPE, LEGACY_TARGET_TYPE]) {
      if (registry[type]) throw new Error(`${type} is already registered; refusing to replace an existing renderer`);
    }
    const drawEffects = renderer(registration);
    const drawTarget = targetRenderer(registration);
    registry[EFFECT_TYPE] = drawEffects;
    registry[LEGACY_EFFECT_TYPE] = drawEffects;
    registry[TARGET_TYPE] = drawTarget;
    registry[LEGACY_TARGET_TYPE] = drawTarget;
    return registry;
  }

  return Object.freeze({ EFFECT_TYPE, LEGACY_EFFECT_TYPE, TARGET_TYPE, LEGACY_TARGET_TYPE, EFFECT_ALIASES, DEFINITION, renderer, targetRenderer, register });
});
