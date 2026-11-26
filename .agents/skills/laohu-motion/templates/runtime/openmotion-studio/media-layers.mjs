// Used by both the Showreel page and its frame exporter. Canvas objects can call
// workbenchVisible(id) in their own draw function and publish a precise hit test.
let edits = {};
window.applyWorkbenchEdits = (value) => {
  edits = value || {};
};
window.workbenchVisible = (id) => !edits[id]?.hidden && !edits[id]?.deleted;
const stateUrl = new URL('./clip-state.json', import.meta.url);
const loaded = fetch(stateUrl, { cache: 'no-store' })
  .then((r) => {
    if (!r.ok) throw Error('无法读取片段开关');
    return r.json();
  })
  .then((state) => window.applyWorkbenchEdits(state.edits));
function layerRows() {
  return Array.from(document.querySelectorAll('[data-workbench-id]'));
}
window.workbenchBounds = (id) => {
  const node = layerRows().find((el) => el.dataset.workbenchId === id);
  if (!node) return null;
  const r = node.getBoundingClientRect();
  return [r.left / innerWidth, r.top / innerHeight, r.width / innerWidth, r.height / innerHeight];
};
window.workbenchHitTest = (time, x, y) => {
  const px = x * innerWidth,
    py = y * innerHeight;
  return layerRows()
    .reverse()
    .filter((node) => {
      const r = node.getBoundingClientRect();
      return (
        !node.hidden &&
        node.style.visibility !== 'hidden' &&
        px >= r.left &&
        py >= r.top &&
        px < r.right &&
        py < r.bottom
      );
    })
    .map((node) => node.dataset.workbenchId);
};
async function videoFrame(node, target) {
  node.muted = true;
  node.pause();
  if (node.error) throw Error('视频无法解码：' + node.dataset.workbenchId);
  if (node.readyState >= 2 && !node.seeking && Math.abs(node.currentTime - target) < 0.00001) return;
  await new Promise((resolve, reject) => {
    const done = (error) => {
      clearTimeout(timeout);
      for (const name of ['seeked', 'loadeddata', 'error']) node.removeEventListener(name, event);
      error ? reject(error) : resolve();
    };
    const event = (e) => {
      if (e.type === 'error') done(Error('视频素材不可用'));
      else if (node.readyState >= 2 && !node.seeking) done();
    };
    const timeout = setTimeout(() => done(Error('视频取帧超时')), 12000);
    for (const name of ['seeked', 'loadeddata', 'error']) node.addEventListener(name, event);
    node.currentTime = target;
  });
}
const originalRender = window.render;
if (typeof originalRender === 'function') {
  window.render = async (time) => {
    await loaded;
    await originalRender(time);
    await Promise.all(
      layerRows().map(async (node) => {
        const start = Number(node.dataset.start || 0),
          duration = Number(node.dataset.duration || Infinity);
        const visible =
          window.workbenchVisible(node.dataset.workbenchId) && time >= start && time < start + duration;
        node.style.visibility = visible ? '' : 'hidden';
        if (visible && node instanceof HTMLVideoElement)
          await videoFrame(node, time - start + Number(node.dataset.mediaStart || 0));
      }),
    );
  };
}
