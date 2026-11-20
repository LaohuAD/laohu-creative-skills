import {useEffect,useState} from 'react';
import {cancelRender,continueRender,delayRender,staticFile} from 'remotion';
export type FontSpec={family:string;file:string;weight?:string;weightProbes?:string[];style?:string;stretch?:string};
const loads=new Map<string,Promise<void>>();
const gates=new Map<string,{promise:Promise<void>;ready:boolean}>();
function cssWeightNumber(value:string){
  const token=value.trim().toLowerCase();
  if(token==='normal')return 400;
  if(token==='bold')return 700;
  if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token))throw new Error(`invalid CSS font weight: ${value}`);
  const numeric=Number(token);
  if(numeric<1||numeric>1000)throw new Error(`CSS font weight must be between 1 and 1000: ${value}`);
  return numeric;
}
function weightEvidence(descriptor:string,requested:string[]|undefined){
  const parts=descriptor.trim().split(/\s+/);
  let min:number,max:number;
  if(parts.length===1){
    min=max=cssWeightNumber(parts[0]);
  }else if(parts.length===2){
    min=cssWeightNumber(parts[0]);max=cssWeightNumber(parts[1]);
    if(min>max)throw new Error(`invalid descending CSS font-weight range: ${descriptor}`);
  }else throw new Error(`invalid CSS font-weight descriptor: ${descriptor}`);
  const probes=parts.length===2
    ?[parts[0],parts[1],...(requested||[])]
    :(requested?.length?requested:[parts[0]]);
  const checks=[...new Set(probes.map((probe)=>{
    const numeric=cssWeightNumber(probe);
    if(numeric<min||numeric>max)throw new Error(`font-weight probe ${probe} is outside descriptor ${descriptor}`);
    return String(probe).trim();
  }))].map((weight)=>({weight,readyCheck:false}));
  return checks;
}
function load(spec:FontSpec){
  const key=JSON.stringify(spec);let promise=loads.get(key);
  if(!promise){promise=(async()=>{
    const weight=spec.weight??'400';
    const checks=weightEvidence(weight,spec.weightProbes);
    const face=new FontFace(spec.family,`url(${JSON.stringify(staticFile(spec.file))})`,{weight,style:spec.style??'normal',...(spec.stretch?{stretch:spec.stretch}:{})});
    document.fonts.add(await face.load());await document.fonts.ready;
    const quotedFamily=spec.family.replace(/["\\]/g,'\\$&');
    for(const check of checks){
      check.readyCheck=document.fonts.check(`${check.weight} 16px "${quotedFamily}"`);
    }
    const readyCheck=checks.length>0&&checks.every((check)=>check.readyCheck);
    if(face.status!=='loaded'||!readyCheck)throw new Error(`local font did not resolve for its declared CSS weight checks after FontFace.load(): ${spec.family} (${spec.file})`);
    console.info('LAOHU_MOTION_FONT_LOAD/1 '+JSON.stringify({format:'laohu.motion.font-load-event/1',family:spec.family,file:spec.file,weight,weightChecks:checks,style:spec.style??'normal',status:face.status,readyCheck,producer:'@laohu/motion/core/fonts.useFonts'}));
  })();loads.set(key,promise);promise.catch(()=>loads.delete(key));}
  return promise;
}
/** Mount once above SceneStack with a stable manifest. Change its key to replace fonts. */
export function useFonts(specs:FontSpec[]){
  const signature=JSON.stringify(specs);
  const [initial]=useState(()=>signature);
  if(initial!==signature)throw new Error('Font manifest changed: remount the font gate with a new key');
  let entry=gates.get(signature);
  if(!entry){
    const handle=delayRender('local font files');
    const gate={ready:false,promise:Promise.resolve()};
    gate.promise=Promise.all(specs.map(load)).then(()=>{gate.ready=true;continueRender(handle);}).catch(error=>{cancelRender(error instanceof Error?error:new Error(String(error)));});
    gates.set(signature,gate);entry=gate;
  }
  const gate=entry;
  const [ready,setReady]=useState(gate.ready);
  useEffect(()=>{
    let active=true;
    gate.promise.then(()=>{if(active&&gate.ready)setReady(true);});
    // A StrictMode cleanup must not release an unfinished shared font load.
    return ()=>{active=false;};
  },[gate]);
  return ready;
}
/** This measures layout; it does NOT verify cmap coverage or true variable axes. */
export function measureCN(text:string,font:string){
  if(typeof document==='undefined')throw new Error('font measurement requires browser');
  if(!document.fonts.check(font,text))throw new Error('font is not ready');
  const g=document.createElement('canvas').getContext('2d');if(!g)throw new Error('Canvas 2D unavailable');
  g.font=font;return g.measureText(text);
}
