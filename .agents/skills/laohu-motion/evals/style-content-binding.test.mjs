import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {adaptStyleCodeContent, STYLE_CONTENT_ADAPTER_MANIFEST} from '../templates/adapters/style-content-adapter.mjs';
import {prepareStyleCodeSpec, __test as remotionTest} from '../templates/adapters/video-shotcraft-remotion.mjs';

const skillRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repoRoot=path.resolve(skillRoot,'../../..');
const stylesRoot=path.join(skillRoot,'templates/styles');
const tmpRoot=path.join(repoRoot,'.cache/tmp/direction-music-upgrade/direction/style-adapter-tests');
const index=JSON.parse(await fs.readFile(path.join(stylesRoot,'compatibility-index.json'),'utf8'));
const catalog=JSON.parse(await fs.readFile(path.join(skillRoot,'templates/catalog.json'),'utf8'));
const consumer=catalog.templates.find((row)=>row.id==='laohu-style-code-canvas');
const digest=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');

const f1Content={title:'项目完成比例',data:[{label:'启动',value:12},{label:'实施',value:37},{label:'验收',value:56}]};
const f2Content={
  nodes:[{key:'我',x:.5,y:.55},{key:'爸爸',x:.2,y:.3},{key:'妈妈',x:.8,y:.3},{key:'团队',x:.5,y:.85}],
  edges:[{from:'爸爸',to:'我',label:'支持',at:1},{from:'妈妈',to:'我',label:'担心',at:1.8},{from:'我',to:'团队',label:'协作',at:3.2}],
  focalKey:'我',highlightLabel:'支持',
};

async function filmFixture({content=f2Content,durationSec=10,contentSource=true}={}){
  await fs.mkdir(tmpRoot,{recursive:true});
  const dir=await fs.mkdtemp(path.join(tmpRoot,'film-'));
  const contentBytes=Buffer.from(`${JSON.stringify(content,null,2)}\n`);
  await fs.writeFile(path.join(dir,'content.json'),contentBytes);
  const source=contentSource?{path:'content.json',sha256:digest(contentBytes)}:undefined;
  const segment={
    id:'relation',renderer:'video-shotcraft-remotion',compositionGroupId:'single',
    startSec:0,endSec:durationSec,sourceCatalogId:consumer.id,
    componentPath:consumer.component.path,componentSha256:consumer.component.sha256,
    exportName:consumer.component.exportName,sourceCommit:catalog.styleLibrary.compatibilitySourceCommit,
    fidelityMode:'native-props',layers:[{id:'style-layer',catalogId:consumer.id,props:{styleId:'F2',content,...(source?{contentSource:source}:{})}}],
  };
  const blueprint={format:'laohu.huashu-film-blueprint/2',width:1920,height:1080,fps:30,
    clock:{kind:'film-global',durationSec},segments:[segment],
    compositionGroups:[{id:'single',segmentIds:['relation']}],transitionEdges:[]};
  const blueprintPath=path.join(dir,'film.json');
  await fs.writeFile(blueprintPath,JSON.stringify(blueprint,null,2));
  return {dir,blueprint,blueprintPath};
}

test('the explicit compatibility index keeps 25 callable A–G functions, excludes B3, and binds F1/F2 adapters',async()=>{
  const rows=index.entries.filter((row)=>row.category==='A-G_代码样片');
  assert.equal(rows.length,25);
  const callable=rows.filter((row)=>row.route?.kind==='remotion-canvas-function'&&row.route.callable===true);
  assert.equal(callable.length,25);
  assert.ok(!rows.some((row)=>row.id==='B3'), 'B3 has no drawing function and is excluded from the callable compatibility index');
  const parentConsumers=[];
  for(const row of callable){
    const bytes=await fs.readFile(path.join(stylesRoot,row.contentPath));
    assert.equal(digest(bytes),row.sourceSha256,`${row.id} source bytes changed`);
    const source=bytes.toString('utf8');
    if(/\bPARENT\b/.test(source)) parentConsumers.push(row.id);
  }
  assert.deepEqual(parentConsumers,['A1']);
  assert.deepEqual(Object.keys(STYLE_CONTENT_ADAPTER_MANIFEST.styles).sort(),['F1','F2']);
  assert.ok(callable.filter((row)=>!['A1','F1','F2'].includes(row.id)).every((row)=>row.route.callable));
});

