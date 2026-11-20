export async function waitForScene(win, signal) {
  // A module can still be waiting on project fonts after the iframe fires load.
  const deadline = performance.now() + 180_000;
  let legacy;
  while (!signal.aborted) {
    const ready = win.ready;
    if (typeof ready?.then === 'function' && ready !== legacy?.promise) {
      const state = {promise: ready, settled: false};
      legacy = state;
      Promise.resolve(ready).then(() => { state.settled = true; }, error => {
        state.error = error || Error('工程初始化失败');
      });
    }
    if (legacy?.error) throw legacy.error;
    if ((!legacy || legacy.settled) && typeof win.render === 'function' &&
        (win.READY === true || win.READY === undefined) && win.document.fonts?.status !== 'loading') return;
    if (performance.now() >= deadline) throw Error('等待工程画面准备超时');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  signal.throwIfAborted();
}

export function renderScene(win, time, fps) {
  return win.RENDER_CONTEXT === true ? win.render(time, {frameTime: time, fps}) : win.render(time);
}

// Stage navigation and all evidence share this dialog. Its preview owns a
// separate clock so inspecting a shot never moves the editing playhead.
export function productionReview({ $, el, action, stamp, sceneUrl, getModel, getCut, getTime }) {
  const dialog = $('review'), stages = $('review-stages'), detail = $('review-detail');
  const names = { motion: '分段动画制作' };
  const labels = {waiting:'待制作', running:'制作中', ready:'已生成', stopped:'待重试', partial:'部分已生成'};
  function indicator() {
    const icon = el('span', undefined, 'work-indicator');
    icon.setAttribute('role','img');
    return icon;
  }
  function paint(node, state) {
    node.dataset.workState = state;
    const icon = node.querySelector('.work-indicator');
    if (icon) { icon.setAttribute('aria-label',labels[state]); icon.title = labels[state]; }
    const label = node.querySelector('.work-label');
    if (label) label.textContent = labels[state];
  }
  function progressView(m,cut) {
    const active = c => !cut.edits[c.id]?.hidden && !cut.edits[c.id]?.deleted;
    const visuals = cut.clips.filter(c=>['animation','video'].includes(c.kind));
    const unitClips = u => visuals.filter(c=>u.clipIds?.includes(c.id) || c.scene===u.id || c.id===u.clipId);
    const units = (cut.units || m.units || m.shots).filter(u=>{
      const clips = unitClips(u);
      return !clips.length || clips.some(active);
    });
    const frames = [...m.materials.designFrames];
    for (const f of m.framePlan) {
      if (!f.file && !frames.some(x=>x.id===f.id) && !['published','confirmed'].includes(f.state)) frames.push(f);
    }
    const rows = {motion:units, cover:frames, ...m.materials.sound, chapters:m.chapterAxis, srt:m.captions,
      input:m.materials.inputs.filter(a=>a.uses.length).map(a=>({...a,id:a.file}))};
    const tasks = [...(m.tasks || [])];
    if (m.editing) {
      const edit = m.editing;
      const matching = edit.stage==='motion' && units.find(u=>unitClips(u).some(c=>c.id===edit.clip));
      tasks.push({...edit,item:matching?.id || edit.item,status:'running'});
      if (edit.mix) tasks.push({stage:'mix',item:'',status:'running'});
    }
    const work = new Map(), parents = new Map();
    for (const stage of m.stages) {
      const records = new Map(tasks.filter(t=>t.stage===stage.id).map(t=>[t.item,t.status]));
      const entries = [...(rows[stage.id] || [])];
      for (const t of tasks.filter(t=>t.stage===stage.id && t.item && t.status!=='finish')) {
        if (!entries.some(r=>String(r.id)===t.item)) entries.push({id:t.item,title:t.title || t.item, upcoming:true});
      }
      rows[stage.id] = entries;
      const phases = new Map();
      for (const row of entries) {
        const id = String(row.id);
        let generated = !row.upcoming;
        if (stage.id === 'motion') generated = generated && (m.publishedShots?.includes(id) || Boolean(m.page && !m.draft &&
          (!row.timeState || row.timeState==='bound') && !row.issues?.length &&
          (unitClips(row).some(active) || m.shots.some(s=>s.id===id && s.t1>s.t0))));
        if (stage.id === 'cover') generated = Boolean(row.file && (m.projectPhase === 'explore' || m.implementationFrames.some(f=>f.id===row.id && f.time===row.time)));
        const task = records.get(id);
        phases.set(id,task==='running' || !task && row.state==='running' ? 'running' : task==='stop' ? 'stopped' : generated ? 'ready' : 'waiting');
      }
      work.set(stage.id,phases);
      const states = [...phases.values()], top = records.get('');
      const native = m.executionStages?.[stage.id];
      const generated = states.length ? states.every(v=>v==='ready') : Boolean(stage.href || stage.state==='ready');
      let state = generated ? 'ready' : states.includes('ready') ? 'partial' : 'waiting';
      if (top==='stop' || native==='failed' || states.includes('stopped')) state='stopped';
      if (native==='running' || top==='running' || states.includes('running')) state='running';
      parents.set(stage.id,state);
    }
    return {rows,work,parents,unitClips,active};
  }
  const range = (a, b) => Number.isFinite(a) && Number.isFinite(b) ? stamp(a) + ' – ' + stamp(b) : '时码待对齐';
  const chosen = new Map();
  let stageId, resourceKey, dispose = () => {};
  let comparisonMode, wipePosition = 50;
  function clearMedia() { dispose(); dispose = () => {}; }
  function scenePlayer(host, item, m, cut) {
    if (m.sceneInputError) {
      host.append(el('p', m.sceneInputError, 'review-note'));
      return;
    }
    const monitor = el('div', undefined, 'review-monitor'), frame = el('iframe');
    frame.title = '当前区间工程画面';
    frame.tabIndex = -1;
    if (item.onCanvas) frame.setAttribute('scrolling','no');
    monitor.append(frame);
    const sound = el('audio'), clock = el('output', stamp(item.from));
    const loading = new AbortController();
    let active = true, running = false, requesting = false, version = 0, current = item.from, origin = 0, raf;
    const paintClock = () => { clock.textContent = item.still ? stamp(current) : stamp(current) + ' / ' + stamp(item.to); };
    const play = action('', async () => {
      if (running || requesting) { pause(); return; }
      requesting = true;
      const token = ++version;
      try {
        if (current >= item.to - 1 / m.fps) current = item.from;
        if (sound.hasAttribute('src')) { sound.currentTime = current; await sound.play(); }
        if (!active || token !== version) return;
        origin = performance.now() - current * 1000;
        running = true;
        requesting = false;
        updateButton();
        await tick(token);
      } catch {
        if (active && token === version) { pause(); clock.textContent = '本段播放失败'; }
      }
    });
    function updateButton() {
      const label = running ? '暂停' : '播放本段';
      play.setAttribute('aria-label', label);
      play.title = label;
      if (item.onCanvas) play.classList.toggle('is-playing', running);
      else play.textContent = label;
    }
    function pause() {
      running = requesting = false;
      version++;
      cancelAnimationFrame(raf);
      sound.pause();
      updateButton();
    }
    async function tick(token) {
      if (!active || !running || token !== version) return;
      current = sound.hasAttribute('src') ? sound.currentTime : (performance.now() - origin) / 1000;
      const ended = current >= item.to || sound.ended;
      if (ended) { sound.pause(); current = Math.max(item.from, item.to - 1 / m.fps); }
      try { await renderScene(frame.contentWindow, current, m.fps); }
      catch { if (active && token === version) { pause(); clock.textContent = '工程暂时无法显示这一帧'; } return; }
      if (!active || token !== version) return;
      paintClock();
      if (ended) pause();
      else raf = requestAnimationFrame(() => tick(token));
    }
    const [w, h] = m.size.split('x').map(Number);
    frame.width = w; frame.height = h;
    const resize = new ResizeObserver(() => {
      frame.style.transform = 'translate(-50%, -50%) scale(' + Math.min(monitor.clientWidth / w, monitor.clientHeight / h) + ')';
    });
    resize.observe(monitor);
    const controls = el('div', undefined, 'review-player-controls');
    play.disabled = true; play.hidden = Boolean(item.still);
    updateButton();
    if (item.onCanvas) {
      host.classList.add('segment-player');
      host.style.setProperty('--segment-aspect', w + ' / ' + h);
      play.className = 'segment-surface';
      const icon = el('span', undefined, 'segment-icon');
      icon.setAttribute('aria-hidden','true');
      play.append(icon);
      clock.className = 'segment-clock';
      monitor.append(play,clock);
      host.append(monitor);
      clock.textContent = '正在加载片段…';
    } else {
      controls.append(play, clock); host.append(monitor, controls);
    }
    if (item.comparison) {
      controls.classList.add('frame-load-status');
      clock.textContent = '正在渲染工程画面…';
    }
    if (!item.still && cut.mix) sound.src = sceneUrl(cut.mix) + '?rev=' + encodeURIComponent(cut.mixHash || 'original');
    frame.onload = async () => {
      try {
        const win = frame.contentWindow;
        await waitForScene(win, loading.signal);
        if (loading.signal.aborted) return;
        win.applyWorkbenchEdits?.(cut.edits);
        await renderScene(win, current, m.fps);
        if (active) { play.disabled = false; paintClock(); if (item.comparison) controls.hidden = true; }
      } catch (error) { if (active) clock.textContent = error.message || '当前工程画面尚未就绪'; }
    };
    frame.src = '/__scene/' + m.page.slice('/project/'.length);
    dispose = () => { active = false; loading.abort(); pause(); resize.disconnect(); frame.onload = null; sound.removeAttribute('src'); sound.load(); };
  }
  function compareFrames(host, design, implementation, model, cut) {
    const compare = el('section', undefined, 'frame-comparison');
    const tools = el('div', undefined, 'compare-tools');
    const images = el('div', undefined, 'compare-images');
    const slider = el('input');
    slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.value = String(wipePosition);
    slider.setAttribute('aria-label', '拖动分界线比较设计与实现');
    const line = el('div', undefined, 'compare-divider');
    const mode = () => comparisonMode || 'pair';
    const pair = action('并排', () => { comparisonMode = 'pair'; layout(); });
    const wipe = action('叠图', () => { comparisonMode = 'wipe'; layout(); });
    const enlarge = action('', () => { dialog.classList.toggle('comparison-large'); layout(); });
    function layout() {
      const overlay = Boolean(implementation) && mode() === 'wipe';
      compare.classList.toggle('is-wipe', overlay);
      pair.setAttribute('aria-pressed', String(!overlay));
      wipe.setAttribute('aria-pressed', String(overlay));
      slider.hidden = line.hidden = !overlay;
      enlarge.textContent = dialog.classList.contains('comparison-large') ? '收回对照' : '放大对照';
    }
    slider.oninput = () => {
      wipePosition = Number(slider.value);
      images.style.setProperty('--split', wipePosition + '%');
      slider.setAttribute('aria-valuetext', '设计图显示至画面宽度的 ' + wipePosition + '%');
    };
    slider.oninput();
    tools.append(pair, wipe, enlarge);
    const target = el('figure', undefined, 'compare-design'), actual = el('figure', undefined, 'compare-implementation');
    const [w,h] = model.size.split('x').map(Number);
    images.style.setProperty('--frame-aspect', w + ' / ' + h);
    compare.style.setProperty('--frame-aspect-number', String(w/h));
    const targetScreen = el('div', undefined, 'compare-screen'), actualScreen = el('div', undefined, 'compare-screen');
    const photo = el('img'); photo.src = design.file; photo.alt = '设计帧 · ' + design.title;
    photo.onerror = () => { targetScreen.replaceChildren(el('span','设计图暂时无法读取')); };
    targetScreen.append(photo);
    target.append(el('figcaption','设计帧'),targetScreen);
    actual.append(el('figcaption','实现帧'),actualScreen);
    images.append(target,actual,line);
    const viewport = el('div', undefined, 'compare-viewport');
    viewport.append(images,slider);
    compare.append(tools,viewport);
    function drag(event) {
      const box = images.getBoundingClientRect();
      slider.value = String(Math.round(100*(event.clientX-box.left)/box.width));
      slider.oninput();
    }
    images.onpointerdown = event => {
      if (slider.hidden || event.button !== 0) return;
      images.setPointerCapture(event.pointerId);
      drag(event);
    };
    images.onpointermove = event => { if (images.hasPointerCapture(event.pointerId)) drag(event); };
    host.append(compare);
    if (implementation) {
      const at = Math.min(Math.round(implementation.time * model.fps) / model.fps, Math.max(0, model.duration - 1/model.fps));
      scenePlayer(actualScreen,{from:at, to:at+1/model.fps,still:true,comparison:true},model,cut);
    } else {
      actualScreen.append(el('span', '此时点的实现帧待就绪'));
      wipe.disabled = true;
    }
    layout();
  }
  function showFile(host, item) {
    const path = item.url, ext = path.split('?')[0].split('.').pop().toLowerCase();
    let node;
    if (/^(png|jpg|jpeg|webp|gif|avif|svg)$/.test(ext)) {
      node = el('img'); node.alt = item.name;
    } else if (/^(mp4|webm|mov|mp3|m4a|ogg|wav|aac|flac)$/.test(ext)) {
      node = el(/^(mp4|webm|mov)$/.test(ext) ? 'video' : 'audio');
      node.controls = true; if (Number.isFinite(item.db)) node.volume = Math.min(1,10**(item.db/20)); node.preload = 'metadata';
      dispose = () => { node.pause(); node.removeAttribute('src'); node.load(); };
    } else if (ext === 'html' && item.url === getModel().chapters) {
      node = el('iframe'); node.title = '章节播放器';
      // Chapter pages are generated by this project and require its scene runtime.
      node.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      node.src = '/__scene/' + path.slice('/project/'.length);
      node.onload = () => {
        node.contentDocument?.addEventListener('keydown', e => { if (e.key === 'Escape') dialog.close(); });
      };
      host.append(node); return;
    } else {
      const pre = el('pre', '正在读取…'), controller = new AbortController();
      host.append(pre);
      dispose = () => controller.abort();
      fetch(path, { signal: controller.signal }).then(async r => {
        if (!r.ok) throw Error('成果暂时无法读取');
        const raw = await r.text();
        if (ext === 'json') pre.textContent = JSON.stringify(JSON.parse(raw), null, 2);
        else pre.textContent = raw;
      }).catch(e => { if (!controller.signal.aborted) pre.textContent = e.message; });
      return;
    }
    node.onerror = () => { if (node.isConnected) host.append(el('p', '当前成果无法载入')); };
    node.src = path; host.append(node);
  }
  function render() {
    const oldMenu = detail.querySelector('.review-item-menu');
    const menuScroll = oldMenu?.scrollTop || 0;
    const menuFocused = oldMenu?.contains(document.activeElement);
    clearMedia();
    const m = getModel(), cut = getCut();
    const view = progressView(m,cut);
    const {unitClips,active} = view;
    const units = view.rows.motion;
    const stage = m.stages.find(s => s.id === stageId) || m.stages[0];
    if (!stage) { detail.textContent = '尚未登记制作步骤'; return; }
    stageId = stage.id;
    if (stage.id !== 'cover') dialog.classList.remove('comparison-large');
    stages.replaceChildren();
    for (const [i, s] of m.stages.entries()) {
      const b = action('', () => {
        if (stageId === s.id) return;
        stageId = s.id;
        resourceKey = '';
        render();
        bFocus(s.id);
      });
      b.dataset.stage = s.id; b.setAttribute('aria-current', String(s.id === stage.id));
      const marker = el('span', String(i + 1).padStart(2, '0'), 'step-marker');
      const title = el('span', names[s.id] || s.name);
      title.append(el('small', '', 'work-label'));
      b.append(marker, title, indicator()); stages.append(b);
    }
    stages.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    detail.replaceChildren();
    detail.scrollTop = 0;
    const header = el('div', undefined, 'review-heading');
    header.append(el('h3', names[stage.id] || stage.name), el('span', '', 'work-label'));
    const content = el('div', undefined, 'review-content');
    const preview = el('article', undefined, 'review-item-detail');
    preview.setAttribute('aria-label', '所选内容');
    content.append(preview);
    detail.append(header, content);
    const resources = [];
    function file(name, url, note) {
      if ((url?.startsWith('/project/') || url?.startsWith('/__scene/')) && !resources.some(r => r.url === url))
        resources.push({ name, url, note, key: url });
    }
    function live(name, from, to) {
      if (m.page && Number.isFinite(from) && to > from)
        resources.push({ name, from, to, onCanvas: stage.id === 'motion', key: 'live-' + from + '-' + to });
    }
    function picker(items, describe = () => ({})) {
      items = view.rows[stage.id] || items;
      if (!items.length) return;
      const entries = items.map(row => {
        const info = row.upcoming ? {} : describe(row);
        return {
          row, id: String(row.id ?? row.time), name: row.title || row.name,
          start: row.t0 ?? row.time, end: row.t1, number: row.number, ...info,
        };
      });
      const sortTime = e => Number.isFinite(e.start) ? e.start : Infinity;
      entries.sort((a,b) => sortTime(a) - sortTime(b) || (a.number ?? 0) - (b.number ?? 0));
      const selected = entries.find(e => e.id === chosen.get(stage.id)) || entries[0];
      chosen.set(stage.id, selected.id);
      const menu = el('nav', undefined, 'review-item-menu');
      menu.dataset.stageId = stage.id;
      menu.setAttribute('aria-label', stage.name + '条目');
      header.firstElementChild.append(el('small', entries.length + ' 项'));
      for (const [index, entry] of entries.entries()) {
        const button = action('', () => {
          if (chosen.get(stage.id) === entry.id) return;
          chosen.set(stage.id, entry.id); resourceKey = '';
          render();
          detail.querySelector('.review-item-menu [aria-current="true"]')?.focus({preventScroll:true});
        });
        button.dataset.item = entry.id;
        button.setAttribute('aria-current', String(entry === selected));
        const titleText = stage.id === 'cover' ? '第 '+(index+1)+' 帧' + (entry.name ? ' · '+entry.name : '') : entry.name;
        const title = el('span', titleText, 'review-item-name');
        const body = el('span', undefined, 'review-item-copy');
        if (Number.isInteger(entry.number)) title.prepend(el('b', String(entry.number).padStart(2,'0'), 'review-item-number'));
        body.append(title);
        const timeText = Number.isFinite(entry.end) ? range(entry.start, entry.end)
          : Number.isFinite(entry.start) ? stamp(entry.start) : '';
        if (timeText || entry.info) body.append(el('small', [timeText,entry.info].filter(Boolean).join(' · ')));
        if (entry.thumbnail) {
          const image = el('img'); image.alt = ''; image.loading = 'lazy'; image.src = entry.thumbnail; button.append(image);
        }
        button.append(body,indicator());
        menu.append(button);
      }
      menu.onkeydown = e => {
        const current = e.target.closest('button');
        if (!current || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        let next;
        if (e.key === 'ArrowDown') next = current.nextElementSibling;
        else if (e.key === 'ArrowUp') next = current.previousElementSibling;
        else if (e.key === 'Home') next = menu.firstElementChild;
        else if (e.key === 'End') next = menu.lastElementChild;
        else return;
        e.preventDefault();
        next?.click();
      };
      content.classList.add('with-items');
      content.prepend(menu);
      if (oldMenu?.dataset.stageId === stage.id) menu.scrollTop = menuScroll;
      const current = menu.querySelector('[aria-current="true"]');
      if (current.offsetTop < menu.scrollTop) menu.scrollTop = current.offsetTop;
      else if (current.offsetTop + current.offsetHeight > menu.scrollTop + menu.clientHeight)
        menu.scrollTop = current.offsetTop + current.offsetHeight - menu.clientHeight;
      if (menuFocused) current.focus({preventScroll:true});
      if (selected.row.upcoming) {
        const note = el('p','','review-note');
        note.dataset.awaitingResult = selected.id;
        preview.append(el('h4',selected.name),note);
        return;
      }
      return selected.row;
    }
    let prose = '', note = stage.note, sub = '';
    if (stage.id === 'motion') {
      preview.classList.add('segment-detail');
      const u = picker(units, row => {
        const uses = unitClips(row).filter(active);
        const primary = uses.find(c=>c.id===row.clipId) || uses.find(c=>c.scene===row.id) || uses[0];
        return {number:primary?.number, thumbnail:primary?.thumbnail && sceneUrl(primary.thumbnail),
          info:row.timeState==='planned' ? '计划' : row.timeState==='waiting' ? '待对齐' : ''};
      });
      if (u) {
        const fs = m.materials.designFrames.filter(f => u.directorText ? f.unitId === u.id || f.id === u.reuseFrameId : f.time >= u.t0 && f.time < u.t1);
        const seg = m.segments.find(v => u.directorText ? v.id === u.id : v.t0 === u.t0 && v.t1 === u.t1);
        sub = u.title;
        const badges = [range(u.t0, u.t1), seg?.state === 'checked' ? '✓ 整段已核验' : '整段待核验'];
        if (u.timeState && u.timeState !== 'bound') badges.push(u.timeState === 'planned' ? '计划时码' : '时码待对齐');
        note = badges.join('　·　');
        prose = [...new Set([u.description, u.directorText, ...(u.issues || []), !fs.some(f => f.file || f.artifacts?.length) && (u.frameReason || '关键设计帧待发布')].filter(Boolean))].join('\n\n');
        if ((!u.timeState || u.timeState === 'bound') && !m.draft) live('本段回放', u.t0, u.t1);
        for (const f of fs) file('关键设计帧 · '+f.title, f.file);
        file('整段核验记录', seg?.proof);
        for (const f of fs) if (!f.file && !f.artifacts?.length) prose += '\n计划帧　' + f.title + '　' + stamp(f.time);
      }
    } else if (stage.id === 'cover') {
      const f = picker(m.materials.designFrames, x => ({
        thumbnail:x.file,
        info:m.projectPhase === 'explore' ? !x.file ? '待发布' : m.directionConfirmationRecorded ? '已记录方向确认' : '设计帧已发布'
          : m.implementationFrames.some(y=>y.id===x.id && y.time===x.time) ? '' : '待实现',
      }));
      if (f) {
        const matched = m.implementationFrames.find(x=>x.id===f.id && x.time===f.time);
        preview.append(el('h4',f.title), el('p', stamp(f.time) + '　·　' +
          ({cover:'Cover 设计图',code:'程序设计图',reference:'对标参考图'}[f.source] || '设计参考'), 'review-note'));
        if (f.file) compareFrames(preview,f,matched,m,cut);
        else preview.append(el('p','等待设计帧生成','review-note'));
        note = m.projectPhase === 'explore' ? m.directionConfirmationRecorded ? '方向确认已记录 · 等候全片资料' : '方向探索 · 等候用户确认' : '';
      }
      for (const sample of m.directionSamples ?? []) file('播放方向样片 · '+range(sample.t0,sample.t1), sample.href, sample.title);
    } else if (stage.id === 'music' || stage.id === 'sfx' || stage.id === 'voice' && (view.rows.voice.length || cut.clips.some(c=>c.kind==='voice'))) {
      const c = picker(m.materials.sound[stage.id]);
      if (c) { sub = stage.name + ' ' + String(c.number).padStart(2,'0') + ' · ' + c.title;
        note = range(c.t0,c.t1); file('试听已处理片段',c.href); resources[0].db=c.db; }
    } else if (stage.id === 'chapters') {
      const c = picker(m.chapterAxis);
      if(c) { sub=c.title; note=range(c.t0,c.t1)+(c.bound ? '　·　成片时钟' : '　·　SRT 规划'); if(c.bound && !m.draft) live('章节回放',c.t0,c.t1); }
    } else if (stage.id === 'srt' && view.rows.srt.length) {
      const cue = picker(m.captions, x => ({name:x.text.split('\n')[0], number:Number(x.id)}));
      if (cue) {
        sub = '字幕 ' + cue.id;
        note = range(cue.t0, cue.t1);
        preview.append(el('blockquote', cue.text, 'review-cue'));
        if (!m.draft) live('回放这句字幕',cue.t0,cue.t1);
        file('完整 SRT', stage.href);
      }
    } else if (stage.id === 'input') {
      const inputs = m.materials.inputs.filter(a=>a.uses.length).map(a=>({...a,id:a.file}));
      const a = picker(inputs, x => {
        const times = cut.clips.filter(c=>x.uses.includes(c.id)).map(c=>c.t0+(cut.edits[c.id]?.offset||0));
        return {start: times.length ? Math.min(...times) : undefined, info:'调用 '+x.uses.length+' 次'};
      });
      if (a) { file(a.name,a.href); note='用于 '+a.uses.map(id=>{const c=cut.clips.find(x=>x.id===id);return c ? c.title : id;}).join('、'); }
    } else {
      if (view.rows[stage.id].length) picker(view.rows[stage.id]);
      if (stage.id === 'export' && m.finalReviewAudio) file('预听本版最终混音', m.finalReviewAudio);
      file('查看成果', stage.href);
      if (stage.id === 'mix' && cut.mixEdited) note = '已按片段修改重新混音，本版响度待复核。';
    }
    paintProgress(view,m);
    if (sub) preview.prepend(el('h4', sub));
    if (note) preview.append(el('p', note, 'review-note'));
    if (resources.length) {
      const tabs = el('div', undefined, 'resource-tabs'), media = el('div', undefined, 'review-media'), caption = el('p');
      const show = r => {
        clearMedia(); resourceKey = r.key;
        for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.key === r.key));
        media.classList.remove('segment-player');
        media.replaceChildren(); caption.textContent = r.note || ''; caption.hidden = !r.note;
        if (r.url) showFile(media, r); else scenePlayer(media, r, m, cut);
      };
      for (const r of resources) {
        const b = action(r.name, () => { if (resourceKey !== r.key) show(r); }); b.dataset.key = r.key; tabs.append(b);
      }
      if (stage.id === 'motion' && resources.length === 1) tabs.hidden = true;
      preview.append(tabs, media, caption);
      show(resources.find(r => r.key === resourceKey) || resources[0]);
    }
    if (prose && !resources.some(r => r.onCanvas)) preview.append(el('p',prose.trim(),'review-prose'));
    else if (prose) {
      const notes = el('details', undefined, 'segment-notes');
      notes.append(el('summary','片段说明'),el('p',prose.trim(),'review-prose'));
      preview.append(notes);
    }
  }
  function paintProgress(view,m) {
    const done = [...view.parents.values()].filter(s=>s==='ready').length;
    $('review-project').textContent = m.title+'　·　'+done+' / '+m.stages.length+' 步已生成';
    for (const b of stages.children) paint(b,view.parents.get(b.dataset.stage));
    paint(detail.querySelector('.review-heading'),view.parents.get(stageId));
    const states = view.work.get(stageId);
    for (const b of detail.querySelectorAll('[data-item]')) paint(b,states.get(b.dataset.item));
    const awaiting = detail.querySelector('[data-awaiting-result]');
    if (awaiting) awaiting.textContent = states.get(awaiting.dataset.awaitingResult)==='stopped'
      ? '本次制作已停止，等待重试。' : '制作中，结果生成后可在这里查看。';
  }
  function updateStatus() {
    const m=getModel(), view=progressView(m,getCut());
    const buttons=detail.querySelectorAll('[data-item]'), states=view.work.get(stageId);
    if (!states || states.size!==buttons.length || [...buttons].some(b=>!states.has(b.dataset.item))) render();
    else paintProgress(view,m);
  }
  function bFocus(id) { [...stages.children].find(b => b.dataset.stage === id)?.focus({ preventScroll: true }); }
  $('review-close').onclick = () => dialog.close();
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const b = dialog.getBoundingClientRect();
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    clearMedia(); dialog.classList.remove('comparison-large'); detail.replaceChildren(); $('progress').setAttribute('aria-expanded', 'false'); $('progress').focus();
  });
  return {
    update: render, updateStatus,
    open() {
      const m = getModel(), units = getCut().units || m.units || m.shots;
      if (!stageId) stageId = m.activeStage;
      if (!chosen.has('motion')) {
        const here = units.find(u => u.t0 <= getTime() && getTime() < u.t1);
        if (here) chosen.set('motion', here.id);
      }
      dialog.showModal(); $('progress').setAttribute('aria-expanded', 'true'); render();
    },
  };
}
