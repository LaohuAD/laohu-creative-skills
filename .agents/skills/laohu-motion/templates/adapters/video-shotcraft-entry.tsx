import React from 'react';
import {AbsoluteFill, Composition, Easing, interpolate, OffthreadVideo, registerRoot, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {PaperTitleCard as TemplatePaperTitleCard} from '../runtime/laohu-remotion/components/paper-title-card';
import {PaperTitleCard as GalleryPaperTitleCard} from '../runtime/laohu-remotion/components/paper-title-card-gallery';
import {VisualThemeProvider} from '../runtime/laohu-remotion/themes/visual-theme';
import {Dust, GridFloor, LOOKS, Sheen, Stage, TextReveal} from '../runtime/laohu-remotion/components/look';
import {Backdrop, EASE, Grain, SpeedBlur} from '../runtime/laohu-remotion/components/polish';
import {ClipCard} from '../runtime/laohu-remotion/components/clip-card';
import {FlashCut} from '../runtime/laohu-remotion/components/flash-cut';
import {GrainDissolve} from '../runtime/laohu-remotion/components/grain-dissolve';
import {PaperTitleCard as DerivedPaperTitleCardCopy} from './derived/PaperTitleCardCopy';
import {LaohuListStackFive} from './laohu-list-stack-five';
import {SceneStack} from '../runtime/laohu-remotion/core/SceneStack';
import {CanvasCodeStyle, CanvasCodeStyleSpec} from '../runtime/laohu-remotion/components/styles/code-canvas';
import {FoundationLayer} from '../runtime/laohu-remotion/components/shots/foundation-layer';

type JsonObject = Record<string, any>;

function reveal(props: JsonObject) {
  const unitStyle = props.highlightIndices?.length
    ? (index: number) => props.highlightIndices.includes(index) ? {color: props.highlightColor} : {}
    : undefined;
  return <TextReveal
      text={props.text}
      start={props.start}
      by={props.by}
      variant={props.variant}
      each={props.each}
      gap={props.gap}
      ease={EASE[props.ease || 'snappy']}
      style={props.style}
      unitStyle={unitStyle}
      out={props.out}
    />;
}

function inPlacement(children: React.ReactNode, placement?: JsonObject): React.ReactNode {
  if (!placement) return children;
  const {x, y, width, height, clip = true, alignX = 'left', alignY = 'top'} = placement;
  const justifyContent = alignX === 'left' ? 'flex-start' : alignX === 'center' ? 'center' : 'flex-end';
  const alignItems = alignY === 'top' ? 'flex-start' : alignY === 'center' ? 'center' : 'flex-end';
  return <div style={{
    position: 'absolute', left: x, top: y, width, height, boxSizing: 'border-box',
    overflow: clip ? 'hidden' : 'visible', display: 'flex', justifyContent, alignItems,
  }}>{children}</div>;
}

function safeChild(node: JsonObject, frame: number, parentLook?: string): React.ReactNode {
  switch (node.catalogId) {
    case 'video-shotcraft-text-reveal': return reveal(node.props || {});
    case 'video-shotcraft-clip-card': return clipCard(node.props || {});
    case 'video-shotcraft-dust': return <Dust look={LOOKS[parentLook || node.props.look]} {...node.props} />;
    case 'video-shotcraft-grid-floor': return <GridFloor look={LOOKS[parentLook || node.props.look]} {...node.props} />;
    case 'video-shotcraft-sheen': {
      const track = node.props.progressTrack;
      const p = track ? interpolate(frame, [track.startFrame, track.endFrame], [track.from, track.to], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE[track.ease || 'linear'],
      }) : node.props.progress;
      return <Sheen {...node.props} progress={p} />;
    }
    default: throw new Error(`Unsupported Shotcraft child component: ${node.catalogId}`);
  }
}

function clipCard(p: JsonObject) {
  return <ClipCard
    src={p.src} caption={p.caption} size={p.size} radius={p.radius} muted={true}
    captionSize={p.captionSize} startFrom={p.startFrom} durationInFrames={p.durationInFrames}
    loopDurationInFrames={p.loopDurationInFrames} loopCrossfadeInFrames={p.loopCrossfadeInFrames}
  />;
}

