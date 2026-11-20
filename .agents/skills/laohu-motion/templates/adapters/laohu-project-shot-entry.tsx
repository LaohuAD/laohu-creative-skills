import React from 'react';
import {AbsoluteFill} from 'remotion';

type ProjectShotHostProps = {
  ShotComponent: React.ComponentType<any>;
  shotProps: Record<string, unknown>;
};

/** Keeps each work-local component on the full Film /2 canvas and local segment frame clock. */
export const LaohuProjectShotHost: React.FC<ProjectShotHostProps> = ({ShotComponent, shotProps}) => <AbsoluteFill
  style={{width: '100%', height: '100%', overflow: 'hidden'}}
>
  <ShotComponent {...shotProps} />
</AbsoluteFill>;
