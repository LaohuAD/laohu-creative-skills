import React, {useEffect, useRef, useState} from 'react';
import {AbsoluteFill, Easing, Img, cancelRender, continueRender, delayRender, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {PageCam2D, CamKey2D} from '../upstream/video-shotcraft/demos/_fixtures/PageCam2D';
import {FONT, SpeedBlur, bezier, softShadow, velocity} from '../upstream/video-shotcraft/demos/_fixtures/Polish';

type Rect = {x: number; y: number; width: number; height: number};
type Card = {src: string; assetLicense?: string; rect: Rect; highlight: Rect};
type Props = {
  pageImage: string;
  pageImageLicense?: string;
  pageHeight: number;
  cards: [Card, Card, Card, Card, Card];
  counterLabel: string;
  counterCaption: string;
};

// Source adaptation of video-shotcraft@1266a3e / ListStackPress, fixed at five
// cards and 88 frames. Source timing, curves, press response, camera move,
// roll, highlight lag, glaze, and motion blur remain local fixed mechanics.
// User media, card geometry, semantic highlight rectangles, and copy are mapped
// from caller inputs; the source demo's screenshots and Paper Radar copy are not used.
const DURATION = 88;
const CUES = [6, 18, 30, 42, 54];
const DUR = 22;
const FLY_EASE = Easing.bezier(0.45, 0.05, 0.25, 1.12);
const TILTS = [2, -2, 2, -2, 2];
const CAM_END = 82;
const CY_EASE = bezier(0.42, 0, 0.2, 1);
const Z_EASE = bezier(0.3, 0, 0.18, 1);
const LINEAR = (t: number) => t;
const ROLL_DUR = 8;
const ROLL_EASE = Easing.bezier(0.25, 0.8, 0.25, 1);

const camAt = (f: number) => {
  const u = Math.min(1, Math.max(0, f / CAM_END));
  return {cx: 960, cy: 270 + (815 - 270) * CY_EASE(u), zoom: 1.35 + (0.86 - 1.35) * Z_EASE(u)};
};
const CAM_KEYS: CamKey2D[] = Array.from({length: DURATION}, (_, frame) => ({frame, ...camAt(frame)}));

const flyT = (i: number, frame: number) => interpolate(frame, [CUES[i], CUES[i] + DUR], [0, 1], {
  extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: FLY_EASE,
});
const flyY = (i: number, frame: number) => 600 * (1 - flyT(i, frame));
const rollAt = (frame: number) => CUES.reduce((pos, cue) => pos + interpolate(frame, [cue + DUR, cue + DUR + ROLL_DUR], [0, 1], {
  extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ROLL_EASE,
}), 0);

const stackPressAt = (settledIndex: number, atFrame: number) => {
  let press = 0;
  for (let j = settledIndex + 1; j < CUES.length; j++) {
    const cue = CUES[j];
    const amount = interpolate(atFrame, [cue, cue + 4, cue + 8], [0, 6, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.sin),
    });
    press = Math.max(press, amount);
  }
  return press;
};

const counterScaleAt = (atFrame: number) => {
  const antT = interpolate(atFrame, [0, 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad)});
  return 0.96 + 0.04 * antT;
};

const PINNED_SOURCE_SPATIAL_BASELINE = Object.freeze({
  pageHeight: 1489,
  counterLabel: 'Paper Radar',
  counterCaption: 'Of 31 Fetched Today',
  cards: [
    {rect:{x:408,y:214,width:1104,height:224.5},highlight:{x:16,y:156,width:187,height:20}},
    {rect:{x:408,y:454.5,width:1104,height:224.5},highlight:{x:16,y:156,width:244,height:20}},
    {rect:{x:408,y:695,width:1104,height:224.5},highlight:{x:16,y:156,width:247,height:20}},
    {rect:{x:408,y:935.5,width:1104,height:224.5},highlight:{x:16,y:156,width:240,height:20}},
    {rect:{x:408,y:1176,width:1104,height:224.5},highlight:{x:16,y:156,width:191,height:20}},
  ],
});

