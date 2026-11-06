import React from 'react';
import {AbsoluteFill, Composition, Easing, interpolate, OffthreadVideo, registerRoot, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {PaperTitleCard as TemplatePaperTitleCard} from '../upstream/video-shotcraft/template/src/aifl/PaperTitleCard';
import {PaperTitleCard as GalleryPaperTitleCard} from '../upstream/video-shotcraft/demos/typography/paper-title-card/PaperTitleCard';
import {VisualThemeProvider} from '../upstream/video-shotcraft/template/src/themes/visual-theme';
import {Dust, GridFloor, LOOKS, Sheen, Stage, TextReveal} from '../upstream/video-shotcraft/demos/_fixtures/Look';
import {Backdrop, EASE, Grain, SpeedBlur} from '../upstream/video-shotcraft/demos/_fixtures/Polish';
import {ClipCard} from '../upstream/video-shotcraft/assets/lib/ClipCard';
import {FlashCut} from '../upstream/video-shotcraft/assets/lib/FlashCut';
import {GrainDissolve} from '../upstream/video-shotcraft/demos/outro/grain-dissolve/GrainDissolve';
import {PaperTitleCard as DerivedPaperTitleCardCopy} from './derived/PaperTitleCardCopy';
import {LaohuListStackFive} from './laohu-list-stack-five';

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
    case 'video-shotcraft-grain-dissolve': return <GrainDissolve />;
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
    case 'video-shotcraft-clip-card': return inPlacement(
      <ClipCard
        src={p.src} caption={p.caption} size={p.size} radius={p.radius} muted={true}
        captionSize={p.captionSize} startFrom={p.startFrom} durationInFrames={p.durationInFrames}
        loopDurationInFrames={p.loopDurationInFrames} loopCrossfadeInFrames={p.loopCrossfadeInFrames}
      />,
      node.placement,
    );
    default: throw new Error(`Unsupported Shotcraft component: ${node.catalogId}`);
  }
}

const ShotcraftLayer: React.FC<{node: JsonObject}> = ({node}) => layer(node, useCurrentFrame());

const ShotcraftFilm: React.FC<{runtimeSpec: JsonObject}> = ({runtimeSpec}) => {
  const frame = useCurrentFrame();
  const segments = runtimeSpec.segments as JsonObject[];
  return <AbsoluteFill style={{overflow: 'hidden', backgroundColor: '#000'}}>
    {segments.map((segment) => <Sequence
      key={segment.id}
      from={segment.frameRange.startFrame}
      durationInFrames={segment.frameRange.endFrame - segment.frameRange.startFrame}
      layout="none"
    >
      <AbsoluteFill>
        {segment.baseVideo && <OffthreadVideo
          src={staticFile(segment.baseVideo.src)}
          muted
          volume={0}
          startFrom={0}
          endAt={segment.frameRange.endFrame - segment.frameRange.startFrame}
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />}
        {(segment.layers || []).map((node: JsonObject, i: number) => <ShotcraftLayer key={`${segment.id}-${i}`} node={node} />)}
      </AbsoluteFill>
    </Sequence>)}
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

const Root: React.FC = () => <Composition
  id="Shotcraft"
  component={(props: {runtimeSpec: JsonObject}) => props.runtimeSpec.kind === 'film' ? <ShotcraftFilm {...props} /> : <ShotcraftSingle {...props} />}
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
/>;

registerRoot(Root);
