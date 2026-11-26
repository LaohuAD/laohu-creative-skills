import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const serverPath = path.join(repoRoot, ".agents/skills/laohu-motion/templates/styles/gallery/serve-gallery.mjs");
const child = spawn(process.execPath, [serverPath, "--port", "0"], { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
let stderr = "";
child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
const lines = createInterface({ input: child.stdout });

function firstLine(stream, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`gallery server startup timeout: ${stderr}`)), timeoutMs);
    stream.once("line", (line) => { clearTimeout(timeout); resolve(line); });
    child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`gallery server exited ${code}: ${stderr}`)); });
  });
}

try {
  const startup = JSON.parse(await firstLine(lines));
  assert.equal(startup.status, "ready", `resource API should be ready before gallery E11 verification: ${startup.resourceError || "unknown error"}`);
  const base = new URL(startup.url);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /resource-grid/);

  const scriptUrl = new URL("./gallery.mjs", base);
  const scriptResponse = await fetch(scriptUrl);
  assert.equal(scriptResponse.status, 200);
  const galleryScript = await scriptResponse.text();
  assert.match(galleryScript, /resource-overview|__gallery-data/);
  assert.match(galleryScript, /function makeSelectButton\(row\)/, "L2 resources share one stable-ID selection action");
  assert.match(galleryScript, /actions\.append\(makeSelectButton\(row\)\)/, "description, Atlas member and Overlay cards expose ID selection");
  assert.match(galleryScript, /actions\.append\(playButton, makeSelectButton\(row\)\)/, "playable motion cards retain selection beside playback");
  const familyCardBlock = galleryScript.slice(galleryScript.indexOf('} else if (row.sourceType === "atlas" && row.isFamily) {'), galleryScript.indexOf('\n  } else {', galleryScript.indexOf('} else if (row.sourceType === "atlas" && row.isFamily) {')));
  assert.ok(!familyCardBlock.includes("makeSelectButton"), "family IDs remain navigation-only; select a concrete member with L2正文");
  assert.match(galleryScript, /canExecute:\s*\[\s*"canvas-code-available"\s*,\s*"canvas-code-with-local-assets"\s*\]\.includes\(row\.availability\)/,
    "both code-only and locally bundled asset modules are offered for playback");

  const overviewResponse = await fetch(new URL("/__gallery-data", base));
  assert.equal(overviewResponse.status, 200);
  const overview = await overviewResponse.json();
  assert.equal(overview.schema, "laohu.motion.resource-overview/1");
  assert.equal(overview.richStyles.length, 75);
  assert.equal(overview.atlasFamilies.length, 21);
  assert.equal(overview.motionPromptItems.length, 240);
  assert.equal(overview.expressionCapabilities.length, 20);
  assert.ok(overview.atlasProductionNoteZh?.includes("示意"));
  assert.ok(overview.richStyles.every((row) => row.appearance && row.id));
  assert.ok(overview.richStyles.every((row) => row.catalog?.visual?.summary), "style cards have visible description copy before expansion");
  assert.ok(overview.expressionCapabilities.every((row) => row.canExecute === undefined || row.canExecute === false));
  assert.equal(Object.hasOwn(overview, "atlasResources"), false, "family memberIds are the only L0 member directory");
  const atlasIds = new Set(overview.atlasFamilies.flatMap((family) => family.memberIds));
  assert.equal(atlasIds.size, 504);
  const familyIds = new Set();
  const familyMemberIds = new Set();
  for (const family of overview.atlasFamilies) {
    assert.ok(family.id.startsWith("atlas-family:"));
    assert.ok(family.visualContributionZh && family.principalDifferencesZh && family.useConditionsZh, family.id);
    assert.equal(family.memberCount, family.memberIds.length, family.id);
    assert.ok(!familyIds.has(family.id), `duplicate family ${family.id}`);
    familyIds.add(family.id);
    for (const id of family.memberIds) familyMemberIds.add(id);
  }
  assert.deepEqual(familyMemberIds, atlasIds, "family navigation covers all 504 IDs without returning their L1 summaries at L0");
  const familyId = overview.atlasFamilies[0].id;
  const familyResponse = await fetch(new URL(`/__gallery-family?id=${encodeURIComponent(familyId)}`, base));
  assert.equal(familyResponse.status, 200);
  const familyResult = await familyResponse.json();
  assert.equal(familyResult.schema, "laohu.motion.resource-family/1");
  assert.equal(familyResult.memberCount, familyResult.resources.length);
  assert.deepEqual(new Set(familyResult.resources.map((row) => row.id)), new Set(overview.atlasFamilies[0].memberIds));
  const searchName = familyResult.resources[0].nameZh;
  const atlasSearch = await fetch(new URL(`/__gallery-search?source=atlas&limit=100&query=${encodeURIComponent(searchName)}`, base));
  assert.equal(atlasSearch.status, 200);
  const searchResults = await atlasSearch.json();
  assert.ok(searchResults.some((row) => row.id === familyResult.resources[0].id));

  const ids = [
    ...overview.richStyles.map((row) => row.id), ...overview.atlasFamilies.map((row) => row.id),
    ...overview.motionPromptItems.map((row) => row.id), ...overview.expressionCapabilities.map((row) => row.id),
  ];
  assert.equal(ids.length, new Set(ids).size, "gallery receives unique stable IDs");
  for (const atlasId of atlasIds) assert.ok(atlasId.startsWith("atlas:"));
  for (const item of overview.motionPromptItems) {
    assert.ok(["canvas-code-available", "canvas-code-with-local-assets"].includes(item.availability), item.id);
    const runtimeFile = String(item.runtimePath).split("/").pop();
    const runtimeUrl = new URL(`../../runtime/motion-vocabulary/${encodeURIComponent(runtimeFile)}`, base);
    const runtime = await fetch(runtimeUrl);
    assert.equal(runtime.status, 200, item.id);
    assert.match(await runtime.text(), /export const createElement/);
  }
  process.stdout.write(`PASS gallery HTTP/API/runtime consumer: styles=${overview.richStyles.length}, atlas families=${overview.atlasFamilies.length}, atlas members=${atlasIds.size}, motion=${overview.motionPromptItems.length}, overlay=${overview.expressionCapabilities.length}; 240 runtime modules served.\n`);
} finally {
  lines.close();
  child.kill("SIGTERM");
}
