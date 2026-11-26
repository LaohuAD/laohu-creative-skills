const el = id => document.getElementById(id);
const node = (tag, cls, text) => {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (text) element.textContent = text;
  return element;
};
const clamp = (x,min,max) => Math.max(min,Math.min(x,max));
const stateNames = {
  ready:'有成果', confirmed:'已确认', checked:'本版已核', checking:'核验中', waiting:'待验',
  review:'待对照', rework:'修订中', sample:'早期局部小样', unconfirmed:'待确认端点', published:'已发布',
};
// The familiar NLE 1-2-5 ruler steps and readable tick spacing follow OpenMotion
// Studio's timelineRulerGeometry.ts at d10c1c9985ec874625818a9628d06a111a8feae8.
const niceSteps = [.02,.05,.1,.2,.5,1,2,5,10,15,30,60,120,300,600,900,1800,3600];
const scene = el('scene'), monitor = el('monitor'), ruler = el('ruler'), dock = el('dock-scroll');
const audio = el('monitor-source'), waveTrack = el('voice-track'), playhead = el('playhead');
const query = new URLSearchParams(location.search);
let model = null, time = Math.max(0,Number(query.get('t')) || 0), pps = 1, playing = false;
let audioLoaded = '', audioSeek = null, origin, base, lastPaint = -1, raf = 0;
let pictureReady = false, drawing = false, pending = null, renderGeneration = 0;
let lastCue = null, activeFrame = null, activeSegment = null, activeSeam = null;
let waveId = '', pauseToScrub = null, waveData = null, refreshing = false;

function stamp(t, detailed = false) {
  const scaled = Math.max(0,Math.round(t*100));
  const mins = String(Math.floor(scaled/6000)).padStart(2,'0');
  const secs = String(Math.floor(scaled/100)%60).padStart(2,'0');
  return mins + ':' + secs + (detailed ? '.' + String(scaled%100).padStart(2,'0') : '');
}

function modelState(state, text) {
  const indicator = el('live-state');
  indicator.dataset.state = state;
  indicator.querySelector('span').textContent = text;
  const notice = el('preview-message');
  notice.hidden = state === 'ready';
  notice.textContent = text;
}

function setLink(id, href) {
  const link = el(id);
  link.hidden = !href;
  if (href) link.href = href;
}

function fitPreview() {
  const [w,h] = (model?.size || '1920x1080').split('x').map(Number);
  const ratio = Math.max(.001,Math.min((monitor.clientWidth-28)/w,(monitor.clientHeight-20)/h));
  const wrap = el('stage-wrap');
  wrap.style.width = w*ratio+'px'; wrap.style.height = h*ratio+'px';
  scene.style.width = w+'px'; scene.style.height = h+'px';
  scene.style.transform = 'scale('+ratio+')';
}

async function draw() {
  if (drawing || pending === null || !pictureReady) return;
  const generation = renderGeneration;
  const t = pending; pending = null; drawing = true;
  try {
    await scene.contentWindow.render(t);
    if (generation === renderGeneration) {
      scene.dataset.renderTime = String(t);
      scene.dispatchEvent(new CustomEvent('workbench-frame', { detail:t }));
    }
  } catch (error) {
    if (generation === renderGeneration) modelState('failed','当前工程帧读取失败 · '+error.message);
  } finally {
    drawing = false;
    if (pending !== null) requestAnimationFrame(draw);
  }
}

