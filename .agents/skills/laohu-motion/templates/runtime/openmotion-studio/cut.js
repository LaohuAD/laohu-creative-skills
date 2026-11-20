import { productionReview, renderScene, waitForScene } from './progress-review.js';
const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
const action = (text, fn) => {
  const b = el('button', text);
  b.type = 'button';
  b.onclick = fn;
  return b;
};
const types = { animation: '动画', video: '视频', voice: '人声', music: '音乐', sfx: '音效' };
const tone = { animation: '#add5a2', video: '#a9c5da', voice: '#e2c69a', music: '#bdaedb', sfx: '#91c9c5' };
const audioKind = (c) => ['voice', 'music', 'sfx'].includes(c.kind);
const label = (c) => types[c.kind] + ' ' + String(c.number).padStart(2, '0');
const stamp = (t) => {
  const cs = Math.round(t * 100);
  return (
    [Math.floor(cs / 6000), Math.floor(cs / 100) % 60].map((n) => String(n).padStart(2, '0')).join(':') +
    '.' +
    String(cs % 100).padStart(2, '0')
  );
};
const sceneUrl = (file) => '/__scene/' + file.split('/').map(encodeURIComponent).join('/');
let cut,
  model,
  selected,
  time = 0,
  playing = false,
  starting = false,
  picking = false,
  playbackGeneration = 0,
  loop = null,
  framePending = false,
  paintVersion = 0,
  ready = false,
  busy = false,
  panel = '',
  noticeTimer;
let progressRevision = '',
  cutRevision = '',
  clockStart = 0;
let sceneLoad;
const collapsed = new Set();
const edit = (c) => cut.edits[c.id] || {};
const start = (c) => c.t0 + (edit(c).offset || 0),
  end = (c) => c.t1 + (edit(c).offset || 0);
