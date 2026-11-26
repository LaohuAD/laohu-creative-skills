// Motion Prompt pack `artstyle`; original code and shared kit are MIT licensed.
// Original author: Shohei Ohtaki. Source: https://github.com/showheyohtaki/motion-prompt
// Local module scope isolates all kit constants/helpers for this pack.
import { createElementAdapter } from "./core.mjs";

const __bundle = (() => {
// Motion Prompt #193-216 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#193
//
// Kit for pack "artstyle" (Art styles for image generation / 画像生成で使う画風の名前): the constants and helpers its elements share.
// Elements #193-216 · 539x208 px · cycle 4.7 s. Element code: https://showheyohtaki.github.io/motion-prompt/api/v1/en/e/<id>.txt (or /ja/).
// Images used: 27 files under https://showheyohtaki.github.io/motion-prompt/packs/artstyle/img/. The kit loads them itself (from the folder of pack.js, or from that URL when pasted on its own); `ready` resolves when they have arrived, and until then every cell draws a plain background.
//
// Run one element standalone in a browser:
//   1. paste this file into a <script>,
//   2. paste the element code below it (it assigns CELLS[n - 1], n = the element number inside the pack),
//   3. then add:
//        const c = document.createElement('canvas'); c.width = 539; c.height = 208; document.body.append(c);
//        const k = c.getContext('2d'), cell = CELLS.find(Boolean), t0 = performance.now();
//        (function loop() {
//          const u = ((performance.now() - t0) / 1000) % 4.7;   // seconds, 0 <= u < 4.7
//          k.setTransform(1, 0, 0, 1, 0, 0); k.clearRect(0, 0, 539, 208);
//          k.save(); cell(k, 539, 208, u); k.restore();
//          requestAnimationFrame(loop);
//        })();
// Every cell is a pure function of u, so the same call renders video frames: u = frame / fps.

// @kit
// 画像生成で使う画風の名前 24（カード 539x208、1周 4.7秒）。各コマは時間 u の純関数。
// 全カードで同じ下絵（丘の上の家・木・太陽の線画）を参照画像として渡し、画像生成AIでそれぞれの画風に描き分けた。
// カードは「下絵 → 斜めのワイプでその画風 → ゆっくり寄る → 下絵へ戻る」。絵は描画せず、生成した画像を表示する。
// 画像はパックのフォルダの img/*.webp（1078x416＝カードの2倍、作者が生成して MIT で公開）。
// 読み込みは非同期なので、ready（Promise）が解決するまでは無地の背景だけを描く。解決後は u だけで絵が決まる。
const CW = 539, CH = 208, CYC = 4.7;
const SITE_IMG = new URL('./assets/artstyle/', import.meta.url).href;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, x) => a + (b - a) * x;
const P = (t, a, b) => clamp((t - a) / (b - a));
const eIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

// 画像の置き場所: このファイルと同じフォルダ。単体で貼って使うときは公開サイトから読む。
const IMG_BASE = SITE_IMG;
// 下絵は1枚。08（ステンドグラス）と23（シンセウェイヴ）だけ切り出し位置が違うので、同じ位置の下絵を別に持つ
const OWN_BASE = ['08', '23'];
const IMG_FILES = ['img/base.webp', ...OWN_BASE.map(n => `img/base-${n}.webp`),
  ...Array.from({ length: 24 }, (_, i) => `img/style-${String(i + 1).padStart(2, '0')}.webp`)];
const IMG = {};
const ready = typeof Image === 'undefined' ? Promise.resolve([]) : Promise.all(IMG_FILES.map(f => new Promise((res, rej) => {
  const im = new Image();
  im.crossOrigin = 'anonymous';
  im.onload = () => { IMG[f] = im; res(); };
  im.onerror = () => rej(new Error('image did not load: ' + f));
  im.src = new URL(f.replace(/^img\//, ''), IMG_BASE).href;
})));
const ok = im => !!(im && im.complete && im.naturalWidth);

// 下絵のあいだ左上に出す札: 鉛筆の形（言語によらない目印）
function pencilTag(k, a) {
  k.save(); k.globalAlpha = a;
  k.beginPath(); k.roundRect(10, 10, 40, 28, 8); k.fillStyle = 'rgba(30,30,33,.72)'; k.fill();
  k.translate(30, 24); k.rotate(-Math.PI / 4);
  k.fillStyle = '#FFFFFF';
  k.fillRect(-7, -2.6, 11, 5.2);                                   // 軸
  k.beginPath(); k.moveTo(4.6, -2.6); k.lineTo(9.6, 0); k.lineTo(4.6, 2.6); k.closePath(); k.fill();   // 先
  k.fillRect(-10, -2.6, 2.2, 5.2);                                 // 消しゴム
  k.restore();
}

// 1枚のカード。no = '01'..'24'
// 0〜0.5秒 下絵 / 0.5〜1.35秒 斜めのワイプで画風へ / 0.5〜4.0秒 1→1.045倍にゆっくり寄る / 4.0〜4.5秒 下絵へフェードで戻る / 〜4.7秒 下絵
function gafu(k, w, h, u, no) {
  const st = IMG[`img/style-${no}.webp`];
  const base = IMG[OWN_BASE.includes(no) ? `img/base-${no}.webp` : 'img/base.webp'];
  k.fillStyle = '#FFFFFF'; k.fillRect(0, 0, w, h);
  if (!ok(st) || !ok(base)) { k.fillStyle = '#F1F0EE'; k.fillRect(0, 0, w, h); return; }   // 読み込み前
  const wp = eIO(P(u, 0.5, 1.35));
  const back = eIO(P(u, 4.0, 4.5));
  const zoom = 1 + 0.045 * eIO(P(u, 0.5, 4.0)) * (1 - back);
  const draw = (im, a) => { k.save(); k.globalAlpha = a; k.translate(w / 2, h / 2); k.scale(zoom, zoom); k.drawImage(im, -w / 2, -h / 2, w, h); k.restore(); };
  draw(base, 0.5);                                                  // 下絵は薄く（ラインアートと見分けるため）
  if (wp > 0 && back < 1) {
    const tilt = 60, x = lerp(-tilt - 8, w + 8, wp);                // 斜めの境目の上端の x
    k.save(); k.beginPath(); k.moveTo(-10, -10); k.lineTo(x + tilt, -10); k.lineTo(x, h + 10); k.lineTo(-10, h + 10); k.closePath(); k.clip();
    draw(st, 1 - back); k.restore();
    if (wp < 1) { k.save(); k.strokeStyle = 'rgba(255,255,255,.95)'; k.lineWidth = 4; k.beginPath(); k.moveTo(x + tilt, -10); k.lineTo(x, h + 10); k.stroke(); k.restore(); }
  }
  const a1 = clamp(1 - P(u, 0.45, 0.7) + P(u, 4.15, 4.45));
  if (a1 > 0.01) pencilTag(k, a1);
}
const CELLS = [];


// ===== Motion Prompt element #193 (watercolor) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 01
// 水彩画: にじみと白い余白が残る淡い絵
CELLS[0] = (k, w, h, u) => gafu(k, w, h, u, '01');


// ===== Motion Prompt element #194 (impasto-oil-painting) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 02
// 油絵（厚塗り）: 絵の具を盛った筆跡が残る
CELLS[1] = (k, w, h, u) => gafu(k, w, h, u, '02');


// ===== Motion Prompt element #195 (ink-wash-painting) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 03
// 水墨画: 墨の濃淡とぼかしだけで描く
CELLS[2] = (k, w, h, u) => gafu(k, w, h, u, '03');


// ===== Motion Prompt element #196 (ukiyo-e) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 04
// 浮世絵: 輪郭線と平らな色の木版画
CELLS[3] = (k, w, h, u) => gafu(k, w, h, u, '04');


// ===== Motion Prompt element #197 (pointillism) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 05
// 点描: 小さな色の点を並べて描く
CELLS[4] = (k, w, h, u) => gafu(k, w, h, u, '05');


// ===== Motion Prompt element #198 (colored-pencil-drawing) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 06
// 色鉛筆画: 紙の目に残る細い線の重なり
CELLS[5] = (k, w, h, u) => gafu(k, w, h, u, '06');


// ===== Motion Prompt element #199 (linocut) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 07
// リノカット: 彫った版の太い白黒の線
CELLS[6] = (k, w, h, u) => gafu(k, w, h, u, '07');


// ===== Motion Prompt element #200 (stained-glass) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 08
// ステンドグラス: 黒い枠で区切った光る色ガラス（丘の鉛の枠まで写すため、切り出し位置が違う下絵を使う）
CELLS[7] = (k, w, h, u) => gafu(k, w, h, u, '08');


// ===== Motion Prompt element #201 (pop-art) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 09
// ポップアート: 原色の面と太い黒線、少しの網点
CELLS[8] = (k, w, h, u) => gafu(k, w, h, u, '09');


// ===== Motion Prompt element #202 (neon-sign) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 10
// ネオンサイン: 暗い壁に、光る管で形を描く
CELLS[9] = (k, w, h, u) => gafu(k, w, h, u, '10');


// ===== Motion Prompt element #203 (art-deco) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 11
// アールデコ: 金と黒、放射する直線と左右対称
CELLS[10] = (k, w, h, u) => gafu(k, w, h, u, '11');


// ===== Motion Prompt element #204 (art-nouveau) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 12
// アールヌーボー: 草花の曲線で縁取る装飾
CELLS[11] = (k, w, h, u) => gafu(k, w, h, u, '12');


// ===== Motion Prompt element #205 (risograph) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 13
// リソグラフ: 2〜3色のインクがずれて重なる
CELLS[12] = (k, w, h, u) => gafu(k, w, h, u, '13');


// ===== Motion Prompt element #206 (layered-paper-art) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 14
// 重ね切り絵: 色紙を切って重ね、段差の影で奥行き
CELLS[13] = (k, w, h, u) => gafu(k, w, h, u, '14');


// ===== Motion Prompt element #207 (flat-illustration) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 15
// フラットイラスト: 線も影もない平らな塗りだけの絵
CELLS[14] = (k, w, h, u) => gafu(k, w, h, u, '15');


// ===== Motion Prompt element #208 (line-art) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 16
// ラインアート: 塗りなしで1色の線だけで描く
CELLS[15] = (k, w, h, u) => gafu(k, w, h, u, '16');


// ===== Motion Prompt element #209 (pixel-art) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 17
// ドット絵（ピクセルアート）: マス目のドットで描くゲーム風
CELLS[16] = (k, w, h, u) => gafu(k, w, h, u, '17');


// ===== Motion Prompt element #210 (voxel-art) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 18
// ボクセルアート: 小さな立方体を積んだ3D
CELLS[17] = (k, w, h, u) => gafu(k, w, h, u, '18');


// ===== Motion Prompt element #211 (low-poly) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 19
// ローポリ: 三角形の面で組んだ3D
CELLS[18] = (k, w, h, u) => gafu(k, w, h, u, '19');


// ===== Motion Prompt element #212 (papercraft) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 20
// ペーパークラフト: 紙を折って組み立てた立体
CELLS[19] = (k, w, h, u) => gafu(k, w, h, u, '20');


// ===== Motion Prompt element #213 (clay-animation-style) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 21
// クレイアニメ風: 粘土で作った指あとの残る立体
CELLS[20] = (k, w, h, u) => gafu(k, w, h, u, '21');


// ===== Motion Prompt element #214 (embroidery) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 22
// 刺繍: 布に色糸を縫い込んで描く
CELLS[21] = (k, w, h, u) => gafu(k, w, h, u, '22');


// ===== Motion Prompt element #215 (synthwave) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 23
// シンセウェイヴ: 80年代風のネオンの格子と縞の夕日（地面の格子を写すため、切り出し位置が違う下絵を使う）
CELLS[22] = (k, w, h, u) => gafu(k, w, h, u, '23');


// ===== Motion Prompt element #216 (blueprint) =====
// Element code starts here. CELLS, constants and helpers live in the kit.

// @element 24
// ブループリント（設計図風）: 青地に白い線の図面
CELLS[23] = (k, w, h, u) => gafu(k, w, h, u, '24');

return { cells: CELLS, ready };
})();

export const PACK_INFO = Object.freeze({
  pack: "artstyle", width: 539, height: 208,
  cycleSeconds: 4.7, scalable: true, elementCount: 24,
  assetsRequired: true,
});
export const createElement = createElementAdapter({
  pack: PACK_INFO.pack, elements: [{"number": "01", "id": "motion-prompt:artstyle:193"}, {"number": "02", "id": "motion-prompt:artstyle:194"}, {"number": "03", "id": "motion-prompt:artstyle:195"}, {"number": "04", "id": "motion-prompt:artstyle:196"}, {"number": "05", "id": "motion-prompt:artstyle:197"}, {"number": "06", "id": "motion-prompt:artstyle:198"}, {"number": "07", "id": "motion-prompt:artstyle:199"}, {"number": "08", "id": "motion-prompt:artstyle:200"}, {"number": "09", "id": "motion-prompt:artstyle:201"}, {"number": "10", "id": "motion-prompt:artstyle:202"}, {"number": "11", "id": "motion-prompt:artstyle:203"}, {"number": "12", "id": "motion-prompt:artstyle:204"}, {"number": "13", "id": "motion-prompt:artstyle:205"}, {"number": "14", "id": "motion-prompt:artstyle:206"}, {"number": "15", "id": "motion-prompt:artstyle:207"}, {"number": "16", "id": "motion-prompt:artstyle:208"}, {"number": "17", "id": "motion-prompt:artstyle:209"}, {"number": "18", "id": "motion-prompt:artstyle:210"}, {"number": "19", "id": "motion-prompt:artstyle:211"}, {"number": "20", "id": "motion-prompt:artstyle:212"}, {"number": "21", "id": "motion-prompt:artstyle:213"}, {"number": "22", "id": "motion-prompt:artstyle:214"}, {"number": "23", "id": "motion-prompt:artstyle:215"}, {"number": "24", "id": "motion-prompt:artstyle:216"}],
  width: PACK_INFO.width, height: PACK_INFO.height, cycleSeconds: PACK_INFO.cycleSeconds, cells: __bundle.cells,
});
export const ready = __bundle.ready;
