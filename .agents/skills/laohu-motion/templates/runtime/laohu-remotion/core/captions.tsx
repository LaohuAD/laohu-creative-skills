import React, {useMemo} from 'react';
import {AbsoluteFill,useCurrentFrame,useVideoConfig} from 'remotion';
import {measureCN} from './fonts';
export type CaptionCue={id:string;start:number;end:number;lines:string[]};
export type CaptionLike={text:string;startMs:number;endMs:number;timestampMs:number|null;confidence:number|null};
export type CaptionManifestLike={format:'laohu.asrcut.caption-manifest/1';sourceClock:{sampleRateHz:number};cues:Array<{id:string;lines:string[];displayWindow:{startSample:number;endSample:number;sampleRateHz:number}}>};
export type CaptionStyleLike={textStyleId:string;function:'subtitle';spatialRelation:'screen-overlay';temporalBehavior:'caption-manifest-display-window';coordinateSpace:'output-pixels';x:number;y:number;width:number;height:number;zIndex:number;alignment:'left'|'center'|'right';background:string;paddingPx:number;maxLines:number;fontFamily:string;fontWeight:string|number;sizePx:number;color:string;lineHeight:number;letterSpacing:number};
export function cueFromCaption(c:CaptionLike,id:string,lines:string[]):CaptionCue{return {id,start:c.startMs/1000,end:c.endMs/1000,lines};}
/** Keep compiled caption identity, exact display windows, and semantic lines through the actual renderer. */
export function cuesFromManifest(manifest:CaptionManifestLike):CaptionCue[]{
  if(manifest?.format!=='laohu.asrcut.caption-manifest/1')throw new Error('Caption renderer requires caption-manifest/1');
  const rate=manifest.sourceClock?.sampleRateHz;
  if(!Number.isSafeInteger(rate)||rate<1)throw new Error('Caption manifest has no valid source clock');
  const seen=new Set<string>();
  return manifest.cues.map(c=>{
    if(!c.id||seen.has(c.id))throw new Error('Caption manifest cue ids must be unique');seen.add(c.id);
    const w=c.displayWindow;
    if(!Number.isSafeInteger(w?.startSample)||!Number.isSafeInteger(w?.endSample)||w.startSample<0||w.endSample<=w.startSample||w.sampleRateHz!==rate)throw new Error(`Invalid compiled caption range: ${c.id}`);
    if(!Array.isArray(c.lines)||c.lines.length<1||c.lines.length>2||c.lines.some(line=>typeof line!=='string'||!line.trim()))throw new Error(`Invalid compiled caption lines: ${c.id}`);
    return {id:c.id,start:w.startSample/rate,end:w.endSample/rate,lines:[...c.lines]};
  });
}
/** Manifest captions use the measured D3 style; explicit legacy cues retain their legacy defaults. */
export const Captions:React.FC<{cues?:CaptionCue[];manifest?:CaptionManifestLike;style?:CaptionStyleLike;family?:string;size?:number;globalFromFrame?:number;globalFromSeconds?:number;bottom?:number;color?:string}>=({cues,manifest,style,family,size=48,globalFromFrame=0,globalFromSeconds=0,bottom=86,color='#fff'})=>{
  const f=useCurrentFrame(),{fps}=useVideoConfig(),t=(f+globalFromFrame)/fps+globalFromSeconds;
  const manifestCues=useMemo(()=>manifest?cuesFromManifest(manifest):null,[manifest]);
  if(manifest&&cues)throw new Error('Choose either a verified manifest or explicit test cues, not both');
  if(manifest&&!style)throw new Error('Formal caption manifests require the D3-bound measured caption style');
  const rows=manifestCues??cues??[];
  const active=rows.filter(c=>t>=c.start&&t<c.end);
  if(active.length>1)throw new Error('Overlapping caption cues: merge or resolve explicitly');
  const c=active[0];
  if(c&&(!Array.isArray(c.lines)||c.lines.length<1||c.lines.length>2))throw new Error('Caption requires one or two explicit lines');
  if(manifest&&style&&(style.coordinateSpace!=='output-pixels'||style.function!=='subtitle'||style.temporalBehavior!=='caption-manifest-display-window'))throw new Error('Invalid measured D3 caption style');
  const font=style?`${style.fontWeight} ${style.sizePx}px "${style.fontFamily.replace(/["\\]/g,'\\$&')}"`:'';
  const measured=useMemo(()=>c&&style?c.lines.map(line=>measureCN(line,font).width+Math.max(0,[...line].length-1)*style.letterSpacing):null,[c?.id,font,style?.letterSpacing]);
  if(!c)return null;
  if(style){
    if(c.lines.length>style.maxLines)throw new Error(`Caption ${c.id} exceeds its measured maxLines`);
    const availableWidth=style.width-2*style.paddingPx,availableHeight=style.height-2*style.paddingPx;
    if(availableWidth<=0||availableHeight<=0)throw new Error('Caption style has no inner reading area');
    if(measured?.some(width=>width>availableWidth+0.5))throw new Error(`Caption ${c.id} exceeds measured width ${availableWidth}px`);
    if(c.lines.length*style.sizePx*style.lineHeight>availableHeight+0.5)throw new Error(`Caption ${c.id} exceeds measured height ${availableHeight}px`);
    const justify=style.alignment==='left'?'flex-start':style.alignment==='right'?'flex-end':'center';
    return <AbsoluteFill data-caption-cue={c.id} style={{left:style.x,top:style.y,width:style.width,height:style.height,zIndex:style.zIndex,display:'flex',justifyContent:justify,alignItems:'center',pointerEvents:'none',boxSizing:'border-box'}}><div style={{width:'100%',fontFamily:style.fontFamily,fontWeight:style.fontWeight,fontSize:style.sizePx,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,fontSynthesis:'none',textAlign:style.alignment,color:style.color,background:style.background,padding:style.paddingPx,boxSizing:'border-box'}}>{c.lines.map((line,i)=><div key={i} style={{whiteSpace:'pre'}}>{line}</div>)}</div></AbsoluteFill>;
  }
  return <AbsoluteFill style={{justifyContent:'flex-end',alignItems:'center',padding:`0 5% ${bottom}px`,pointerEvents:'none'}}><div style={{maxWidth:'100%',fontFamily:family,fontSize:size,lineHeight:1.4,fontSynthesis:'none',textAlign:'center',color,background:'rgba(0,0,0,.7)',padding:'.15em .45em',boxSizing:'border-box'}}>{c.lines.map((line,i)=><div key={i} style={{whiteSpace:'pre'}}>{line}</div>)}</div></AbsoluteFill>;
};