const isPinnedSourceSpatialBaseline = (pageHeight: number, counterLabel: string, counterCaption: string, cards: Card[]) => {
  const sameRect = (actual: Rect, expected: Rect) => ['x','y','width','height'].every((key) => actual[key as keyof Rect] === expected[key as keyof Rect]);
  return pageHeight === PINNED_SOURCE_SPATIAL_BASELINE.pageHeight
    && counterLabel === PINNED_SOURCE_SPATIAL_BASELINE.counterLabel
    && counterCaption === PINNED_SOURCE_SPATIAL_BASELINE.counterCaption
    && cards.length === PINNED_SOURCE_SPATIAL_BASELINE.cards.length
    && cards.every((card,index) => {
      const pinned = PINNED_SOURCE_SPATIAL_BASELINE.cards[index];
      return sameRect(card.rect,pinned.rect) && sameRect(card.highlight,pinned.highlight);
    });
};

type Bounds = {left: number; right: number; top: number; bottom: number};
const boxesOverlap = (a: Bounds, b: Bounds) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const cardBoundsAtFrame = (card: Card, index: number, frame: number): Bounds | null => {
  const t = flyT(index, frame);
  if (t <= 0) return null;
  const settled = t >= 0.999;
  const dy = flyY(index, frame) + (settled ? stackPressAt(index, frame) : 0);
  const rotation = TILTS[index] * (1 - t) * Math.PI / 180;
  const scale = 1.06 - 0.06 * t;
  const centerX = card.rect.x + card.rect.width / 2;
  const centerY = card.rect.y + card.rect.height / 2 + dy;
  const {cx, cy, zoom} = camAt(frame);
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  const corners = [
    [-card.rect.width / 2, -card.rect.height / 2], [card.rect.width / 2, -card.rect.height / 2],
    [-card.rect.width / 2, card.rect.height / 2], [card.rect.width / 2, card.rect.height / 2],
  ].map(([dx, localY]) => {
    const x = centerX + dx * scale * cos - localY * scale * sin;
    const y = centerY + dx * scale * sin + localY * scale * cos;
    return {x:960 + (x - cx) * zoom, y:540 + (y - cy) * zoom};
  });
  return {
    left: Math.min(...corners.map((point) => point.x)), right: Math.max(...corners.map((point) => point.x)),
    top: Math.min(...corners.map((point) => point.y)), bottom: Math.max(...corners.map((point) => point.y)),
  };
};

const textForCssTransform = (node: HTMLElement, rawText: string, textTransform: string) => {
  if (textTransform !== 'uppercase') return rawText;
  const locale = node.closest('[lang]')?.getAttribute('lang') || document.documentElement.lang || undefined;
  return rawText.toLocaleUpperCase(locale);
};

const fontSpecFor = (style: CSSStyleDeclaration) => [
  style.fontStyle && style.fontStyle !== 'normal' ? style.fontStyle : '',
  style.fontWeight || '400',
  style.fontSize,
  style.fontFamily,
].filter(Boolean).join(' ');

const measureTrackedTextWidth = (context: CanvasRenderingContext2D, node: HTMLElement, rawText: string, fontSet: FontFaceSet) => {
  const style = getComputedStyle(node);
  const fontWeight = style.fontWeight || '400';
  const fontSize = Number.parseFloat(style.fontSize);
  const letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
  const displayedText = textForCssTransform(node, rawText, style.textTransform);
  const font = fontSpecFor(style);
  if (!font || !Number.isFinite(fontSize) || !/^-?(?:\d+(?:\.\d+)?)(?:px|em)$/.test(letterSpacing)) throw new Error(`Unable to parse counter text font metrics for ${JSON.stringify(rawText)}; cannot verify overlap`);
  context.font = '9px serif';
  context.font = font;
  const parsedFont = context.font;
  const sizeToken = parsedFont.match(/(?:^|\s)([\d.]+)px(?:\s|$)/);
  const parsedSize = Number(sizeToken?.[1]);
  const prefix = sizeToken ? parsedFont.slice(0, sizeToken.index).trim().split(/\s+/) : [];
  const parsedFamily = sizeToken ? parsedFont.slice((sizeToken.index || 0) + sizeToken[0].length).trim() : '';
  const expectedWeight = fontWeight === 'normal' ? '400' : fontWeight;
  const normalizeFamilies = (value: string) => value.replace(/["']/g, '').replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  if (!Number.isFinite(parsedSize) || Math.abs(parsedSize - fontSize) > 0.01 || (expectedWeight !== '400' && !prefix.includes(expectedWeight)) || normalizeFamilies(parsedFamily) !== normalizeFamilies(style.fontFamily)) {
    throw new Error(`Canvas did not parse the counter font family/weight/size as requested (${font}); resolved ${parsedFont}; cannot verify overlap`);
  }
  if (!fontSet.check(font, displayedText)) throw new Error(`Counter font is not ready for measurement (${font}); preview/render is paused rather than guessing text width`);
  context.direction = style.direction === 'rtl' ? 'rtl' : 'ltr';
  context.textAlign = 'right';
  const contextWithSpacing = context as CanvasRenderingContext2D & {letterSpacing?: string};
  const nativeLetterSpacing = typeof contextWithSpacing.letterSpacing === 'string';
  if (nativeLetterSpacing) {
    contextWithSpacing.letterSpacing = letterSpacing;
    if (contextWithSpacing.letterSpacing !== letterSpacing) throw new Error(`Canvas did not accept the resolved CSS letter spacing ${letterSpacing}; cannot verify overlap`);
  }
  const metrics = context.measureText(displayedText);
  const locale = node.closest('[lang]')?.getAttribute('lang') || document.documentElement.lang || undefined;
  const graphemeCount = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(locale, {granularity:'grapheme'}).segment(displayedText)].length
    : Array.from(displayedText).length;
  const fallbackLetterSpacing = !nativeLetterSpacing && graphemeCount > 1
    ? (graphemeCount - 1) * Number.parseFloat(letterSpacing) * (letterSpacing.endsWith('em') ? fontSize : 1)
    : 0;
  return Math.max(0, metrics.width + fallbackLetterSpacing);
};

