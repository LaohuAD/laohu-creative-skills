import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {ListStackPress} from '../templates/upstream/video-shotcraft/demos/ui-entrance/list-stack-press/ListStackPress';

const SourceBaseline: React.FC = () => <Composition
  id="ListStackPressSourceBaseline"
  component={ListStackPress}
  width={1920}
  height={1080}
  fps={30}
  durationInFrames={88}
/>;

registerRoot(SourceBaseline);
