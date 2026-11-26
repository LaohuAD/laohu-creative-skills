#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const galleryDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(galleryDir, "../../..");
const repoRoot = path.resolve(skillRoot, "../../..");
const stylesCli = path.join(skillRoot, "scripts", "laohu-styles.py");
const python = process.env.LAOHU_PYTHON || "python3";
const portArg = process.argv.indexOf("--port");
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 4173;
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port must be an integer from 0 to 65535");

const overview = spawnSync(python, [stylesCli, "resource-overview", "--scope", "all"], {
  cwd: repoRoot,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
let data = null;
let dataError = null;
if (overview.status === 0) {
  try {
    data = JSON.parse(overview.stdout);
  } catch (error) {
    dataError = `resource-overview returned invalid JSON: ${error.message}`;
  }
} else {
  dataError = (overview.stderr || overview.error?.message || `resource-overview exit ${overview.status}`).trim();
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".woff": "font/woff",
  ".woff2": "font/woff2", ".ttf": "font/ttf", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
};

function send(response, statusCode, body, type = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(body);
}

function runResourceCommand(args, maxBuffer = 8 * 1024 * 1024) {
  const result = spawnSync(python, [stylesCli, ...args], { cwd: repoRoot, encoding: "utf8", maxBuffer });
  if (result.status !== 0) return { error: (result.stderr || result.error?.message || `resource command exit ${result.status}`).trim() };
  try { return { value: JSON.parse(result.stdout) }; }
  catch (error) { return { error: `resource command returned invalid JSON: ${error.message}` }; }
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
  const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
  if (pathname === "/__gallery-data") {
    if (!data) return send(response, 503, JSON.stringify({ error: dataError }), "application/json; charset=utf-8");
    return send(response, 200, JSON.stringify(data), "application/json; charset=utf-8");
  }
  if (pathname === "/__gallery-search") {
    const query = (requestUrl.searchParams.get("query") || "").trim();
    const source = requestUrl.searchParams.get("source") || "all";
    const limit = Number(requestUrl.searchParams.get("limit") || 100);
    if (!query || query.length > 240 || !["all", "style", "atlas", "motion-prompt", "overlay"].includes(source)
      || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return send(response, 400, JSON.stringify({ error: "invalid query/source/limit" }), "application/json; charset=utf-8");
    }
    const result = runResourceCommand(["resource-search", "--query", query, "--source", source, "--limit", String(limit)]);
    if (result.error) return send(response, 503, JSON.stringify({ error: result.error }), "application/json; charset=utf-8");
    return send(response, 200, JSON.stringify(result.value), "application/json; charset=utf-8");
  }
  if (pathname === "/__gallery-family") {
    const id = requestUrl.searchParams.get("id") || "";
    if (!/^atlas-family:[a-z0-9-]+$/u.test(id)) return send(response, 400, JSON.stringify({ error: "invalid Atlas family ID" }), "application/json; charset=utf-8");
    const result = runResourceCommand(["resource-family", "--id", id], 24 * 1024 * 1024);
    if (result.error) return send(response, 503, JSON.stringify({ error: result.error }), "application/json; charset=utf-8");
    return send(response, 200, JSON.stringify(result.value), "application/json; charset=utf-8");
  }
  const mapped = pathname === "/" ? "/templates/styles/gallery/index.html" : pathname;
  const decoded = decodeURIComponent(mapped);
  const absolute = path.resolve(skillRoot, `.${decoded}`);
  if (absolute !== skillRoot && !absolute.startsWith(`${skillRoot}${path.sep}`)) return send(response, 403, "forbidden");
  try {
    const info = await stat(absolute);
    if (!info.isFile()) return send(response, 404, "not found");
    const body = await readFile(absolute);
    return send(response, 200, body, mimeTypes[path.extname(absolute).toLowerCase()] || "application/octet-stream");
  } catch {
    return send(response, 404, "not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/templates/styles/gallery/index.html`;
  process.stdout.write(JSON.stringify({ status: data ? "ready" : "resource-catalog-pending", url, resourceError: dataError }) + "\n");
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