const offsetTopWithin = (node: HTMLElement, ancestor: HTMLElement) => {
  let current: HTMLElement | null = node;
  let top = 0;
  while (current && current !== ancestor) {
    top += current.offsetTop;
    const parent = current.offsetParent;
    current = parent instanceof HTMLElement ? parent : null;
  }
  if (current !== ancestor) throw new Error('Counter text is no longer laid out inside its fixed source counter group; cannot verify overlap');
  return top;
};

const measureCounterBoxes = async (
  root: HTMLDivElement,
  textNodes: Array<HTMLDivElement | null>,
  numberGlyph: HTMLSpanElement | null,
  counterLabel: string,
  counterCaption: string,
) => {
  if (textNodes.length !== 3 || textNodes.some((node) => !node) || !numberGlyph) throw new Error('Counter text refs are incomplete; cannot verify overlap');
  const [labelNode, numberRow, captionNode] = textNodes as [HTMLDivElement, HTMLDivElement, HTMLDivElement];
  const rootStyle = getComputedStyle(root);
  const top = Number.parseFloat(rootStyle.top);
  const right = Number.parseFloat(rootStyle.right);
  const [originXText, originYText] = rootStyle.transformOrigin.split(/\s+/);
  const originX = Number.parseFloat(originXText);
  const originY = Number.parseFloat(originYText);
  if (Math.abs(top - 70) > 0.01 || Math.abs(right - 96) > 0.01 || Math.abs(originX - root.offsetWidth) > 1 || Math.abs(originY) > 0.01 || rootStyle.textAlign !== 'right') {
    throw new Error('ListStackPress counter position/alignment changed from its pinned source geometry; overlap cannot be verified');
  }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas text measurement is unavailable; preview/render is paused rather than guessing text width');
  const widthRows = [
    {node:labelNode, text:counterLabel, role:'counter label', layoutNode:labelNode},
    {node:numberGlyph, text:'0', role:'rolling number', layoutNode:numberRow},
    {node:captionNode, text:counterCaption, role:'counter caption', layoutNode:captionNode},
  ];
  const fontSet = document.fonts;
  await Promise.all(widthRows.map(async ({node, text}) => {
    const style = getComputedStyle(node);
    const font = fontSpecFor(style);
    const displayText = textForCssTransform(node, text, style.textTransform);
    await fontSet.load(font, displayText);
  }));
  await fontSet.ready;
  const rightEdge = 1920 - right;
  return widthRows.map(({node, text, role, layoutNode}) => {
    const canvasWidth = measureTrackedTextWidth(context, node, text, fontSet);
    const width = role === 'rolling number' ? Math.max(canvasWidth, numberGlyph.offsetWidth) : canvasWidth;
    const layoutHeight = layoutNode.offsetHeight;
    const offsetTop = offsetTopWithin(layoutNode, root);
    if (layoutHeight <= 0) throw new Error(`Unable to measure ${role} line box in the renderer; cannot verify overlap`);
    return {role, width, top:top + offsetTop, height:layoutHeight, rightEdge};
  });
};