test('F1 adapts only title and dataset literals and retains original source bytes',async()=>{
  const row=index.entries.find((entry)=>entry.id==='F1');
  const source=await fs.readFile(path.join(stylesRoot,row.contentPath),'utf8');
  const originalHash=digest(Buffer.from(source));
  const fence=source.match(/^```(?:js|javascript)\s*\n([\s\S]*?)\n```\s*$/m)[1];
  const result=adaptStyleCodeContent({styleId:'F1',sourceCode:fence,sourceSha256:row.sourceSha256,content:f1Content});
  assert.equal(result.demoMode,false);
  assert.deepEqual(result.consumedContentFields,['title','data[].label','data[].value']);
  assert.strictEqual(result.consumedContentFields,STYLE_CONTENT_ADAPTER_MANIFEST.styles.F1.contentCapability.consumedContentFields);
  assert.equal(STYLE_CONTENT_ADAPTER_MANIFEST.styles.F1.contentCapability.schema.properties.data.minItems,2);
  assert.equal(STYLE_CONTENT_ADAPTER_MANIFEST.styles.F1.contentCapability.schema.properties.data.items.properties.value.maximum,60);
  assert.match(result.code,/V = \[12,37,56\]/);
  assert.match(result.code,/N = \["启动","实施","验收"\]/);
  assert.match(result.code,/项目完成比例/);
  assert.match(result.code,/const tm = t % 8\.5/);
  assert.equal(digest(await fs.readFile(path.join(stylesRoot,row.contentPath))),originalHash);
});

