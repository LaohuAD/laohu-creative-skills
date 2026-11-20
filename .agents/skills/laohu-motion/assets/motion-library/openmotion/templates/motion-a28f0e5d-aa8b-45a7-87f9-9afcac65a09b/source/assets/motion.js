(() => {
  'use strict';

  const FPS = 30;
  const DURATION = 632 / FPS;
  const CLOSING_START = 520 / FPS;
  const WAVE_END = 526 / FPS;
  const EPSILON = 0.000001;
  const scenes = [
    { id: 'keyboard', start: 0, end: 2.5 },
    { id: 'voice', start: 2.5, end: 5.2 },
    { id: 'dictation', start: 5.2, end: 9.25 },
    { id: 'compatibility', start: 9.25, end: 14 },
    { id: 'offer', start: 14, end: CLOSING_START },
    { id: 'closing', start: CLOSING_START, end: DURATION }
  ];
  const typing = {
    dictation: [6.05, 7.25],
    deletion: [9.25, 9.8],
    compatibility: [9.8, 10.35],
    feature: [14, 14.58],
    offer: [14.32, 15.02],
    availability: [15.1, 15.47],
    comingSoon: [15.4, 15.72],
    brand: [18.3, 18.8]
  };
  const appStops = [
    { id: 'app-gmail', start: 10.5, end: 11.02 },
    { id: 'app-chatgpt', start: 11.02, end: 11.57 },
    { id: 'app-docs', start: 11.57, end: 12.09 },
    { id: 'app-cursor', start: 12.09, end: 12.61 },
    { id: 'app-outlook', start: 12.61, end: 12.99 },
    { id: 'app-gemini', start: 12.99, end: 13.28 },
    { id: 'app-figma', start: 13.28, end: 13.47 },
    { id: 'app-lovable', start: 13.47, end: 13.58 },
    { id: 'app-claude', start: 13.58, end: 13.69 },
    { id: 'app-granola', start: 13.69, end: 13.84 }
  ];
  const grayKeys = [
    { id: 'key-granola', start: 0.86, angle: -28, x: -36, y: -610, exitX: -170, exitY: -660, exitAngle: -71 },
    { id: 'key-voice', start: 1.02, angle: 38, x: 80, y: -630, exitX: 310, exitY: -680, exitAngle: 85 },
    { id: 'key-typing', start: 1.14, angle: 54, x: 430, y: -570, exitX: 600, exitY: -300, exitAngle: 47 }
  ];

  const byId = id => document.getElementById(id);
  const clamp = value => Math.max(0, Math.min(1, value));
  const progress = (time, start, end) => clamp((time - start) / (end - start));
  const mix = (from, to, amount) => from + (to - from) * amount;
  const smooth = value => value * value * (3 - 2 * value);
  const easeOut = value => 1 - Math.pow(1 - value, 3);
  const easeIn = value => value * value * value;
  const style = (id, values) => Object.assign(byId(id).style, values);
  const sourceText = id => byId(id).textContent;
  const characters = (text, amount) => Array.from(text).slice(0, Math.floor(Array.from(text).length * clamp(amount) + EPSILON)).join('');

  function visible(id, time, start, end) {
    const active = time + EPSILON >= start && time + EPSILON < end;
    style(id, { visibility: active ? 'visible' : 'hidden', opacity: active ? 1 : 0 });
    return active;
  }

  function typed(id, source, time, range) {
    byId(id).textContent = characters(source, progress(time, range[0], range[1]));
  }

  function renderDictation(text) {
    const keyIndex = text.indexOf('fn');
    byId('dictation-before').textContent = keyIndex < 0 ? text : text.slice(0, keyIndex);
    byId('dictation-key').textContent = keyIndex < 0 ? '' : 'fn';
    byId('dictation-after').textContent = keyIndex < 0 ? '' : text.slice(keyIndex + 2);
    style('dictation-key', { display: keyIndex < 0 ? 'none' : 'inline' });
  }

  function render(rawTime) {
    const time = Math.max(0, Math.min(DURATION, Number(rawTime) || 0));
    for (const scene of scenes) {
      visible(scene.id, time, scene.start, scene.end);
    }

    // The lime key and waveform remain single objects while their surrounding scenes change.
    visible('lime-key', time, 0, 5.2);
    const keyEnter = progress(time, 0, 0.58);
    const keySettle = easeOut(keyEnter);
    const moveAside = smooth(progress(time, 0.82, 1.32));
    const keyDrop = easeIn(progress(time, 4.42, 5.04));
    const keyBounce = Math.sin(keyEnter * Math.PI * 2) * Math.sin(keyEnter * Math.PI) * 33;
    style('lime-key', {
      transform: `translate(${-357 * moveAside + 18 * keyDrop}px, ${400 * (1 - keySettle) + keyBounce + 655 * keyDrop}px) rotate(${mix(-46, 0, keySettle) + 12 * keyDrop}deg)`,
      opacity: 1 - progress(time, 5.02, 5.12)
    });
    const keyDraw = easeOut(progress(time, 0.1, 0.52));
    style('key-spiral', { strokeDasharray: '1', strokeDashoffset: String(1 - keyDraw) });

    visible('keyboard-strip', time, 0.86, 3.36);
    grayKeys.forEach((key, index) => {
      const enter = easeOut(progress(time, key.start, key.start + 0.43));
      const exit = easeIn(progress(time, 2.57 + index * 0.035, 3.18 + index * 0.035));
      const wobble = Math.sin(progress(time, key.start, key.start + 0.53) * Math.PI * 2) * 8 * (1 - enter);
      style(key.id, {
        transform: `translate(${key.x * (1 - enter) + key.exitX * exit}px, ${key.y * (1 - enter) + key.exitY * exit}px) rotate(${key.angle * (1 - enter) + key.exitAngle * exit + wobble}deg)`,
        opacity: progress(time, key.start, key.start + 0.08) * (1 - progress(time, 3.15 + index * 0.035, 3.28 + index * 0.035))
      });
    });

    visible('wave-widget', time, 2.5, WAVE_END);
    const waveEnter = easeOut(progress(time, 2.5, 3.02));
    const lower = smooth(progress(time, 5.25, 6.2));
    const waveExit = easeIn(progress(time, CLOSING_START, WAVE_END));
    style('wave-widget', {
      transform: `translate(0px, ${490 * (1 - waveEnter) + 255 * lower + 190 * waveExit}px) scale(${mix(1, 0.6, lower)})`,
      opacity: time + EPSILON >= 2.5 && time + EPSILON < WAVE_END ? 1 : 0
    });
    style('wave-glow', { opacity: progress(time, 2.5, 2.9) * (1 - progress(time, 4.52, 4.92)) });
    for (let index = 0; index < 11; index += 1) {
      const envelope = 0.24 + 0.76 * Math.sin((index + 1) / 12 * Math.PI);
      const pulse = 0.35 + 0.65 * Math.abs(Math.sin(time * 7.4 + index * 0.67) * Math.cos(time * 2.7 - index * 0.43));
      const height = 7 + 68 * envelope * pulse;
      style(`wave-bar-${String(index + 1).padStart(2, '0')}`, { height: `${height.toFixed(3)}px` });
    }

    visible('wave-trail', time, 4.2, 10.3);
    const trailReveal = easeOut(progress(time, 4.2, 5.55));
    style('wave-trail', {
      transform: `translate(${80 * lower}px, ${255 * lower}px)`,
      clipPath: `inset(0 0 0 ${100 * (1 - trailReveal)}%)`,
      fill: time < 5.1 ? '#babeb5' : '#fbfcf5',
      opacity: progress(time, 4.2, 4.45) * (1 - progress(time, 9.85, 10.3))
    });
    for (let index = 0; index < 48; index += 1) {
      const height = 5 + 43 * Math.pow(Math.abs(Math.sin(index * 1.23 - time * 5.1) * Math.cos(index * 0.39 + time * 3.2)), 2);
      const bar = byId(`trail-bar-${String(index + 1).padStart(2, '0')}`);
      bar.setAttribute('height', height.toFixed(3));
      bar.setAttribute('y', ((100 - height) / 2).toFixed(3));
      bar.setAttribute('opacity', String(0.45 + 0.55 * Math.abs(Math.sin(index * 0.7 + time * 2))));
    }

    // A right-to-left triangular paper reveal opens into the editable app interface.
    visible('collage-background', time, 4.9, 10.25);
    const paperReveal = smooth(progress(time, 4.9, 6.15));
    const tipX = 100 * (1 - Math.min(1, paperReveal * 1.45));
    const spread = 50 * Math.min(1, paperReveal * 1.65);
    const paperOpen = smooth(progress(time, 5.65, 6.2));
    style('collage-background', {
      clipPath: `polygon(${tipX}% ${50 * (1 - paperOpen)}%, 100% ${50 - spread}%, 100% ${50 + spread}%, ${tipX}% ${50 + 50 * paperOpen}%)`,
      transform: `scale(${mix(1.04, 1, paperReveal)})`
    });
    const clear = smooth(progress(time, 9.65, 10.08));
    visible('clearing-wipe', time, 9.65, 10.3);
    style('clearing-wipe', { clipPath: `inset(0 0 0 ${100 * (1 - clear)}%)` });

    visible('demo-heading', time, 5.2, 9.7);
    const demoEnter = easeOut(progress(time, 5.2, 6.2));
    const headingExit = 1 - smooth(progress(time, 9.25, 9.7));
    style('demo-heading', {
      transform: `translate(0px, ${62 * (1 - demoEnter)}px) scale(${mix(0.69, 1, demoEnter)})`,
      opacity: progress(time, 5.2, 5.6) * headingExit
    });
    style('greeting-sun', { transform: `rotate(${mix(-18, 0, demoEnter)}deg)` });

    visible('composer-panel', time, 5.2, 10.45);
    const panelExit = easeIn(progress(time, 10.04, 10.45));
    const panelCenter = smooth(progress(time, 9.7, 9.94));
    style('composer-panel', {
      transform: `translate(${-1210 * panelExit}px, ${62 * (1 - demoEnter) + 38 * panelCenter}px) scale(${mix(0.69, 1, demoEnter)})`,
      opacity: progress(time, 5.2, 5.48) * (1 - progress(time, 10.38, 10.45))
    });
    const dictationText = sourceText('dictation-source');
    const dictated = characters(dictationText, progress(time, ...typing.dictation) * (1 - progress(time, ...typing.deletion)));
    renderDictation(dictated);
    style('dictation-line', { opacity: time < 9.8 ? 1 : 0 });
    style('composer-placeholder', { opacity: time < typing.dictation[0] ? 1 : 0 });
    const controlsOpacity = 1 - smooth(progress(time, 9.3, 9.62));
    style('composer-controls', { opacity: controlsOpacity });
    style('composer-model', { opacity: 1 - smooth(progress(time, 9.5, 9.8)) });

    visible('works-line', time, 9.8, 14);
    typed('works-line', sourceText('compatibility-source'), time, typing.compatibility);
    const worksCenter = smooth(progress(time, 9.8, 10.4));
    const worksAside = smooth(progress(time, 10.45, 10.7));
    const compatibilityExit = easeIn(progress(time, 13.78, 14));
    style('works-line', {
      transform: `translate(${-235 * (1 - worksCenter) - 103 * worksAside}px, ${-235 * compatibilityExit}px)`,
      opacity: (1 - progress(time, 13.88, 14))
    });
    visible('app-reel', time, 10.5, 14);
    style('app-reel', {
      transform: `translate(0px, ${-235 * compatibilityExit}px)`,
      opacity: 1 - progress(time, 13.88, 14)
    });
    appStops.forEach(app => {
      const transition = Math.min(0.135, (app.end - app.start) * 0.45);
      const enter = easeOut(progress(time, app.start, app.start + transition));
      const exit = easeIn(progress(time, app.end - transition, app.end));
      const active = time + EPSILON >= app.start && time + EPSILON < app.end;
      style(app.id, {
        visibility: active ? 'visible' : 'hidden',
        opacity: active ? Math.min(1, progress(time, app.start, app.start + transition * 0.5) * (1 - progress(time, app.end - transition * 0.5, app.end))) : 0,
        transform: `translate(0px, ${145 * (1 - enter) - 145 * exit}px) rotate(${5 * (1 - enter) - 5 * exit}deg)`,
        filter: `blur(${(1 - enter + exit) * 4}px)`
      });
    });

    typed('feature-title', sourceText('feature-source'), time, typing.feature);
    typed('offer-title', sourceText('offer-source'), time, typing.offer);
    typed('availability', sourceText('availability-source'), time, typing.availability);
    typed('coming-soon', sourceText('coming-source'), time, typing.comingSoon);

    const logoDraw = progress(time, 521 / FPS, 530 / FPS);
    const shrink = smooth(progress(time, 17.9, 18.2));
    const brandReveal = progress(time, ...typing.brand);
    style('closing-spiral', { strokeDasharray: '1', strokeDashoffset: String(1 - logoDraw) });
    style('closing-logo', {
      transform: `translate(${-280 * brandReveal}px, 0px) scale(${mix(1, 0.49, shrink)})`,
      opacity: time + EPSILON >= 521 / FPS ? 1 : 0
    });
    typed('closing-brand', sourceText('brand-source'), time, typing.brand);
    style('closing-brand', {
      transform: `translateX(${280 * (1 - brandReveal)}px)`,
      opacity: time + EPSILON >= typing.brand[0] ? 1 : 0
    });
  }

  const clock = { time: 0 };
  const timeline = gsap.timeline({ paused: true });
  timeline.to(clock, { time: DURATION, duration: DURATION, ease: 'none', onUpdate: () => render(clock.time) }, 0);
  window.__timelines = window.__timelines || {};
  window.__timelines["granola-voice-typing"] = timeline;
  window.__templateScene = { render, duration: DURATION, fps: FPS, scenes, typing, appStops, grayKeys, closingStart: CLOSING_START, waveEnd: WAVE_END };
  render(0);
})();