async function connectPicture() {
  pictureReady = false; el('play').disabled = true;
  const generation = ++renderGeneration;
  if (!model.page) {
    modelState('waiting','等候工程场景页'); scene.removeAttribute('src'); return;
  }
  modelState('loading','正在读取本版工程画面');
  const [width,height] = model.size.split('x');
  const requested = new URL(model.page + '?render=1&w='+width+'&h='+height+'&v='+model.renderRevision,location.href);
  scene.src = requested.href;
  try {
    const view = scene.contentWindow, deadline = performance.now()+15000;
    const connected = () => {
      try { return view.location.href === requested.href && typeof view.render === 'function'; }
      catch { return false; }
    };
    while (!connected() && generation === renderGeneration && performance.now()<deadline) {
      await new Promise(resolve => setTimeout(resolve,60));
    }
    if (generation !== renderGeneration) return;
    if (!connected()) throw new Error('场景尚未提供 render(t)');
    let timeout;
    try {
      await Promise.race([
        Promise.resolve(view.ready).then(() => view.document.fonts.ready),
        new Promise((_,reject) => { timeout = setTimeout(() => reject(new Error('字体或场景加载超时')),15000); }),
      ]);
    } finally { clearTimeout(timeout); }
    if (generation !== renderGeneration) return;
    pictureReady = true; el('play').disabled = false;
    const verified = model.duration > 0 && Number.isFinite(view.DUR) && Math.abs(model.duration-view.DUR) < .001;
    if (!model.duration && Number.isFinite(view.DUR)) { model.duration = view.DUR; sizeTracks(); paint(); }
    modelState('ready',verified ? '连到本版 render(t)' : '连到工程 render(t)');
    pending = time; await draw(); fitPreview();
  } catch (error) {
    if (generation !== renderGeneration) return;
    const binding = /caption manifest|caption cue|missing from brief|caption text|display window/i.test(error.message);
    modelState('failed',binding ? '等待字幕清单与 Brief 文字登记同步' : '场景未就绪 · '+error.message.slice(0,160));
    el('preview-message').title = error.message.slice(0,800);
  }
}

function showCue() {
  const cue = model.captions.find(row => row.t0 <= time && time < row.t1);
  if (cue === lastCue) return;
  lastCue = cue;
  for (const item of el('captions-track').children) item.classList.toggle('active',item.dataset.cue === cue?.id);
  el('cue-label').textContent = cue ? 'SRT ' + cue.id : '当前位置字幕';
  el('cue-text').textContent = cue ? cue.text.replaceAll('\n',' / ') : '无字幕';
  el('cue-text').title = cue?.text || '';
}

function reveal(t = time, center = false) {
  const gutter = ruler.offsetLeft, viewport = Math.max(140,dock.clientWidth-gutter);
  const target = t * pps;
  if (center) dock.scrollLeft = Math.max(0,target-viewport*.35);
  else if (target > dock.scrollLeft+viewport-18) dock.scrollLeft = target-viewport*.82;
  else if (target < dock.scrollLeft+2) dock.scrollLeft = Math.max(0,target-14);
}

function paint(follow = false) {
  if (!model) return;
  el('timecode').textContent = stamp(time,true);
  el('duration').textContent = '/ ' + stamp(model.duration,true);
  ruler.setAttribute('aria-valuenow',time.toFixed(3));
  ruler.setAttribute('aria-valuetext',stamp(time,true));
  playhead.style.transform = 'translateX('+(time*pps)+'px)';
  el('scene-name').textContent = model.shots.find(shot => shot.t0 <= time && time < shot.t1)?.title || '';
  showCue();
  if (follow) reveal();
  if (Math.abs(time-lastPaint) < .000001) return;
  lastPaint = time; pending = time;
  if (pictureReady) requestAnimationFrame(draw);
}

function alignAudio(t) {
  if (!audioLoaded) return;
  if (audio.readyState<1) { audioSeek = t; return; }
  const last = Number.isFinite(audio.duration) ? audio.duration : t;
  audio.currentTime = Math.min(t,last);
  audioSeek = null;
}

function seek(value, { revealTime = false } = {}) {
  if (!model || !Number.isFinite(value)) return;
  time = clamp(value,0,model.duration);
  alignAudio(time); base = time; origin = performance.now();
  paint();
  if (revealTime) reveal(time,true);
}

function stop() {
  if (!playing) return;
  playing = false;
  cancelAnimationFrame(raf);
  audio.pause();
  el('play').textContent = '▶'; el('play').setAttribute('aria-label','播放');
}