test('F2 adapts nodes, edges, focal key and unique warm edge while retaining original drawing/timing code',async()=>{
  const row=index.entries.find((entry)=>entry.id==='F2');
  const source=await fs.readFile(path.join(stylesRoot,row.contentPath),'utf8');
  const fence=source.match(/^```(?:js|javascript)\s*\n([\s\S]*?)\n```\s*$/m)[1];
  const result=adaptStyleCodeContent({styleId:'F2',sourceCode:fence,sourceSha256:row.sourceSha256,content:f2Content});
  assert.equal(result.demoMode,false);
  assert.strictEqual(result.consumedContentFields,STYLE_CONTENT_ADAPTER_MANIFEST.styles.F2.contentCapability.consumedContentFields);
  assert.equal(STYLE_CONTENT_ADAPTER_MANIFEST.styles.F2.contentCapability.schema.properties.edges.uniqueUndirectedNodePair,true);
  assert.equal(STYLE_CONTENT_ADAPTER_MANIFEST.styles.F2.contentCapability.schema.properties.nodes.minimumCenterDistancePx,186);
  assert.match(result.code,/const Nd = \{"我":\[0\.5,0\.55\],"爸爸":\[0\.2,0\.3\]/);
  assert.match(result.code,/const warm = lab === "支持"/);
  assert.match(result.code,/const me = k === "我"/);
  assert.match(result.code,/const tm = t % 10/);
  assert.match(result.code,/setLineDash\(\[5, 5\]\)/);
  assert.match(result.code,/me \? '#f1b25c'/);
  assert.equal(result.adaptation.patches.length,4);
});

test('progressive catalog binds reused Chinese originals and translated Chinese views to actual files',async()=>{
  const indexBytes=await fs.readFile(path.join(stylesRoot,'index.json'));
  const formal=JSON.parse(indexBytes.toString('utf8'));
  const command=spawnSync('python3',[path.join(skillRoot,'scripts/laohu-styles.py'),'catalog'],{cwd:repoRoot,encoding:'utf8',maxBuffer:16*1024*1024});
  assert.equal(command.status,0,`${command.stdout}\n${command.stderr}`);
  const delivered=JSON.parse(command.stdout);
  assert.equal(delivered.entryCount,formal.entries.length);
  assert.equal(delivered.entries.length,formal.entries.length);
  assert.deepEqual(Object.keys(delivered.entries[0]).sort(),['catalog','fullTextEntry','id','name','sourceSet']);
  assert.equal(delivered.entries.some((row)=>Object.hasOwn(row,'sourcePath')||Object.hasOwn(row,'sourceSha256')||Object.hasOwn(row,'translationSourcePath')),false,
    'the reader-facing catalog must not repeat full binding metadata');

  const reused=formal.entries.find((row)=>row.id==='original:art-deco');
  assert.equal(reused.translationStatus,'reviewed-zh-source');
  assert.equal(reused.contentPath,reused.sourcePath);
  assert.equal(reused.translationSourcePath,'.agents/skills/laohu-motion/templates/runtime/laohu-showreel/references/styles/art-deco.md');
  assert.equal(reused.translationSourceSha256,reused.sourceSha256);
  assert.equal(reused.localSha256,reused.translationSha256);
  const reusedPath=path.resolve(stylesRoot,reused.contentPath);
  assert.equal(digest(await fs.readFile(reusedPath)),reused.localSha256);
  const reusedView=delivered.entries.find((row)=>row.id===reused.id);
  assert.ok(reusedView);
  assert.match(reusedView.fullTextEntry,/input-candidate/);
  await assertCatalogEvidence(reused,reusedView,reusedPath);

  const translated=formal.entries.find((row)=>row.id==='new:caption-news');
  assert.equal(translated.translationStatus,'translated-reviewed');
  assert.equal(translated.contentPath,'zh-CN/caption-news.md');
  assert.equal(translated.translationSourcePath,'.agents/skills/laohu-motion/templates/styles/entries/caption-news.md');
  assert.notEqual(translated.sourceSha256,translated.translationSourceSha256,
    'upstream attribution hash must remain distinct from the locally reviewed source hash');
  const translatedPath=path.resolve(stylesRoot,translated.contentPath);
  const translationSource=path.resolve(repoRoot,translated.translationSourcePath);
  assert.equal(digest(await fs.readFile(translationSource)),translated.translationSourceSha256);
  assert.equal(digest(await fs.readFile(translatedPath)),translated.translationSha256);
  const translatedView=delivered.entries.find((row)=>row.id===translated.id);
  assert.ok(translatedView);
  assert.match(translatedView.fullTextEntry,/input-candidate/);
  await assertCatalogEvidence(translated,translatedView,translatedPath);
});

async function assertCatalogEvidence(indexRow,deliveredRow,contentPath){
  const source=await fs.readFile(contentPath,'utf8');
  const lines=source.split(/\r?\n/u);
  assert.deepEqual(Object.keys(deliveredRow.catalog).sort(),['actions','cameraSpaceChange','expressionEmotion','fit','fusion','limitations','visual']);
  for(const [field,item] of Object.entries(indexRow.catalog)){
    const visible=deliveredRow.catalog[field];
    assert.equal(visible.summary,item.summary,`${indexRow.id}:${field} summary`);
    assert.ok(Array.isArray(visible.evidence));
    for(const proof of item.evidence){
      assert.ok(proof.lineStart>=1&&proof.lineEnd>=proof.lineStart&&proof.lineEnd<=lines.length,`${indexRow.id}:${field} evidence range`);
      assert.ok(lines.slice(proof.lineStart-1,proof.lineEnd).join('\n').includes(proof.quote),`${indexRow.id}:${field} evidence quote`);
      assert.ok(visible.evidence.some((row)=>row.lineStart===proof.lineStart&&row.lineEnd===proof.lineEnd&&row.quote===proof.quote));
    }
  }
}

test('adapter fails closed on stale source, unsupported IDs, unknown fields, invalid F1 values, and missing/ambiguous F2 emphasis',async()=>{
  const row1=index.entries.find((entry)=>entry.id==='F1');
  const text1=await fs.readFile(path.join(stylesRoot,row1.contentPath),'utf8');
  const code1=text1.match(/^```(?:js|javascript)\s*\n([\s\S]*?)\n```\s*$/m)[1];
  assert.throws(()=>adaptStyleCodeContent({styleId:'F1',sourceCode:code1,sourceSha256:'0'.repeat(64),content:f1Content}),/source fulltext hash/);
  assert.throws(()=>adaptStyleCodeContent({styleId:'A2',sourceCode:code1,sourceSha256:row1.sourceSha256,content:f1Content}),/no source-preserving structured content adapter/);
  assert.throws(()=>adaptStyleCodeContent({styleId:'F1',sourceCode:code1,sourceSha256:row1.sourceSha256,content:{...f1Content,script:'alert(1)'}}),/not supported/);
  assert.throws(()=>adaptStyleCodeContent({styleId:'F1',sourceCode:code1,sourceSha256:row1.sourceSha256,content:{...f1Content,data:[{label:'空',value:0},{label:'零',value:0}]}}),/at least one positive/);
  assert.throws(()=>adaptStyleCodeContent({styleId:'F1',sourceCode:code1,sourceSha256:row1.sourceSha256,content:{...f1Content,data:[{label:'负值',value:-1},{label:'正值',value:2}]}}),/finite integer/);
  const row2=index.entries.find((entry)=>entry.id==='F2');
  const text2=await fs.readFile(path.join(stylesRoot,row2.contentPath),'utf8');
  const code2=text2.match(/^```(?:js|javascript)\s*\n([\s\S]*?)\n```\s*$/m)[1];
  assert.throws(()=>adaptStyleCodeContent({styleId:'F2',sourceCode:code2,sourceSha256:row2.sourceSha256,content:{...f2Content,highlightLabel:null}}),/highlightLabel/);
  assert.throws(()=>adaptStyleCodeContent({styleId:'F2',sourceCode:code2,sourceSha256:row2.sourceSha256,content:{...f2Content,edges:[...f2Content.edges,{from:'妈妈',to:'团队',label:'支持',at:4}]}}),/exactly one edge label/);
  assert.throws(()=>adaptStyleCodeContent({styleId:'F2',sourceCode:code2,sourceSha256:row2.sourceSha256,content:{...f2Content,edges:[...f2Content.edges,{from:'我',to:'不存在',label:'错误',at:4}]}}),/existing node keys/);
});

test('prepare API marks A1 parent text, F1/F2 structured content, and fixed demos as distinct states',async()=>{
  const parent=await prepareStyleCodeSpec({styleId:'A1',parentText:'父层提供的旁白材料'});
  assert.equal(parent.contentBinding.status,'parent-text-consumed');
  assert.equal(parent.contentBinding.demoMode,false);
  assert.deepEqual(parent.contentBinding.consumedFields,['parentText']);
  const bound=await prepareStyleCodeSpec({styleId:'F2',parentText:'父层提供的旁白材料',content:f2Content});
  assert.equal(bound.contentBinding.status,'structured-content-bound');
  assert.equal(bound.contentBinding.demoMode,false);
  assert.deepEqual(bound.contentBinding.consumedFields,['nodes[].key','nodes[].x','nodes[].y','edges[].from','edges[].to','edges[].label','edges[].at','focalKey','highlightLabel']);
  assert.deepEqual(bound.contentBinding.ignoredFields,['parentText']);
  assert.deepEqual(bound.spec.content,f2Content);
  assert.match(bound.spec.code,/const warm = lab === "支持"/);
  const demo=await prepareStyleCodeSpec({styleId:'A2'});
  assert.equal(demo.contentBinding.status,'fixed-demo-content');
  assert.equal(demo.contentBinding.demoMode,true);
});

test('Film /2 compiles structured F2 into the catalog consumer, records source evidence, and rejects demos/short clocks/stale JSON',async(t)=>{
  const fixture=await filmFixture();
  t.after(()=>fs.rm(fixture.dir,{recursive:true,force:true}));
  const schedule=await remotionTest.compileFilmV2(fixture.blueprint,fixture.blueprintPath,catalog);
  const row=schedule.rows[0];
  const layer=row.layers[0];
  assert.equal(row.sourceVerification.sourceId,'laohu-style-library');
  assert.equal(row.sourceVerification.sourceCommit,catalog.styleLibrary.compatibilitySourceCommit);
  assert.equal(layer.catalogId,'laohu-style-code-canvas');
  assert.equal(layer.props.canvasCodeSpec.styleId,'F2');
  assert.equal(layer.props.contentBinding.demoMode,false);
  assert.equal(layer.props.contentBinding.status,'structured-content-bound');
  assert.equal(layer.props.contentBinding.contentSource.path,'content.json');
  assert.match(layer.props.contentBinding.contentSha256,/^[a-f0-9]{64}$/);
  assert.match(layer.props.contentSource.sha256,/^[a-f0-9]{64}$/);
  assert.notEqual(layer.props.contentBinding.contentSha256,layer.props.contentSource.sha256,'canonical consumed-content hash is separate from raw JSON-file SHA');
  assert.match(layer.props.canvasCodeSpec.code,/const warm = lab === "支持"/);
  const noContent=structuredClone(fixture.blueprint);
  noContent.segments[0].layers[0].props={styleId:'F2'};
  await assert.rejects(remotionTest.compileFilmV2(noContent,fixture.blueprintPath,catalog),/require structured content/);
  const short=structuredClone(fixture.blueprint);
  short.clock.durationSec=9.9;short.segments[0].endSec=9.9;
  await assert.rejects(remotionTest.compileFilmV2(short,fixture.blueprintPath,catalog),/complete 300-frame source clock/);
  const stale=structuredClone(fixture.blueprint);
  stale.segments[0].layers[0].props.contentSource.sha256='0'.repeat(64);
  await assert.rejects(remotionTest.compileFilmV2(stale,fixture.blueprintPath,catalog),/does not match the content JSON bytes/);
});
