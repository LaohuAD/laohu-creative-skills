const ROLES = new Set(['target', 'support', 'context', 'wait', 'retire']);
const CONSUMER = 'laohu-motion.attention-actor-style/1';
const PROPERTY_KEYS = new Set(['x', 'y', 'width', 'height', 'scale', 'rotation', 'opacity', 'visible', 'coordinateSpace', 'zIndex', 'readingPoint', 'readingPointSpace', 'depth', 'focusDepth']);

function fail(message) { throw new Error(`Invalid attention phase: ${message}`); }
const finite = (value) => typeof value === 'number' && Number.isFinite(value);

function validatePhase(phase, actorIds) {
  if (!phase || typeof phase.id !== 'string' || !phase.id.trim()) fail('phase id is required');
  if (!finite(phase.start) || !finite(phase.end) || phase.start < 0 || phase.end <= phase.start) fail(`${phase.id} needs a positive half-open time window`);
  if (!phase.mainTask || typeof phase.mainTask.id !== 'string' || !phase.mainTask.id.trim() || typeof phase.mainTask.description !== 'string' || !phase.mainTask.description.trim()) fail(`${phase.id} needs one named main viewing task`);
  if (!Array.isArray(phase.mainTask.actorIds) || !phase.mainTask.actorIds.length) fail(`${phase.id} main task needs one or more target actors`);
  if (!Array.isArray(phase.cameraKeys) || !phase.cameraKeys.length) fail(`${phase.id} needs at least one camera key consumed by CameraRig`);
  if (!Array.isArray(phase.readingZones)) fail(`${phase.id} readingZones must be explicit, even when empty`);
  if (!Array.isArray(phase.readWindows)) fail(`${phase.id} readWindows must remain available to the actual bridge`);
  const readWindowIds = new Set();
  for (const window of phase.readWindows) {
    if (!window || typeof window.id !== 'string' || !window.id.trim() || readWindowIds.has(window.id)) fail(`${phase.id} readWindows need unique ids`);
    if (!finite(window.start) || !finite(window.end) || window.start < phase.start || window.end <= window.start || window.end > phase.end) fail(`${phase.id} readWindow ${window.id} needs a bounded active interval inside its phase`);
    readWindowIds.add(window.id);
  }
  for (const zone of phase.readingZones) {
    if (![zone.x, zone.y, zone.width, zone.height].every(finite) || zone.width <= 0 || zone.height <= 0) fail(`${phase.id} contains invalid reading-zone geometry`);
    if (typeof zone.id !== 'string' || !zone.id.trim() || typeof zone.windowId !== 'string' || !readWindowIds.has(zone.windowId)) fail(`${phase.id} reading zone must point to one actual readWindow id`);
  }
  const actors = new Map();
  for (const binding of phase.actorBindings ?? []) {
    if (!actorIds.has(binding.actorId)) fail(`${phase.id} references unknown actor ${binding.actorId}`);
    if (actors.has(binding.actorId)) fail(`${phase.id} has conflicting owners for actor ${binding.actorId}`);
    if (!ROLES.has(binding.role)) fail(`${phase.id} actor ${binding.actorId} has an unknown attention role`);
    if (binding.owner !== phase.id || binding.consumer !== CONSUMER) fail(`${phase.id} actor ${binding.actorId} lacks the declared owner/real runtime consumer mapping`);
    const props = binding.props;
    if (!props || typeof props !== 'object' || Array.isArray(props)) fail(`${phase.id} actor ${binding.actorId} has no bounded properties`);
    for (const key of Object.keys(props)) if (!PROPERTY_KEYS.has(key)) fail(`${phase.id} actor ${binding.actorId} has unsupported property ${key}`);
    if (![props.x, props.y, props.width, props.height, props.scale, props.rotation, props.opacity].every(finite)
      || props.width <= 0 || props.height <= 0 || props.scale <= 0 || props.opacity < 0 || props.opacity > 1 || typeof props.visible !== 'boolean') {
      fail(`${phase.id} actor ${binding.actorId} needs explicit position, positive geometry, scale, rotation, opacity, and visibility`);
    }
    if (!new Set(['world', 'screen']).has(props.coordinateSpace)) fail(`${phase.id} actor ${binding.actorId} must declare world or screen coordinateSpace`);
    if (props.zIndex != null && !Number.isSafeInteger(props.zIndex)) fail(`${phase.id} actor ${binding.actorId} zIndex must be an integer`);
    if (props.readingPoint && (!Array.isArray(props.readingPoint) || props.readingPoint.length !== 2 || !props.readingPoint.every(finite))) fail(`${phase.id} actor ${binding.actorId} readingPoint must be [x,y] in output pixels`);
    if (props.readingPoint && !new Set(['world', 'screen']).has(props.readingPointSpace)) fail(`${phase.id} actor ${binding.actorId} readingPoint must declare world or screen coordinates`);
    if (props.depth != null && (!finite(props.depth) || props.depth < 0)) fail(`${phase.id} actor ${binding.actorId} depth must be non-negative`);
    if (props.focusDepth != null && (!finite(props.focusDepth) || props.focusDepth < 0)) fail(`${phase.id} actor ${binding.actorId} focusDepth must be non-negative`);
    if (binding.role === 'retire' && props.visible && props.opacity > 0) fail(`${phase.id} retired actor ${binding.actorId} remains visible`);
    if (binding.role === 'target' && (!props.visible || props.opacity === 0)) fail(`${phase.id} main target ${binding.actorId} is not actually visible`);
    actors.set(binding.actorId, binding);
  }
  for (const targetId of phase.mainTask.actorIds) {
    const binding = actors.get(targetId);
    if (!binding || binding.role !== 'target') fail(`${phase.id} main viewing task target ${targetId} has no target actor binding`);
  }
  for (const key of phase.cameraKeys) {
    if (!finite(key.at) || !Array.isArray(key.center) || key.center.length !== 2 || !key.center.every(finite)
      || !finite(key.zoom) || key.zoom <= 0 || !finite(key.rotation)) fail(`${phase.id} has an invalid CameraRig camera key`);
  }
  return actors;
}

