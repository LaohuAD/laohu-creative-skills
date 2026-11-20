import { spawnSync } from "node:child_process";

function bounded(value, limit = 2400) {
  const text = String(value || "").trim();
  if (text.length <= limit) return text;
  const half = Math.floor(limit / 2);
  return text.slice(0, half) + "\n… diagnostic truncated …\n" + text.slice(-half);
}

/** Run the selected FFmpeg before a source renderer starts browser capture. */
export function preflightFfmpeg(executable, { env = process.env, timeoutMs = 10_000 } = {}) {
  if (typeof executable !== "string" || !executable.trim()) {
    throw new Error("FFmpeg preflight requires a non-empty selected executable");
  }
  const result = spawnSync(executable, ["-hide_banner", "-version"], {
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  if (result.error || result.status !== 0) {
    const details = [
      result.error?.message,
      result.status == null ? null : "exit " + result.status,
      result.signal ? "signal " + result.signal : null,
      stderr,
      stdout,
    ].filter(Boolean).join("\n");
    throw new Error("FFmpeg preflight failed before source rendering for " + executable + ": " + bounded(details));
  }
  const version = stdout.split(/\r?\n/).find((line) => /^ffmpeg version\b/i.test(line.trim()));
  if (!version) {
    throw new Error("FFmpeg preflight did not receive an `ffmpeg version` response from " + executable + ": " + bounded(stdout || stderr));
  }
  return { executable, version: version.trim() };
}