function tick(now) {
  if (!playing) return;
  const beforeVoiceEnd = audioLoaded && audio.readyState>0 && time<audio.duration-.003 && !audio.ended;
  if (beforeVoiceEnd && audio.paused && !audio.seeking) { stop(); return; }
  time = beforeVoiceEnd ? audio.currentTime : base+(now-origin)/1000;
  if (time >= model.duration) { seek(model.duration); stop(); return; }
  paint(true);
  raf = requestAnimationFrame(tick);
}

async function begin() {
  if (!pictureReady || !model?.duration || playing) return;
  if (time >= model.duration-.01) seek(0,{revealTime:true});
  base = time; origin = performance.now();
  playing = true;
  el('play').textContent = 'Ⅱ'; el('play').setAttribute('aria-label','暂停');
  try {
    if (audioLoaded) {
      if (audio.readyState<1) await new Promise((resolve,reject) => {
        audio.addEventListener('loadedmetadata',resolve,{once:true});
        audio.addEventListener('error',reject,{once:true});
      });
      alignAudio(time);
      if (time < audio.duration-.002) await audio.play();
    }
    if (playing) raf = requestAnimationFrame(tick);
  } catch { stop(); modelState('ready','画面已连接；监听音轨暂不可播'); }
}

function changeAudio() {
  const hadPlayback = playing;
  stop();
  const chosen = model?.[el('monitor-audio').value];
  const url = chosen ? chosen.url+'?v='+chosen.version : '';
  if (url !== audioLoaded) {
    audioLoaded = url; audioSeek = time;
    if (url) audio.src = url;
    else audio.removeAttribute('src');
    audio.load();
  }
  if (hadPlayback) void begin();
}

audio.addEventListener('loadedmetadata',() => alignAudio(audioSeek ?? time));
audio.addEventListener('ended',() => { base = Math.max(time,audio.currentTime); origin = performance.now(); });
audio.addEventListener('error',() => { if (audioLoaded && playing) stop(); });

function addLabel(div, word, tone) {
  const span = node('span','badge',word);
  span.dataset.state = tone;
  div.append(span);
}
function detail(title, detailText, links = [], tone = null) {
  const panel = el('selection');
  panel.hidden = false;
  const heading = node('h2',null,title);
  panel.replaceChildren(heading);
  if (tone) addLabel(panel,stateNames[tone] || tone,tone);
  if (detailText) panel.append(node('p',null,detailText));
  for (const entry of links) {
    const link = node('a',null,entry.name+' ↗'); link.href = entry.href; link.target = '_blank'; link.rel = 'noopener';
    panel.append(link);
  }
}