function layer(node: JsonObject, frame: number): React.ReactNode {
  const p = node.props || {};
  switch (node.catalogId) {
    case 'video-shotcraft-paper-title-card':
      return <VisualThemeProvider theme={p.theme} colors={p.colors}>
        <TemplatePaperTitleCard {...p.componentProps} />
      </VisualThemeProvider>;
    case 'video-shotcraft-paper-title-card-gallery':
      return p.derivedPatch
        ? <DerivedPaperTitleCardCopy words={p.derivedPatch.words} sub={p.derivedPatch.sub} subDigits={p.derivedPatch.subDigits} />
        : <GalleryPaperTitleCard />;
    case 'video-shotcraft-grain-dissolve': return <GrainDissolve brandName={node.props.brandName} />;
    case 'video-shotcraft-list-stack-five': return <LaohuListStackFive {...p} />;
    case 'video-shotcraft-stage': {
      const decor = (p.backgroundDecor || []).map((child: JsonObject, i: number) => <React.Fragment key={`decor-${i}`}>{safeChild(child, frame, p.look)}</React.Fragment>);
      return <Stage look={LOOKS[p.look]} keyLight={p.keyLight} fill={p.fill} horizon={p.horizon} intensity={p.intensity} breathe={p.breathe} grain={p.grain} vignette={p.vignette}>{decor}</Stage>;
    }
    case 'video-shotcraft-backdrop': return inPlacement(<Backdrop {...p} />, node.placement);
    case 'video-shotcraft-grain': return inPlacement(<Grain {...p} />, node.placement);
    case 'video-shotcraft-text-reveal': return inPlacement(reveal(p), node.placement);
    case 'video-shotcraft-sheen': {
      const track = p.progressTrack;
      const progress = track ? interpolate(frame, [track.startFrame, track.endFrame], [track.from, track.to], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE[track.ease || 'linear'],
      }) : p.progress;
      return inPlacement(<Sheen {...p} progress={progress} />, node.placement);
    }
    case 'video-shotcraft-speed-blur': return inPlacement(<AbsoluteFill>
      <SpeedBlur vx={p.vx} vy={p.vy} amount={p.amount} max={p.max}>
        {safeChild(p.content, frame)}
      </SpeedBlur>
    </AbsoluteFill>, node.placement);
    case 'video-shotcraft-clip-card': return inPlacement(clipCard(p), node.placement);
    case 'laohu-style-code-canvas': return <MeasuredCanvasCodeStyle spec={p.canvasCodeSpec} />;
    case 'laohu-typography-track-in':
    case 'laohu-background-flow-field':
    case 'laohu-character-walk-cycle':
    case 'laohu-data-animated-bars':
    case 'laohu-media-photo-montage':
    case 'laohu-three-volume':
    case 'laohu-transition-overlap':
    case 'laohu-authored-shot':
      return <FoundationLayer node={node} />;
    default: throw new Error(`Unsupported Shotcraft component: ${node.catalogId}`);
  }
}

const ShotcraftLayer: React.FC<{node: JsonObject}> = ({node}) => layer(node, useCurrentFrame());

const ShotcraftFilmSegment: React.FC<{segment: JsonObject}> = ({segment}) => {
  const durationInFrames = segment.frameRange.endFrame - segment.frameRange.startFrame;
  return <AbsoluteFill>
    {segment.baseVideo && <OffthreadVideo
      src={staticFile(segment.baseVideo.src)}
      muted
      volume={0}
      startFrom={0}
      endAt={durationInFrames}
      style={{width: '100%', height: '100%', objectFit: 'cover'}}
    />}
    {(segment.layers || []).map((node: JsonObject, i: number) => <ShotcraftLayer key={`${segment.id}-${i}`} node={node} />)}
  </AbsoluteFill>;
};