const findCounterCardCollision = (boxes: Array<{role:string; width:number; top:number; height:number; rightEdge:number}>, cards: Card[]) => {
  for (let frame = 0; frame < DURATION; frame++) {
    const scale = counterScaleAt(frame);
    for (const textBox of boxes) {
      const bounds = {
        left:textBox.rightEdge - textBox.width * scale,
        right:textBox.rightEdge,
        top:70 + (textBox.top - 70) * scale,
        bottom:70 + (textBox.top + textBox.height - 70) * scale,
      };
      if (bounds.left < 0 || bounds.right > 1920 || bounds.top < 0 || bounds.bottom > 1080) {
        throw new Error(`ListStackPress ${textBox.role} exceeds the visible 1920×1080 composition at frame ${frame}; shorten its copy before rendering`);
      }
      for (const [cardIndex, card] of cards.entries()) {
        const cardBounds = cardBoundsAtFrame(card, cardIndex, frame);
        if (cardBounds && boxesOverlap(bounds, cardBounds)) {
          return `ListStackPress ${textBox.role} overlaps visible card ${cardIndex + 1} at frame ${frame}; shorten the counter copy or remap the page/cards. The source font, counter position, camera and timing are unchanged.`;
        }
      }
    }
  }
  return null;
};

const DigitRoll: React.FC<{pos: number; lineH: number; color: string; blur: number; firstDigitRef?: (node: HTMLSpanElement | null) => void}> = ({pos, lineH, color, blur, firstDigitRef}) => (
  <span style={{display: 'inline-flex', overflow: 'hidden', height: lineH, verticalAlign: 'bottom'}}>
    <span style={{display: 'inline-block', height: lineH}}>
      <span style={{display: 'block', transform: `translateY(${-pos * lineH}px)`, filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined}}>
        {'01234567890123456789'.split('').map((digit, index) => <span key={index} ref={index === 0 ? firstDigitRef : undefined} style={{
          display: 'block', fontFamily: FONT.sans, fontWeight: 500, fontSize: 104, letterSpacing: '-0.04em',
          lineHeight: `${lineH}px`, color, fontVariantNumeric: 'tabular-nums',
        }}>{digit}</span>)}
      </span>
    </span>
  </span>
);

