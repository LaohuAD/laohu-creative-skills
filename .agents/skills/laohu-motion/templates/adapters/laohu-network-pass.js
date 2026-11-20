/*
 * Laohu local adapter for the pinned Huashu Art Motion t1_3b1b s1+s2 coupled scene.
 * Source: alchaincyf/huashu-art-motion, commit 8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c (MIT).
 * Source files: scripts/engine/demos/t1_3b1b/t1_s1.js (Git blob b5d0c35c211fbd766a4aef11a76f5f2a28deb33f; SHA-256 10f1e0b82dae1c55f53f59ae6fbae8d976773d822c749171f924121214d47b3a),
 * scripts/engine/demos/t1_3b1b/t1_s2.js (Git blob ea22ea60d26087442be248e504c954784d7d948e; SHA-256 686b2c620be37ede852c92c3952f624dfbaf5724927328e9ab45d8bc7569922f),
 * eras.js (Git blob 704a31b8d49f70d0882b7dfff6d87283ef2a373e; SHA-256 448e7293cf5a0e724b2cfa4cab1bc7148f8027ecc0ddfc6a04ade2817acb2216).
 * Only the source data declarations are adapted into explicit input fields; drawing bodies, geometry, timing calls, camera path, order, fonts and colors remain source-derived.
 * The upstream MIT notice and permission text are retained here as required for substantial portions.
 *
 * MIT License
 * Copyright (c) 2026 alchaincyf (花叔 · 花生)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
(function (root) {
  "use strict";
  const TYPE = "custom:laohu-network-pass";
  const SOURCE = Object.freeze({ id: "huashu-art-motion", commit: "8a0d7d72ca65fcce6f8ba82c4a6c8dfe35b8422c", scenes: ["t1_s1", "t1_s2"], durationSec: 5.4 });
  const GROUP_START = 0;
  const S1_END = 2.6;
  const GROUP_END = 5.4;
  const groupCache = new Map();
  const DISCLOSURE_ID = "network-pass-disclosure";
  const DISCLOSURE = Object.freeze({
    type: "text",
    space: "screen",
    x: 960,
    y: 1018,
    fontFamily: "NotoSerifSC",
    fontWeight: "700",
    fontSize: 38,
    maxWidth: 1680,
    align: "center",
    baseline: "alphabetic",
    fill: "#FFFF00",
  });
  const DISCLOSURE_KEYS = new Set([
    "id", "type", "space", "x", "y", "text", "fontFamily", "fontWeight",
    "fontSize", "maxWidth", "align", "baseline", "fill",
  ]);

  function fail(message) { throw new Error(message); }
  function exactKeys(value, allowed, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(label + " must be an object");
    for (const key of Object.keys(value)) if (!allowed.has(key)) fail(label + " contains unsupported field " + key);
  }
  function boundedArray(value, count, low, high, label) {
    if (!Array.isArray(value) || value.length !== count) fail(label + " must contain exactly " + count + " numbers");
    return value.map((item, index) => {
      if (!Number.isFinite(item) || item < low || item > high) fail(label + "[" + index + "] must be finite in [" + low + ", " + high + "]");
      return item;
    });
  }
  function matrix(value, rows, columns, low, high, label) {
    if (!Array.isArray(value) || value.length !== rows) fail(label + " must have " + rows + " rows");
    return value.map((row, rowIndex) => boundedArray(row, columns, low, high, label + "[" + rowIndex + "]"));
  }
  function normalizeParameters(object) {
    exactKeys(object.data || {}, new Set(["nativeParameters"]), object.id + ".data");
    const raw = object.data?.nativeParameters == null ? {} : object.data.nativeParameters;
    exactKeys(raw, new Set(["inputPixels", "outputs", "hiddenActivations", "inputToHiddenWeights", "hiddenToOutputWeights"]), object.id + ".data.nativeParameters");
    const normalized = {};
    if (raw.inputPixels != null) normalized.inputPixels = boundedArray(raw.inputPixels, 100, 0, 1, object.id + ".data.nativeParameters.inputPixels");
    if (raw.outputs != null) {
      if (!Array.isArray(raw.outputs) || raw.outputs.length !== 3) fail(object.id + ".data.nativeParameters.outputs must contain exactly 3 named outputs");
      normalized.outputs = raw.outputs.map((output, index) => {
        exactKeys(output, new Set(["name", "activation"]), object.id + ".data.nativeParameters.outputs[" + index + "]");
        if (typeof output.name !== "string" || !output.name.trim() || /[\r\n\u2028\u2029]/.test(output.name)) fail(object.id + ".data.nativeParameters.outputs[" + index + "].name must be non-empty single-line text");
        if (!Number.isFinite(output.activation) || output.activation < 0 || output.activation > 1) fail(object.id + ".data.nativeParameters.outputs[" + index + "].activation must be in [0, 1]");
        return { name: output.name, activation: output.activation };
      });
    }
    if (raw.hiddenActivations != null) normalized.hiddenActivations = boundedArray(raw.hiddenActivations, 10, 0, 1, object.id + ".data.nativeParameters.hiddenActivations");
    if (raw.inputToHiddenWeights != null) normalized.inputToHiddenWeights = matrix(raw.inputToHiddenWeights, 16, 10, -1, 1, object.id + ".data.nativeParameters.inputToHiddenWeights");
    if (raw.hiddenToOutputWeights != null) normalized.hiddenToOutputWeights = matrix(raw.hiddenToOutputWeights, 10, 3, -1, 1, object.id + ".data.nativeParameters.hiddenToOutputWeights");
    return normalized;
  }
  function summarizeParameters(parameters) {
    const numericSummary = (values) => values && values.length
      ? { count: values.length, min: Math.min(...values), max: Math.max(...values) }
      : null;
    return {
      inputPixels: parameters.inputPixels ? numericSummary(parameters.inputPixels) : null,
      outputs: parameters.outputs ? parameters.outputs.map(({ name, activation }) => ({ name, activation })) : null,
      hiddenActivations: parameters.hiddenActivations ? parameters.hiddenActivations.slice() : null,
      inputToHiddenWeights: parameters.inputToHiddenWeights ? { rows: 16, columns: 10, values: numericSummary(parameters.inputToHiddenWeights.flat()) } : null,
      hiddenToOutputWeights: parameters.hiddenToOutputWeights ? { rows: 10, columns: 3, values: numericSummary(parameters.hiddenToOutputWeights.flat()) } : null,
    };
  }
  function validateOutputNameFit(ctx, parameters, objectId) {
    if (!parameters.outputs) return;
    ctx.save();
    try {
      ctx.font = `600 46px "${root.DG.FONT.zh}"`;
      for (const [index, output] of parameters.outputs.entries()) {
        const missingGlyphs = root.U?.missingGlyphs?.(root.DG.FONT.zh, output.name);
        if (!Array.isArray(missingGlyphs)) fail(`${objectId}.data.nativeParameters.outputs[${index}].name requires the pinned source font cmap to be loaded before rendering`);
        if (missingGlyphs.length) fail(`${objectId}.data.nativeParameters.outputs[${index}].name contains glyphs absent from the pinned ${root.DG.FONT.zh} subset: ${missingGlyphs.join("")}`);
        const width = ctx.measureText(output.name).width;
        if (!Number.isFinite(width) || width > 54) fail(`${objectId}.data.nativeParameters.outputs[${index}].name exceeds the source label slot (${width}px > 54px)`);
      }
    } finally { ctx.restore(); }
  }
  function validateDisclosureObject(ctx, disclosure) {
    exactKeys(disclosure, DISCLOSURE_KEYS, TYPE + " disclosure object");
    if (disclosure.id !== DISCLOSURE_ID) fail(TYPE + " optional disclosure object must use id " + DISCLOSURE_ID);
    for (const [field, expected] of Object.entries(DISCLOSURE)) {
      if (disclosure[field] !== expected) fail(TYPE + " disclosure object has unsupported " + field + "; expected " + String(expected));
    }
    if (typeof disclosure.text !== "string" || !disclosure.text.trim() || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(disclosure.text)) {
      fail(TYPE + " disclosure text must be non-empty single-line text without control characters");
    }
    const missingGlyphs = root.U?.missingGlyphs?.(DISCLOSURE.fontFamily, disclosure.text);
    if (!Array.isArray(missingGlyphs)) fail(TYPE + " disclosure text requires the pinned source font cmap to be loaded before rendering");
    if (missingGlyphs.length) fail(TYPE + " disclosure text contains glyphs absent from the pinned " + DISCLOSURE.fontFamily + " subset: " + missingGlyphs.join(""));
    if (typeof root.MotionCore?.layoutText !== "function") fail(TYPE + " disclosure text requires MotionCore.layoutText");

    ctx.save();
    try {
      // Match MotionCore.configureTextFont for the following Core text object.
      ctx.font = `${DISCLOSURE.fontWeight} ${DISCLOSURE.fontSize}px ${DISCLOSURE.fontFamily}`;
      const layout = root.MotionCore.layoutText(ctx, disclosure.text, { maxWidth: DISCLOSURE.maxWidth });
      if (!Array.isArray(layout.lines) || layout.lines.length !== 1 || !Array.isArray(layout.widths) || layout.widths.length !== 1) {
        fail(TYPE + " disclosure text must fit as one line in the fixed safe region; it is not wrapped or shrunk");
      }
      const measuredWidthPx = layout.widths[0];
      if (!Number.isFinite(measuredWidthPx) || measuredWidthPx <= 0 || measuredWidthPx > DISCLOSURE.maxWidth) {
        fail(TYPE + " disclosure text exceeds the fixed readable width (" + measuredWidthPx + "px > " + DISCLOSURE.maxWidth + "px)");
      }
      return { id: DISCLOSURE_ID, text: disclosure.text, fontFamily: DISCLOSURE.fontFamily, fontWeight: DISCLOSURE.fontWeight, fontSize: DISCLOSURE.fontSize, measuredWidthPx, maxWidthPx: DISCLOSURE.maxWidth };
    } finally { ctx.restore(); }
  }
  function validateScene(ctx, object, scene) {
    if (scene.width !== 1920 || scene.height !== 1080) fail(TYPE + " requires the source 1920×1080 canvas");
    if (Math.abs(scene.duration - GROUP_END) > 1e-8) fail(TYPE + " requires the unscaled 5.4-second source clock (2.6s s1 + 2.8s s2)");
    const objects = Array.isArray(scene.objects) ? scene.objects : [];
    if (objects.length < 1 || objects.length > 2 || objects[0]?.id !== object.id || objects[0]?.type !== TYPE || object.space !== "screen") {
      fail(TYPE + " requires one top-level screen-space group object, optionally followed by one fixed disclosure text object");
    }
    const disclosure = objects.length === 2 ? validateDisclosureObject(ctx, objects[1]) : null;
    if ((scene.layers || []).length || (scene.events || []).length || (scene.bindings || []).length) fail(TYPE + " does not accept extra layers, events, or bindings that alter the source group");
    if (object.clip || object.style || object.styleOverrides || object.visible === false || (object.opacity != null && object.opacity !== 1)) fail(TYPE + " requires the original unclipped, fully visible source group");
    for (const [field, expected] of [["x", 0], ["y", 0], ["translateX", 0], ["translateY", 0], ["rotation", 0]]) {
      if (object[field] != null && object[field] !== expected) fail(TYPE + " does not support object-level transform " + field);
    }
    for (const field of ["scale", "scaleX", "scaleY"]) if (object[field] != null && object[field] !== 1) fail(TYPE + " does not support object-level scale " + field);
    return disclosure;
  }
  function groupFor(parameters) {
    const key = JSON.stringify(parameters);
    if (!groupCache.has(key)) groupCache.set(key, createSourceGroup(parameters));
    return groupCache.get(key);
  }

  // Source-derived factory. Per-instance local window/SCENES keeps independent explicit states isolated.
  function createSourceGroup(sourceParameters) {
    const window = {};
    const SCENES = {};
    const ERAS = [
      { id: 't1_s1', dur: 2.6 },
      { id: 't1_s2', dur: 2.8 },
      { id: 't1_s3', dur: 2.6, transition: { type: 'zoomThrough', dur: 0.75, cx: 850, cy: 391.5, zoom: 48, r0: 24.2, live: true, focus: [640, 585] } },
    ];
    let T1;
    // t1 · 3b1b 式：「神经网络一层是怎么把像素变成『猫』的」
    // 镜头 1（2.6s）：一张 10×10 的猫图逐格出现 → 每格写上亮度 → 100 个像素 Transform 成一列输入神经元（16 个可见＋⋮）
    // 本文件同时放 t1 三个镜头共用的数据与布局（window.T1），后面的镜头直接用。
    (() => {
    const { clamp, lerp, hash } = U;
    const C = DG.MANIM;
    
    // ---------- 共用数据 ----------
    const CAT = [
      '0000000000',
      '0600000060',
      '0870000780',
      '0899999980',
      '0929999290',
      '0999999990',
      '0999449990',
      '0099999900',
      '0007887000',
      '0000000000'];
    const defaultPIX = []; for (let r = 0; r < 10; r++) for (let q = 0; q < 10; q++) { const d = +CAT[r][q]; defaultPIX.push(d ? clamp(d / 10 + (hash(r, q) - 0.5) * 0.08, 0, 1) : 0); }
    const PIX = sourceParameters.inputPixels ? sourceParameters.inputPixels.slice() : defaultPIX;
    // 「猫」神经元的权重：猫形处为正（蓝），猫形外一圈为负（红），眼睛处为负（猫的眼睛是暗的）
    const WTS = PIX.map((v, i) => {
      const r = (i / 10) | 0, q = i % 10;
      if (+CAT[r][q] === 2) return -0.55;
      if (v > 0.5) return 0.55 + 0.4 * hash(q, r + 7);
      let near = false; for (let dr = -1; dr <= 1; dr++) for (let dq = -1; dq <= 1; dq++) { const rr = r + dr, qq = q + dq; if (rr >= 0 && rr < 10 && qq >= 0 && qq < 10 && PIX[rr * 10 + qq] > 0.5) near = true; }
      return near ? -0.6 - 0.3 * hash(r, q + 3) : -0.12 * hash(q, r);
    });
    
    // ---------- 布局（屏幕 px；1 manim 单位 = 135px） ----------
    const GRID = { cx: 960, cy: 545, cell: 52 };
    const cellXY = i => [GRID.cx + ((i % 10) - 4.5) * GRID.cell, GRID.cy + (((i / 10) | 0) - 4.5) * GRID.cell];
    const IN_X = 330, IN_R = 17;
    const VIS = Array.from({ length: 16 }, (_, k) => Math.round(k * 99 / 15));           // 可见的 16 个输入
    const inY = j => 540 + (j - 7.5) * 44 + (j >= 8 ? 30 : -30);
    const HID_X = 900, HID_R = 22, HID_N = 10, hidY = j => 540 + (j - 4.5) * 70;
    const OUT_X = 1470, OUT_R = 32, defaultOUT = [{ y: 400, name: '猫', a: 0.92 }, { y: 540, name: '狗', a: 0.07 }, { y: 680, name: '鸟', a: 0.03 }], OUT = defaultOUT.map((entry, index) => ({ ...entry, name: sourceParameters.outputs ? sourceParameters.outputs[index].name : entry.name, a: sourceParameters.outputs ? sourceParameters.outputs[index].activation : entry.a }));
    const HID_A = sourceParameters.hiddenActivations ? sourceParameters.hiddenActivations.slice() : [0.82, 0.12, 0.95, 0.3, 0.64, 0.06, 0.71, 0.22, 0.88, 0.41];
    const W1 = sourceParameters.inputToHiddenWeights ? ((j, k) => sourceParameters.inputToHiddenWeights[j][k]) : ((j, k) => Math.sin(j * 12.9898 + k * 78.233) * 0.5 + (hash(j, k + 11) - 0.5) * 1.1);   // 输入→隐藏
    const defaultW2 = [[0.9, -0.5, 0.95, -0.2, 0.7, -0.8, 0.85, -0.3, 0.8, 0.1], [-0.6, 0.4, -0.7, 0.5, -0.2, 0.6, -0.5, 0.3, -0.4, 0.2], [-0.3, 0.2, -0.5, 0.6, -0.6, 0.4, -0.2, 0.7, -0.5, 0.3]], W2 = sourceParameters.hiddenToOutputWeights ? ((k, o) => sourceParameters.hiddenToOutputWeights[k][o]) : ((k, o) => defaultW2[o][k]);
    
    // 输入列（S1 结束、S2 全程都要画）
    const drawInputs = (c, a = 1) => {
      VIS.forEach((pi, j) => DG.neuron(c, IN_X, inY(j), IN_R, PIX[pi] * a, { sa: a }));
      c.save(); c.fillStyle = `rgba(255,255,255,${a})`; for (let d = -1; d <= 1; d++) { c.beginPath(); c.arc(IN_X, 540 + d * 16, 4, 0, Math.PI * 2); c.fill(); } c.restore();
    };
    const drawBrace = (c, p) => {
      DG.brace(c, IN_X - 34, inY(0) - IN_R, inY(15) + IN_R, { p: MO.smooth(p), lw: 3 });
      c.save(); c.translate(IN_X - 92, 540); c.rotate(-Math.PI / 2);
      DG.write(c, '100 个输入', 0, 0, 40, p, { align: 'center' }); c.restore();
    };
    window.T1 = { PIX, WTS, CAT, GRID, cellXY, IN_X, IN_R, VIS, inY, HID_X, HID_R, HID_N, hidY, OUT_X, OUT_R, OUT, HID_A, W1, W2, drawInputs, drawBrace };
    
    // ---------- 镜头 1 ----------
    const DUR = 2.6;
    SCENES['t1_s1'] = {
      draw(c, lt) {
        c.fillStyle = '#000'; c.fillRect(0, 0, 1920, 1080);
        // 相机：前 1.4s 绕网格极慢推近 1→1.025，Transform 开始时 smooth 拉回 1（镜头 2 首帧要逐像素对上）
        const z = 1 + 0.025 * MO.smooth(MO.seg(lt, 0, 1.4)) * (1 - MO.smooth(MO.seg(lt, 1.4, 2.2)));
        c.save(); c.translate(960, 545); c.scale(z, z); c.translate(-960, -545);
        // 标题：Write（linear，<15 个字 1 秒）
        const out = MO.smooth(MO.seg(lt, 1.4, 1.9));                  // FadeOut(shift=UP)
        c.save(); c.globalAlpha = 1 - out; c.translate(0, -40 * out);
        DG.write(c, '一张 10×10 的「猫」', 960, 150, 58, MO.seg(lt, 0.1, 1.1));
        c.restore();
    
        const morph = MO.seg(lt, 1.45, 2.55);                          // 100 个子 Transform，LaggedStart 0.01
        const appear = MO.seg(lt, 0.0, 0.9);
        const order = i => ((i % 10) + ((i / 10) | 0));                // 按对角线出现，像扫描
        for (let i = 0; i < 100; i++) {
          const [x, y] = cellXY(i), v = PIX[i];
          const qa = MO.smooth(clamp(appear * 1.6 - order(i) / 18 * 0.6));
          if (qa <= 0) continue;
          const qm = MO.smooth(MO.lagged(i, 100, morph, 0.01));
          const j = VIS.indexOf(i), vis = j >= 0;
          // 不可见的像素：飞向中间的 ⋮ 并缩成点
          const tx = IN_X, ty = vis ? inY(j) : 540 + (((i * 7) % 3) - 1) * 16, tr = vis ? IN_R : 3;
          const s = GRID.cell * (0.92 + 0.08 * qa);
          const A = DG.rectPts(x, y, s, s, 48), B = DG.circlePts(tx, ty, tr, 48);
          const pts = qm > 0 ? DG.morph(A, B, qm) : A;
          const fadeHidden = vis ? 1 : 1 - clamp((qm - 0.6) / 0.4);
          if (qm >= 1) { if (vis) DG.neuron(c, tx, ty, IN_R, v); continue; }   // 落定后用真圆画：镜头 2 首帧逐像素接得上（48 边形与 arc 抗锯齿不同）
          c.save(); c.globalAlpha = qa * fadeHidden;
          DG.shape(c, pts, { fill: `rgba(255,255,255,${v})`, stroke: `rgba(255,255,255,${lerp(0.22, 1, qm)})`, lw: lerp(1, 2, qm) });
          c.restore();
          // 亮度数字（0.7s 起淡入，Transform 开始时淡出）
          const na = clamp((lt - 0.7) / 0.3) * (1 - clamp((lt - 1.35) / 0.2));
          if (na > 0) { c.save(); c.globalAlpha = na; c.font = `20px "${DG.FONT.rm}"`; c.textAlign = 'center'; c.fillStyle = v > 0.55 ? '#000' : C.GREY_B; c.fillText(v.toFixed(1), x, y + 7); c.restore(); }
        }
        // 底部说明：FadeIn(shift=UP)，随标题一起淡出
        const la = MO.smooth(MO.seg(lt, 0.55, 1.15)) * (1 - out);
        if (la > 0) { c.save(); c.globalAlpha = la; c.font = `600 38px "${DG.FONT.zh}"`; c.textAlign = 'center'; c.fillStyle = C.GREY_A; c.fillText('每个像素 = 一个 0 到 1 之间的数', 960, 905 + 24 * (1 - la)); c.restore(); }
        // ⋮ 与大括号
        const dots = MO.smooth(MO.seg(lt, 2.25, 2.55));
        if (dots > 0) { c.save(); c.fillStyle = '#fff'; c.globalAlpha = dots; for (let d = -1; d <= 1; d++) { c.beginPath(); c.arc(IN_X, 540 + d * 16, 4, 0, Math.PI * 2); c.fill(); } c.restore(); }
        T1.drawBrace(c, MO.seg(lt, 1.95, 2.6));
        c.restore();
      },
    };
    })();
    
    T1 = window.T1;
    // t1 · 镜头 2（2.8s）：一层网络。连线按权重着色（蓝正红负、线宽 ∝ |w|³）逐条画出 → 公式 Write →
    // 黄色信号沿连线闪过（ShowPassingFlash）→ 隐藏层按激活值变亮 → 输出层「猫」最亮 → Indicate → 激活 0.95 的隐藏神经元描边染黄，镜头推进它。
    // 开头一帧与镜头 1 的最后一帧逐像素相同（Transform 接续，没有切）。
    (() => {
    const { clamp, lerp } = U;
    const C = DG.MANIM;
    const DUR = 2.8;
    const CAM_END = { x: 1000, y: 500, z: 1.1 };
    const TGT = { k: 2 };                                  // 要推进去看的隐藏层神经元（激活 0.95 的那个）
    const camAt = lt => {
      if (lt <= DUR) { const k = MO.smooth(clamp(lt / DUR)); return { x: lerp(960, CAM_END.x, k), y: lerp(540, CAM_END.y, k), z: lerp(1, CAM_END.z, k) }; }
      // 转场期间（lt>时长）：绕目标神经元的屏幕位置继续推相机，矢量重画；与 eras.js 里 zoomThrough 的 dur/zoom 一致
      const T = window.T1, wx = T.HID_X, wy = T.hidY(TGT.k);
      const tr = ERAS.find(e => e.id === 't1_s3').transition, e = MO.smooth(clamp((lt - DUR) / tr.dur));
      return CAM.pushTo(CAM_END, wx, wy, CAM_END.z * tr.zoom, e, 0);                // k=0：目标在屏幕上原地不动，只放大
    };
    SCENES['t1_s2'] = {
      camAt,
      draw(c, lt) {
        const T = window.T1;
        c.fillStyle = '#000'; c.fillRect(0, 0, 1920, 1080);
        const cam = camAt(lt);
        CAM.with(c, cam, (c) => {
          const inE = T.VIS.map((pi, j) => [T.IN_X, T.inY(j)]);
          const hid = Array.from({ length: T.HID_N }, (_, k) => [T.HID_X, T.hidY(k)]);
          // ---- 连线：ShowCreation，LaggedStart lag 0.006 ----
          const e1p = MO.seg(lt, 0.15, 0.95), e2p = MO.seg(lt, 0.55, 1.05);
          const n1 = inE.length * hid.length;
          inE.forEach((a, j) => hid.forEach((b, k) => {
            const i = j * hid.length + k, q = MO.smooth(MO.lagged(i, n1, e1p, 0.006));
            DG.edge(c, DG.edgeEnds(a[0], a[1], T.IN_R, b[0], b[1], T.HID_R), T.W1(j, k), q, { alpha: 0.7, maxW: 3 });
          }));
          hid.forEach((a, k) => T.OUT.forEach((o, m) => {
            const q = MO.smooth(MO.lagged(k * 3 + m, 30, e2p, 0.02));
            DG.edge(c, DG.edgeEnds(a[0], a[1], T.HID_R, T.OUT_X, o.y, T.OUT_R), T.W2(k, m), q, { alpha: 0.8, maxW: 3.4 });
          }));
          // ---- 信号：连线复制一份染黄、线宽 ×1.5，ShowPassingFlash（time_width 2），按输入行错开 ----
          const f1 = MO.seg(lt, 0.95, 1.75);
          if (f1 > 0 && f1 < 1) inE.forEach((a, j) => { if (T.PIX[T.VIS[j]] < 0.3) return; hid.forEach((b, k) => {
            const q = MO.smooth(MO.lagged(j, 16, f1, 0.04)); const [lo, hi] = DG.flash(q); if (hi <= lo) return;
            const e = DG.edgeEnds(a[0], a[1], T.IN_R, b[0], b[1], T.HID_R);
            c.save(); c.strokeStyle = C.YELLOW; c.globalAlpha = 0.85; c.lineWidth = 3; c.beginPath(); c.moveTo(lerp(e[0], e[2], lo), lerp(e[1], e[3], lo)); c.lineTo(lerp(e[0], e[2], hi), lerp(e[1], e[3], hi)); c.stroke(); c.restore();
          }); });
          const f2 = MO.seg(lt, 1.6, 2.25);
          if (f2 > 0 && f2 < 1) hid.forEach((a, k) => { if (T.HID_A[k] < 0.4) return; T.OUT.forEach((o, m) => {
            const q = MO.smooth(MO.lagged(k, 10, f2, 0.05)); const [lo, hi] = DG.flash(q); if (hi <= lo) return;
            const e = DG.edgeEnds(a[0], a[1], T.HID_R, T.OUT_X, o.y, T.OUT_R);
            c.save(); c.strokeStyle = C.YELLOW; c.globalAlpha = 0.9; c.lineWidth = 4.5; c.beginPath(); c.moveTo(lerp(e[0], e[2], lo), lerp(e[1], e[3], lo)); c.lineTo(lerp(e[0], e[2], hi), lerp(e[1], e[3], hi)); c.stroke(); c.restore();
          }); });
          // ---- 神经元 ----
          T.drawInputs(c); T.drawBrace(c, 1);
          const ha = MO.seg(lt, 0.0, 0.55), hf = MO.seg(lt, 1.3, 1.95);
          const pick = MO.smooth(MO.seg(lt, 2.3, 2.6));      // 末尾：目标隐藏神经元描边染黄（「我们来看这一个」），相机随后推进去
          hid.forEach((b, k) => { const q = MO.smooth(MO.lagged(k, 10, ha, 0.05)); if (q <= 0) return;
            const hk = k === TGT.k ? pick : 0;
            c.save(); c.globalAlpha = q; DG.neuron(c, b[0] + 24 * (1 - q), b[1], T.HID_R, T.HID_A[k] * MO.smooth(MO.lagged(k, 10, hf, 0.08)), { stroke: DG.mix('#ffffff', C.YELLOW, hk), lw: 2 + 2 * hk }); c.restore(); });
          const oa = MO.seg(lt, 0.2, 0.7), of = MO.seg(lt, 1.95, 2.4);
          T.OUT.forEach((o, m) => { const q = MO.smooth(MO.lagged(m, 3, oa, 0.2)); if (q <= 0) return;
            const fill = o.a * MO.smooth(of);
            c.save(); c.globalAlpha = q; DG.neuron(c, T.OUT_X + 24 * (1 - q), o.y, T.OUT_R, fill, { lw: 2.5 });
            // 标签＋数值；「猫」Indicate：放大 1.2、染黄、回来
            const ind = m === 0 ? DG.indicate(MO.seg(lt, 2.0, 2.45)) : { s: 1, k: 0 };
            c.translate(T.OUT_X + 62, o.y + 15); c.scale(ind.s, ind.s);
            c.font = `600 46px "${DG.FONT.zh}"`; c.fillStyle = DG.mix('#ffffff', C.YELLOW, ind.k); c.textAlign = 'left'; c.fillText(o.name, 0, 0);
            if (of > 0) { c.font = `40px "${DG.FONT.rm}"`; c.fillStyle = DG.mix(C.GREY_B, C.YELLOW, ind.k); c.globalAlpha = q * clamp(of * 2); c.fillText(TY.fmt(fill, 2), 62, 0); }
            c.restore(); });
        });
        // 公式（不随相机动：屏幕固定层），颜色编码：黄=激活，蓝=权重
        const Y = C.YELLOW, B = C.BLUE_C;
        DG.math(c, [{ s: 'a', it: true, col: Y, sup: '(1)' }, { s: '=', gap: 14 }, { s: 'σ', it: true, gap: 4 }, { s: '(', gap: 6 }, { s: 'W', it: true, col: B, gap: 8 },
          { s: 'a', it: true, col: Y, sup: '(0)', gap: 14 }, { s: '+', gap: 14 }, { s: 'b', it: true }, { s: ')' }], 960, 112, 64, { p: MO.seg(lt, 0.3, 1.3) });
      },
    };
    })();
    
    return { s1: SCENES['t1_s1'], s2: SCENES['t1_s2'] };
  }

  function renderer(ctx, object, timeSec, scene) {
    const disclosure = validateScene(ctx, object, scene);
    const parameters = normalizeParameters(object);
    validateOutputNameFit(ctx, parameters, object.id);
    const group = groupFor(parameters);
    const evidence = root.MOTION_EVIDENCE || (root.MOTION_EVIDENCE = {});
    const receipt = evidence.nativeNetworkPass || (evidence.nativeNetworkPass = { source: SOURCE, groupDurationSec: GROUP_END, sourceOrder: [{ id: "t1_s1", durationSec: S1_END }, { id: "t1_s2", durationSec: 2.8 }], objects: {} });
    const row = receipt.objects[object.id] || (receipt.objects[object.id] = { parameterFields: Object.keys(parameters), parameterEvidence: summarizeParameters(parameters), sameFrameDisclosure: null, drawCalls: { t1_s1: 0, t1_s2: 0 }, lastCall: null });
    row.sameFrameDisclosure = disclosure ? { ...disclosure, consumer: "MotionCore text primitive", sameFrame: true } : null;
    if (timeSec < GROUP_START || timeSec > GROUP_END) return;
    const sceneId = timeSec < S1_END ? "t1_s1" : "t1_s2";
    const localTimeSec = sceneId === "t1_s1" ? timeSec : timeSec - S1_END;
    row.drawCalls[sceneId] += 1;
    row.lastCall = { sceneId, sceneLocalTimeSec: localTimeSec, groupLocalTimeSec: timeSec };
    group[sceneId === "t1_s1" ? "s1" : "s2"].draw(ctx, localTimeSec);
  }

  function register(registry) {
    if (!root.DG || !root.MO || !root.CAM || !root.TY) fail("laohu-motion-network-pass requires the pinned Huashu Art Motion toolkit closure");
    const previousReady = root.MOTION_READY;
    root.MOTION_READY = async () => {
      if (typeof previousReady === "function") await previousReady();
      else if (previousReady != null) await previousReady;
      if (!Array.isArray(root.MOTION_SOURCE_FONT_FACES) || typeof root.U?.loadCmaps !== "function") {
        fail("laohu-motion-network-pass requires its catalogued CMU-rm and NotoSerifSC source fonts");
      }
      const loadedFamilies = new Set(root.MOTION_SOURCE_FONT_FACES.map((face) => face.family));
      if (![root.DG.FONT.rm, root.DG.FONT.zh].every((family) => loadedFamilies.has(family))) {
        fail("laohu-motion-network-pass source font faces must include the original DG.FONT.rm and DG.FONT.zh families");
      }
      await root.U.loadCmaps(root.MOTION_SOURCE_FONT_FACES);
    };
    registry[TYPE] = renderer;
    return registry;
  }
  root.MOTION_RENDERERS ||= {};
  register(root.MOTION_RENDERERS);
  root.LaohuMotionNetworkPass = { id: "laohu-motion-network-pass", renderer: TYPE, register, normalizeParameters, source: SOURCE };
})(typeof globalThis !== "undefined" ? globalThis : this);
