const PAGE_SIZE = 36;
const sourceLabels = {
  style: "视觉描述",
  atlas: "Atlas",
  "atlas-member": "Atlas 成员",
  "motion-prompt": "Motion Prompt",
  overlay: "表达参考",
};
const status = document.querySelector("#status-message");
const grid = document.querySelector("#resource-grid");
const searchBox = document.querySelector("#search");
const sourceFilter = document.querySelector("#source-filter");
const categoryFilter = document.querySelector("#category-filter");
const statusFilter = document.querySelector("#status-filter");
const resultCount = document.querySelector("#result-count");
const pageLabel = document.querySelector("#page-label");
const previousPage = document.querySelector("#previous-page");
const nextPage = document.querySelector("#next-page");
const selectedId = document.querySelector("#selected-id");
const copyButton = document.querySelector("#copy-id");
const selectionFeedback = document.querySelector("#selection-feedback");

let data = null;
let allEntries = [];
let filteredEntries = [];
let currentPage = 0;
let selected = "";
let activePlayback = null;
let playbackNonce = 0;
let searchNonce = 0;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function styleSummary(row) {
  return Object.entries(row.catalog || {})
    .filter(([, detail]) => detail && detail.summary)
    .map(([dimension, detail]) => ({ dimension, summary: detail.summary }));
}

function makeEntries(overview) {
  const entries = [];
  for (const row of overview.richStyles || []) {
    entries.push({ ...row, sourceType: "style", displayName: row.name, availability: "reviewed-description" });
  }
  for (const row of overview.atlasFamilies || []) {
    entries.push({ ...row, sourceType: "atlas", isFamily: true,
      displayName: row.nameZh || row.name || row.titleZh || row.id,
      summary: row.visualContributionZh || row.summaryZh || row.summary,
      useConditions: row.useConditionsZh || row.useConditions,
      limitations: row.limitationsZh || row.limitations,
      principalDifferences: row.principalDifferencesZh || row.alternativesZh,
      familyCount: row.count ?? row.memberCount ?? row.memberIds?.length ?? 0,
      category: row.categoryZh || row.kindZh || row.eraZh || "", canExecute: false });
  }
  for (const row of overview.motionPromptItems || []) {
    const runtimeFile = String(row.runtimePath || "").split("/").pop();
    entries.push({ ...row, sourceType: "motion-prompt", displayName: row.nameZh,
      summary: row.meaningZh, useConditions: row.askExampleZh, runtimeFile,
      canExecute: ["canvas-code-available", "canvas-code-with-local-assets"].includes(row.availability) });
  }
  for (const row of overview.expressionCapabilities || []) {
    entries.push({ ...row, sourceType: "overlay", displayName: row.name, canExecute: false });
  }
  return entries;
}

function kindStatus(row) {
  if (row.sourceType === "motion-prompt" && row.canExecute) return "playable";
  if ((row.sourceType === "atlas" || row.sourceType === "atlas-member") && String(row.availability || "").includes("review")) return "pending";
  if (row.sourceType === "atlas" || row.sourceType === "atlas-member") return "reference";
  if (row.sourceType === "overlay") return "reference";
  return "reviewed";
}

function statusText(row) {
  if (row.sourceType === "motion-prompt") return row.canExecute ? "MIT 模块可播放" : "运行状态待核";
  if (row.sourceType === "atlas" && row.isFamily) return `Atlas 家族 · ${row.familyCount} 项`;
  if (row.sourceType === "atlas" || row.sourceType === "atlas-member") {
    if (String(row.availability || "").includes("translation-review-needed")) return "待核译";
    if (String(row.availability || "").includes("knowledge-only-no-local-runtime")) return "知识目录 · 无本地实现";
    return String(row.availability || "目录项");
  }
  if (row.sourceType === "overlay") return "仅表达参考 · 无受限组件";
  return "中文描述已核";
}

function textSearch(row) {
  const visual = Object.values(row.appearance || {}).map((x) => x?.summary || "").join(" ");
  const dimensions = styleSummary(row).map((x) => `${x.dimension} ${x.summary}`).join(" ");
  return [row.id, row.displayName, row.nameEn, row.summary, row.visualContribution, row.useConditions,
    row.limitations, row.principalDifferences, row.category, ...(row.memberIds || []), ...(row.aliases || []), ...(row.tags || []), visual, dimensions]
    .filter(Boolean).join(" ").toLocaleLowerCase();
}

