import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {TrackIn} from '../typography/craft/TrackIn';
import {FlowField} from '../backgrounds';
import {WalkCycle} from '../character';
import {AnimatedBars, PhotoMontage} from '../data-ui';
import {VolumeScene} from '../three/specimen/VolumeScene';
import {crossfade, directionalWipe, fadeThrough, iris, pageFlip, push, sharedAxis, TransitionOverlap, whipPan, zoomThrough} from '../transitions';
import {LocalAuthoredShot} from './registry';

type JsonObject = Record<string, any>;
function place(child:React.ReactNode,placement?:JsonObject):React.ReactNode {
  if(!placement)return child;
  const {x,y,width,height,clip=true,alignX='left',alignY='top'}=placement;
  return <div style={{position:'absolute',left:x,top:y,width,height,boxSizing:'border-box',overflow:clip?'hidden':'visible',display:'flex',justifyContent:alignX==='left'?'flex-start':alignX==='center'?'center':'flex-end',alignItems:alignY==='top'?'flex-start':alignY==='center'?'center':'flex-end'}}>{child}</div>;
}

const presentations = (props: JsonObject) => {
  switch (props.method) {
    case 'crossfade': return crossfade;
    case 'fade-through': return fadeThrough;
    case 'directional-wipe': return directionalWipe(props.direction, props.softness);
    case 'iris': return iris(props.width ?? 1920, props.height ?? 1080, props.center);
    case 'push': return push(props.direction, props.moveOutgoing);
    case 'shared-axis': return sharedAxis(props.axis, props.distance);
    case 'zoom-through': return zoomThrough(props.origin, props.factor);
    case 'page-flip': return pageFlip(props.perspective);
    case 'whip-pan': return whipPan(props.width ?? 1920, props.direction, props.maxBlur);
    default: throw new Error(`Unknown companion transition method: ${props.method}`);
  }
};

/** Routes allowlisted companion source components through the regular Shotcraft composition. */
export const FoundationLayer: React.FC<{node: JsonObject}> = ({node}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const p = node.props || {};

  switch (node.catalogId) {
    case 'laohu-typography-track-in':
      return place(<TrackIn {...p} />,node.placement);
    case 'laohu-background-flow-field':
      return <FlowField {...p} t={frame / fps} width={width} height={height} />;
    case 'laohu-character-walk-cycle':
      return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
        <WalkCycle {...p} t={frame / fps} />
      </svg>;
    case 'laohu-data-animated-bars': {
      const progress = interpolate(frame, [p.startFrame, p.endFrame], [p.fromProgress ?? 0, p.toProgress ?? 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
      return place(<AnimatedBars {...p} progress={progress} />,node.placement);
    }
    case 'laohu-media-photo-montage':
      return <PhotoMontage {...p} t={frame / fps} width={width} height={height} />;
    case 'laohu-three-volume':
      return <VolumeScene th={p.theme} clay={p.clay} s={{...p.state, wave: frame + (p.waveOffset ?? 0)}} width={width} height={height} />;
    case 'laohu-transition-overlap':
      return <TransitionOverlap
        t={frame / fps}
        start={p.startFrame / fps}
        end={p.endFrame / fps}
        background={p.background}
        presentation={presentations(p)}
        outgoing={<div style={{width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: p.colorA, background: p.background, fontFamily: p.family, fontSize: p.size, fontWeight: p.weight}}>{p.textA}</div>}
        incoming={<div style={{width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: p.colorB, background: p.background, fontFamily: p.family, fontSize: p.size, fontWeight: p.weight}}>{p.textB}</div>}
      />;
    case 'laohu-authored-shot':
      return <LocalAuthoredShot shotId={p.shotId} parameters={p.parameters} />;
    default:
      throw new Error(`Unsupported companion foundation component: ${node.catalogId}`);
  }
};
