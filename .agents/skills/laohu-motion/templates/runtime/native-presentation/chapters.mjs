function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

const HASH = /^[a-f0-9]{64}$/;
const BINDING_KEYS = ['projectId', 'revision', 'planSha256', 'timelineSha256'];

function validateBinding(binding, label) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)
    || typeof binding.projectId !== 'string' || !binding.projectId
    || !Number.isSafeInteger(binding.revision) || binding.revision < 1
    || !HASH.test(binding.planSha256 ?? '') || !HASH.test(binding.timelineSha256 ?? '')) {
    fail('invalid-chapter-binding', `${label} must include projectId, revision, planSha256, and timelineSha256`);
  }
}

function equalBinding(left, right) {
  return BINDING_KEYS.every((key) => left[key] === right[key]);
}

function timecode(seconds) {
  const ms = Math.floor(seconds * 1000 + 1e-7);
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor(ms / 60000) % 60;
  const wholeSeconds = Math.floor(ms / 1000) % 60;
  const remainder = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(remainder).padStart(3, '0')}`;
}

/**
 * Compile chapter titles into exact seek points from the currently bound timeline events.
 * Chapter metadata contains event IDs, never guessed absolute times.
 *
 * timeline: { durationSeconds, events: [{ id, t0, t1 }], binding }
 * chapters: [{ id, title, startEventId, endEventId, description? }]
 * binding: version recorded with the chapter metadata
 * expectedBinding: the current project/timeline identity from the consumer
 * seek: optional callback that performs a real media/workspace seek in seconds
 */
export function buildChapterIndex({timeline, chapters, binding, expectedBinding, seek} = {}) {
  validateBinding(binding, 'chapter metadata binding');
  validateBinding(expectedBinding, 'expectedBinding');
  validateBinding(timeline?.binding, 'timeline.binding');
  if (!equalBinding(binding, expectedBinding) || !equalBinding(timeline.binding, expectedBinding)) {
    fail('stale-chapter-binding', 'chapter metadata or timeline.js binding does not match the current project and timeline hashes');
  }
  if (!Number.isFinite(timeline.durationSeconds) || timeline.durationSeconds <= 0 || !Array.isArray(timeline.events)) {
    fail('invalid-chapter-timeline', 'timeline must provide positive durationSeconds and actual events');
  }
  if (typeof seek !== 'undefined' && typeof seek !== 'function') fail('invalid-chapter-seek', 'seek must be a function when supplied');
  if (!Array.isArray(chapters) || !chapters.length) fail('invalid-chapter-metadata', 'at least one chapter definition is required');

  const events = new Map();
  for (const [index, event] of timeline.events.entries()) {
    if (!event || typeof event.id !== 'string' || !event.id || events.has(event.id)
      || !Number.isFinite(event.t0) || !Number.isFinite(event.t1) || event.t0 < 0 || event.t1 <= event.t0
      || event.t1 > timeline.durationSeconds) {
      fail('invalid-chapter-timeline', `timeline.events[${index}] needs a unique id and a valid t0/t1 range inside DUR`);
    }
    events.set(event.id, event);
  }

  const seenIds = new Set();
  const index = chapters.map((chapter, ordinal) => {
    if (!chapter || typeof chapter.id !== 'string' || !chapter.id || seenIds.has(chapter.id)
      || typeof chapter.title !== 'string' || !chapter.title.trim()
      || typeof chapter.startEventId !== 'string' || typeof chapter.endEventId !== 'string') {
      fail('invalid-chapter-metadata', `chapter ${ordinal + 1} needs a unique id, title, startEventId, and endEventId`);
    }
    seenIds.add(chapter.id);
    const startEvent = events.get(chapter.startEventId);
    const endEvent = events.get(chapter.endEventId);
    if (!startEvent || !endEvent) fail('stale-chapter-event', `chapter ${chapter.id} references a missing event in the current timeline`);
    const startSec = startEvent.t0;
    const endSec = endEvent.t1;
    if (endSec <= startSec) fail('invalid-chapter-range', `chapter ${chapter.id} has an end event before its start event`);
    if (chapter.description != null && (typeof chapter.description !== 'string' || !chapter.description.trim())) {
      fail('invalid-chapter-metadata', `chapter ${chapter.id}.description must be non-empty when supplied`);
    }
    return {
      id: chapter.id,
      title: chapter.title.trim(),
      ...(chapter.description ? {description: chapter.description.trim()} : {}),
      startEventId: chapter.startEventId,
      endEventId: chapter.endEventId,
      startSec,
      endSec,
      timecode: timecode(startSec),
    };
  });

  for (let position = 1; position < index.length; position += 1) {
    if (index[position].startSec <= index[position - 1].startSec) fail('invalid-chapter-order', 'chapter metadata must follow increasing timeline event times');
    if (index[position].startSec < index[position - 1].endSec) fail('overlapping-chapters', `chapters ${index[position - 1].id} and ${index[position].id} overlap`);
  }

  function at(t) {
    if (!Number.isFinite(t) || t < 0) fail('invalid-chapter-time', 'at(t) expects a non-negative absolute time in seconds');
    let low = 0, high = index.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const chapter = index[middle];
      if (t < chapter.startSec) high = middle - 1;
      else if (t >= chapter.endSec) low = middle + 1;
      else return chapter;
    }
    return null;
  }

  function jumpTo(id) {
    const chapter = index.find((row) => row.id === id);
    if (!chapter) fail('unknown-chapter', `no chapter with id ${id}`);
    if (seek) seek(chapter.startSec, chapter);
    return chapter;
  }

  return {
    binding: {...binding},
    chapters: index.map((chapter) => ({...chapter})),
    at,
    jumpTo,
  };
}