function makeTimelineItems() {
  const pct = value => (100*value/Math.max(model.duration,.001)).toFixed(6)+'%';
  const position = (button,t0,t1) => {
    button.style.left = pct(t0);
    if (t1 !== undefined) button.style.width = pct(t1-t0);
  };
  const userSeek = (button,value,action) => {
    button.type = 'button';
    button.addEventListener('click',() => { seek(value,{revealTime:false}); action?.(); });
    return button;
  };
  const captions = model.captions.map(cue => {
    const name = stamp(cue.t0,true)+'  '+cue.text;
    const button = node('button','clip caption',cue.text.split('\n')[0]);
    button.dataset.cue = cue.id;
    button.title = name; button.setAttribute('aria-label',name);
    position(button,cue.t0,cue.t1); return userSeek(button,cue.t0);
  });
  el('captions-track').replaceChildren(...captions);
  const frames = model.frames.map(frame => {
    const timeLabel = stamp(frame.time,true);
    const button = node('button','marker');
    button.append(node('span','frame-title',frame.title));
    button.dataset.frame = frame.id; button.dataset.state = frame.state;
    button.classList.toggle('active',activeFrame === frame.id);
    button.title = timeLabel+' '+frame.title+' · '+(stateNames[frame.state] || frame.state);
    button.setAttribute('aria-label',button.title);
    position(button,frame.time);
    return userSeek(button,frame.time,() => {
      activeFrame = frame.id;
      for (const item of el('frames-track').children) item.classList.toggle('active',item.dataset.frame === activeFrame);
      detail(frame.title,frame.role+' · '+timeLabel,frame.file ? [{name:'查看已发布的代码帧',href:frame.file}] : [],frame.state);
    });
  });
  el('frames-track').replaceChildren(...frames);
  const segments = model.segments.map(part => {
    const label = part.left+' → '+part.right;
    const button = node('button','clip segment',label);
    button.dataset.segment = part.id; button.dataset.state = part.state;
    button.classList.toggle('active',activeSegment === part.id);
    button.append(node('span','clip-note',stateNames[part.state] || part.state));
    button.title = label+' · '+(stateNames[part.state] || part.state);
    position(button,part.t0,part.t1);
    return userSeek(button,part.t0,() => {
      activeSegment = part.id;
      for (const item of el('segments-track').children) item.classList.toggle('active',item.dataset.segment === activeSegment);
      const sources = part.probes.map(p=>({name:'局部小样 '+stamp(p.t0,true)+'–'+stamp(p.t1,true),href:p.href}));
      if (part.proof) sources.unshift({name:'本版核验记录',href:part.proof});
      detail(label,stamp(part.t0,true)+'–'+stamp(part.t1,true)+(part.note ? ' · '+part.note : ''),sources,part.state);
    });
  });
  el('segments-track').replaceChildren(...segments);
  const seams = model.seams.map(point => {
    const button = node('button','marker seam');
    button.dataset.seam = point.id; button.dataset.state = point.state;
    button.classList.toggle('active',activeSeam === point.id);
    button.title = point.title+' · '+stamp(point.time,true)+' · '+(stateNames[point.state] || point.state);
    button.setAttribute('aria-label',button.title);
    position(button,point.time);
    return userSeek(button,point.time,() => {
      activeSeam = point.id;
      for (const item of el('seams-track').children) item.classList.toggle('active',item.dataset.seam === activeSeam);
      detail('接到 '+point.title,stamp(point.time,true)+(point.note ? ' · '+point.note : ''),point.proof ? [{name:'本版接缝记录',href:point.proof}] : [],point.state);
    });
  });
  el('seams-track').replaceChildren(...seams);
  const windows = (model.voice?.clips || []).map(clip => {
    const bar = node('span','voice-window');
    bar.style.left = pct(clip.t0); bar.style.width = pct(clip.t1-clip.t0);
    return bar;
  });
  waveTrack.replaceChildren(...windows);
  drawWave();
  buildCaptionList();
}

function buildCaptionList() {
  const list = model.captions.map(cue => {
    const button = node('button','caption-entry');
    button.type = 'button'; button.dataset.cue = cue.id;
    button.append(node('time',null,stamp(cue.t0,true)),node('span',null,cue.text));
    button.addEventListener('click',() => { el('captions-dialog').close(); seek(cue.t0,{revealTime:true}); });
    return button;
  });
  el('caption-list').replaceChildren(...list);
}

