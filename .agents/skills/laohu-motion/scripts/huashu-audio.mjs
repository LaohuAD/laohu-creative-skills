#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runCli } from "./laohu-audio-source.mjs";

export * from "./laohu-audio-source.mjs";

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => { process.stderr.write((error.stack || error.message) + "\n"); process.exitCode = 1; });
}