const selectedClip = () => cut?.clips.find((c) => c.id === selected);
const getScene = () => $('scene').contentWindow;
async function json(url, opts) {
  const r = await fetch(url, { cache: 'no-store', ...opts });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || '请求失败');
  return data;
}
function report(message, keep = false) {
  clearTimeout(noticeTimer);
  $('notice').textContent = message;
  $('notice').hidden = false;
  if (!keep) noticeTimer = setTimeout(() => ($('notice').hidden = true), 3500);
}
function fit() {
  if (!model) return;
  const [w, h] = model.size.split('x').map(Number),
    m = $('monitor'),
    scale = Math.min(m.clientWidth / w, m.clientHeight / h);
  $('scene').style.cssText =
    'width:' + w + 'px;height:' + h + 'px;transform:translate(-50%,-50%) scale(' + scale + ')';
}
function selectionOutline() {
  const c = selectedClip(),
    outline = $('outline');
  outline.hidden =
    !ready ||
    playing ||
    !c ||
    audioKind(c) ||
    edit(c).deleted ||
    edit(c).hidden ||
    time < start(c) ||
    time >= end(c);
  if (outline.hidden) return;
  const b = getScene().workbenchBounds?.(c.id, time) || c.bounds || [0, 0, 1, 1];
  const rect = $('scene').getBoundingClientRect(),
    host = $('monitor').getBoundingClientRect();
  Object.assign(outline.style, {
    left: rect.left - host.left + b[0] * rect.width + 'px',
    top: rect.top - host.top + b[1] * rect.height + 'px',
    width: b[2] * rect.width + 'px',
    height: b[3] * rect.height + 'px',
  });
  outline.firstElementChild.textContent = label(c) + ' · ' + c.title;
}
async function draw() {
  paintVersion++;
  if (!ready || framePending) return;
  const loading = sceneLoad;
  framePending = true;
  try {
    let last;
    do {
      last = paintVersion;
      await renderScene(getScene(), time, model.fps);
    } while (!loading.signal.aborted && last !== paintVersion);
  } catch (e) {
    if (!loading.signal.aborted) {
      stop();
      report('工程预览：' + e.message, true);
    }
  } finally {
    if (!loading.signal.aborted) {
      framePending = false;
      selectionOutline();
    }
  }
}
function clock(follow = false) {
  $('clock').textContent = stamp(time);
  const head = $('head'),
    body = $('tracks'),
    gutter = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--label'));
  if (head) {
    const px = gutter + ((body.offsetWidth - gutter) * time) / model.duration;
    head.style.left = px + 'px';
    const sc = $('scroll');
    if (follow && (px < sc.scrollLeft + gutter || px > sc.scrollLeft + sc.clientWidth - 5))
      sc.scrollLeft = Math.max(0, px - gutter - 50);
  }
}
function seek(t, follow = true) {
  time = Math.min(Math.max(0, t), Math.max(0, model.duration - 1 / model.fps));
  $('mix').currentTime = time;
  clockStart = performance.now() - time * 1000;
  clock(follow);
  void draw();
}
function stop() {
  playbackGeneration++;
  playing = false;
  selectionOutline();
  $('mix').pause();
  starting = false;
  $('play').classList.remove('is-playing');
  $('play').setAttribute('aria-label', '播放');
}
function tick(generation) {
  if (!playing || generation !== playbackGeneration) return;
  time = $('mix').currentSrc ? $('mix').currentTime : (performance.now() - clockStart) / 1000;
  if (loop && (time >= loop[1] || $('mix').ended)) {
    const [from, until] = loop;
    loop = null;
    stop();
    seek(Math.max(from, until - 1 / model.fps));
    return;
  }
  if (time >= model.duration || $('mix').ended) {
    stop();
    return;
  }
  clock(true);
  void draw();
  requestAnimationFrame(() => tick(generation));
}
async function play() {
  if (!ready) {
    report('工程画面正在加载');
    return;
  }
  if (playing || starting) {
    stop();
    return;
  }
  const generation = ++playbackGeneration;
  starting = true;
  setPicking(false);
  silenceLibrary();
  if ($('mix').ended || time >= model.duration - 1 / model.fps) seek(loop?.[0] || 0);
  if ($('mix').getAttribute('src')) {
    try {
      await $('mix').play();
    } catch (e) {
      if (generation === playbackGeneration) { stop(); report('混音未能播放：' + e.message); }
      return;
    }
  }
  if (generation !== playbackGeneration) return;
  clockStart = performance.now() - time * 1000;
  playing = true;
  starting = false;
  $('play').classList.add('is-playing');
  $('play').setAttribute('aria-label', '暂停');
  tick(generation);
}
function replay(a, b) {
  stop();
  loop = [a, b];
  seek(a);
  void play();
}
function choose(c, { jump = true } = {}) {
  if (!c) return;
  setPicking(false);
  loop = null;
  selected = c.id;
  if (jump) {
    stop();
    seek(start(c));
  }
  $('hitmenu').hidden = true;
  for (const n of document.querySelectorAll('.clip')) n.classList.toggle('active', n.dataset.id === c.id);
  controls();
  selectionOutline();
  remember(c);
}
async function remember(c) {
  try {
    await json('/__workbench/selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: cut.revision, id: c.id, time }),
    });
  } catch (e) {
    report('选中位置未能同步：' + e.message);
  }
}
function controls() {
  const c = selectedClip(),
    gone = c && edit(c).deleted;
  $('selected').textContent = c ? label(c) + ' · ' + c.title : '选择片段';
  $('selected').title = $('selected').textContent;
  $('hide').disabled = busy || !c || gone;
  $('remove').disabled = busy || !c;
  $('audition').disabled = !c || gone;
  $('undo').disabled = busy || !cut?.canUndo;
  $('redo').disabled = busy || !cut?.canRedo;
  $('hide').textContent = c && edit(c).hidden ? '启用' : c && audioKind(c) ? '静音' : '隐藏';
  $('remove').textContent = gone ? '放回原位' : '移除';
}
function peaks(c) {
  if (!c.peaks?.length) return null;
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg'),
    p = document.createElementNS(ns, 'path');
  svg.setAttribute('viewBox', '0 0 ' + c.peaks.length + ' 20');
  svg.setAttribute('preserveAspectRatio', 'none');
  const max = Math.max(...c.peaks, 0.001);
  p.setAttribute(
    'd',
    c.peaks.map((n, i) => 'M' + (i + 0.5) + ' ' + (10 - (9 * n) / max) + 'v' + (18 * n) / max).join(' '),
  );
  p.setAttribute('stroke', 'currentColor');
  svg.append(p);
  return svg;
}
function pack(rows) {
  const lanes = [];
  for (const c of rows.toSorted((a, b) => start(a) - start(b) || a.number - b.number)) {
    let lane = lanes.find((l) => end(l.at(-1)) <= start(c) + 1e-8);
    if (!lane) {
      lane = [];
      lanes.push(lane);
    }
    lane.push(c);
  }
  return lanes;
}
function timeline() {
  if (!cut || !model || !model.duration) return;
  const host = $('tracks'),
    sc = $('scroll'),
    gutter = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--label'));
  const zoom = Number($('zoom').value) || model.duration,
    span = Math.min(zoom, model.duration);
  host.replaceChildren();
  host.style.width = gutter + ((sc.clientWidth - gutter) * model.duration) / span + 'px';
  let tickSize = span <= 12 ? 1 : span <= 35 ? 5 : span <= 100 ? 10 : 60;
  host.style.setProperty('--grid', (100 * tickSize) / model.duration + '%');
  function row(name, count, group, cls) {
    const r = el('div', undefined, 'row ' + (cls || '')),
      l = group
        ? action((collapsed.has(group) ? '▸ ' : '▾ ') + name, () => {
            collapsed.has(group) ? collapsed.delete(group) : collapsed.add(group);
            timeline();
          })
        : el('span', name);
    l.className = 'track-label';
    if (group) l.setAttribute('aria-expanded', String(!collapsed.has(group)));
    if (count !== null) l.append(el('small', String(count)));
    const lane = el('div', undefined, 'lane');
    r.append(l, lane);
    host.append(r);
    lane.onclick = (e) => {
      loop = null;
      stop();
      const rect = lane.getBoundingClientRect();
      seek(((e.clientX - rect.left) / rect.width) * model.duration, false);
    };
    return lane;
  }
  const ruler = row('时间', null, null, 'ruler');
  let scrub = false;
  const scrubAt = (e) => {
    const rect = ruler.getBoundingClientRect();
    loop = null;
    stop();
    seek(((e.clientX - rect.left) / rect.width) * model.duration, false);
  };
  ruler.onpointerdown = (e) => {
    scrub = true;
    ruler.setPointerCapture(e.pointerId);
    scrubAt(e);
  };
  ruler.onpointermove = (e) => {
    if (scrub) scrubAt(e);
  };
  ruler.onpointerup = ruler.onpointercancel = () => {
    scrub = false;
  };
  for (let t = 0; t < model.duration; t += tickSize) {
    const n = el('span', stamp(t).slice(0, 5));
    n.style.left = (100 * t) / model.duration + '%';
    ruler.append(n);
  }
  function placement(n, c) {
    n.style.left = (100 * start(c)) / model.duration + '%';
    n.style.width = (100 * (end(c) - start(c))) / model.duration + '%';
    n.style.setProperty('--tone', tone[c.kind]);
  }
  function summaries(l, cs) {
    for (const c of cs) {
      const n = el('i', undefined, 'summary');
      placement(n, c);
      l.append(n);
    }
  }
  function group(kind, name) {
    const cs = cut.clips.filter((c) => c.kind === kind && !edit(c).deleted),
      l = row(name, cs.length, kind);
    if (collapsed.has(kind)) {
      summaries(l, cs);
      return;
    }
    const lanes = pack(cs);
    lanes.forEach((items, i) => {
      const ln = i === 0 ? l : row(name + ' · 子轨 ' + (i + 1), null, null);
      for (const c of items) {
        const n = action('', (e) => {
          e.stopPropagation();
          choose(c);
        });
        n.className = 'clip';
        n.dataset.id = c.id;
        n.classList.toggle('off', !!edit(c).hidden);
        n.classList.toggle('active', selected === c.id);
        const text = label(c) + ' · ' + c.title;
        n.setAttribute('aria-label', text + (edit(c).hidden ? ' · 已关闭' : ''));
        n.title = text + '　' + stamp(start(c)) + ' – ' + stamp(end(c));
        placement(n, c);
        n.append(el('b', String(c.number).padStart(2, '0'), 'clip-num'));
        if (c.thumbnail) {
          const pic = el('img');
          pic.src = sceneUrl(c.thumbnail);
          pic.alt = '';
          pic.loading = 'lazy';
          n.append(pic);
        }
        if (((end(c) - start(c)) / span) * (sc.clientWidth - gutter) < 35) n.classList.add('tiny');
        const wave = peaks(c);
        if (wave) n.append(wave);
        n.append(el('span', c.title));
        ln.append(n);
      }
    });
  }
  group('animation', '动画');
  group('video', '原生视频');
  const sounds = cut.clips.filter((c) => audioKind(c) && !edit(c).deleted),
    al = row('音频', sounds.length, 'audio');
  summaries(al, sounds);
  if (!collapsed.has('audio')) {
    group('voice', '人声');
    group('music', '音乐');
    group('sfx', '音效');
  }
  const head = el('div', undefined, 'playhead');
  head.id = 'head';
  host.append(head);
  clock();
}
let libraryTab, importing = false;
function silenceLibrary() {
  $('solo').pause();
  for (const media of $('library-body').querySelectorAll('audio,video')) media.pause();
}
function libraryPreview(item, row) {
  const show = action('预览', async () => {
    const old = item.querySelector('.library-preview');
    if (old) { old.remove(); return; }
    const ext = row.href.split('.').pop().toLowerCase();
    const tag = /^(mp4|m4v|mov|webm)$/.test(ext) ? 'video' : /^(mp3|wav|flac|m4a|aac|ogg)$/.test(ext) ? 'audio' : /^(srt|txt|md|json)$/.test(ext) ? 'pre' : 'img';
    const n = el(tag, undefined, 'library-preview'); item.append(n);
    if (tag === 'pre') {
      try { const r=await fetch(row.href); if (!r.ok) throw Error(); n.textContent=await r.text(); }
      catch { n.textContent='文件暂时无法读取'; }
    } else {
      if (tag === 'img') n.alt = row.name || '';
      else { n.controls=true; n.preload='metadata'; n.onplay=()=>{stop(); $('solo').pause();}; }
      n.src=row.href;
    }
  });
  item.append(show);
}
function renderCaptions() {
  $('drawer').hidden = !panel;
  $('captions').setAttribute('aria-expanded', String(Boolean(panel)));
  if (!panel) return;
  const box = $('drawer-body'), previous = box.scrollTop;
  box.replaceChildren();
  for (const c of model.captions) {
    const item = el('div', undefined, 'item');
    item.append(action(stamp(c.t0) + '　' + c.text, () => {
      panel = '';
      renderCaptions();
      stop();
      loop = null;
      seek(c.t0);
    }));
    box.append(item);
  }
  box.scrollTop = previous;
}
function renderLibrary() {
  const box = $('library-body'), previous = box.scrollTop;
  box.replaceChildren();
  for (const button of document.querySelectorAll('.library-tabs button'))
    button.setAttribute('aria-pressed',String(libraryTab === button.dataset.tab));
  if (libraryTab === 'original') {
    const input=el('input'); input.type='file'; input.multiple=true; input.hidden=true;
    input.accept='.png,.jpg,.jpeg,.gif,.webp,.avif,.mp4,.mov,.m4v,.webm,.mp3,.wav,.flac,.ogg,.m4a,.aac,.txt,.srt';
    const add=action(importing ? '正在导入…' : '导入原始素材',()=>input.click()); add.disabled=importing;
    input.onchange=async()=>{
      const files=[...input.files]; if (!files.length || importing) return;
      importing=true; add.disabled=true; add.textContent='正在导入…'; let count=0;
      try {
        for (const f of files) {
          await json('/__workbench/input',{method:'POST',headers:{'X-Input-Name':encodeURIComponent(f.name)},body:f}); count++;
        }
        report('已导入 '+count+' 个素材');
      } catch(e) { report('已完成 '+count+' 个。'+e.message,true); }
      finally { importing=false; await refresh(); renderLibrary(); }
    };
    box.append(add,input);
    if (!model.materials.inputs.length) box.append(el('p','暂无原始素材'));
    for (const a of model.materials.inputs) {
      const item=el('div',undefined,'item'); item.append(el('strong',a.name),el('p',a.uses.length ? '本版已调用 '+a.uses.length+' 次' : '已入库 · 本版未调用'));
      libraryPreview(item,a); box.append(item);
    }
  } else if (libraryTab === 'history') {
    if (!model.materials.history.length && !cut.clips.some(c=>edit(c).deleted)) box.append(el('p','暂无历史记录'));
    for (const a of model.materials.history) {
      const item=el('div',undefined,'item'); item.append(el('strong',a.name),el('p',[a.kind,a.date && a.date.slice(0,10)].filter(Boolean).join(' · ')));
      libraryPreview(item,a); box.append(item);
    }
    for (const c of cut.clips.filter(c=>edit(c).deleted)) {
      const item=el('div',undefined,'item'); item.append(el('strong',label(c)+' · '+c.title),el('p','已从时间轴移除'),action('放回原位',()=>change('restore',c)));
      if(c.file||c.thumbnail) libraryPreview(item,{name:c.title,href:sceneUrl(c.file||c.thumbnail)}); box.append(item);
    }
  } else {
    const assets = Map.groupBy(cut.clips.filter(c=>!edit(c).deleted), (c) => c.assetId || c.file || c.id);
    for (const a of cut.assets || [])
      if (!assets.has(a.id)) {
        const item = el('div', undefined, 'item');
        item.append(el('strong', a.title), el('p', '尚未放入剪辑'));
        if (a.file) {
          libraryPreview(item,{name:a.title,href:sceneUrl(a.file)});
        }
        box.append(item);
      }
    if (!assets.size && !cut.assets?.length) box.append(el('p','暂无处理后素材'));
    for (const uses of assets.values()) {
      const c = uses[0],
        item = el('div', undefined, 'item');
      if (c.thumbnail) {
        const img = el('img');
        img.src = sceneUrl(c.thumbnail);
        img.alt = '';
        img.loading = 'lazy';
        item.append(img);
      }
      item.append(el('strong', c.title), el('p', types[c.kind] + ' · ' + (c.t1 - c.t0).toFixed(2) + ' 秒'));
      for (const u of uses) {
        item.append(
          action(label(u) + (edit(u).hidden ? ' · 已关闭' : ' · ' + stamp(start(u))), () => choose(u)),
        );
      }
      if (!audioKind(c) && !edit(c).deleted)
        item.append(
          action('回放片段', () => {
            choose(c);
            replay(start(c), end(c));
          }),
        );
      if (audioKind(c) && c.file)
        item.append(
          action('试听素材', async () => {
            stop();
            $('solo').src = sceneUrl(c.file);
            try {
              await $('solo').play();
            } catch (e) {
              report(e.message);
            }
          }),
        );
      box.append(item);
    }
  }
  box.scrollTop = previous;
}
async function change(op, c, value) {
  if (busy) return;
  busy = true;
  controls();
  stop();
  report('正在应用剪辑…', true);
  try {
    await json('/__workbench/cut', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: cut.revision, id: c?.id, action: op, value }),
    });
    await refresh();
    if (selectedClip()) remember(selectedClip());
    report(
      {
        hide: '已关闭',
        show: '已启用',
        remove: '已从轨道移除',
        restore: '已放回原位',
        undo: '已撤销',
        redo: '已重做',
        shift: '已移动',
        gain: '已调整音量',
      }[op] + (c ? ' · ' + label(c) : ''),
    );
  } catch (e) {
    report(e.message, true);
    await refresh();
  } finally {
    busy = false;
    controls();
  }
}
function number(s) {
  if (/^\d+$/.test(s)) return +s;
  const d = '零一二三四五六七八九',
    n = s.replace('两', '二').split('十');
  return n.length === 1
    ? d.indexOf(s.replace('两', '二'))
    : (n[0] ? d.indexOf(n[0]) : 1) * 10 + (n[1] ? d.indexOf(n[1]) : 0);
}
function command(raw) {
  let text = raw
    .trim()
    .replace(/[，。、！？,!\s]/g, '')
    .replace(/\.$/, '')
    .replace(
      /[動畫號樂聲頻關閉隱顯刪銷復個遲啟靜調]/g,
      (ch) =>
        ({
          動: '动',
          畫: '画',
          號: '号',
          樂: '乐',
          聲: '声',
          頻: '频',
          關: '关',
          閉: '闭',
          隱: '隐',
          顯: '显',
          刪: '删',
          銷: '销',
          復: '复',
          個: '个',
          遲: '迟',
          啟: '启',
          靜: '静',
          調: '调',
        })[ch],
    );
  text = text
    .replace(/(动画|音乐|音效|视频|人声)(?:分类|轨道)(?:里面的|里的|中的|的)?/g, '$1')
    .replace(/第([零一二两三四五六七八九十0-9]+)(?:个|段|首)(动画|音乐|音效|视频|人声)/g, '$2$1号')
    .replace(/(动画|音乐|音效|视频|人声)片段(?:编号)?/g, '$1');
  if (/^(撤销|撤回|撤消)(上一步)?$/.test(text)) {
    void change('undo');
    return;
  }
  if (/^(重做|恢复上一步|撤销撤销)$/.test(text)) {
    void change('redo');
    return;
  }
  const ref =
    /(动画|原生视频|视频|人声|音乐|音效)(?:片段)?(?:第|编号)?(\d+|[一二两三四五六七八九十零]+)(?:号|段)?/;
  const m = text.match(ref);
  const c = m
    ? cut.clips.find((c) => types[c.kind] === m[1].replace('原生', '') && c.number === number(m[2]))
    : selectedClip();
  if (!c) {
    report('请点选片段或说出类别和编号');
    return;
  }
  if (m && c.id !== selected) choose(c);
  const verb = text
    .replace(m?.[0] || '', '')
    .replace(/^(请|把|将)+/, '')
    .replace(/(这个|这段|片段|一下|给我)/g, '');
  if (/^(隐藏|关闭|关掉|静音)$/.test(verb)) void change('hide', c);
  else if (/^(启用|显示|打开|取消隐藏|取消静音)$/.test(verb)) void change('show', c);
  else if (/^(移除|删除|删掉)$/.test(verb)) void change('remove', c);
  else if (/^(恢复|放回原位)$/.test(verb)) void change(edit(c).deleted ? 'restore' : 'show', c);
  else if (/^(播放|回放|看看|试听)$/.test(verb)) {
    choose(c);
    replay(start(c), end(c));
  } else if (/^(轻一点|小声一点|音量小一点|调低一点)$/.test(verb) && audioKind(c))
    void change('gain', c, Math.max(-60, (edit(c).db || 0) - 3));
  else if (!verb) choose(c);
  else {
    const shift = verb.match(/^(提前|推迟|延后|晚|早)(半|\d+(?:\.\d+)?|[一二两三四五六七八九十]+)秒(?:进|开始)?$/);
    const gain = verb.match(/^(?:音量|设为|音量设为)(-?\d+(?:\.\d+)?)(?:db|分贝)$/i);
    if (shift) {
      const n = shift[2] === '半' ? 0.5 : /^\d/.test(shift[2]) ? Number(shift[2]) : number(shift[2]);
      void change('shift', c, (/^(提前|早)$/.test(shift[1]) ? -1 : 1) * n);
    } else if (gain) void change('gain', c, Number(gain[1]));
    else {
      choose(c, { jump: false });
      report('片段已定位。复杂修改可在当前对话中描述，此指令尚未执行。', true);
    }
  }
}
let refreshTask;
function refresh() {
  if (refreshTask) return refreshTask;
  refreshTask = load().finally(() => (refreshTask = null));
  return refreshTask;
}
function loadScene(model, previousError) {
  sceneLoad?.abort();
  const loading = new AbortController();
  sceneLoad = loading;
  ready = framePending = false;
  stop();
  $('play').disabled = true;
  $('pick').hidden = true;
  const scene = $('scene');
  scene.onload = null;
  if (model.sceneInputError || !model.page) {
    scene.removeAttribute('src');
    if (model.sceneInputError) report('无法打开工程预览：' + model.sceneInputError, true);
    return;
  }
  scene.onload = async () => {
    try {
      const win = getScene();
      await waitForScene(win, loading.signal);
      if (loading.signal.aborted) return;
      win.applyWorkbenchEdits?.(cut.edits);
      ready = true;
      $('play').disabled = false;
      $('pick').hidden = !cut.clips.some(c => !audioKind(c));
      if (previousError && $('notice').textContent === '无法打开工程预览：' + previousError)
        $('notice').hidden = true;
      fit();
      void draw();
    } catch (e) {
      if (!loading.signal.aborted) report('无法打开工程预览：' + e.message, true);
    }
  };
  scene.src = sceneUrl(decodeURIComponent(model.page.substring('/project/'.length)));
}
async function load() {
  let [next, m] = await Promise.all([json('/__workbench/cut'), json('/__workbench/model')]);
  // The host uses UUID directories for a project throughout its lifetime, including after a rename.
  const title = m.title?.trim();
  const directoryId = /^[0-9a-f]{8}[0-9a-f]{4}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/i;
  m.title = title && !directoryId.test(title) ? title : '动画';
  if (!next && m.nativeStudio !== false) {
    next = { revision:'planning', clips:[], edits:{}, canUndo:false, mix:m.mix?.url ? decodeURIComponent(m.mix.url.slice('/project/'.length)) : null };
  }
  if (!next) next = { revision: 'planning', clips: [], edits: {}, canUndo: false, mix: null };
  $('mic').hidden = !m.dictation || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined';
  const previous = model;
  const first = !cut,
    changed = first || next.revision !== cutRevision,
    updated = first || m.revision !== progressRevision;
  if (!changed && !updated) {
    const activity = v=>JSON.stringify([v.tasks,v.editing]);
    const refresh = activity(m)!==activity(model);
    model = m;
    if (refresh && $('review').open) review.updateStatus();
    return;
  }
  const libraryChanged = changed || JSON.stringify([m.materials.inputs,m.materials.history]) !==
    JSON.stringify([model?.materials.inputs,model?.materials.history]);
  const oldMix = cut?.mixHash;
  cut = next;
  model = m;
  cutRevision = cut.revision;
  progressRevision = m.revision;
  if (!libraryTab) libraryTab = cut.clips.length || cut.assets?.length ? 'processed' : 'original';
  $('project').textContent = m.title;
  document.title = m.title === '动画' ? '动画工作台' : m.title + ' · 动画工作台';
  $('duration').textContent = '/ ' + stamp(m.duration);
  if (first || previous?.page !== m.page || previous?.sceneInputError !== m.sceneInputError ||
      previous?.sceneTextRevision !== m.sceneTextRevision || !changed && previous?.renderRevision !== m.renderRevision) {
    loadScene(m, previous?.sceneInputError);
  } else if (ready && changed) {
    getScene().applyWorkbenchEdits?.(cut.edits);
    void draw();
  }
  if (first || oldMix !== cut.mixHash) {
    const was = playing;
    stop();
    if (cut.mix) {
      $('mix').src = sceneUrl(cut.mix) + '?rev=' + encodeURIComponent(cut.mixHash || 'original');
      $('mix').currentTime = time;
    }
    if (was) void play();
  }
  const stage = m.stages.find((s) => s.id === m.activeStage);
  $('progress').textContent =
    '制作进度' + (stage ? ' · ' + (stage.id === 'motion' ? '动画制作' : stage.name) : '');
  timeline();
  controls();
  if (libraryChanged) renderLibrary();
  renderCaptions();
  if ($('review').open) review.update();
  fit();
}
function setPicking(value) {
  picking = value;
  $('pick').setAttribute('aria-pressed',String(value));
  $('monitor').classList.toggle('is-picking',value);
  $('play').setAttribute('aria-label',value ? '点选画面中的片段' : playing ? '暂停' : '播放');
  if (!value) $('hitmenu').hidden = true;
}
$('pick').onclick = () => { stop(); setPicking(!picking); };
function pickAt(e) {
  if (!ready) return;
  stop();
  const rect = $('scene').getBoundingClientRect(),
    x = (e.clientX - rect.left) / rect.width,
    y = (e.clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return;
  const hits = getScene().workbenchHitTest?.(time, x, y);
  const rows = cut.clips.filter(
    (c) =>
      !audioKind(c) &&
      !edit(c).hidden &&
      !edit(c).deleted &&
      start(c) <= time &&
      time < end(c) &&
      (Array.isArray(hits)
        ? hits.includes(c.id)
        : !c.bounds ||
          (x >= c.bounds[0] &&
            y >= c.bounds[1] &&
            x < c.bounds[0] + c.bounds[2] &&
            y < c.bounds[1] + c.bounds[3])),
  );
  if (rows.length === 1) {
    setPicking(false);
    choose(rows[0], { jump: false });
    report('已选 ' + label(rows[0]) + ' · ' + rows[0].title);
  } else if (rows.length) {
    const menu = $('hitmenu');
    menu.replaceChildren(...rows.map((c) => action(label(c) + ' ' + c.title, () => { setPicking(false); choose(c, { jump: false }); })));
    menu.hidden = false;
  } else report('当前位置没有可选画面片段');
}
$('form').onsubmit = (e) => {
  e.preventDefault();
  if (cut && !busy) command($('command').value);
};
$('hide').onclick = () => {
  const c = selectedClip();
  void change(edit(c).hidden ? 'show' : 'hide', c);
};
$('remove').onclick = () => {
  const c = selectedClip();
  void change(edit(c).deleted ? 'restore' : 'remove', c);
};
$('undo').onclick = () => change('undo');
$('redo').onclick = () => change('redo');
$('audition').onclick = () => {
  const c = selectedClip();
  replay(start(c), end(c));
};
$('play').onclick = e => {
  if (picking && e.detail) { pickAt(e); return; }
  setPicking(false);
  loop = null;
  void play();
};
for (const [id, d] of [
  ['back', -1],
  ['next', 1],
])
  $(id).onclick = () => {
    stop();
    seek(time + d / model.fps);
  };
for (const tab of document.querySelectorAll('.library-tabs button')) tab.onclick = () => {
  if (!model || tab.dataset.tab === libraryTab) return;
  silenceLibrary();
  libraryTab = tab.dataset.tab;
  renderLibrary();
  $('library-body').scrollTop = 0;
};
$('captions').onclick = () => {
  if (!model) return;
  panel = panel ? '' : 'captions';
  renderCaptions();
};
$('close').onclick = () => {
  panel = '';
  renderCaptions();
  $('solo').pause();
};
$('zoom').onchange = () => {
  timeline();
  clock(true);
};
const review = productionReview({ $, el, action, stamp, sceneUrl, getModel: () => model, getCut: () => cut, getTime: () => time });
$('progress').onclick = () => {
  if (!model) return;
  stop();
  panel = '';
  renderCaptions();
  setPicking(false);
  silenceLibrary();
  review.open();
};
const isMac = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform);
const shortcuts = {
  hide: 'Y', remove: isMac ? 'Delete / ⌫' : 'Delete', audition: 'Shift + Space', play: 'Space',
  undo: isMac ? '⌥ Z / ⌘ Z' : 'Ctrl + Z', redo: isMac ? '⌥ ⇧ Z / ⌘ ⇧ Z' : 'Ctrl + Shift + Z',
};
const keyNames = {
  hide: 'Y', remove: isMac ? 'Delete Backspace' : 'Delete', audition: 'Shift+Space', play: 'Space',
  undo: isMac ? 'Alt+Z Meta+Z' : 'Control+Z', redo: isMac ? 'Alt+Shift+Z Meta+Shift+Z' : 'Control+Shift+Z',
};
for (const [id, keys] of Object.entries(shortcuts)) {
  $(id).title = keys;
  $(id).setAttribute('aria-keyshortcuts', keyNames[id]);
  $(id).dataset.shortcut = keys.split(' / ')[0];
}
window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || $('review').open) return;
  if (e.key === 'Escape') {
    panel = '';
    renderCaptions();
    setPicking(false);
    silenceLibrary();
    return;
  }
  if (e.code === 'Space' && !e.shiftKey && e.target.closest?.('#library button,#library audio,#library video,#pick')) return;
  if (!cut || panel || e.target.isContentEditable || e.target.closest?.('input,textarea,select,[role="textbox"]')) return;
  const mod = e.ctrlKey || e.metaKey || e.altKey;
  let id;
  if ((e.code === 'KeyZ' || e.key.toLowerCase() === 'z') &&
      (e.ctrlKey && !e.altKey && !e.metaKey || isMac && !e.ctrlKey && e.altKey !== e.metaKey))
    id = e.shiftKey ? 'redo' : 'undo';
  else if (!mod && !e.shiftKey && (e.code === 'KeyY' || e.key.toLowerCase() === 'y')) id = 'hide';
  else if (!mod && !e.shiftKey && (e.key === 'Delete' || isMac && e.key === 'Backspace')) {
    if (selectedClip() && !edit(selectedClip()).deleted) id = 'remove';
    else return;
  } else if (!mod && e.code === 'Space') id = e.shiftKey ? 'audition' : 'play';
  if (!id) return;
  e.preventDefault();
  if (!e.repeat && !busy && !$(id).disabled) $(id).click();
});
let recorder, recordingTimer;
$('mic').onclick = async () => {
  if (recorder?.state === 'recording') {
    recorder.stop();
    return;
  }
  try {
    stop();
    $('solo').pause();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    try {
      recorder = new MediaRecorder(stream);
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      throw e;
    }
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      clearTimeout(recordingTimer);
      stream.getTracks().forEach((t) => t.stop());
      $('mic').textContent = '听写中';
      $('mic').disabled = true;
      $('mic').setAttribute('aria-pressed', 'false');
      try {
        const type = recorder.mimeType;
        const result = await json('/__workbench/dictate', {
          method: 'POST',
          headers: { 'Content-Type': type },
          body: new Blob(chunks, { type }),
        });
        if (!result.text) throw Error('没有识别到指令');
        $('command').value = result.text;
        command(result.text);
      } catch (e) {
        report(e.message, true);
      } finally {
        $('mic').textContent = '口述';
        $('mic').disabled = false;
      }
    };
    recorder.start();
    $('mic').textContent = '说完执行';
    $('mic').setAttribute('aria-pressed', 'true');
    recordingTimer = setTimeout(() => {
      if (recorder?.state === 'recording') recorder.stop();
    }, 30000);
  } catch (e) {
    report('麦克风未能启用，可使用输入框或系统听写。');
  }
};
window.addEventListener('pagehide', () => {
  if (recorder?.state === 'recording') {
    recorder.onstop = null;
    recorder.stream.getTracks().forEach((t) => t.stop());
  }
});
new ResizeObserver(() => {
  fit();
  timeline();
}).observe($('monitor'));
async function poll() {
  try {
    await refresh();
  } catch (e) {
    report('工作台：' + e.message, true);
  } finally {
    setTimeout(poll, 3500);
  }
}
void poll();
