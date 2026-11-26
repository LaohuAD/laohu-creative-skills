(() => {
  'use strict';

  const data = window.motionFontGallery;
  const $ = (selector) => document.querySelector(selector);
  const compare = $('#featured');
  const catalogue = $('#font-groups');
  const search = $('#family-filter');
  const text = $('#sample-text');
  const size = $('#sample-size');
  const defaultText = text.value;
  const latinText = 'Type moves 0193';
  const groupLabels = new Map([
    ['中文书写', '中文书写 · 楷行草与手写'],
    ['中文展示', '中文展示 · 艺术字'],
    ['中文圆体', '中文圆体'],
    ['中文像素', '中文像素'],
    ['中文宋体', '中文宋体'],
    ['中文黑体', '中文黑体'],
    ['拉丁书写', '西文书写'],
    ['拉丁展示', '西文展示'],
    ['拉丁衬线', '西文衬线'],
    ['拉丁无衬线', '西文无衬线'],
    ['等宽字', '等宽字 · 代码与数字'],
  ]);
  const featuredSpecs = [
    ['font:ma-shan-zheng', '毛笔楷书', 400],
    ['font:zhi-mang-xing', '行书', 400],
    ['font:liu-jian-mao-cao', '毛笔草体', 400],
    ['font:long-cang', '手写', 400],
    ['font:lxgw-marker-gothic', '漫黑展示', 400],
    ['font:zhuque-fangsong', '仿宋活字', 400],
    ['font:cactus-classical-serif', '古典宋体', 400],
    ['font:chocolate-classical-sans', '人文古典黑', 400],
    ['font:ark-pixel-12px-mono-zh-hans', '像素', 400],
  ];
  const classicSpecs = [
    ['font:lxgw-wenkai-regular', '文楷书写', 400],
    ['font:lxgw-marker-gothic', '圆润漫黑', 400],
    ['font:noto-serif-sc-variable', '思源宋体', 500],
    ['font:noto-sans-sc-variable', '思源黑体', 500],
  ];

  if (!data?.fonts?.length) {
    $('#counts').textContent = '字体目录数据未载入。请检查本地 gallery-data.js。';
    return;
  }

  const fonts = data.fonts.map((font, index) => ({ ...font, alias: `MotionSpecimen${index}` }));
  for (const {category} of fonts) {
    if (!groupLabels.has(category)) groupLabels.set(category, category);
  }
  const supportsChinese = (font) => font.category.startsWith('中文') || font.scripts.includes('汉字');
  const faces = new Map();
  const views = [];
  const groups = [];
  const browserCanVerify = /^https?:$/.test(location.protocol) && Boolean(window.crypto?.subtle);

  function element(tag, classes, value) {
    const node = document.createElement(tag);
    if (classes) node.className = classes;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function rangeSet(ranges) {
    const points = new Set();
    for (const span of ranges.split(' ')) {
      if (!span) continue;
      const [first, last = first] = span.split('-').map((value) => Number.parseInt(value, 16));
      for (let point = first; point <= last; point += 1) points.add(point);
    }
    return points;
  }

  function textCoverage(font, sample) {
    font.points ??= rangeSet(font.cmap);
    font.variants ??= new Map();
    const missing = new Set();
    const parts = [];
    let previous;
    for (const char of sample) {
      if (char === '\r') continue;
      if (char === '\n' || char === '\t') {
        parts.push({ char, covered: true });
        previous = undefined;
        continue;
      }
      const point = char.codePointAt(0);
      const variant = point >= 0xfe00 && point <= 0xfe0f || point >= 0xe0100 && point <= 0xe01ef;
      let covered;
      if (variant) {
        if (!font.variants.has(point)) {
          font.variants.set(point, rangeSet(font.variationSequences[point.toString(16).toUpperCase()] || ''));
        }
        covered = font.variants.get(point).has(previous);
      } else {
        covered = font.points.has(point);
      }
      if (!covered) {
        const hex = `U+${point.toString(16).toUpperCase().padStart(4, '0')}`;
        missing.add(variant ? `${previous === undefined ? '' : String.fromCodePoint(previous)} ${hex}`
          : point === 32 || /\s/u.test(char) ? hex : char);
      }
      parts.push({ char, covered, variant });
      previous = point;
    }
    return { parts, missing: [...missing] };
  }

  async function checkedBytes(descriptor) {
    const response = await fetch(descriptor.url);
    if (!response.ok) throw new Error(`Unreadable file ${descriptor.name}`);
    const bytes = await response.arrayBuffer();
    const hash = await window.crypto.subtle.digest('SHA-256', bytes);
    const actual = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (actual !== descriptor.sha256) throw new Error(`Changed file ${descriptor.name}`);
    return bytes;
  }

  function loadFace(font) {
    if (faces.has(font.id)) return faces.get(font.id);
    const result = (async () => {
      const weight = font.weight.min === font.weight.max ? String(font.weight.min) : `${font.weight.min} ${font.weight.max}`;
      const copies = [...font.copies].sort((a, b) => Number(Boolean(b.license)) - Number(Boolean(a.license)));
      for (const copy of copies) {
        try {
          const src = browserCanVerify
            ? await checkedBytes(copy.file)
            : `url(${JSON.stringify(copy.file.url)}) format(${JSON.stringify(copy.file.format)})`;
          const face = await new FontFace(font.alias, src, { weight, style: font.style }).load();
          document.fonts.add(face);
          const licenseVerified = browserCanVerify && copy.license
            ? await checkedBytes(copy.license).then(() => true, () => false) : false;
          return { face, copy, licenseVerified };
        } catch {
          // Try another indexed location with the same expected binary content.
        }
      }
      return null;
    })();
    faces.set(font.id, result);
    return result;
  }

  function drawText(view) {
    const sample = text.value || defaultText;
    const original = textCoverage(view.font, sample);
    const preferLatin = !supportsChinese(view.font) && original.missing.length > 0;
    const output = preferLatin ? textCoverage(view.font, latinText) : original;
    view.status.classList.toggle('has-gap', original.missing.length > 0);
    if (original.missing.length) {
      view.status.textContent = `${preferLatin ? '西文样张 · ' : ''}原句缺字 ${original.missing.join('、')}`;
    } else {
      view.status.textContent = '原句用字齐全';
    }
    if (view.root.dataset.state !== 'loaded') return;

    const fragment = document.createDocumentFragment();
    let run = '';
    for (const part of output.parts) {
      if (part.covered) {
        run += part.char;
      } else {
        if (run) fragment.append(run);
        run = '';
        const box = element('span', 'missing-glyph');
        const label = part.variant ? `缺少异体字序列 ${part.char.codePointAt(0).toString(16)}` : `缺字 ${part.char}`;
        box.setAttribute('role', 'img');
        box.setAttribute('aria-label', label);
        box.title = label;
        fragment.append(box);
      }
    }
    if (run) fragment.append(run);
    view.sample.replaceChildren(fragment);
  }

  async function mountFace(view) {
    if (view.root.dataset.state !== 'waiting') return;
    view.root.dataset.state = 'loading';
    view.placeholder.textContent = '正在载入字形…';
    const loaded = await loadFace(view.font);
    if (!loaded) {
      view.root.dataset.state = 'unavailable';
      view.placeholder.textContent = '当前字体文件无法载入';
      view.assetStatus.textContent = '文件待核对';
      return;
    }
    view.sample.style.fontFamily = view.font.alias;
    view.sample.style.fontStyle = view.font.style;
    view.placeholder.hidden = true;
    view.sample.hidden = false;
    view.root.dataset.state = 'loaded';
    view.assetStatus.textContent = browserCanVerify && loaded.licenseVerified
      ? '已核对样张文件和许可'
      : browserCanVerify ? '样张文件已核对 · 许可待核对' : '本地样张 · 选用前核对许可';
    drawText(view);
  }

  function fontWeight(font) {
    return font.weight.min === font.weight.max
      ? String(font.weight.min) : `${font.weight.min}–${font.weight.max}`;
  }

  function fileDetails(font, sample) {
    const details = element('details');
    details.append(element('summary', '', '字重与来源文件'));
    details.append(element('h4', '', font.id));
    const family = font.label === font.family ? font.family : `${font.label} · ${font.family}`;
    const scripts = font.scripts.length ? font.scripts.join('、') : '按用字检索';
    details.append(element('p', '', `${family} · 字重 ${fontWeight(font)} · 覆盖示例 ${scripts}`));
    details.append(element('p', '', font.summary));
    if (font.upstream) {
      const upstream = element('a', '', '上游字体来源');
      upstream.href = font.upstream;
      details.append(upstream);
    }
    if (font.weight.min !== font.weight.max) {
      const change = element('label', 'weight-trial', '试排字重 ');
      const slider = element('input');
      slider.type = 'range';
      slider.min = font.weight.min;
      slider.max = font.weight.max;
      slider.value = sample.style.fontWeight;
      const number = element('output', '', slider.value);
      slider.addEventListener('input', () => {
        sample.style.fontWeight = slider.value;
        number.textContent = slider.value;
      });
      change.append(slider, number);
      details.append(change);
    }
    const sources = element('ul', 'sources');
    for (const copy of font.copies) {
      const row = element('li');
      const file = element('a', '', copy.file.name);
      file.href = copy.file.url;
      file.title = copy.file.sha256;
      row.append(element('span', '', `${copy.source} · `), file);
      if (copy.license) {
        const license = element('a', '', '许可原文');
        license.href = copy.license.url;
        license.title = copy.license.sha256;
        row.append(' · ', license);
      } else {
        row.append(' · 许可待查');
      }
      sources.append(row);
    }
    details.append(sources);
    return details;
  }

  function specimen(font, feature) {
    const root = element('article', 'sheet');
    root.dataset.font = font.id;
    root.dataset.state = 'waiting';
    const figure = element('figure');
    const caption = element('figcaption', '', font.label);
    const chosenWeight = feature ? feature[2] : Math.min(font.weight.max, Math.max(font.weight.min, 500));
    if (feature) caption.append(element('span', 'weight', `${feature[1]} · ${chosenWeight}`));
    const sampling = element('div', 'sampling');
    const placeholder = element('p', 'sample-placeholder', '等待载入字形…');
    const sample = element('p', 'sample-line');
    sample.hidden = true;
    sample.style.fontWeight = chosenWeight;
    sampling.append(placeholder, sample);
    const extra = font.style === 'italic' ? ' · 斜体' : '';
    const faceMeta = element('p', 'face-meta', feature
      ? font.family
      : `字重 ${fontWeight(font)}${extra} · ${font.coverageScope} · ${supportsChinese(font) ? '汉字按原句核对' : '西文'}`);
    const status = element('p', 'coverage');
    figure.append(caption, sampling, faceMeta, status);
    root.append(figure);
    const assetStatus = element('p', 'face-meta');
    if (!feature) {
      const details = fileDetails(font, sample);
      details.append(assetStatus);
      root.append(details);
    }
    const view = { root, font, sample, status, placeholder, assetStatus };
    views.push(view);
    drawText(view);
    return view;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      mountFace(viewsByRoot.get(entry.target));
    }
  }, { rootMargin: '180px' });
  const viewsByRoot = new Map();

  const classic = $('#classic');
  for (const [container, specs] of [[compare, featuredSpecs], [classic, classicSpecs]]) {
    for (const feature of specs) {
      const font = fonts.find((row) => row.id === feature[0]);
      if (!font) continue;
      const view = specimen(font, feature);
      container.append(view.root);
      viewsByRoot.set(view.root, view);
      observer.observe(view.root);
    }
  }
  $('#compare-set').addEventListener('change', (event) => {
    compare.hidden = event.target.value !== 'expanded';
    classic.hidden = !compare.hidden;
  });

  const families = new Set(fonts.map((font) => font.family));
  const chinese = fonts.filter((font) => font.category.startsWith('中文'));
  const chineseFamilies = new Set(chinese.map((font) => font.family));
  $('#counts').textContent = `${fonts.length} 份字体文件，${families.size} 个家族。中文 ${chinese.length} 份，覆盖 ${chineseFamilies.size} 个登记家族。`;

  for (const [category, display] of groupLabels) {
    const groupFonts = fonts.filter((font) => font.category === category);
    if (!groupFonts.length) continue;
    const section = element('section', 'catalog-group');
    section.id = `faces-${groups.length}`;
    const heading = element('h3', '', display);
    const count = element('span', 'group-count');
    heading.append(count);
    const atlas = element('div', 'atlas');
    section.append(heading, atlas);
    const link = element('a', '', display.split(' · ')[0]);
    link.href = `#${section.id}`;
    $('#jump-list').append(link);
    const groupViews = groupFonts.map((font) => specimen(font));
    for (const view of groupViews) {
      atlas.append(view.root);
      viewsByRoot.set(view.root, view);
      observer.observe(view.root);
    }
    catalogue.append(section);
    groups.push({ section, link, count, views: groupViews });
  }

  function filter() {
    const terms = search.value.toLowerCase().trim().split(/\s+/u).filter(Boolean);
    let total = 0;
    for (const group of groups) {
      let count = 0;
      for (const view of group.views) {
        const font = view.font;
        const fileNames = font.copies.map((copy) => copy.file.name);
        const haystack = [font.id, font.label, font.family, font.category, ...font.aliases, ...fileNames].join(' ').toLowerCase();
        const show = terms.every((term) => haystack.includes(term));
        view.root.hidden = !show;
        if (show) count += 1;
      }
      group.section.hidden = group.link.hidden = count === 0;
      group.count.textContent = `${count} 份`;
      total += count;
    }
    $('#visible-count').textContent = `显示 ${total} / ${fonts.length} 份`;
    $('#empty-results').hidden = total !== 0;
  }

  function updateSamples() {
    for (const view of views) drawText(view);
  }

  $('#sample-form').addEventListener('submit', (event) => event.preventDefault());
  $('#reset').addEventListener('click', () => {
    text.value = defaultText;
    updateSamples();
  });
  for (const button of document.querySelectorAll('[data-example]')) {
    button.addEventListener('click', () => {
      text.value = button.dataset.example;
      updateSamples();
    });
  }
  text.addEventListener('input', updateSamples);
  search.addEventListener('input', filter);
  function changeSize() {
    document.documentElement.style.setProperty('--sample-size', `${size.value}px`);
    $('#size-value').textContent = `${size.value} px`;
  }

  if (matchMedia('(max-width: 760px)').matches && size.value === size.defaultValue) {
    size.value = size.min;
  }
  size.addEventListener('input', changeSize);
  changeSize();
  filter();
})();
