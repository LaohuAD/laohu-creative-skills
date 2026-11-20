import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {CameraRig, cameraPath} from '../camera';
import {FlowField} from '../backgrounds';
import {Captions} from '../../core/captions';
import {formationPoint} from '../../core/motion-core.mjs';
import {beatGrid} from '../../core/audio/beat-grid.mjs';
import {PixelStage, cycle, pixText, ridge} from '../materials/pixel';
import {BoilDefs, Rough, Sparkle} from '../materials/handdrawn';
import {SketchDefs, Stroke} from '../materials/lineart';
import {TrackIn} from '../typography/craft/TrackIn';
import {GlyphAnatomy, type GlyphData} from '../three/specimen/GlyphAnatomy';
import type {SpecimenTheme} from '../three/specimen/theme';

/** Imports available to authored local Remotion shots; production components stay under this runtime. */
export * as MotionModules from './index';

type JsonObject = Record<string, any>;

const FormationCameraShot: React.FC<{title?: string; caption?: string; bpm?: number; accent?: string}> = ({title='A shared path',caption='A form becomes visible when its parts keep one direction.',bpm=92,accent='#e7b451'}) => {
  const frame=useCurrentFrame();
  const {fps,width,height}=useVideoConfig();
  const t=frame/fps;
  const camera=cameraPath([
    {at:0,center:[960,540],zoom:1,rotation:0},
    {at:2.2,center:[960,500],zoom:1.08,rotation:-0.035},
    {at:4,center:[960,540],zoom:1,rotation:0,stop:true},
  ]);
  const group={
    path:(time:number):[number,number]=>[960+Math.sin(time*.8)*170,535+Math.cos(time*.6)*54],
    heading:(time:number)=>Math.atan2(Math.cos(time*.6)*-32,Math.cos(time*.8)*136),
    scale:(time:number)=>1+.07*Math.sin(time*.45),
    flutterEnvelope:(time:number)=>Math.exp(-Math.max(0,time)*.24),
    wave:14,k:.012,omega:1.4,
  };
  const elements=Array.from({length:15},(_,index)=>({
    delay:index*.035,
    offset:[Math.cos(index/15*Math.PI*2)*360,Math.sin(index/15*Math.PI*2)*220] as [number,number],
    frequency:1.8+(index%5)*.12,phase:index*1.7,
  }));
  const beats=beatGrid({bpm,offset:0,start:0,end:4.5,fps});
  const captionCue={id:'authored-caption',start:1.35,end:4.35,lines:[caption]};
  return <AbsoluteFill style={{background:'#101820',overflow:'hidden'}}>
    <FlowField t={t} width={width} height={height} seed="formation-camera" lines={96} steps={32} stepLength={5} color="#91a8b3" zones={[{x:160,y:72,width:1600,height:230,padding:24,feather:110,floor:.04}]} />
    <CameraRig t={t} camera={camera} width={width} height={height} screen={<>
      <div style={{position:'absolute',left:170,top:120}}><TrackIn text={title} family="Arial, sans-serif" size={78} weight={600} at={4} dur={38} from={.2} to={0} color="#f4f1e8" /></div>
      <Captions cues={[captionCue]} family="Arial, sans-serif" size={34} bottom={96} color="#f4f1e8" />
    </>}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {elements.map((element,index)=>{
          const [x,y]=formationPoint(t,element,group);
          return <g key={index} transform={`translate(${x} ${y})`}>
            <circle r={index%3===0?13:8} fill={index%3===0?accent:'#b6c7cb'} opacity={.9}/>
            <circle r={index%3===0?22:14} fill="none" stroke={accent} strokeOpacity={.25} strokeWidth="1.5" />
          </g>;
        })}
        {beats.map((beat:any)=><line key={beat.index} x1={300+beat.frame*23} x2={300+beat.frame*23} y1={875} y2={889} stroke={accent} strokeWidth={2} opacity={beat.frame===frame?1:.22}/>)}
      </svg>
    </CameraRig>
  </AbsoluteFill>;
};

const MaterialCraftShot: React.FC<{label?:string;accent?:string}> = ({label='MOTION STUDY',accent='#e7b451'}) => {
  const frame=useCurrentFrame();
  const {fps}=useVideoConfig();
  const t=frame/fps;
  const progress=Math.min(1,Math.max(0,(frame-8)/42));
  const draw=(g:CanvasRenderingContext2D,time:number)=>{
    g.fillStyle='#101820';g.fillRect(0,0,320,180);
    const horizon=108;
    for(let x=0;x<320;x+=8){const y=horizon-ridge(x*.035,19)*18;g.fillStyle=cycle(['#24343a','#314349','#41535a'],Math.floor(x/8),time,.7);g.fillRect(x,Math.round(y),8,180-Math.round(y));}
    pixText(g,label,160,22,'#f2eee4',2,'#000','center');
    const walk=Math.floor(time*10)%280;
    g.fillStyle=accent;g.fillRect(18+walk,118,8,8);g.fillRect(10+walk,128,24,3);
  };
  return <AbsoluteFill style={{background:'#101820',overflow:'hidden'}}>
    <PixelStage t={t} draw={draw} />
    <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{position:'absolute',inset:0}}>
      <SketchDefs id="foundation-sketch" t={frame} hold={2} scale={2.5} region={[0,0,1920,1080]} />
      <BoilDefs t={frame} hold={2} scale={2.2} region={[0,0,1920,1080]} />
      <path d="M 250 760 C 510 610 720 850 970 690 S 1410 590 1670 750" fill="none" stroke={accent} strokeWidth="5" strokeDasharray="13 12" opacity=".6" />
      <g filter="url(#boil-a)"><Rough d="M 330 820 C 550 745 730 805 920 760" u={progress} color="#f1eee5" width={4} /></g>
      <Stroke d="M 1020 810 C 1190 735 1400 760 1580 690" u={progress} width={3} color={accent} filter="url(#foundation-sketch)" />
      <Sparkle x={1580} y={690} r={22} t={frame} at={34} color={accent} />
    </svg>
  </AbsoluteFill>;
};