function fillCategories() {
  const categories = [...new Set(allEntries.flatMap((row) => {
    if (row.sourceType === "motion-prompt") return row.categoryZh ? [row.categoryZh] : [];
    if (row.sourceType === "overlay") return row.tags || [];
    if (row.sourceType === "atlas") return [row.categoryZh, row.kindZh, row.eraZh, ...(row.tags || [])].filter(Boolean);
    return [];
  }))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  categoryFilter.replaceChildren(node("option", "", "全部类别"));
  categoryFilter.firstElementChild.value = "all";
  for (const category of categories) {
    const option = node("option", "", category);
    option.value = category;
    categoryFilter.append(option);
  }
}

function showCoverage() {
  const atlasMemberCount = (data.atlasFamilies || []).reduce((sum, family) => sum + (family.memberIds?.length || 0), 0);
  const chips = [
    [data.richStyles?.length || 0, "项视觉描述"], [atlasMemberCount, "项 Atlas 目录"],
    [data.motionPromptItems?.length || 0, "项 MIT 动作"], [data.expressionCapabilities?.length || 0, "项表达参考"],
  ];
  const root = document.querySelector("#coverage");
  root.replaceChildren(...chips.map(([count, label]) => node("span", "coverage-chip", `${count} ${label}`)));
}

function appendParagraph(parent, label, value) {
  if (!value || typeof value !== "string") return;
  const p = node("p");
  const title = node("span", "meta-label", `${label}：`);
  p.append(title, document.createTextNode(value));
  parent.append(p);
}

function addDetails(card, row) {
  const details = node("details", "card-details");
  const summary = node("summary", "", row.sourceType === "style" ? "展开正式描述维度" : "展开适用条件与限制");
  details.append(summary);
  if (row.sourceType === "style") {
    const list = node("ul", "dimension-list");
    const labels = { visual: "视觉", actions: "动作", cameraSpaceChange: "镜头与空间", expressionEmotion: "表达与情绪",
      fit: "适用", limitations: "限制", fusion: "融合", appearance: "长相证据" };
    const descriptions = [...styleSummary(row)];
    for (const [key, value] of Object.entries(row.appearance || {})) {
      if (value?.summary) descriptions.push({ dimension: `appearance:${key}`, summary: value.summary });
    }
    for (const item of descriptions) {
      const li = node("li");
      const [family, field] = item.dimension.split(":");
      const label = family === "appearance" ? `${labels.appearance} · ${field}` : labels[item.dimension] || item.dimension;
      li.append(node("strong", "", label), document.createTextNode(item.summary));
      list.append(li);
    }
    details.append(list);
  } else {
    const content = node("div", "dimension-list");
    appendParagraph(content, "用途条件", row.useConditions);
    appendParagraph(content, "主要差异", row.principalDifferences);
    appendParagraph(content, "边界", row.limitations);
    if (row.sourceType === "atlas" && Array.isArray(row.familyIds)) appendParagraph(content, "Atlas 家族", row.familyIds.join("、"));
    details.append(content);
  }
  card.append(details);
}

function stopPlayback() {
  playbackNonce += 1;
  if (activePlayback?.frame) cancelAnimationFrame(activePlayback.frame);
  activePlayback = null;
  for (const button of grid.querySelectorAll("[data-action='stop']")) {
    button.textContent = "播放动作";
    button.dataset.action = "play";
  }
}

async function playMotion(row, canvas, button) {
  stopPlayback();
  const nonce = playbackNonce;
  const runtimeStatus = grid.querySelector(`[data-runtime-status="${CSS.escape(row.id)}"]`);
  button.textContent = "停止播放";
  button.dataset.action = "stop";
  try {
    const moduleUrl = new URL(`../../runtime/motion-vocabulary/${encodeURIComponent(row.runtimeFile)}`, location.href);
    const module = await import(moduleUrl.href);
    if (nonce !== playbackNonce) return;
    if (module.ready && typeof module.ready.then === "function") await module.ready;
    if (nonce !== playbackNonce) return;
    const element = module.createElement(row.localNumber);
    const context = canvas.getContext("2d");
    const startedAt = performance.now();
    const draw = (now) => {
      if (nonce !== playbackNonce) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      element.draw(context, canvas.width, canvas.height, (now - startedAt) / 1000);
      activePlayback = { frame: requestAnimationFrame(draw), id: row.id };
    };
    runtimeStatus.textContent = `正在播放 · ${row.cycleSeconds}s 循环 · ${row.dimensions?.width} × ${row.dimensions?.height}`;
    activePlayback = { frame: requestAnimationFrame(draw), id: row.id };
  } catch (error) {
    button.textContent = "播放动作";
    button.dataset.action = "play";
    if (runtimeStatus) runtimeStatus.textContent = `模块加载失败：${error.message}`;
  }
}

function selectId(row) {
  selected = row.id;
  selectedId.textContent = row.id;
  copyButton.disabled = false;
  selectionFeedback.textContent = `${sourceLabels[row.sourceType]} · ${row.displayName || row.name}`;
  for (const button of grid.querySelectorAll(".select-button")) {
    const isSelected = button.dataset.id === selected;
    button.textContent = isSelected ? "已选中" : "选中 ID";
    button.setAttribute("aria-pressed", String(isSelected));
  }
}

function makeSelectButton(row) {
  const button = node("button", "select-button", "选中 ID");
  button.type = "button";
  button.dataset.id = row.id;
  button.addEventListener("click", () => selectId(row));
  return button;
}

function makeCard(row) {
  const card = node("article", "resource-card");
  card.dataset.id = row.id;
  const top = node("div", "card-top");
  const title = node("h3", "card-title");
  title.append(document.createTextNode(row.displayName || row.name || row.nameZh || row.id));
  if (row.nameEn) title.append(node("span", "card-en", row.nameEn));
  top.append(title, node("span", `badge ${kindStatus(row)}`, statusText(row)));
  card.append(top, node("code", "resource-id", row.id));

  const content = node("div", "card-content");
  if (row.sourceType === "style") {
    appendParagraph(content, "视觉", row.catalog?.visual?.summary);
    appendParagraph(content, "动作", row.catalog?.actions?.summary);
  }
  appendParagraph(content, "表现", row.summary);
  appendParagraph(content, row.sourceType === "motion-prompt" ? "动作示例" : "适用", row.useConditions);
  appendParagraph(content, "贡献", row.visualContribution);
  card.append(content);

  if (row.sourceType === "motion-prompt" && row.canExecute) {
    const canvas = document.createElement("canvas");
    canvas.width = row.dimensions?.width || 539;
    canvas.height = row.dimensions?.height || 208;
    const preview = node("div", "preview-wrap");
    preview.append(canvas);
    card.append(preview);
    const actions = node("div", "card-actions");
    const playButton = node("button", "", "播放动作");
    playButton.type = "button";
    playButton.dataset.action = "play";
    playButton.addEventListener("click", () => {
      if (playButton.dataset.action === "stop") stopPlayback();
      else playMotion(row, canvas, playButton);
    });
    actions.append(playButton, makeSelectButton(row));
    card.append(actions, node("div", "runtime-note", `本地 MIT 模块 · ${row.cycleSeconds}s 周期 · ${row.availability}`));
    const statusLine = node("div", "runtime-note", "点击播放动作以检查模块加载与循环。 ");
    statusLine.dataset.runtimeStatus = row.id;
    card.append(statusLine);
  } else if (row.sourceType === "atlas" && row.isFamily) {
    addDetails(card, row);
    const actions = node("div", "card-actions");
    const expandButton = node("button", "", `展开 ${row.familyCount} 项成员`);
    expandButton.type = "button";
    expandButton.setAttribute("aria-expanded", "false");
    const members = node("div", "family-member-list");
    expandButton.addEventListener("click", async () => {
      const expanded = expandButton.getAttribute("aria-expanded") === "true";
      if (expanded) {
        members.hidden = true;
        expandButton.setAttribute("aria-expanded", "false");
        expandButton.textContent = `展开 ${row.familyCount} 项成员`;
        return;
      }
      if (!members.dataset.loaded) {
        expandButton.disabled = true;
        expandButton.textContent = "正在读取家族成员…";
        try {
          const response = await fetch(`/__gallery-family?id=${encodeURIComponent(row.id)}`, { cache: "no-store" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const family = await response.json();
          const expectedMembers = row.memberIds || family.family?.memberIds || [];
          if (family.schema !== "laohu.motion.resource-family/1" || !Array.isArray(family.resources)
            || family.memberCount !== family.resources.length || family.resources.length !== row.familyCount
            || expectedMembers.length !== family.resources.length
            || new Set(family.resources.map((item) => item.id)).size !== family.resources.length
            || expectedMembers.some((id) => !family.resources.some((item) => item.id === id))) {
            throw new Error("家族响应与当前 L0 成员 ID/数量不一致");
          }
          for (const resource of family.resources) {
            members.append(makeCard({ ...resource, sourceType: "atlas-member", isFamily: false,
              displayName: resource.nameZh || resource.name || resource.id,
              summary: resource.summaryZh || resource.summary,
              visualContribution: resource.visualContributionZh || resource.visualContribution,
              useConditions: resource.useConditionsZh || resource.useConditions,
              limitations: resource.limitationsZh || resource.limitations }));
          }
          members.dataset.loaded = "true";
        } catch (error) {
          members.replaceChildren(node("p", "", `无法读取家族成员：${error.message}`));
        } finally {
          expandButton.disabled = false;
        }
      }
      members.hidden = false;
      expandButton.setAttribute("aria-expanded", "true");
      expandButton.textContent = `收起 ${row.familyCount} 项成员`;
    });
    actions.append(expandButton);
    card.append(actions, members);
  } else {
    addDetails(card, row);
    const actions = node("div", "card-actions");
    actions.append(makeSelectButton(row));
    card.append(actions);
  }
  return card;
}

function rowMatchesFilters(row, { query, source, category, status }) {
  const sameSource = source === "all" || row.sourceType === source || (source === "atlas" && row.sourceType === "atlas-member");
  if (!sameSource) return false;
  if (query && !textSearch(row).includes(query)) return false;
  if (category !== "all") {
    const categories = row.sourceType === "motion-prompt" ? [row.categoryZh]
      : row.sourceType === "atlas" ? [row.categoryZh, row.kindZh, row.eraZh, ...(row.tags || [])]
      : row.sourceType === "atlas-member" ? row.familyIds || []
      : row.sourceType === "overlay" ? row.tags || [] : [];
    if (!categories.includes(category)) return false;
  }
  if (status === "playable" && kindStatus(row) !== "playable") return false;
  if (status === "reference" && kindStatus(row) !== "reference") return false;
  if (status === "pending" && kindStatus(row) !== "pending") return false;
  return true;
}

async function applyFilters() {
  const thisSearch = ++searchNonce;
  stopPlayback();
  const query = searchBox.value.trim().toLocaleLowerCase();
  const source = sourceFilter.value;
  const category = categoryFilter.value;
  const statusValue = statusFilter.value;
  const filter = { query, source, category, status: statusValue };
  let rows = allEntries.filter((row) => rowMatchesFilters(row, filter));
  if (query && (source === "all" || source === "atlas")) {
    try {
      const response = await fetch(`/__gallery-search?source=atlas&limit=100&query=${encodeURIComponent(searchBox.value.trim())}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const atlasHits = await response.json();
      if (thisSearch !== searchNonce) return;
      rows.push(...atlasHits.map((row) => ({ ...row, sourceType: "atlas-member", displayName: row.nameZh || row.name || row.id,
        summary: row.summaryZh || row.summary, visualContribution: row.visualContributionZh || row.visualContribution,
        useConditions: row.useConditionsZh || row.useConditions, limitations: row.limitationsZh || row.limitations,
        principalDifferences: row.principalDifferencesZh || row.alternativesZh,
        isFamily: false, canExecute: false })).filter((row) => rowMatchesFilters(row, filter)));
    } catch (error) {
      if (thisSearch !== searchNonce) return;
      status.textContent = `Atlas 成员搜索暂不可用：${error.message}`;
      status.classList.add("error");
    }
  }
  if (thisSearch !== searchNonce) return;
  const unique = new Map(rows.map((row) => [row.id, row]));
  filteredEntries = [...unique.values()];
  filteredEntries.sort((a, b) => String(a.id).localeCompare(String(b.id), "zh-CN"));
  currentPage = 0;
  renderPage();
}

function renderPage() {
  stopPlayback();
  const pages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pages - 1);
  const start = currentPage * PAGE_SIZE;
  const visible = filteredEntries.slice(start, start + PAGE_SIZE);
  resultCount.textContent = `找到 ${filteredEntries.length} 项 · 当前显示 ${visible.length} 项`;
  pageLabel.textContent = `${currentPage + 1} / ${pages}`;
  previousPage.disabled = currentPage <= 0;
  nextPage.disabled = currentPage >= pages - 1;
  grid.replaceChildren();
  if (!visible.length) {
    grid.append(node("div", "empty-state", "没有符合筛选条件的资源。试试清空筛选或换一个描述词。"));
    return;
  }
  for (const row of visible) grid.append(makeCard(row));
  for (const button of grid.querySelectorAll(".select-button")) {
    const isSelected = button.dataset.id === selected;
    button.textContent = isSelected ? "已选中" : "选中 ID";
    button.setAttribute("aria-pressed", String(isSelected));
  }
}

async function copySelectedId() {
  if (!selected) return;
  try {
    await navigator.clipboard.writeText(selected);
    selectionFeedback.textContent = "稳定 ID 已复制；生产时由所选 ID 读取对应中文 MD。";
  } catch {
    selectionFeedback.textContent = "复制不可用；可直接选中并复制下方稳定 ID。";
  }
}

async function initialize() {
  try {
    const response = await fetch("/__gallery-data", { cache: "no-store" });
    if (!response.ok) throw new Error(`统一目录返回 HTTP ${response.status}`);
    data = await response.json();
    const expected = { richStyles: 75, motionPromptItems: 240, expressionCapabilities: 20 };
    for (const [key, count] of Object.entries(expected)) {
      if ((data[key] || []).length !== count) throw new Error(`${key} 覆盖数异常：预期 ${count}，收到 ${(data[key] || []).length}`);
    }
    const atlasMemberIds = (data.atlasFamilies || []).flatMap((family) => family.memberIds || []);
    if (data.atlasFamilies?.length !== 21 || atlasMemberIds.length !== 504 || new Set(atlasMemberIds).size !== 504) {
      throw new Error(`Atlas 家族成员导航覆盖数异常：家族 ${data.atlasFamilies?.length || 0}，成员 ${new Set(atlasMemberIds).size}`);
    }
    showCoverage();
    allEntries = makeEntries(data);
    fillCategories();
    if (typeof data.atlasProductionNoteZh !== "string" || !data.atlasProductionNoteZh.trim()) {
      throw new Error("Atlas 目录缺少工艺/示意适用条件说明");
    }
    status.textContent = `统一目录已载入。Atlas 先按家族浏览，展开后读取该家族 L1 成员摘要；只有 Motion Prompt MIT 模块提供本地动态预览。${data.atlasProductionNoteZh}`;
    status.classList.remove("error");
    applyFilters();
  } catch (error) {
    status.textContent = `资源目录暂不可用：${error.message}。请先由资源维护流程生成并校验统一目录，再重启此 gallery 服务。`;
    status.classList.add("error");
    resultCount.textContent = "目录尚未就绪";
  }
}

let searchTimer = null;
searchBox.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 180);
});
sourceFilter.addEventListener("change", () => { categoryFilter.value = "all"; applyFilters(); });
categoryFilter.addEventListener("change", applyFilters);
statusFilter.addEventListener("change", applyFilters);
document.querySelector("#clear-filters").addEventListener("click", () => {
  searchBox.value = "";
  sourceFilter.value = "all";
  categoryFilter.value = "all";
  statusFilter.value = "all";
  applyFilters();
});
previousPage.addEventListener("click", () => { currentPage -= 1; renderPage(); });
nextPage.addEventListener("click", () => { currentPage += 1; renderPage(); });
copyButton.addEventListener("click", copySelectedId);
initialize();
