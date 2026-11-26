#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

function fail(message) {
  console.error(`showreel-audio-scene: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const positionals = [];
  let out = null;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--out') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) fail('--out needs a file path');
      out = argv[++index];
    } else if (value.startsWith('--out=')) out = value.slice('--out='.length);
    else if (value.startsWith('--')) fail(`unsupported option ${value}`);
    else positionals.push(value);
  }
  if (positionals.length !== 1) fail('usage: showreel-audio-scene.mjs <project> [--out <absolute-or-project-relative-json>]');
  return { project: path.resolve(positionals[0]), out };
}

function number(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be a finite number of seconds`);
  return value;
}

function selectedEvents(timeline) {
  if (Object.prototype.hasOwnProperty.call(timeline, 'AUDIO_EVENTS')) {
    if (!Array.isArray(timeline.AUDIO_EVENTS)) fail('timeline.js AUDIO_EVENTS must be an array');
    return timeline.AUDIO_EVENTS;
  }
  if (Array.isArray(timeline.CUES)) {
    const soundCues = timeline.CUES.filter(cue => cue && cue.sfx != null);
    if (soundCues.some(cue => typeof cue.id !== 'string' || !cue.id.trim())) {
      fail('timeline.js has sound CUES without stable IDs; give each shared sound cue an id, or export AUDIO_EVENTS explicitly');
    }
    return soundCues;
  }
  return [];
}

function sceneEvents(timeline, duration) {
  const phases = Array.isArray(timeline.PHASES) ? timeline.PHASES
    : Array.isArray(timeline.phases) ? timeline.phases : [];
  const phaseById = new Map();
  for (const [index, phase] of phases.entries()) {
    if (!phase || typeof phase.id !== 'string' || !phase.id.trim()) fail(`timeline.js PHASES[${index}] needs a stable id`);
    if (phaseById.has(phase.id)) fail(`timeline.js repeats phase id ${phase.id}`);
    phaseById.set(phase.id, phase);
  }
  const ids = new Set();
  return selectedEvents(timeline).map((event, index) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) fail(`sound event ${index + 1} must be an object`);
    if (typeof event.id !== 'string' || !event.id.trim()) fail(`sound event ${index + 1} needs a stable id`);
    if (ids.has(event.id)) fail(`duplicate sound event id ${event.id}`);
    ids.add(event.id);

    const timeKeys = ['filmTimeSec', 'timeSec', 'time', 't'].filter(key => event[key] != null);
    if (event.phaseId != null) {
      if (timeKeys.length) fail(`sound event ${event.id} has phaseId and a second time value`);
      if (event.timeBasis != null && event.timeBasis !== 'film-global') fail(`Showreel phase event ${event.id} must use the film-global clock`);
      const phase = phaseById.get(event.phaseId);
      if (!phase) fail(`sound event ${event.id} references missing PHASES id ${event.phaseId}`);
      const phaseStart = number(phase.startSec, `PHASES.${phase.id}.startSec`);
      const phaseOffset = event.phaseOffsetSec == null ? 0 : number(event.phaseOffsetSec, `sound event ${event.id}.phaseOffsetSec`);
      const resolved = phaseStart + phaseOffset;
      if (resolved < 0 || resolved > duration) fail(`sound event ${event.id} resolves outside DUR`);
      return { ...event, timeBasis: 'film-global' };
    }
    if (timeKeys.length !== 1) fail(`sound event ${event.id} needs exactly one numeric film time`);
    if (event.timeBasis != null && event.timeBasis !== 'film-global') fail(`Showreel sound event ${event.id} must use the film-global clock`);
    const timeSec = number(event[timeKeys[0]], `sound event ${event.id} time`);
    if (timeSec < 0 || timeSec > duration) fail(`sound event ${event.id} falls outside DUR`);
    const { timeSec: _timeSec, time: _time, t: _t, ...rest } = event;
    return { ...rest, id: event.id, filmTimeSec: timeSec, timeBasis: 'film-global' };
  });
}

async function main() {
  const { project, out } = parseArgs(process.argv.slice(2));
  const timelinePath = path.join(project, 'timeline.js');
  if (!fs.existsSync(timelinePath) || !fs.statSync(timelinePath).isFile()) fail(`missing ${timelinePath}`);
  const sourceBytes = fs.readFileSync(timelinePath);
  const url = pathToFileURL(timelinePath);
  url.searchParams.set('showreel-audio-scene', createHash('sha256').update(sourceBytes).digest('hex'));
  const timeline = await import(url.href);
  const duration = number(timeline.DUR, 'timeline.js DUR');
  if (duration <= 0) fail('timeline.js DUR must be positive');
  const rows = sceneEvents(timeline, duration);
  const scene = {
    format: 'laohu.motion.showreel-audio-scene/1',
    duration,
    timeBasis: 'film-global',
    ...(Number.isFinite(timeline.FPS) && timeline.FPS > 0 ? { fps: timeline.FPS } : {}),
    phases: Array.isArray(timeline.PHASES) ? timeline.PHASES : Array.isArray(timeline.phases) ? timeline.phases : [],
    audioEvents: rows,
    sourceTimeline: {
      file: 'timeline.js',
      sha256: createHash('sha256').update(sourceBytes).digest('hex'),
    },
  };
  const output = out ? (path.isAbsolute(out) ? out : path.resolve(project, out)) : path.join(project, 'audio', 'audio-event-scene.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temp = `${output}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(scene, null, 2) + '\n', { flag: 'wx' });
  try { fs.renameSync(temp, output); }
  finally { fs.rmSync(temp, { force: true }); }
  console.log(`SCENE ${output}\nEVENTS ${rows.length}\nTIMELINE_SHA256 ${scene.sourceTimeline.sha256}`);
}

main().catch(error => {
  console.error(`showreel-audio-scene: ${error.message}`);
  process.exitCode = 1;
});
