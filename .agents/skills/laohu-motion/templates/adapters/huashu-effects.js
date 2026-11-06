(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../../scripts/motion-ops.js"), require("../../scripts/motion-core.js"), root);
  } else {
    root.HuashuLocalEffects = factory(root.MotionOps, root.MotionCore, root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (ops, core, root) {
  "use strict";

  const EFFECT_TYPE = "custom:huashu-local-effects";
  const DEFINITION = Object.freeze({
    "huashu-dg-draw-partial": { sourceFunction: "DG.drawPartial", end: "complete-path" },
    "huashu-dg-circumscribe": { sourceFunction: "DG.circumscribe", end: "source-one-shot-disappears-at-progress-1" },
    "huashu-dg-brace": { sourceFunction: "DG.brace", end: "brace-remains-at-progress-1" },
    "huashu-dg-indicate-frame-pulse": { sourceFunction: "DG.indicate", end: "pulse-returns-to-neutral" },
    "huashu-mo-staggered-target-reveal": { sourceFunction: "MO.lagged", end: "target-reaches-full-opacity-and-remains-visible" },
  });

  function finite(value, label) {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
    return value;
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

  function renderer() {
    return function drawHuashuLocalEffects(ctx, object, timeSec, scene) {
      if (!object || object.type !== EFFECT_TYPE) throw new TypeError(`Expected ${EFFECT_TYPE} custom object`);
      if (!root.DG || !root.MO || !ops || typeof ops.validateLocalEffects !== "function") throw new Error("Huashu local-effects renderer requires the pinned DG/MO source closure and MotionOps");
      const instances = object.data && object.data.motionEffects;
      if (!Array.isArray(instances) || !instances.length) throw new Error(`${object.id}.data.motionEffects must be a non-empty array`);
      const records = ops.validateLocalEffects(scene);
      const known = new Map(records.map((record) => [record.id, record]));
      const evidence = root.MOTION_LOCAL_EFFECT_EVIDENCE || (root.MOTION_LOCAL_EFFECT_EVIDENCE = { renderer: EFFECT_TYPE, instances: {}, targetObjects: {} });
      evidence.instances ||= {};
      evidence.targetObjects ||= {};
      for (const instance of instances) {
        const record = known.get(instance.id);
        if (!record || record.ownerId !== object.id) throw new Error(`Local effect ${instance.id} was not validated for owner ${object.id}`);
        if (instance.effectId === "huashu-mo-staggered-target-reveal") continue;
        const phaseSample = ops.samplePhase(timeSec, record.phase);
        const progress = instance.stagger
          ? root.MO.lagged(instance.stagger.index, instance.stagger.count, phaseSample.curvedProgress, instance.stagger.ratio == null ? 0.08 : instance.stagger.ratio)
          : phaseSample.curvedProgress;
        const key = instance.id;
        const row = evidence.instances[key] || {
          id: instance.id,
          effectId: instance.effectId,
          targetId: instance.targetId,
          phase: { id: record.phase.id, startSec: record.phase.startSec, durationSec: record.phase.durationSec || null, endSec: record.phase.endSec || null, timeBasis: record.phase.timeBasis, curve: record.phase.curve || "linear" },
          sourceFunction: DEFINITION[instance.effectId].sourceFunction,
          sourceEndBehavior: DEFINITION[instance.effectId].end,
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
        const targetState = ops.localEffectTargetState(scene, instance.targetId, timeSec);
        const targetOpacity = targetState.targetOpacity;
        if (!targetState.visible) {
          row.targetInvisibleSkips += 1;
          row.lastCall = {
            timeSec,
            progress: p,
            targetVisible: false,
            targetOpacity,
            drawn: false,
            skipReason: targetState.visibilityValue === false ? "target-visible-false" : "target-opacity-zero",
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
        ctx.save();
        try {
          ctx.globalAlpha = targetComposedAlpha;
          if (instance.effectId === "huashu-dg-draw-partial") {
            const points = instance.geometry.points;
            const cumulative = root.DG.cum(points);
            const distance = cumulative[cumulative.length - 1] * p;
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            const tip = root.DG.drawPartial(ctx, points, cumulative, distance);
            sourceArguments = { points, cumulativeLength: cumulative[cumulative.length - 1], distance, tip };
          } else if (instance.effectId === "huashu-dg-circumscribe") {
            const { x, y, width, height } = instance.geometry.rect;
            const timeWidth = parameters.timeWidth == null ? 0.3 : parameters.timeWidth;
            root.DG.circumscribe(ctx, x, y, width, height, p, { col: color, lw: lineWidth, tw: timeWidth });
            sourceArguments = { rect: { x, y, width, height }, progress: p, color, lineWidth, timeWidth };
          } else if (instance.effectId === "huashu-dg-brace") {
            const { x, y0, y1 } = instance.geometry;
            const depth = parameters.depth == null ? 22 : parameters.depth;
            sourceAlphaMultiplier = Math.max(0, Math.min(1, p * 1.5));
            root.DG.brace(multiplySourceAlphaByInherited(ctx, targetComposedAlpha), x, y0, y1, { col: color, lw: lineWidth, depth, p });
            sourceArguments = { x, y0, y1, progress: p, color, lineWidth, depth };
          } else if (instance.effectId === "huashu-dg-indicate-frame-pulse") {
            const { x, y, width, height } = instance.geometry.rect;
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
            sourceArguments = { rect: { x, y, width, height }, progress: p, returnedScale: indication.s, returnedHighlight: indication.k, appliedScale: scale, outlineDrawn, color, lineWidth };
          } else {
            throw new Error(`Unsupported local effect ${instance.effectId}`);
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

  function targetRenderer() {
    return function drawStaggeredLocalTarget(ctx, object, timeSec, scene) {
      if (!object || object.type !== "custom:huashu-local-target") throw new TypeError("Expected custom:huashu-local-target object");
      if (!root.MO || !ops || typeof ops.validateLocalEffects !== "function") throw new Error("Huashu local target renderer requires the pinned MO source closure and MotionOps");
      const records = ops.validateLocalEffects(scene).filter((record) => record.targetId === object.id && record.effectId === "huashu-mo-staggered-target-reveal");
      if (records.length !== 1) throw new Error(`${object.id} must be bound to exactly one huashu-mo-staggered-target-reveal instance`);
      const record = records[0];
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
      row.lastCall = { timeSec, phaseProgress: phaseSample.curvedProgress, targetOpacity: progress, drawn: progress > 0 };
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

  function register(registry) {
    if (!registry || typeof registry !== "object") throw new TypeError("renderer registry is required");
    if (registry[EFFECT_TYPE]) throw new Error(`${EFFECT_TYPE} is already registered; refusing to replace an existing renderer`);
    if (registry["custom:huashu-local-target"]) throw new Error("custom:huashu-local-target is already registered; refusing to replace an existing renderer");
    registry[EFFECT_TYPE] = renderer();
    registry["custom:huashu-local-target"] = targetRenderer();
    return registry;
  }

  return Object.freeze({ EFFECT_TYPE, DEFINITION, renderer, targetRenderer, register });
});