const ShotcraftFilm: React.FC<{runtimeSpec: JsonObject}> = ({runtimeSpec}) => {
  const segments = runtimeSpec.segments as JsonObject[];
  const fps = runtimeSpec.fps as number;
  const scenes = segments.map((segment) => ({
    id: segment.id,
    start: segment.frameRange.startFrame / fps,
    end: segment.frameRange.endFrame / fps,
    time_basis: 'planned' as const,
  }));
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  return <AbsoluteFill style={{overflow: 'hidden', backgroundColor: '#000'}}>
    <SceneStack scenes={scenes} fps={fps} background="#000" renderScene={(scene) => {
      const segment = byId.get(scene.id);
      if (!segment) throw new Error(`Film SceneStack lost segment ${scene.id}`);
      return <ShotcraftFilmSegment segment={segment} />;
    }} />
    {(runtimeSpec.transitionEdges || []).map((edge: JsonObject) => <Sequence
      key={edge.id}
      from={edge.startFrame}
      durationInFrames={edge.durationInFrames}
      layout="none"
    ><FlashCut duration={edge.durationInFrames} /></Sequence>)}
  </AbsoluteFill>;
};

const ShotcraftSingle: React.FC<{runtimeSpec: JsonObject}> = ({runtimeSpec}) => <AbsoluteFill style={{overflow: 'hidden'}}>
  {(runtimeSpec.layers || []).map((node: JsonObject, i: number) => <ShotcraftLayer key={i} node={node} />)}
</AbsoluteFill>;

const ShotcraftComposition: React.FC<{runtimeSpec: JsonObject}> = (props) => props.runtimeSpec.kind === 'film'
  ? <ShotcraftFilm {...props} />
  : <ShotcraftSingle {...props} />;

type StyleCodeRuntimeSpec = CanvasCodeStyleSpec & {durationInFrames:number; content?:JsonObject};

