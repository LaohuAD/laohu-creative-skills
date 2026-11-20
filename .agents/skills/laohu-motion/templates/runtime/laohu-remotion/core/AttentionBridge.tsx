import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {CameraRig, cameraPath, RackFocus, type CameraKey} from '../components/camera';
import {ReadingZoneMask, type ReadingZone} from '../components/backgrounds';
import {projectCameraPoint, resolveAttentionBindings} from './attention-phase.mjs';

export type AttentionActorBinding = {
  actorId: string;
  role: 'target' | 'support' | 'context' | 'wait' | 'retire';
  owner: string;
  consumer: 'laohu-motion.attention-actor-style/1';
  props: {x: number; y: number; width: number; height: number; scale: number; rotation: number; opacity: number; visible: boolean;
    coordinateSpace: 'world' | 'screen'; zIndex?: number; readingPoint?: [number, number]; readingPointSpace?: 'world' | 'screen'; depth?: number; focusDepth?: number};
};
export type AttentionPhaseDefinition = {
  id: string; start: number; end: number;
  mainTask: {id: string; description: string; actorIds: string[]};
  cameraKeys: CameraKey[]; readingZones: Array<ReadingZone & {id:string;windowId:string;textCueIds:string[]}>;
  readWindows:Array<{id:string;taskId:string;groupId:string;captionCueIds:string[];screenTextIds:string[];start:number;end:number;basis:'canonical-display-window'|'phase-frame-budget';semanticRange?:{startCueId:string|null;endCueId:string|null};reason:string}>;
  actorBindings: AttentionActorBinding[];
};
export type AttentionActor = {id: string; node: React.ReactNode};

/** Binds phase-owned camera and actor properties to rendered geometry. */
export const AttentionBridge: React.FC<{phases: AttentionPhaseDefinition[]; actors: AttentionActor[];
  width: number; height: number; globalFromSeconds?:number; screen?: React.ReactNode; children?: React.ReactNode}> = ({phases, actors, width, height, globalFromSeconds=0, screen, children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const time = frame / fps + globalFromSeconds;
  const state = resolveAttentionBindings({phases, actorIds: actors.map((actor) => actor.id), time});
  const camera = useMemo(() => cameraPath(state.cameraKeys), [state.cameraKeys]);
  const cameraState = camera(time);
  const renderActor = (actor: AttentionActor) => {
    const binding = state.actors[actor.id];
    if (!binding?.visible) return null;
    const readingPoint = binding.readingPoint
      ? binding.readingPointSpace === 'world'
        ? projectCameraPoint(binding.readingPoint, cameraState, width, height)
        : binding.readingPoint
      : null;
    const contextRetreat = binding.role === 'context' && readingPoint
      ? ReadingZoneMask(readingPoint[0], readingPoint[1], state.readingZones)
      : 1;
    const focusWrapped = binding.depth != null && binding.focusDepth != null
      ? <RackFocus depth={binding.depth} focus={binding.focusDepth}>{actor.node}</RackFocus>
      : actor.node;
    return <div key={actor.id} data-attention-actor={actor.id} data-attention-phase={state.phaseId ?? ''} style={{
      position: 'absolute', left: binding.x, top: binding.y, width: binding.width, height: binding.height, boxSizing:'border-box',
      transformOrigin: 'center center',
      transform: `translate(-50%, -50%) scale(${binding.scale}) rotate(${binding.rotation}rad)`,
      opacity: binding.opacity * contextRetreat, zIndex: binding.zIndex ?? 1, visibility: 'visible', pointerEvents: 'none',
    }}>{focusWrapped}</div>;
  };
  const worldActors = actors.filter((actor) => state.actors[actor.id]?.coordinateSpace === 'world').map(renderActor);
  const screenActors = actors.filter((actor) => state.actors[actor.id]?.coordinateSpace === 'screen').map(renderActor);
  const screenLayer = <>{screen}{screenActors}</>;
  return <AbsoluteFill data-attention-phase={state.phaseId ?? ''} data-attention-task={state.mainTask?.id ?? ''}
    data-attention-read-windows={state.readWindows.map((window)=>window.id).join(',')} style={{overflow: 'hidden'}}>
    <CameraRig t={time} camera={camera} width={width} height={height} screen={screenLayer}>
      {children}
      {worldActors}
    </CameraRig>
  </AbsoluteFill>;
};