export const LaohuListStackFive: React.FC<Props> = ({pageImage, pageHeight, cards, counterLabel, counterCaption}) => {
  const frame = useCurrentFrame();
  const counterTextRefs = useRef<Array<HTMLDivElement | null>>([]);
  const counterRootRef = useRef<HTMLDivElement | null>(null);
  const numberGlyphRef = useRef<HTMLSpanElement | null>(null);
  const [layoutHandle] = useState(() => delayRender('ListStackPress counter font and card-overlap check'));
  const rollPos = rollAt(frame);
  const rollV = Math.abs(velocity(rollAt, frame));
  const antT = interpolate(frame, [0, 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad)});
  const counterScale = 0.96 + 0.04 * antT;
  const counterOpacity = 0.3 + 0.7 * antT;
  useEffect(() => {
    const verifyLayout = async () => {
      try {
        if (!counterRootRef.current) throw new Error('ListStackPress counter group is missing; cannot verify overlap');
        const boxes = await measureCounterBoxes(counterRootRef.current, counterTextRefs.current, numberGlyphRef.current, counterLabel, counterCaption);
        const collision = findCounterCardCollision(boxes, cards);
        const preservesSourceSpatialBaseline = isPinnedSourceSpatialBaseline(pageHeight, counterLabel, counterCaption, cards);
        if (collision && !preservesSourceSpatialBaseline) {
          cancelRender(new Error(collision));
          return;
        }
        continueRender(layoutHandle);
      } catch (error) {
        cancelRender(error instanceof Error ? error : new Error(String(error)));
      }
    };
    void verifyLayout();
  }, [layoutHandle, cards, counterCaption, counterLabel]);
  const glazeX = interpolate(frame, [74, 87], [-500, 2300], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.45, 0, 0.35, 1),
  });
  const glazeVis = interpolate(frame, [74, 77, 84, 87], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return <AbsoluteFill style={{backgroundColor: '#faf7f2', overflow: 'hidden'}}>
    <PageCam2D src={pageImage} pageH={pageHeight} keys={CAM_KEYS} ease={LINEAR}>
      {cards.map((card, index) => <div key={`slot-${index}`} style={{
        position: 'absolute', left: card.rect.x - 12, top: card.rect.y - 10,
        width: card.rect.width + 24, height: card.rect.height + 20, background: '#faf7f2',
        opacity: frame >= CUES[index] + DUR - 2 ? 0 : 1,
      }} />)}
      {cards.map((card, index) => {
        const cue = CUES[index];
        const t = flyT(index, frame);
        if (t <= 0) return null;
        const settled = t >= 0.999;
        const press = settled ? stackPressAt(index, frame) : 0;
        const dy = flyY(index, frame) + press;
        const rotation = TILTS[index] * (1 - t);
        const scale = 1.06 - 0.06 * t;
        const elevation = settled ? 3 - press * 0.3 : 3 + 53 * Math.min(1, Math.max(0, 1 - t));
        const vy = settled ? 0 : velocity((at) => flyY(index, at), frame);
        const lastCard = index === CUES.length - 1;
        const highlightStart = cue + DUR + (lastCard ? 2 : 3);
        const highlightLength = lastCard ? 5 : 7;
        const highlightGrow = interpolate(frame, [highlightStart, highlightStart + highlightLength], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1),
        });
        const highlightFade = interpolate(frame, [highlightStart + highlightLength, highlightStart + highlightLength + (lastCard ? 4 : 5)], [1, 0], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });
        const renderedCard = <div style={{
          position: 'absolute', left: card.rect.x, top: card.rect.y, width: card.rect.width, height: card.rect.height,
          transform: `translateY(${dy.toFixed(3)}px) rotate(${rotation.toFixed(4)}deg) scale(${scale.toFixed(5)})`,
          transformOrigin: 'center center', borderRadius: 12,
          boxShadow: softShadow(elevation, {color: '#3c2d1e', strength: 1.15}),
        }}>
          <div style={{position: 'absolute', inset: 0, borderRadius: 12, overflow: 'hidden'}}>
            <Img src={staticFile(card.src)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block'}} />
            {highlightGrow > 0 && highlightFade > 0 && <div style={{
              position: 'absolute', left: card.highlight.x, top: card.highlight.y, height: card.highlight.height,
              width: card.highlight.width * highlightGrow, borderRadius: 3,
              background: 'oklch(90% 0.075 82)', mixBlendMode: 'multiply', opacity: 0.85 * highlightFade,
              pointerEvents: 'none',
            }} />}
            {glazeVis > 0 && <div style={{
              position: 'absolute', top: -200, height: card.rect.height + 400,
              left: glazeX - card.rect.x - (card.rect.y - 200) * 0.25, width: 360,
              transform: 'rotate(14deg)', opacity: glazeVis * 0.55, mixBlendMode: 'soft-light',
              background: 'linear-gradient(90deg, rgba(255,236,200,0), rgba(255,226,170,0.95) 45%, rgba(255,226,170,0.95) 55%, rgba(255,236,200,0))',
              pointerEvents: 'none',
            }} />}
          </div>
          <div style={{position: 'absolute', inset: 0, borderRadius: 12, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)', pointerEvents: 'none'}} />
        </div>;
        return Math.abs(vy) > 1
          ? <SpeedBlur key={`card-${index}`} vx={0} vy={vy} amount={0.22} max={14}>{renderedCard}</SpeedBlur>
          : <React.Fragment key={`card-${index}`}>{renderedCard}</React.Fragment>;
      })}
    </PageCam2D>
    <div ref={counterRootRef} style={{
      position: 'absolute', top: 70, right: 96, textAlign: 'right', pointerEvents: 'none', opacity: counterOpacity,
      transform: `scale(${counterScale})`, transformOrigin: 'top right',
    }}>
      <div ref={(node) => { counterTextRefs.current[0] = node; }} style={{fontFamily: FONT.mono, fontSize: 22, fontWeight: 500, letterSpacing: '0.18em', color: 'oklch(48% 0.008 82)', textTransform: 'uppercase'}}>{counterLabel}</div>
      <div ref={(node) => { counterTextRefs.current[1] = node; }} style={{display: 'flex', justifyContent: 'flex-end', marginTop: 4}}>
        <DigitRoll pos={rollPos} lineH={104 * 1.12} color="oklch(52% 0.115 65)" blur={Math.min(6, rollV * 30)} firstDigitRef={(node) => { numberGlyphRef.current = node; }} />
      </div>
      <div style={{height: 1, background: 'oklch(80% 0.01 82)', margin: '8px 0 10px auto', width: 220}} />
      <div ref={(node) => { counterTextRefs.current[2] = node; }} style={{fontFamily: FONT.mono, fontSize: 19, letterSpacing: '0.14em', color: 'oklch(52% 0.008 82)', textTransform: 'uppercase'}}>{counterCaption}</div>
    </div>
  </AbsoluteFill>;
};