function updatePanels() {
  document.title = model.title+' · 制作工作台';
  el('project-title').textContent = model.title;
  el('project-spec').textContent = model.size.replace('x','×')+' · '+model.fps+' fps';
  setLink('chapters-link',model.chapters); setLink('final-link',model.exported);
  el('covers-btn').hidden = !model.covers.length;
  el('caption-list-btn').disabled = !model.captions.length;
  el('monitor-audio').querySelector('[value=voice]').disabled = !model.voice;
  el('monitor-audio').querySelector('[value=mix]').disabled = !model.mix;
  if (el('monitor-audio').selectedOptions[0]?.disabled) el('monitor-audio').value = model.voice ? 'voice' : model.mix ? 'mix' : 'silent';
  el('timeline-note').textContent = model.captions.length ? model.captions.length+' 条字幕 · '+model.frames.length+' 张代码帧' : '等候项目时间线';
  el('covers-gallery').replaceChildren(...model.covers.map(cover => {
    const figure = node('figure');
    const link = node('a');
    link.href=cover.href; link.target='_blank'; link.rel='noopener';
    const image = node('img'); image.src=cover.href; image.alt=cover.name; image.loading='lazy';
    link.append(image); figure.append(link,node('figcaption',null,cover.name));
    return figure;
  }));
  el('stages').replaceChildren(...model.stages.map(item => {
    const row = node('div','stage-row');
    row.classList.toggle('current',model.activeStage === item.id);
    row.dataset.stage = item.id;
    const heading = item.href ? node('a','stage-title',item.name) : node('span','stage-title',item.name);
    if (item.href) { heading.href = item.href; heading.target = '_blank'; heading.rel='noopener'; }
    row.append(heading); addLabel(row,stateNames[item.state] || item.state,item.state);
    const note = node('div','stage-note',item.note); note.title = item.note;
    row.append(note); return row;
  }));
}

function sizeTracks() {
  if (!model) return;
  const gutter = ruler.offsetLeft;
  const full = Math.max(200,dock.clientWidth-gutter-1);
  const windowSeconds = el('zoom').value === 'fit' ? model.duration : Number(el('zoom').value);
  pps = full/Math.max(.1,Math.min(model.duration || 1,windowSeconds || 1));
  const size = Math.max(full,pps*model.duration);
  const major = niceSteps.find(timeStep => timeStep*pps>=88) || niceSteps.at(-1);
  const minor = major*pps/4 > 7 ? major/4 : major/2;
  el('tracks').style.setProperty('--axis-width',size+'px');
  el('tracks').style.setProperty('--grid-step',minor*pps+'px');
  [...el('captions-track').children].forEach((item,i) => {
    item.classList.toggle('compact',(model.captions[i].t1-model.captions[i].t0)*pps < 36);
  });
  [...el('frames-track').children].forEach((item,i) => {
    const remaining = (model.frames[i+1]?.time ?? model.duration)-model.frames[i].time;
    item.style.maxWidth = Math.max(12,remaining*pps-2)+'px';
  });
  ruler.setAttribute('aria-valuemax',model.duration.toFixed(3));
  const ticks = [];
  for (let index=0; index<2000 && index*minor<=model.duration+.00001; index++) {
    const t=index*minor, strong=Math.abs(t/major-Math.round(t/major))<1e-9;
    const tick = node('span',strong?'tick major':'tick');
    tick.style.left=t*pps+'px';
    if (strong && size-t*pps>36) tick.append(node('strong',null,stamp(t)));
    ticks.push(tick);
  }
  ruler.replaceChildren(...ticks);
  paint();
}

