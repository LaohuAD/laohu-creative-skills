import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { importInput } from '../templates/runtime/production-workbench/materials.mjs';
import { readSetup, snapshot, workbenchModel } from '../templates/runtime/production-workbench/model.mjs';

test('progress follows selected designs, current clip usage and SRT chapter planning', async t => {
  const cache = fileURLToPath(new URL('../../../../.cache/tmp/', import.meta.url));
  mkdirSync(cache,{recursive:true});
  const root = mkdtempSync(path.join(cache,'material-views-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  function put(name,value) {
    const file=path.join(root,name);
    mkdirSync(path.dirname(file),{recursive:true});
    writeFileSync(file,typeof value==='string'?value:JSON.stringify(value));
  }
  const model=()=>{ const setup=readSetup(root); return workbenchModel(root,setup,snapshot(root,setup),{}); };
  const original=await importInput(root,'source.wav',Readable.from([Buffer.from('original')]));
  put('timeline.js','export const DUR=2,FPS=30,SHOTS=[{id:"part",t0:0,t1:2}];');
  put('index.html','<canvas></canvas>');
  put('captions.srt','1\n00:00:00,000 --> 00:00:01,000\n第一句\n');
  put('visual/current.png','reference'); put('visual/earlier.png','earlier');
  put('assets/part.wav','processed');
  put('.showreel-progress/workbench.json',{chapterPlan:[{id:'one',title:'开场',firstCue:1,lastCue:1}],
    covers:[{file:'visual/earlier.png',name:'过往方案'}],framePlan:[{id:'part',time:1,title:'关键时点'}]});
  put('.showreel-input-delivery.json',{keyframeSet:{artifacts:[{
    path:'visual/current.png',frame:{event:'part',source:'reference',timeSeconds:1,role:'design'},
  }]}});
  put('assets/workbench/clips.json',{clips:[
    {id:'picture',kind:'animation',t0:0,t1:2},{id:'sound',kind:'sfx',file:'assets/part.wav',sourceFiles:[original],t0:0,t1:1},
  ]});
  let m=await model();
  assert.equal(m.materials.designFrames[0].source,'reference');
  assert.equal(m.implementationFrames[0].id,'part');
  assert.deepEqual(m.materials.inputs[0].uses,['sound']);
  assert.equal(m.chapterAxis[0].bound,false);
  assert.equal(m.chapterAxis[0].t1,1);
  assert.deepEqual(m.materials.history.map(x=>x.name),['过往方案']);
  put('assets/clip-state.json',{edits:{picture:{deleted:true},sound:{hidden:true}}});
  m=await model();
  assert.deepEqual(m.materials.inputs[0].uses,[]);
  assert.deepEqual(m.materials.sound.sfx,[]);
  assert.deepEqual(m.materials.designFrames,[]);
  assert.deepEqual(m.implementationFrames,[]);
  assert.ok(m.materials.history.some(x=>x.href==='/project/visual/current.png'));
});
