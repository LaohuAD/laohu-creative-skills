window.__hf = window.__hf || {};
window.__hf.buildReady = window.__hf.buildReady || {};
window.__hf.buildReady.asCode = buildBoltSkills();

async function buildBoltSkills() {
  await document.fonts.load('500 40px InterLocal');
  const settings = {
    skillName: 'brand-color-system',
    writingSkill: 'writing-guidelines',
    repositoryUrl: 'https://github.com/anthropics/skills',
    fileName: 'skills.md',
    closingTitle: '/skills',
    closingSubtitle: 'Now in Bolt.new',
    ...(window.__hyperframes?.getVariables?.() || {})
  };
  const description = 'Use when styling any UI element, page, or component that involves color. Covers backgrounds, text, buttons, borders, and states like hover, active, and disabled. Doesn’t apply to illustrations, photography, or user-uploaded content colors.';
  const instructions = '# Brand color system\nRead this skill before applying color to any UI element. Use it to keep every screen visually consistent with the brand palette.\n## Core palette\n- Primary: deep indigo (#4F46E5) — used for primary buttons, links, and active states.\n- Secondary: warm amber (#F59E0B) — used sparingly, for highlights and calls to attention only.\n- Neutral background: near-black (#0B0B0F) for dark mode, off-white (#FAFAFA) for light mode.\n- Text: high-contrast white/near-black — never pure #000 or #FFF.\n## Usage rules\n- Never use more than one accent color (secondary) per screen.\n- Primary color is reserved for the single most important action.';
  const longCopy = 'make sure every page has proper SEO meta tags and descriptions, write all button labels verb-first like “Save changes” not “Submit”, use second person and present tense everywhere, keep the tone friendly but not overly casual, use contractions, add alt text to every image, check color contrast meets accessibility standards, keep headings in sentence case, empty states should explain why it’s empty and what to do next, don’t call it “Projects” in one place and “Work” somewhere else, and remember use verb-first button labels, second person present tense, alt text on every image, sentence case headings, check contrast ratios, keep terminology consistent across the app, and don’t forget to ';
  const byId = id => document.getElementById(id);
  const clamp = value => Math.max(0, Math.min(1, value));
  const progress = (time, start, end) => clamp((time - start) / (end - start));
  const smooth = value => value * value * (3 - 2 * value);
  const easeOut = value => 1 - Math.pow(1 - value, 4);
  const mix = (a, b, amount) => a + (b - a) * amount;
  const alpha = (id, value) => { byId(id).style.opacity = clamp(value); };
  const pose = (id, values) => {
    const [x, y, scale = 1, rotation = 0] = values;
    byId(id).style.transform = `translate(${x}px,${y}px) scale(${scale}) rotate(${rotation}deg)`;
  };
  function keys(time, points) {
    if (time <= points[0][0]) return points[0].slice(1);
    for (let index = 1; index < points.length; index++) {
      if (time <= points[index][0]) {
        const amount = smooth(progress(time, points[index - 1][0], points[index][0]));
        return points[index].slice(1).map((value, axis) => mix(points[index - 1][axis + 1], value, amount));
      }
    }
    return points[points.length - 1].slice(1);
  }
  const typeText = (id, text, time, start, end) => {
    byId(id).textContent = text.slice(0, Math.floor(progress(time, start, end) * text.length));
  };
  function makeWords(id, text) {
    const element = byId(id);
    element.replaceChildren(...text.split(' ').map((word, index) => {
      const span = document.createElement('span');
      span.textContent = (index ? ' ' : '') + word;
      span.style.display = 'inline-block';
      span.style.whiteSpace = 'pre';
      return span;
    }));
  }
  function revealWords(id, time, start, gap, duration) {
    for (const [index, span] of [...byId(id).children].entries()) {
      const amount = progress(time, start + index * gap, start + index * gap + duration);
      span.style.opacity = amount;
      span.style.transform = `translateY(${9 * (1 - easeOut(amount))}px)`;
      span.style.filter = `blur(${3 * (1 - amount)}px)`;
    }
  }
  makeWords('knows', 'Bolt knows what to do');
  makeWords('tell-once', 'Just tell it once');
  byId('uploaded-name').textContent = settings.fileName;
  byId('closing-title').textContent = settings.closingTitle;
  byId('closing-subtitle').textContent = settings.closingSubtitle;
  const visibleObjects = ['opening-phrase', 'writing-phrase', 'all-label', 'this-label', 'just-write', 'introducing', 'knows', 'tell-once', 'import-copy', 'upload-copy', 'browse-copy', 'curated-copy', 'or-just', 'add-first', 'take-it', 'closing', 'prompt-camera', 'project-window', 'skill-form', 'repository-dialog', 'upload-zone', 'markdown-file', 'uploaded-file', 'curated-window'];

  function renderBackground(time) {
    const amount = keys(time, [[0, 0], [1.78, 0], [2.2, 1], [13.74, 1], [14.3, 0], [16.2, 0], [16.75, 1], [31.1, 1], [31.42, 0], [32.08, 0], [32.38, 1], [37.94, 1], [38.3, 0]])[0];
    alpha('full-blue', amount);
    alpha('lower-blue', 1 - amount);
    const drift = Math.sin(time * .27);
    byId('blue-haze').style.transform = `translate(${38 * drift}px,${20 * Math.cos(time * .34)}px) rotate(${drift * 3}deg)`;
    byId('cyan-column').style.transform = `translateX(${70 * Math.sin(time * .23)}px) rotate(${-6 + drift * 3}deg)`;
    byId('white-column').style.transform = `translateX(${45 * Math.cos(time * .3)}px) rotate(${-12 + drift * 4}deg)`;
    byId('dark-fold').style.transform = `translate(${50 * drift}px,${35 * Math.cos(time * .21)}px) rotate(${33 + drift * 4}deg)`;
    byId('dot-plane-a').style.backgroundPosition = `${time * 1.3}px ${time * .5}px`;
    byId('dot-plane-b').style.backgroundPosition = `${-time * .8}px ${time * .7}px`;
  }

  function renderOpening(time) {
    if (time < 25 / 30 - .000001) {
      alpha('opening-phrase', progress(time, .08, .18));
      pose('opening-phrase', keys(time, [[0, 0, 0, 1], [.55, 0, 0, 1], [.8, -210, 0, 1]]));
      for (const [id, start] of [['word-what', .08], ['word-if', .15], ['word-instead', .24]]) alpha(id, progress(time, start, start + .13));
      const jump = Math.sin(Math.PI * progress(time, .29, .7));
      byId('word-if').style.transform = `translateY(${-65 * jump}px)`;
      byId('word-if').style.color = time > .47 && time < .73 ? '#20aee8' : '#f5f5f5';
      byId('word-instead').style.color = time > .53 && time < .73 ? '#20aee8' : '#f5f5f5';
    }
    if (time >= 25 / 30 - .000001 && time < 2.05) {
      alpha('writing-phrase', 1 - progress(time, 1.78, 2.05));
      typeText('writing-phrase', 'of writing', time, .75, 1.13);
      if (time > 1.15 && time < 1.5 && Math.floor(time * 7) % 2) byId('writing-phrase').textContent += '|';
    }
    if (time >= 1.95 && time < 3.3) {
      const amount = progress(time, 2.08, 2.3) * (1 - progress(time, 3.12, 3.3));
      alpha('all-label', amount); alpha('this-label', amount);
    }
    if (time >= 3.2 && time < 5.35) {
      alpha('just-write', progress(time, 3.2, 3.4) * (1 - progress(time, 5.16, 5.35)));
      pose('just-write', keys(time, [[3.2, 0, 0, 1.28], [3.6, 0, 0, 1.28], [4.4, -480, 0, 1.28], [5.2, -620, 0, 1.28]]));
    }
    if (time >= 5.3 && time < 6.7 - .000001) {
      alpha('introducing', 1);
      [...byId('introducing').children].forEach((element, index) => {
        element.style.opacity = progress(time, 5.3 + index * .12, 5.65 + index * .12);
        element.style.filter = `blur(${12 * (1 - progress(time, 5.3, 5.8))}px)`;
      });
    }
  }

  function renderPrompt(time) {
    alpha('main-menu', 0); alpha('skill-menu', 0); alpha('skill-token', 0);
    alpha('prompt-placeholder', 0); alpha('prompt-typed', 0); alpha('long-prompt', 0); alpha('prompt-sheen', 0);
    byId('prompt-box').style.height = '280px';
    byId('prompt-box').style.filter = 'none';
    byId('prompt-box').style.background = '#1e1e20';
    byId('warp-amount').setAttribute('scale', '0');
    byId('main-menu').style.transform = 'none'; byId('skill-menu').style.transform = 'none';
    byId('skills-menu-row').classList.toggle('selected', time >= 8.35 && time < 10.35);
    byId('writing-menu-row').classList.toggle('selected', time >= 9.65 && time < 10.35);
    if (time >= 1.95 && time < 3.5) {
      alpha('prompt-camera', progress(time, 1.95, 2.13) * (1 - progress(time, 3.25, 3.5)));
      byId('prompt-box').style.height = '700px';
      pose('prompt-camera', keys(time, [[1.95, 565, 312, .16], [2.3, 420, 220, .45], [2.7, 375, 160, .53], [3, 368, 92, .57], [3.35, 368, -780, .57]]));
      alpha('long-prompt', 1);
      typeText('long-prompt', longCopy.repeat(2), time, 1.94, 3.2);
    }
    if (time >= 3.75 && time < 5.35) {
      alpha('prompt-camera', progress(time, 3.75, 3.9) * (1 - progress(time, 5.18, 5.35)));
      pose('prompt-camera', keys(time, [[3.75, 1480, 135, 1.65], [4.0, 742, 135, 1.65], [4.4, 505, 135, 1.65], [5.2, 462, 135, 1.65]]));
      alpha('skill-token', 1); byId('skill-token').textContent = '/write-app-copy';
      alpha('prompt-sheen', Math.sin(Math.PI * progress(time, 3.75, 4.6)) * .6);
      byId('prompt-sheen').style.transform = `translateX(${mix(-500, 500, progress(time, 3.75, 4.6))}px)`;
    }
    if (time >= 6.7 - .000001 && time < 12.0) {
      alpha('prompt-camera', 1);
      const camera = keys(time, [[6.7, 160, 220, 1.02], [7, 293, 253, .79], [7.5, 380, 220, 1.1], [8.3, 320, 213, 1.35], [8.6, 300, 210, 1.4], [9.0, 165, 148, 1.3], [9.5, -100, 28, 1.3], [10.05, -20, 28, 1.3], [10.55, 0, 110, 1.2], [11.0, 150, 215, 1.03], [12.0, 160, 220, 1.0]]);
      pose('prompt-camera', camera);
      alpha('prompt-placeholder', time < 10.25 ? 1 : 0);
      alpha('main-menu', progress(time, 7.28, 7.4) * (1 - progress(time, 10.25, 10.65)));
      alpha('skill-menu', progress(time, 8.68, 8.85) * (1 - progress(time, 10.25, 10.65)));
      if (time >= 10.25) {
        alpha('skill-token', progress(time, 10.25, 10.38));
        byId('skill-token').textContent = '/' + settings.writingSkill;
        const drop = easeOut(progress(time, 10.25, 10.65));
        byId('main-menu').style.transform = `translateY(${460 * drop}px)`;
        byId('skill-menu').style.transform = `translateY(${460 * drop}px)`;
      }
    }
    if (time >= 12 && time < 12.4) {
      alpha('prompt-camera', 1 - progress(time, 12.15, 12.4));
      pose('prompt-camera', keys(time, [[12, 160, 505, .25], [12.4, 160, 550, .25]]));
      alpha('skill-token', 1); byId('skill-token').textContent = '/' + settings.writingSkill;
    }
    if (time >= 31.2 - .000001 && time < 1051 / 30 - .000001) {
      alpha('prompt-camera', 1);
      pose('prompt-camera', keys(time, [[31.133333, 390, 274, .54], [31.5, 420, 280, .48], [32, 420, 280, .48], [32.48, 210, 240, .93], [33.2, 195, 238, .96], [35, 195, 238, .96]]));
      alpha('or-just', 1 - progress(time, 32.02, 32.28));
      pose('or-just', [0, -110, .86]);
      alpha('prompt-placeholder', time < 32.66 ? 1 : 0);
      alpha('prompt-typed', time >= 32.66 && time < 33.28 ? 1 : 0);
      typeText('prompt-typed', '/' + settings.skillName, time, 32.65, 33.18);
      alpha('skill-token', progress(time, 33.22, 33.35)); byId('skill-token').textContent = '/' + settings.skillName;
      const warp = Math.sin(Math.PI * progress(time, 31.13, 31.48));
      if (warp > 0) {
        byId('prompt-box').style.filter = 'url(#liquid-warp)';
        byId('warp-amount').setAttribute('scale', String(50 * warp));
        byId('prompt-box').style.background = `rgb(${30 - 24 * warp},${30 + 45 * warp},${32 + 220 * warp})`;
        byId('or-just').style.transform += ` skewX(${7 * warp}deg)`;
      }
    }
  }

  function renderProject(time) {
    const first = time >= 12 && time < 14.28;
    const second = time >= 1051 / 30 - .000001 && time < 38.3;
    if (!first && !second) return;
    const amount = first ? (.1 + .9 * progress(time, 12, 12.75)) * (1 - progress(time, 13.75, 14.28)) : (.55 + .45 * progress(time, 35.033333, 35.36)) * (1 - progress(time, 37.95, 38.3));
    alpha('project-window', amount);
    pose('project-window', first ? keys(time, [[12, 405, 80, .79], [12.65, 148, 75, .94], [13.7, 148, 75, .94], [14.28, 148, 180, .94]]) : keys(time, [[35.033333, 220, 148, .82], [35.7, 220, 148, .82], [37.7, 220, 148, .82], [38.3, 220, 148, .82]]));
    const recolor = second ? smooth(progress(time, 35.75, 37.0)) : 0;
    const page = byId('recipe-page');
    page.style.background = `rgb(${mix(248, 248, recolor)},${mix(250, 239, recolor)},${mix(247, 208, recolor)})`;
    page.style.color = recolor > .5 ? '#751d3e' : '#14392a';
    const heading = byId('recipe-heading');
    heading.textContent = 'You next masterpiece awaits.';
    heading.style.fontFamily = 'Georgia, serif'; heading.style.fontStyle = 'italic'; heading.style.fontWeight = '700'; heading.style.color = '';
    if (first && time < 12.58) {
      heading.textContent = 'Find your next masterpiece.'.slice(0, Math.ceil(27 * (1 - progress(time, 12.3, 12.58))));
      heading.style.fontFamily = 'InterLocal'; heading.style.fontStyle = 'normal'; heading.style.fontWeight = '400'; heading.style.color = '#2787c4';
    } else if (first && time < 13) {
      typeText('recipe-heading', 'You next masterpiece awaits.', time, 12.58, 13);
    }
    for (const element of document.querySelectorAll('.recipe-filters > *')) element.style.background = recolor > .5 ? '#f0e4b2' : '#e0f4df';
    for (const element of [document.querySelector('.recipe-filters b'), document.querySelector('#recipe-page nav b')]) element.style.background = recolor > .5 ? '#8f214c' : '#346e4b';
    const shimmer = second ? Math.sin(Math.PI * progress(time, 35.7, 36.9)) : Math.sin(Math.PI * progress(time, 12.4, 13.15));
    alpha('project-sheen', shimmer * .55);
    byId('project-sheen').style.transform = `translateX(${mix(-900, 900, second ? progress(time, 35.7, 36.9) : progress(time, 12.4, 13.15))}px)`;
    const wobble = second ? Math.sin(Math.PI * progress(time, 35.75, 36.85)) : 0;
    byId('recipe-heading').style.filter = `blur(${wobble * 3}px)`;
    document.querySelector('.recipe-images').style.filter = `blur(${wobble * 1.8}px)`;
    document.querySelector('.recipe-images').style.transform = `skewY(${wobble * 1.5}deg)`;
  }

  function renderForm(time) {
    if (time >= 14.2 && time < 15.4) {
      alpha('knows', 1 - progress(time, 15.08, 15.4));
      revealWords('knows', time, 14.18, .075, .25);
    }
    if (time >= 15.35 && time < 16.85) {
      alpha('tell-once', 1 - progress(time, 16.25, 16.85));
      revealWords('tell-once', time, 15.35, .085, .22);
      pose('tell-once', keys(time, [[15.35, 0, 0, 1], [16.2, 0, 0, 1], [16.85, -430, 0, 1]]));
    }
    if (time < 16.45 || time >= 21.98) return;
    alpha('skill-form', progress(time, 16.45, 16.8) * (1 - progress(time, 21.65, 21.98)));
    pose('skill-form', keys(time, [[16.45, 1430, 137, 1.25], [17, 440, 136, 1.25], [17.5, 380, 136, 1.25], [18, 140, 112, 1.15], [18.5, 65, 100, 1.08], [19, 50, 50, 1.1], [19.55, 140, -270, 1.1], [20, 62, -200, 1.05], [20.5, 130, -180, 1], [21, 205, 20, .78], [21.5, 218, -110, .77], [21.98, 218, -930, .77]]));
    typeText('skill-name-field', settings.skillName, time, 16.89, 17.35);
    typeText('skill-description', description, time, 17.35, 18.3);
    typeText('skill-instructions', instructions, time, 18.28, 20.05);
    const sheen = Math.sin(Math.PI * progress(time, 16.45, 17.05));
    alpha('form-sheen', sheen * .7);
    byId('form-sheen').style.transform = `translateX(${mix(-800, 800, progress(time, 16.45, 17.05))}px)`;
  }

  function renderImport(time) {
    if (time >= 21.93 && time < 24.8) {
      alpha('import-copy', progress(time, 21.93, 22.27) * (1 - progress(time, 23.76, 24.25)));
      const split = smooth(progress(time, 22.7, 23.55));
      byId('import-prefix').style.transform = `translateX(${-292 * split}px)`;
      byId('github-word').style.transform = `translateX(${139 * split}px)`;
    }
    if (time >= 22.8 && time < 25.25) {
      alpha('repository-dialog', progress(time, 22.8, 23.3) * (1 - progress(time, 24.85, 25.25)));
      pose('repository-dialog', keys(time, [[22.8, 625, 327, .05], [23.5, 510, 260, 1], [24.5, 435, 260, 1], [24.9, 435, 260, 1], [25.25, 435, -270, 1]]));
      typeText('repository-url', settings.repositoryUrl, time, 23.6, 24.25);
      alpha('repository-sheen', Math.sin(Math.PI * progress(time, 24.28, 24.85)) * .8);
      byId('repository-sheen').style.transform = `translateX(${mix(-250, 250, progress(time, 24.28, 24.85))}px)`;
    }
    if (time >= 24.96 && time < 27.45) {
      alpha('upload-copy', progress(time, 24.96, 25.28) * (1 - progress(time, 26.95, 27.4)));
      pose('upload-copy', keys(time, [[24.96, 0, 0, 1], [25.5, 0, 0, 1], [26, 0, -120, 1], [26.9, 0, -120, 1]]));
    }
    if (time >= 25.8 && time < 27.35) {
      alpha('upload-zone', progress(time, 25.8, 26.15) * (1 - progress(time, 27.1, 27.35)));
      pose('upload-zone', [0, 0, 1]);
      alpha('markdown-file', progress(time, 26.76, 26.91) * (1 - progress(time, 27.1, 27.3)));
      pose('markdown-file', keys(time, [[26.75, 180, 120, 1.1, -30], [27, 0, 0, 1, -22], [27.3, -40, -90, .1, 0]]));
    }
    if (time >= 27.2 && time < 28.35) {
      alpha('uploaded-file', progress(time, 27.2, 27.45) * (1 - progress(time, 28.05, 28.35)));
      pose('uploaded-file', keys(time, [[27.2, 0, -15, .96], [27.5, 0, 0, 1], [28, 0, 30, 1], [28.35, 0, 50, 1]]));
    }
  }

  function renderCurated(time) {
    if (time < 28.05 || time >= 31.2 - .000001) return;
    alpha('curated-window', progress(time, 28.05, 28.35));
    const expand = easeOut(progress(time, 29.65, 30.25));
    const scroll = keys(time, [[28.05, -180], [28.55, -225], [29.05, -270], [29.35, -270], [29.65, -220], [30.25, 0]])[0];
    byId('curated-window').style.height = `${mix(90, 240, expand)}px`;
    byId('curated-window').style.width = `${mix(630, 420, expand)}px`;
    pose('curated-window', [mix(0, 100, expand), mix(0, -60, expand), 1]);
    byId('curated-rows').style.transform = `translateY(${scroll}px)`;
    for (const row of byId('curated-rows').children) {
      row.style.height = `${mix(90, 60, expand)}px`;
      row.style.fontSize = `${mix(38, 28, expand)}px`;
    }
    const labels = progress(time, 28.12, 28.6) * (1 - progress(time, 30.5, 31.03));
    alpha('browse-copy', labels); alpha('curated-copy', labels);
    pose('browse-copy', [mix(0, -490, expand), mix(-110, -45, expand), mix(1, .72, expand)]);
    pose('curated-copy', [mix(0, 400, expand), mix(145, 100, expand), mix(1, .72, expand)]);
  }

  function renderEnding(time) {
    if (time >= 38.2 && time < 39.7) alpha('add-first', progress(time, 38.2, 38.42) * (1 - progress(time, 39.35, 39.7)));
    if (time >= 39.35 && time < 40.88) alpha('take-it', progress(time, 39.35, 39.7) * (1 - progress(time, 40.65, 40.88)));
    if (time >= 40.8) {
      alpha('closing', progress(time, 40.8, 41.02));
      alpha('closing-subtitle', progress(time, 41.06, 41.3));
    }
  }
  function render(time) {
    for (const id of visibleObjects) alpha(id, 0);
    renderBackground(time);
    renderOpening(time);
    renderPrompt(time);
    renderProject(time);
    renderForm(time);
    renderImport(time);
    renderCurated(time);
    renderEnding(time);
    byId('root').dataset.time = time.toFixed(6);
    byId('root').dataset.scene = time < 5.3 ? 'prompt-compression' : time < 6.7 ? 'introducing' : time < 12 ? 'skill-menu' : time < 14.28 ? 'recipe-demo' : time < 16.45 ? 'tell-once' : time < 21.98 ? 'create-skill' : time < 24.96 ? 'github-import' : time < 28.05 ? 'file-upload' : time < 31.2 ? 'curated-skills' : time < 35.033333 ? 'custom-command' : time < 38.2 ? 'brand-recolor' : 'closing';
  }
  const clock = {time: 0};
  const timeline = gsap.timeline({paused: true, onUpdate: () => render(clock.time)});
  timeline.to(clock, {time: 1289 / 30, duration: 1289 / 30, ease: 'none'}, 0);
  window.__timelines = window.__timelines || {};
  window.__timelines["bolt-skills-213"] = timeline;
  render(0);
  byId('root').dataset.ready = 'true';
}