async function fetchWave() {
  const key = model.voice?.version || '';
  if (key === waveId) return;
  waveId = key; waveData = null;
  if (!key) return;
  try {
    const res=await fetch('/__workbench/wave',{cache:'no-store'});
    if (!res.ok) throw new Error('wave');
    const data = await res.json();
    if (waveId === key) { waveData=data; drawWave(); }
  } catch {
    if (waveId === key) waveId = '';
  }
}
function drawWave() {
  waveTrack.querySelector('canvas')?.remove();
  if (!waveData?.peaks?.length || !model?.duration) return;
  const canvas = node('canvas');
  const { peaks, interval } = waveData;
  canvas.width = Math.min(16000, Math.ceil(model.duration/interval));
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  const loud = [...peaks].sort((a,b)=>a-b)[Math.floor(peaks.length*.965)] || .12;
  ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#69cdb4';
  const samplesPerPixel = (model.duration/interval)/canvas.width;
  for(let x=0; x<canvas.width; x++){
    const a=Math.floor(x*samplesPerPixel), b=Math.max(a+1,Math.ceil((x+1)*samplesPerPixel));
    let maximum = 0;
    for(let i=a; i<b && i<peaks.length; i++) maximum=Math.max(maximum,peaks[i]);
    if (maximum < .0008) continue;
    const height=Math.max(2,Math.min(64,Math.sqrt(maximum/loud)*45));
    ctx.fillRect(x,(72-height)/2,1,height);
  }
  waveTrack.insertBefore(canvas,waveTrack.firstChild);
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const res = await fetch('/__workbench/model'+(model ? '?if='+model.revision : ''),{cache:'no-store'});
    if (res.status === 304) { if (model?.voice && !waveData) void fetchWave(); return; }
    if (!res.ok) throw new Error('暂未读到新版文件');
    const value = await res.json();
    const reload = model?.renderRevision !== value.renderRevision || model?.size !== value.size;
    const audioChanged = !model || model.voice?.version !== value.voice?.version || model.mix?.version !== value.mix?.version;
    model=value; time=clamp(time,0,model.duration); lastCue=null; lastPaint=-1;
    updatePanels(); makeTimelineItems(); sizeTracks(); fitPreview();
    if (reload) connectPicture();
    if (audioChanged) changeAudio();
    if (model.voice && !waveData || waveId !== model.voice?.version) void fetchWave();
    el('refresh-state').textContent = '随项目更新';
  } catch (error) {
    el('refresh-state').textContent = error.message;
    if (!model) modelState('waiting','连接后即可拖动工程画面');
  } finally { refreshing=false; }
}

function pixelTime(event) {
  return (event.clientX-ruler.getBoundingClientRect().left)/pps;
}
ruler.addEventListener('pointerdown',event => {
  if (event.button!==0 || !model?.duration) return;
  pauseToScrub = playing;
  stop();
  ruler.setPointerCapture(event.pointerId);
  seek(pixelTime(event));
});
ruler.addEventListener('pointermove',event => { if (ruler.hasPointerCapture(event.pointerId)) seek(pixelTime(event)); });
function finishScrub(event) {
  if (!ruler.hasPointerCapture(event.pointerId)) return;
  ruler.releasePointerCapture(event.pointerId);
  if (pauseToScrub) void begin();
  pauseToScrub = null;
}
ruler.addEventListener('pointerup',finishScrub);
ruler.addEventListener('pointercancel',finishScrub);
waveTrack.addEventListener('click',event => seek(pixelTime(event)));
el('play').addEventListener('click',() => playing ? stop() : begin());
el('previous').addEventListener('click',() => seek(time-1/(model?.fps || 30)));
el('next').addEventListener('click',() => seek(time+1/(model?.fps || 30)));
el('zoom').addEventListener('change',() => { sizeTracks(); reveal(time,true); });
el('monitor-audio').addEventListener('change',changeAudio);
el('covers-btn').addEventListener('click',() => el('covers-dialog').showModal());
el('caption-list-btn').addEventListener('click',() => {
  el('captions-dialog').showModal();
  if (lastCue) el('caption-list').querySelector('[data-cue="'+CSS.escape(lastCue.id)+'"]')?.scrollIntoView({block:'nearest'});
});
for (const close of document.querySelectorAll('[data-close]')) close.addEventListener('click',() => close.closest('dialog').close());
document.addEventListener('keydown',event => {
  if (!model || event.target.closest('button,select,a,input,dialog') || event.altKey || event.metaKey || event.ctrlKey) return;
  if (event.key === ' ') { event.preventDefault(); if (playing) stop(); else void begin(); }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); seek(time+(event.key==='ArrowLeft' ? -1 : 1)*(event.shiftKey ? 1 : 1/model.fps));
    reveal();
  }
  if (event.target===ruler && (event.key==='Home' || event.key==='End')) {
    event.preventDefault(); seek(event.key==='End' ? model.duration : 0,{revealTime:true});
  }
});
new ResizeObserver(fitPreview).observe(monitor);
new ResizeObserver(sizeTracks).observe(dock);
el('play').disabled = true;
await refresh();
setInterval(refresh,2000);
