import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {validateManifest} from '../templates/runtime/laohu-showreel/scripts/build-long.mjs';
import {discoverEditorProject, initialSession, localFile} from '../templates/runtime/laohu-showreel/scripts/lib/editor-model.mjs';
import {newJob, prepareEditorAudio} from '../templates/runtime/laohu-showreel/scripts/lib/editor-media.mjs';
import {audioDuration} from '../templates/runtime/laohu-showreel/scripts/lib/narration.mjs';

function ffmpeg(args, env) {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', ...args], {env, encoding:'utf8'});
  if (result.error || result.status !== 0) throw Error(result.error?.message || result.stderr.trim() || '无法读取实际音轨');
  return result.stdout.trim();
}

export async function prepareEditorReviewAudio(project, options, keepMix) {
  const spec = await discoverEditorProject(project, options);
  const result = await prepareEditorAudio(project, spec, initialSession(spec), newJob('final-review-audio'));
  if (!result.file) return null;
  if (result.original) return result.file;
  return keepMix(localFile(project, result.file));
}

// Match the protected long renderer's chapter order, silence padding for absent
// chapter tracks, and 48 kHz stereo PCM conversion before the final AAC encode.
export function withLongformAudio(project, manifest, env, onAudio, checkInput) {
  const spec = validateManifest(manifest, project);
  if (spec.audio) return onAudio(checkInput(spec.audio), false);
  if (!spec.chapters.some(chapter => chapter.audio)) return onAudio(null, false);
  const directory = fs.mkdtempSync(path.join(env.TMPDIR, 'showreel-review-audio-'));
  try {
    const files = spec.chapters.map((chapter, index) => {
      const file = path.join(directory, `${index}.wav`);
      const input = chapter.audio ? checkInput(chapter.audio) : null;
      if (input && Math.abs(audioDuration(input) - chapter.duration) > 0.05) {
        throw Error(`章 ${chapter.id} 的音轨时长与本章画面不同。先按成片时钟调整音轨。`);
      }
      const source = input ? ['-i', input] : ['-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t',String(chapter.duration)];
      ffmpeg(['-y', ...source, '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', file], env);
      return `file '${path.basename(file)}'`;
    });
    const list = path.join(directory, 'ordered.txt');
    const combined = path.join(directory, 'review.wav');
    fs.writeFileSync(list, files.join('\n') + '\n');
    ffmpeg(['-y', '-f', 'concat', '-safe', '1', '-i', list, '-map', '0:a:0', '-c:a', 'copy', combined], env);
    return onAudio(combined, true);
  } finally { fs.rmSync(directory, {recursive:true, force:true}); }
}

export function pcmFingerprint(file, env) {
  return ffmpeg(['-i', file, '-map', '0:a:0', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', '-f', 'hash', '-hash', 'sha256', 'pipe:1'], env);
}
