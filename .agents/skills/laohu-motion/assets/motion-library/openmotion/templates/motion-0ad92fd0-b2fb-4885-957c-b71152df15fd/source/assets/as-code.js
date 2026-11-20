window.__hf = window.__hf || {};
window.__hf.buildReady = window.__hf.buildReady || {};
window.__hf.buildReady.asCode = buildDia();

async function buildDia() {
  await Promise.all([document.fonts.load('400 24px InterLocal'), document.fonts.load('400 54px GaramondLocal')]);
  const settings = {
    brand: 'Dia', explainPrompt: 'Explain this', writingPrompt: 'Shorter, warmer, sound like me',
    videoTab: 'MIT Introduction to...', firstProduct: 'Akari 24N', secondProduct: 'Panthella Portable Lamp',
    ...(window.__hyperframes?.getVariables?.() || {})
  };
  const root = document.getElementById('root');
  const byId = id => document.getElementById(id);
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const progress = clamp(value); return progress * progress * (3 - 2 * progress); };
  const out = value => 1 - Math.pow(1 - clamp(value), 3);
  const mix = (start, end, progress) => start + (end - start) * progress;
  const show = (element, visible) => { element.style.display = visible ? '' : 'none'; element.style.visibility = 'visible'; };
  const fade = (time, start, end, tail = .25) => out((time - start) / .2) * (1 - smooth((time - end) / tail));
  function keys(time, points) {
    if (time <= points[0][0]) return points[0].slice(1);
    for (let index = 1; index < points.length; index++) {
      if (time <= points[index][0]) {
        const previous = points[index - 1];
        const next = points[index];
        const progress = smooth((time - previous[0]) / (next[0] - previous[0]));
        return next.slice(1).map((value, component) => mix(previous[component + 1], value, progress));
      }
    }
    return points[points.length - 1].slice(1);
  }
  const typed = (time, text, start, end) => String(text).slice(0, Math.floor(clamp((time - start) / (end - start)) * String(text).length));
  byId('brand-label').textContent = settings.brand;
  byId('welcome-title').textContent = 'Welcome to ' + settings.brand;
  const canvas = byId('dia-material');
  const context = canvas.getContext('2d');
  const homeworkPills = [[273, 35, 286], [715, 140, 170], [273, 245, 530]].map(([x, y, width]) => {
    const element = document.createElement('div');
    element.className = 'response-pill';
    element.style.left = x + 'px';
    element.style.top = y + 'px';
    element.style.width = width + 'px';
    byId('homework-replies').appendChild(element);
    return element;
  });
  function lines(parent, widths) {
    return widths.map(width => {
      const element = document.createElement('div');
      element.className = 'skeleton-line';
      element.style.width = width + 'px';
      parent.appendChild(element);
      return element;
    });
  }
  const explanationLines = lines(byId('explanation-lines'), [450, 450, 418, 455, 437, 425, 300, 280]);
  const rewriteLines = lines(byId('rewrite-lines'), [378, 385, 364, 320, 240]);
  for (let index = 0; index < 15; index++) {
    const element = document.createElement('div');
    element.className = 'table-cell';
    byId('comparison-table').appendChild(element);
  }
  const tabDefinitions = [
    {id: 'youtube', icon: 'video-icon', title: settings.videoTab, width: 260},
    {id: 'paper', icon: 'paper-icon', title: settings.firstProduct, width: 260},
    {id: 'lamp', icon: 'lamp-icon', title: settings.secondProduct, width: 260},
    {id: 'mail', icon: 'mail-icon', title: 'Inbox', width: 270}
  ];
  const tabs = Object.fromEntries(tabDefinitions.map(definition => {
    const element = document.createElement('div');
    element.className = 'flying-tab';
    element.id = 'tab-' + definition.id;
    element.style.width = definition.width + 'px';
    const icon = document.createElement('span');
    icon.className = 'tab-icon';
    icon.innerHTML = `<svg><use href="#${definition.icon}"/></svg>`;
    const label = document.createElement('span');
    label.className = 'tab-title';
    label.textContent = definition.title;
    element.append(icon, label);
    byId('flying-tabs').appendChild(element);
    return [definition.id, {element, label, definition}];
  }));
  byId('wallpaper').loading = 'eager';
  await byId('wallpaper').decode();

  function drawMark(time) {
    context.clearRect(0, 0, 1156, 720);
    if (time < .75 || time >= 7.72) return;
    const [size, top] = keys(time, [[.75, 960, 720], [2.5, 960, 692], [3.1, 960, 690],
      [3.5, 960, 550], [4, 600, 332], [4.5, 390, 276], [5, 280, 264],
      [5.5, 230, 261], [6, 205, 263], [6.5, 200, 268], [7.1, 200, 280], [7.5, 180, 283]]);
    const left = 578 - size / 2;
    const notch = smooth((time - 4.1) / .5);
    const path = new Path2D();
    if (notch < .001) {
      path.arc(578, top + size / 2, size / 2, 0, Math.PI * 2);
    } else {
      const endY = mix(.94, .8214, notch);
      const middleY = mix(1, .72, notch);
      path.moveTo(left + .117 * size, top + endY * size);
      path.bezierCurveTo(left - .12 * size, top + .47 * size, left + .05 * size, top, left + .5 * size, top);
      path.bezierCurveTo(left + .95 * size, top, left + 1.12 * size, top + .47 * size, left + .883 * size, top + endY * size);
      path.bezierCurveTo(left + .85 * size, top + .9 * size, left + .73 * size, top + middleY * size, left + .5 * size, top + middleY * size);
      path.bezierCurveTo(left + .27 * size, top + middleY * size, left + .15 * size, top + .9 * size, left + .117 * size, top + endY * size);
      path.closePath();
    }
    context.save();
    context.globalAlpha = 1 - smooth((time - 7.4) / .15);
    context.shadowColor = time < 4.2 ? '#f56615' : '#d9e0ff55';
    context.shadowBlur = time < 4.2 ? 95 : 9;
    const material = context.createRadialGradient(578, top + size * .59, 0, 578, top + size * .45, size * .63);
    material.addColorStop(0, time < 4 ? '#fff' : '#8da6e6');
    material.addColorStop(.43, time < 4 ? '#fff' : '#bac8f0');
    material.addColorStop(.76, '#f0e8f3');
    material.addColorStop(1, '#fff');
    context.fillStyle = material;
    context.fill(path);
    context.shadowBlur = 0;
    context.clip(path);
    const bandPosition = keys(time, [[4.5, -.4], [5.55, -.3], [6, .23], [6.2, .45], [6.5, .9], [7, 1.2]])[0];
    const band = context.createLinearGradient(0, top + (bandPosition - .2) * size, 0, top + (bandPosition + .2) * size);
    band.addColorStop(0, '#ffd4a000');
    band.addColorStop(.5, '#ffd9b899');
    band.addColorStop(1, '#d4d2f000');
    context.fillStyle = band;
    context.fillRect(left, top, size, size);
    context.restore();
    if (time > 7.12) {
      const [radius, centerY] = keys(time, [[7.12, 150, 630], [7.26, 150, 455], [7.4, 90, 390], [7.6, 78, 360]]);
      context.save();
      context.fillStyle = '#04040c';
      context.globalAlpha = 1 - smooth((time - 7.4) / .2);
      context.shadowColor = '#020309';
      context.shadowBlur = 20;
      context.beginPath();
      context.arc(578, centerY, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }
  function positionTab(id, visible, x, y, scale = 1, opacity = 1, rotation = 0) {
    const tab = tabs[id];
    show(tab.element, visible);
    tab.element.style.transform = `translate(${x}px,${y}px) scale(${scale}) rotate(${rotation}deg)`;
    tab.element.style.opacity = opacity;
  }
  function renderTabs(time) {
    Object.values(tabs).forEach(tab => show(tab.element, false));
    const browser = byId('browser-window');
    const videoWindow = time >= 9.4 && time < 11;
    const shopWindow = time >= 12.55 && time < 15;
    const mailWindow = time >= 16.2 && time < 17.7;
    show(browser, videoWindow || shopWindow || mailWindow);
    const start = videoWindow ? 9.4 : shopWindow ? 12.55 : 16.2;
    const finish = videoWindow ? 10.6 : shopWindow ? 14.5 : 17.15;
    const entry = out((time - start) / .45);
    const exit = smooth((time - finish) / .4);
    const browserTop = mix(820, 645, entry) - exit * 80;
    browser.style.top = browserTop + 'px';
    browser.style.opacity = entry * (1 - exit);
    if (time >= 9.4 && time < 12.35) {
      const fly = out((time - 10.45) / .55);
      const sent = smooth((time - 11.92) / .35);
      positionTab('youtube', true, mix(275, 294, fly) + sent * 180, mix(browserTop - 55, 359, fly) - sent * 210,
        mix(1.55, 1, fly), fade(time, 9.4, 12.13), -Math.sin(fly * Math.PI) * 4);
    }
    if (time >= 12.55 && time < 16.2) {
      const paper = out((time - 14.1) / .65);
      const lamp = out((time - 14.55) / .65);
      const sent = smooth((time - 15.62) / .35);
      positionTab('paper', true, mix(203, 294, paper), mix(browserTop - 55, 359, paper) - sent * 310,
        1, fade(time, 12.55, 15.95), -Math.sin(paper * Math.PI) * 8);
      positionTab('lamp', true, mix(470, 307, lamp), mix(browserTop - 55, 349, lamp) - sent * 320,
        1, fade(time, 12.55, 15.95), Math.sin(lamp * Math.PI) * 6);
      tabs.lamp.element.style.zIndex = '0';
      tabs.paper.element.style.zIndex = '1';
    }
    if (time >= 16.2 && time < 19.95) {
      const fly = out((time - 16.95) / .55);
      const sent = smooth((time - 19.45) / .45);
      tabs.mail.label.textContent = time < 17 ? 'Inbox' : 'I have a question ab...';
      positionTab('mail', true, mix(184, 294, fly), mix(browserTop - 55, 359, fly) - sent * 240,
        1, fade(time, 16.2, 19.7), -Math.sin(fly * Math.PI) * 5);
      tabs.mail.element.querySelector('use').setAttribute('href', time < 17 ? '#mail-icon' : '#paper-icon');
    }
  }
  function renderReplies(time) {
    const chat = byId('chat-sent');
    show(chat, time >= 8.77 && time < 9.25);
    const chatProgress = out((time - 8.77) / .28);
    chat.style.opacity = fade(time, 8.77, 9.1, .15);
    chat.style.transform = `translateY(${200 * (1 - chatProgress) - 90 * smooth((time - 9.05) / .2)}px)`;
    const homeworkExit = smooth((time - 10.35) / .3);
    homeworkPills.forEach((element, index) => {
      const progress = out((time - 9.02 - index * .1) / .3);
      element.style.opacity = progress * (1 - homeworkExit);
      element.style.transform = `translateY(${70 * (1 - progress) - homeworkExit * 340}px) scaleX(${mix(.5, 1, progress)})`;
    });
    const explanation = time >= 12.08 && time < 13.75;
    const comparison = time >= 15.65 && time < 17.2;
    const writing = time >= 19.55 && time < 20.4;
    const user = byId('user-sent');
    show(user, explanation || comparison || writing);
    user.textContent = explanation ? settings.explainPrompt : writing ? settings.writingPrompt : 'Compare';
    user.style.top = (writing ? -10 : 35) + 'px';
    const userStart = explanation ? 12.08 : writing ? 19.55 : 15.65;
    const userExit = explanation ? 13.3 : writing ? 19.9 : 16.3;
    user.style.opacity = fade(time, userStart, userExit, .55);
    user.style.transform = `translateY(${60 * (1 - out((time - userStart) / .25)) - smooth((time - userExit) / .5) * 100}px)`;
    show(byId('explanation-lines'), explanation);
    explanationLines.forEach((element, index) => {
      const progress = out((time - 12.15 - index * .105) / .13);
      element.style.opacity = progress * (1 - smooth((time - 13.3) / .4));
      element.style.transform = `scaleX(${progress})`;
    });
    const table = byId('comparison-table');
    show(table, comparison);
    table.style.opacity = fade(time, 15.75, 16.85, .35);
    table.style.transform = `translateY(${80 * (1 - out((time - 15.75) / .35)) - 330 * smooth((time - 16.85) / .35)}px)`;
    const rewrite = byId('rewrite-card');
    show(rewrite, time >= 19.65 && time < 21.15);
    rewrite.style.opacity = fade(time, 19.65, 20.9, .25);
    rewrite.style.transform = `translateY(${80 * (1 - out((time - 19.65) / .3)) - 230 * smooth((time - 20.9) / .25)}px)`;
    rewriteLines.forEach((element, index) => {
      const progress = out((time - 19.9 - index * .14) / .2);
      element.style.opacity = progress;
      element.style.transform = `scaleX(${progress})`;
    });
    rewrite.querySelector('button').style.opacity = out((time - 19.98) / .2);
  }
  function setInput(time) {
    const visible = time >= 7.32;
    show(byId('input-world'), visible);
    const [width, height, centerY] = keys(time, [[7.32, 180, 180, 400], [7.6, 156, 156, 360],
      [7.8, 132, 132, 360], [8.04, 610, 120, 360], [8.7, 610, 120, 360],
      [9.2, 610, 90, 360], [10.4, 610, 90, 360], [10.85, 610, 140, 360]]);
    const card = byId('input-card');
    card.style.width = width + 'px';
    card.style.height = height + 'px';
    card.style.left = -width / 2 + 'px';
    card.style.top = -height / 2 + 'px';
    card.style.borderRadius = mix(80, 35, smooth((time - 10.4) / .45)) + 'px';
    card.style.opacity = out((time - 7.32) / .16);
    const [submitSize, submitMargin] = keys(time, [[7.32, 180, 0], [7.6, 156, 0], [7.8, 132, 0], [8.04, 98, 11],
      [8.7, 98, 11], [9.2, 72, 9], [10.4, 72, 9], [10.85, 50, 20]]);
    const submit = byId('submit');
    submit.style.width = submitSize + 'px';
    submit.style.height = submitSize + 'px';
    submit.style.right = submitMargin + 'px';
    submit.style.bottom = submitMargin + 'px';
    const buttonLight = smooth((time - 7.8) / .24);
    submit.style.background = `rgb(${mix(158, 244, buttonLight)},${mix(151, 243, buttonLight)},${mix(174, 246, buttonLight)})`;
    submit.style.color = `rgb(${mix(42, 128, buttonLight)},${mix(38, 122, buttonLight)},${mix(54, 132, buttonLight)})`;
    let text = '';
    let placeholder = '';
    let activeCaret = false;
    if (time >= 8.12 && time < 8.77) { text = typed(time, 'Chat', 8.12, 8.45); activeCaret = true; }
    if (time >= 9.25 && time < 10.4) placeholder = 'Chat with your homework';
    if (time >= 10.65 && time < 11.92) { text = typed(time, settings.explainPrompt, 10.65, 11.45); activeCaret = true; }
    if (time >= 12.2 && time < 13.4) placeholder = 'Chat with your shopping';
    if (time >= 13.4 && time < 15.62) {
      const compare = 'Compare ' + settings.firstProduct + ' ' + String(settings.secondProduct).slice(0, 15) + '...';
      text = typed(time, compare, 13.4, 14.85);
      activeCaret = true;
    }
    if (time >= 16.1 && time < 17) placeholder = 'Chat with your writing';
    if (time >= 17 && time < 19.45) { text = typed(time, settings.writingPrompt, 17, 19.25); activeCaret = true; }
    if (time >= 19.9) placeholder = '▱ Chat with your tabs';
    const fontSize = keys(time, [[7.8, 48], [8.7, 48], [9.2, 36], [10.4, 36], [10.85, 24]])[0];
    const padding = keys(time, [[7.8, 36], [8.7, 36], [9.2, 27], [10.85, 21]])[0];
    byId('input-content').textContent = text;
    const inputText = byId('input-text');
    const placeholderElement = byId('input-placeholder');
    for (const element of [inputText, placeholderElement]) {
      element.style.fontSize = fontSize + 'px';
      element.style.left = padding + 'px';
      element.style.top = (time < 10.4 ? (height - fontSize * 1.4) / 2 : 23) + 'px';
    }
    placeholderElement.textContent = placeholder;
    show(placeholderElement, !!placeholder);
    show(byId('input-caret'), activeCaret);
    byId('input-caret').style.height = fontSize * 1.2 + 'px';
    show(byId('add-tabs'), (time >= 12.2 && time < 13.4) || (time >= 16.1 && time < 17) || time >= 19.9);
    submit.style.opacity = placeholder ? .7 : 1;
    const [inputX, inputY, inputScale] = keys(time, [[0, 578, centerY, 1], [20.98, 578, 360, 1],
      [21.2, 578, 360, .72], [21.4, 578, 360, .55], [21.7, 855, 350, .42], [22.2, 900, 350, .37]]);
    byId('input-world').style.left = inputX + 'px';
    byId('input-world').style.top = (time < 20.98 ? centerY : inputY) + 'px';
    byId('input-world').style.transform = `scale(${inputScale})`;
    if (time >= 21) card.style.background = '#f8f8f8d9';
    else card.style.background = '#c7c1d1bf';
  }
  function renderWelcome(time) {
    const welcome = byId('welcome');
    welcome.style.opacity = out((time - 21.42) / .7);
    const [x, y, scale] = keys(time, [[21.42, 280, 100, 1.15], [21.8, 200, 136, 1.04], [22.2, 223, 136, 1]]);
    welcome.style.left = x + 'px';
    welcome.style.top = y + 'px';
    welcome.style.transform = `scale(${scale})`;
    const demo = byId('demonstration-window');
    show(demo, time >= 20.98);
    const [left, top, width, height, opacity] = keys(time, [[20.98, 62, 80, 1032, 600, 0],
      [21.2, 180, 108, 910, 530, .55], [21.4, 270, 155, 715, 420, .9],
      [21.7, 625, 200, 620, 325, 1], [22.2, 665, 214, 550, 275, 1]]);
    Object.assign(demo.style, {left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px', opacity});
    const clip = smooth((time - 21.65) / .55);
    byId('demonstration-clip').style.clipPath = `inset(${136 * clip}px ${223 * clip}px ${167 * clip}px ${223 * clip}px round ${20 * clip}px)`;
  }
  function renderAt(time) {
    byId('shade').style.opacity = smooth((time - .65) / 1.3) * (1 - smooth((time - 21.4) / .8));
    byId('company-credit').style.opacity = fade(time, .8, 3.65, .5);
    show(byId('brand-scene'), time >= .7 && time < 7.8);
    drawMark(time);
    byId('brand-label').style.opacity = out((time - 4.5) / .5) * (1 - smooth((time - 7.08) / .14));
    byId('brand-label').style.top = keys(time, [[4.5, 545], [5, 499], [5.5, 472], [6.5, 465], [7.2, 465]])[0] + 'px';
    show(byId('conversation-scene'), time >= 7.1 && time < 21.5);
    renderReplies(time);
    renderTabs(time);
    setInput(time);
    show(byId('welcome-scene'), time >= 21.35);
    renderWelcome(time);
    byId('tour-footer').style.opacity = out((time - 7.12) / .3) * (1 - smooth((time - 21.25) / .3));
    root.dataset.scene = time < 3.5 ? 'company-sunrise' : time < 7.2 ? 'dia-material' : time < 8.85 ? 'arrow-chat-morph'
      : time < 12.1 ? 'learning-tabs' : time < 16.1 ? 'shopping-comparison' : time < 21 ? 'writing-replacement' : 'welcome';
    root.dataset.time = time.toFixed(5);
  }
  const clock = {time: 0};
  const timeline = gsap.timeline({paused: true});
  timeline.to(clock, {time: 1441 / 60, duration: 1441 / 60, ease: 'none', onUpdate: () => renderAt(clock.time)});
  window.__timelines = window.__timelines || {};
  window.__timelines["dia-introduction-183"] = timeline;
  renderAt(0);
  root.dataset.ready = 'true';
}
