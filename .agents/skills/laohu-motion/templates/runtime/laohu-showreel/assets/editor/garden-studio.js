const byId = id => document.getElementById(id);
const player = byId('garden-motion');
const stages = byId('stages-list');
const labels = {ready:'已就绪',review:'待评审',confirmed:'已确认',waiting:'待开始',running:'制作中',planned:'已计划',rework:'待修改',published:'已出帧',checking:'核验中',checked:'已核验',sample:'有小样',unconfirmed:'端点待确认'};
let ready = false, pending = null, revision = '', selectedKey = '', selectedName = '';
const timeText = value => {
  const n = Math.round(Math.max(0,value)*100);
  return String(Math.floor(n/6000)).padStart(2,'0')+':'+String(Math.floor(n/100)%60).padStart(2,'0')+'.'+String(n%100).padStart(2,'0');
};
function make(tag, text, cls) {
  const el = document.createElement(tag);
  if(text != null) el.textContent = text;
  if(cls) el.className = cls;
  return el;
}
function send(type, fields = {}) { player.contentWindow?.postMessage({type:'laohu-studio:'+type,...fields},location.origin); }
player.addEventListener('load',() => {ready=false;send('status');});
window.addEventListener('message',e=>{
  if(e.origin !== location.origin || e.source !== player.contentWindow) return;
  const data=e.data;
  if(!['laohu-studio:time','laohu-studio:ready'].includes(data?.type) || !Number.isFinite(data.time) || !(data.duration>0)) return;
  ready=true;
  byId('frame-clock').textContent=timeText(data.time)+' / '+timeText(data.duration);
  if(!selectedName) byId('selection').textContent='工程预览';
  if(pending!==null) {const time=pending;pending=null;send('seek',{time});}
});
send('status');
function stateTag(state) {
  return make('span',labels[state] || state,['tag', ['ready','published','confirmed','checked'].includes(state)?'available':['planned','rework','running','sample'].includes(state)?'pending':''].join(' '));
}
function marker(group,key,name,time,state) {
  const item=make('button',null,'item');
  item.type='button';item.dataset.key=key;
  item.append(make('span',timeText(time),'stamp'),make('span',name),stateTag(state));
  item.classList.toggle('selected',selectedKey===key);
  item.addEventListener('click',()=>{
    for(const old of stages.querySelectorAll('.selected'))old.classList.remove('selected');
    selectedKey=key;selectedName=name;item.classList.add('selected');
    byId('selection').textContent=name+' · '+(labels[state]||state);
    if(ready) send('seek',{time}); else {pending=time;send('status');}
  });
  group.append(item);
}
function evidence(group,name,href) {
  if(typeof href!=='string'||!href.startsWith('/project/'))return;
  const a=make('a',name);a.href=href;a.target='_blank';a.rel='noopener';group.append(a);
}
function draw(m) {
  const first=!stages.children.length;
  const opened=new Set([...stages.querySelectorAll('details[open]')].map(el=>el.dataset.id));
  const savedScroll=stages.scrollTop;
  const focused=document.activeElement?.dataset.key;
  byId('project-name').textContent=m.title;document.title=m.title+' · 制作工作台';
  const current=m.stages.find(row=>row.id===m.activeStage);
  byId('current-stage').textContent=current?'当前 · '+current.name:'制作流程';
  const frag=document.createDocumentFragment();
  for(const [idx,s] of m.stages.entries()){
    const group=make('details',null,'phase'); group.dataset.id=s.id;
    group.open=first?['code',m.activeStage].includes(s.id):opened.has(s.id);
    const heading=make('summary',(idx+1)+'. '+s.name); heading.append(stateTag(s.state));group.append(heading);
    if(s.note)group.append(make('p',s.note));
    if(s.id==='code') {
      for(const [i,f] of (m.framePlan||m.frames).entries())marker(group,'frame:'+f.id+':'+f.time,'第'+(i+1)+'帧 · '+f.title,f.time,f.state);
    } else if(s.id==='motion') {
      for(const [i,v] of m.segments.entries()){
        marker(group,'motion:'+v.id,'第'+(i+1)+'段 · '+v.left+' → '+v.right,v.t0,v.state);
        for(const probe of v.probes||[])evidence(group,'查看局部小样',probe.href);
      }
    } else if(s.id==='seams'){
      for(const v of m.seams)marker(group,'seam:'+v.id,v.title,v.time,v.state);
    } else if(s.id==='cover'){
      for(const v of m.covers)evidence(group,v.name,v.href);
    } else evidence(group,'查看阶段成果',s.href);
    frag.append(group);
  }
  stages.replaceChildren(frag);stages.scrollTop=savedScroll;
  if(focused)stages.querySelector('[data-key="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});
}
async function refresh(){
  try{
    const res=await fetch('/__workbench/model',{cache:'no-store'});
    if(!res.ok)throw Error();
    const m=await res.json();
    if(m.revision!==revision){draw(m);revision=m.revision;}
    byId('sync-note').textContent=m.sourceNote||'';
  }catch{byId('sync-note').textContent='制作进度连接中';}
  finally{setTimeout(refresh,3500);}
}
byId('toggle-progress').addEventListener('click',e=>{
  const plan=byId('plan');plan.hidden=!plan.hidden;e.currentTarget.setAttribute('aria-expanded',String(!plan.hidden));
});
refresh();