/** Resolve the same explicit actor props that AttentionBridge binds to rendered wrappers. */
export function resolveAttentionBindings({phases, actorIds, time}) {
  if (!Array.isArray(phases) || !phases.length) fail('at least one phase is required');
  if (!Array.isArray(actorIds) || !actorIds.length || actorIds.some((id) => typeof id !== 'string' || !id.trim()) || new Set(actorIds).size !== actorIds.length) fail('actor ids must be a unique non-empty list');
  if (!finite(time) || time < 0) fail('time must be a non-negative number of seconds');
  const actorSet = new Set(actorIds);
  const sorted = [...phases].sort((a, b) => a.start - b.start || a.end - b.end);
  const cameraKeys = [];
  let previousEnd = -Infinity;
  for (const phase of sorted) {
    validatePhase(phase, actorSet);
    if (phase.start < previousEnd) fail(`phases ${phase.id} overlap in time`);
    previousEnd = phase.end;
    cameraKeys.push(...phase.cameraKeys);
  }
  cameraKeys.sort((a, b) => a.at - b.at);
  const mergedCameraKeys = [];
  for (const key of cameraKeys) {
    const prior = mergedCameraKeys.at(-1);
    if (!prior || key.at > prior.at) mergedCameraKeys.push(key);
    else if (key.at === prior.at && JSON.stringify({...key, at: undefined}) === JSON.stringify({...prior, at: undefined})) continue;
    else fail('CameraRig key times must increase or repeat an identical boundary pose across the full plan');
  }
  const active = sorted.find((phase) => time >= phase.start && time < phase.end) ?? null;
  if (!active) return {phaseId: null, mainTask: null, cameraKeys: mergedCameraKeys, readingZones: [], readWindows: [], actors: Object.fromEntries(actorIds.map((id) => [id, {visible: false, opacity: 0}]))};
  const readWindows = active.readWindows.filter((window) => time >= window.start && time < window.end);
  const activeWindowIds = new Set(readWindows.map((window) => window.id));
  const readingZones = active.readingZones.filter((zone) => activeWindowIds.has(zone.windowId));
  const bindings = new Map(active.actorBindings.map((binding) => [binding.actorId, binding]));
  const actors = Object.fromEntries(actorIds.map((id) => {
    const binding = bindings.get(id);
    return [id, binding
      ? {role: binding.role, owner: binding.owner, consumer: binding.consumer, ...binding.props}
      : {visible: false, opacity: 0}];
  }));
  return {phaseId: active.id, mainTask: structuredClone(active.mainTask), cameraKeys: mergedCameraKeys,
    readingZones: structuredClone(readingZones), readWindows: structuredClone(readWindows), actors};
}

/** Project a world-space point through CameraRig's current center/zoom/rotation/tilt/perspective. */
export function projectCameraPoint(point, camera, width, height, perspective = 1400) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(finite)
    || ![camera?.center?.[0], camera?.center?.[1], camera?.zoom, camera?.rotation, width, height, perspective].every(finite)
    || camera.zoom <= 0 || perspective <= 0) fail('camera point projection needs finite coordinates and a positive camera/output');
  let x = point[0] - camera.center[0];
  let y = point[1] - camera.center[1];
  let z = 0;
  const tiltY = camera.tiltY ?? 0;
  const afterYx = Math.cos(tiltY) * x + Math.sin(tiltY) * z;
  z = -Math.sin(tiltY) * x + Math.cos(tiltY) * z;
  x = afterYx;
  const tiltX = camera.tiltX ?? 0;
  const afterXy = Math.cos(tiltX) * y - Math.sin(tiltX) * z;
  z = Math.sin(tiltX) * y + Math.cos(tiltX) * z;
  y = afterXy;
  const afterZx = Math.cos(camera.rotation) * x - Math.sin(camera.rotation) * y;
  const afterZy = Math.sin(camera.rotation) * x + Math.cos(camera.rotation) * y;
  const factor = camera.zoom * perspective / (perspective - camera.zoom * z);
  if (!finite(factor)) fail('camera point projection crossed the perspective plane');
  return [width / 2 + afterZx * factor, height / 2 + afterZy * factor];
}

export const attentionActorConsumer = CONSUMER;