function preflightStructuredStyleText(spec: StyleCodeRuntimeSpec) {
  if (!['F1','F2'].includes(spec.styleId) || !spec.content) return;
  const probe=document.createElement('canvas');
  probe.width=1; probe.height=1;
  const base=probe.getContext('2d');
  if(!base) throw new Error(`${spec.styleId} actual Canvas text preflight could not create a 2D context`);
  const measure=(text:unknown,x:number,y:number)=>{
    const value=String(text);
    const metrics=base.measureText(value);
    const left=x-(metrics.actualBoundingBoxLeft ?? metrics.width/2);
    const right=x+(metrics.actualBoundingBoxRight ?? metrics.width/2);
    const ascent=metrics.actualBoundingBoxAscent ?? 0;
    const descent=metrics.actualBoundingBoxDescent ?? 0;
    if(left < -0.5 || right > spec.width+0.5 || y-ascent < -0.5 || y+descent > spec.height+0.5) {
      throw new Error(`${spec.styleId} actual Canvas text ${JSON.stringify(value)} exceeds the 1920×1080 source canvas bounds`);
    }
    return metrics.width;
  };
  const ctx=new Proxy(base,{
    get(target,property){
      if(property==='fillText') return (text:unknown,x:number,y:number,maxWidth?:number)=>{
        const value=String(text);
        const width=measure(value,x,y);
        if(spec.styleId==='F1') {
          const title=spec.content.title===value;
          const labels=Array.isArray(spec.content.data)?spec.content.data:[];
          const index=labels.findIndex((row:JsonObject)=>row.label===value);
          if(title && width > spec.width*(.94-.1)) throw new Error(`F1 content.title actual Canvas width ${width.toFixed(1)}px exceeds the source title lane`);
          if(index>=0) {
            const laneWidth=spec.width*(.94-.1)/labels.length;
            if(width > laneWidth*.9) throw new Error(`F1 content.data[${index}].label actual Canvas width ${width.toFixed(1)}px exceeds its source chart lane ${laneWidth.toFixed(1)}px`);
          }
        } else if(spec.styleId==='F2') {
          const nodes=Array.isArray(spec.content.nodes)?spec.content.nodes:[];
          const nodeIndex=nodes.findIndex((row:JsonObject)=>row.key===value);
          const radius=Math.min(spec.width,spec.height)*.075;
          if(nodeIndex>=0 && width > radius*1.8) throw new Error(`F2 content.nodes[${nodeIndex}].key actual Canvas width ${width.toFixed(1)}px exceeds its source node-label area`);
          const edges=Array.isArray(spec.content.edges)?spec.content.edges:[];
          edges.forEach((edge:JsonObject,index:number)=>{
            if(edge.label!==value) return;
            const from=nodes.find((row:JsonObject)=>row.key===edge.from),to=nodes.find((row:JsonObject)=>row.key===edge.to);
            if(!from||!to) throw new Error(`F2 content.edges[${index}] lost a node during Canvas preflight`);
            const distance=Math.hypot((from.x-to.x)*spec.width,(from.y-to.y)*spec.height);
            const laneWidth=distance-2*radius-12;
            if(width > laneWidth) throw new Error(`F2 content.edges[${index}].label actual Canvas width ${width.toFixed(1)}px exceeds its source edge-label lane ${laneWidth.toFixed(1)}px`);
          });
        }
        return target.fillText.call(target,value,x,y,maxWidth);
      };
      const value=Reflect.get(target,property,target);
      return typeof value==='function'?value.bind(target):value;
    },
    set(target,property,value){return Reflect.set(target,property,value,target);},
  }) as CanvasRenderingContext2D;
  const factory=new Function('PARENT','SERIF','PI',`const S = {};\n${spec.helper}\n${spec.code}\nif (typeof S[${JSON.stringify(spec.styleId)}] !== 'function') throw new Error('style draw function was not registered');\nreturn S[${JSON.stringify(spec.styleId)}];`);
  const draw=factory(Array.from(spec.parentText||''),spec.serif||'"Noto Serif SC", "Songti SC", "SimSun", serif',Math.PI) as (ctx:CanvasRenderingContext2D,width:number,height:number,timeSec:number,state:JsonObject,dpr:number)=>void;
  const cycleFrames=spec.styleId==='F1'?255:300;
  const state:JsonObject={};
  for(let frame=0;frame<cycleFrames;frame+=1) draw(ctx,spec.width,spec.height,frame/30,state,1);
}

const MeasuredCanvasCodeStyle: React.FC<{spec:StyleCodeRuntimeSpec}> = ({spec}) => {
  const [ready,setReady]=React.useState(false);
  React.useLayoutEffect(()=>{
    preflightStructuredStyleText(spec);
    setReady(true);
  },[spec]);
  return ready ? <CanvasCodeStyle spec={spec} /> : null;
};

const StyleCodeComposition: React.FC<{runtimeSpec: StyleCodeRuntimeSpec}> = ({runtimeSpec}) => <MeasuredCanvasCodeStyle spec={runtimeSpec} />;

const Root: React.FC = () => <>
  <Composition
    id="Shotcraft"
    component={ShotcraftComposition}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={55}
    defaultProps={{runtimeSpec: {kind: 'single', width: 1920, height: 1080, fps: 30, durationInFrames: 55, layers: []}}}
    calculateMetadata={({props}: {props: {runtimeSpec: JsonObject}}) => ({
      width: props.runtimeSpec.width,
      height: props.runtimeSpec.height,
      fps: props.runtimeSpec.fps,
      durationInFrames: props.runtimeSpec.durationInFrames,
    })}
  />
  <Composition
    id="StyleCode"
    component={StyleCodeComposition}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={90}
    defaultProps={{runtimeSpec: {styleId: 'A1', code: '', helper: '', width: 1920, height: 1080, parentText: '老胡', serif: 'serif', durationInFrames: 90}}}
    calculateMetadata={({props}: {props: {runtimeSpec: StyleCodeRuntimeSpec}}) => ({
      width: props.runtimeSpec.width,
      height: props.runtimeSpec.height,
      fps: 30,
      durationInFrames: props.runtimeSpec.durationInFrames,
    })}
  />
</>;

registerRoot(Root);
