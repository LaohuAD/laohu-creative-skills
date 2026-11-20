import React,{useLayoutEffect,useRef} from 'react';
import {useCurrentFrame,useVideoConfig} from 'remotion';

export type CanvasCodeStyleSpec={
  styleId:string;
  code:string;
  helper:string;
  width:number;
  height:number;
  parentText?:string;
  serif?:string;
};

type Draw=(ctx:CanvasRenderingContext2D,width:number,height:number,timeSec:number,state:Record<string,any>,dpr:number)=>void;
type DrawState={key:string;draw:Draw;ctx:CanvasRenderingContext2D;state:Record<string,any>;lastFrame:number};

/**
 * Runs the original A-G Canvas function body. Stateful samples advance sequentially;
 * a non-sequential Remotion frame request resets the canvas/state and replays from frame 0.
 */
export const CanvasCodeStyle:React.FC<{spec:CanvasCodeStyleSpec}>=({spec})=>{
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const drawRef=useRef<DrawState|null>(null);
  const frame=useCurrentFrame();
  const {fps,width:compositionWidth,height:compositionHeight}=useVideoConfig();

  useLayoutEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)throw new Error('CanvasCodeStyle canvas is unavailable');
    if(canvas.width!==spec.width)canvas.width=spec.width;
    if(canvas.height!==spec.height)canvas.height=spec.height;
    const key=JSON.stringify([spec.styleId,spec.width,spec.height,spec.code,spec.helper,spec.parentText||'',spec.serif||'']);
    let state=drawRef.current;
    if(!state||state.key!==key){
      if(!/^[A-G]\d+$/.test(spec.styleId))throw new Error(`unsupported Canvas code style ${spec.styleId}`);
      if(!spec.code.includes(`S.${spec.styleId} =`))throw new Error(`source code does not define S.${spec.styleId}`);
      const factory=new Function('PARENT','SERIF','PI',`const S = {};\n${spec.helper}\n${spec.code}\nif (typeof S[${JSON.stringify(spec.styleId)}] !== 'function') throw new Error('style draw function was not registered');\nreturn S[${JSON.stringify(spec.styleId)}];`);
      const draw=factory(Array.from(spec.parentText||''),spec.serif||'"Noto Serif SC", "Songti SC", "SimSun", serif',Math.PI) as Draw;
      const ctx=canvas.getContext('2d');
      if(!ctx)throw new Error('Canvas 2D context unavailable');
      state={key,draw,ctx,state:{},lastFrame:-1};
      drawRef.current=state;
    }
    if(frame===state.lastFrame+1){
      state.draw(state.ctx,spec.width,spec.height,frame/fps,state.state,1);
      state.lastFrame=frame;
    }else{
      canvas.width=spec.width;
      canvas.height=spec.height;
      const ctx=canvas.getContext('2d');
      if(!ctx)throw new Error('Canvas 2D context unavailable');
      state.ctx=ctx;
      state.state={};
      state.lastFrame=-1;
      for(let current=0;current<=frame;current+=1){
        state.draw(state.ctx,spec.width,spec.height,current/fps,state.state,1);
      }
      state.lastFrame=frame;
    }
  },[frame,fps,spec]);

  return <canvas ref={canvasRef} width={spec.width} height={spec.height} style={{position:'absolute',left:0,top:0,width:compositionWidth,height:compositionHeight,display:'block'}}/>;
};