const CaptionTypeShot: React.FC<{title?:string;caption?:string;accent?:string;titleAtFrame?:number}> = ({title='说清一件事',caption='画面动作跟着同一条时间线展开。',accent='#e7b451',titleAtFrame=0}) => {
  const frame=useCurrentFrame();
  const {fps}=useVideoConfig();
  const t=frame/fps;
  return <AbsoluteFill style={{background:'#f3efe5',color:'#161b20'}}>
    <div style={{position:'absolute',left:180,top:170,fontFamily:'Georgia, "Songti SC", serif',fontSize:86,fontWeight:700}}>
      <TrackIn text={title} family="Georgia, 'Songti SC', serif" size={86} weight={700} at={titleAtFrame} dur={32} from={.28} to={0} color="#161b20" />
    </div>
    <div style={{position:'absolute',left:180,top:390,width:1480,fontFamily:'Arial, "Microsoft YaHei", sans-serif',fontSize:42,lineHeight:1.5}}>
      <span style={{background:`linear-gradient(transparent 64%,${accent}80 64%)`}}>{caption}</span>
    </div>
    <Captions cues={[{id:'caption-type-shot',start:.5,end:4,lines:[caption]}]} family={'Arial, "Microsoft YaHei", sans-serif'} size={30} bottom={72} color="#f7f4ed" />
    <div style={{position:'absolute',left:180,bottom:142,fontFamily:'Arial, sans-serif',fontSize:22,color:'#687179'}}>LOCAL CAPTION + TYPE MODULES · {Math.floor(t*fps)}f</div>
  </AbsoluteFill>;
};

const GLYPH_THEME: SpecimenTheme = {
  ink:'#172127', paper:'#f3efe5', paper2:'#e9e1d2', cream:'#f8f4e9',
  accent:'#a34232', accent2:'#2d7472',
  palette:[{name:'ink',hex:'#172127'},{name:'paper',hex:'#f3efe5'},{name:'accent',hex:'#a34232'}],
  sprinkle:['#a34232','#2d7472','#d09a3c'],
  serif:'Georgia, "Songti SC", serif', sans:'Arial, "Microsoft YaHei", sans-serif', mono:'ui-monospace, SFMono-Regular, Menlo, monospace',
};

/** Consumes the exact JSON emitted by laohu-glyph-outline.py through a real ThreeSpecimen component. */
const GlyphAnatomyShot: React.FC<{glyph:GlyphData;title?:string;accent?:string}> = ({glyph,title='字形结构',accent='#a34232'}) => {
  const frame=useCurrentFrame();
  const first=glyph.contours[0]?.[0];
  const loupeAt=first?{x:1510,y:350,r:100,point:[first[0],first[1]] as [number,number],zoom:3}:undefined;
  return <AbsoluteFill style={{background:GLYPH_THEME.paper,color:GLYPH_THEME.ink,overflow:'hidden'}}>
    <div style={{position:'absolute',left:190,top:110,fontFamily:GLYPH_THEME.sans,fontSize:25,letterSpacing:'0.14em',color:accent}}>{title}</div>
    <div style={{position:'absolute',left:190,top:155,fontFamily:GLYPH_THEME.serif,fontSize:42,fontWeight:700}}>{glyph.char}</div>
    <GlyphAnatomy th={{...GLYPH_THEME,accent}} glyph={glyph} x={570} baseline={675} size={430}
      metrics={Math.min(1,frame/18)} outline={Math.min(1,frame/32)}
      points={Math.max(0,Math.min(1,(frame-14)/48))} fill={Math.max(0,Math.min(1,(frame-38)/30))}
      loupe={Math.max(0,Math.min(1,(frame-56)/18))} loupeAt={loupeAt} />
    <div style={{position:'absolute',left:190,bottom:110,fontFamily:GLYPH_THEME.mono,fontSize:19,color:'#45535a'}}>{glyph.font} · UPM {glyph.upm} · ADVANCE {glyph.advance}</div>
  </AbsoluteFill>;
};

const REGISTRY: Record<string, React.FC<any>> = {
  'formation-camera': FormationCameraShot,
  'material-craft': MaterialCraftShot,
  'caption-type': CaptionTypeShot,
  'glyph-anatomy': GlyphAnatomyShot,
};

export const AUTHORED_SHOT_IDS=Object.freeze(Object.keys(REGISTRY));
export const LocalAuthoredShot: React.FC<{shotId:string;parameters?:JsonObject}> = ({shotId,parameters={}}) => {
  const Shot=REGISTRY[shotId];
  if(!Shot) throw new Error(`Unknown authored local shot ${shotId}; add a typed component to the local registry first`);
  return <Shot {...parameters} />;
};
