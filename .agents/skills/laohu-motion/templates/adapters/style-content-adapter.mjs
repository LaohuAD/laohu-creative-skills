import crypto from 'node:crypto';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const ownKeys = (value) => Object.keys(value);

function fail(message) { throw new Error(message); }
function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(`${label} must be a plain JSON object`);
  }
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!Object.hasOwn(descriptor, 'value')) fail(`${label}.${key} must be a data field`);
  }
  return value;
}
function exactKeys(value, allowed, label) {
  for (const key of ownKeys(value)) if (!allowed.has(key)) fail(`${label}.${key} is not supported`);
  for (const key of allowed) if (!Object.hasOwn(value, key)) fail(`${label}.${key} is required`);
}
function finite(value, label, {min = -Infinity, max = Infinity, integer = false} = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) {
    fail(`${label} must be a finite ${integer ? 'integer' : 'number'} in [${min}, ${max}]`);
  }
  return value;
}
function text(value, label, {min = 1, max, pattern, trim = true} = {}) {
  if (typeof value !== 'string') fail(`${label} must be a string`);
  const length = Array.from(value).length;
  if (length < min || length > max) fail(`${label} must contain ${min}–${max} Unicode characters`);
  if (trim && value !== value.trim()) fail(`${label} cannot start or end with whitespace`);
  if (/[\p{Cc}\p{Cf}]/u.test(value)) fail(`${label} cannot contain control or formatting characters`);
  if (pattern && !pattern.test(value)) fail(`${label} contains unsupported characters`);
  return value;
}
function jsonLiteral(value) {
  return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/**
 * Exact source-literal patches for the two Canvas sources with content that can be
 * connected without replacing their layout, animation, drawing or state algorithms.
 * Hashes pin each original source fence and every source fragment that may change.
 */
export const STYLE_CONTENT_ADAPTER_MANIFEST = Object.freeze({
  format: 'laohu.motion.style-content-adapter/1',
  sharedHelper: Object.freeze({
    sourcePath:'风格提示词/A-G_代码样片/_公共函数.js',
    sourceSha256:'7d06fa480b1c0e3ed3cb2e0df5cf4fd9d5707227530d455e98fda56d6733d198',
    localPath:'code/_公共函数.js',
  }),
  styles: Object.freeze({
    F1: Object.freeze({
      sourcePath: '风格提示词/A-G_代码样片/F1_图表生长.md',
      sourceSha256: '2d6f2584aeb5ad30bc83536da4a30073df2a820472d97b5aa22e254a30b6619a',
      sourceFenceSha256: 'f9bbfe64568b9d711c8b71e48231f02b71e7fd3bfa20bef260e34521b449c7de',
      contentCapability: Object.freeze({
        status: 'structured-content-bound',
        consumedContentFields: Object.freeze(['title','data[].label','data[].value']),
        schema: Object.freeze({
          type: 'object', additionalProperties: false, required: Object.freeze(['title','data']),
          properties: Object.freeze({
            title: Object.freeze({type:'string',minLength:1,maxLength:24,lengthUnit:'Unicode code points'}),
            data: Object.freeze({
              type:'array',minItems:2,maxItems:8,uniqueBy:'label',atLeastOne:{path:'[].value',operator:'>',value:0},
              items:Object.freeze({type:'object',additionalProperties:false,required:Object.freeze(['label','value']),properties:Object.freeze({
                label:Object.freeze({type:'string',minLength:1,maxLength:4,lengthUnit:'Unicode code points'}),
                value:Object.freeze({type:'integer',minimum:0,maximum:60}),
              })}),
            }),
          }),
        }),
        layoutPreflight: 'Original browser Canvas font metrics are measured; title or category labels outside the original layout are rejected.',
      }),
      patches: Object.freeze([
        Object.freeze({field:'content.data.values', expected:'V = [12, 19, 27, 33, 41, 58]', expectedSha256:'bd9ea2f1b94ab9b6fb94262151025dcefe03489eed580945850ee08ca4279732'}),
        Object.freeze({field:'content.data.labels', expected:"N = ['小学', '初中', '高中', '大学', '工作', '现在']", expectedSha256:'ef2b2d6f5c4343f2bda6b7c1f2eba5c95aafecdfc92fffc78350cd944a5c40ce'}),
        Object.freeze({field:'content.title', expected:"c.fillText('示例数据：心里那句话想说出口的次数', l, h * .11);", expectedSha256:'49882d2b1d86e81e16eab049cdf899629628f67255bc53ba8c83b748277f334a'}),
      ]),
    }),
    F2: Object.freeze({
      sourcePath: '风格提示词/A-G_代码样片/F2_关系图.md',
      sourceSha256: 'a652eb0e3725806f061c0a9a9cb55a2b3568a9b0d6402c359f5b8a59844812cf',
      sourceFenceSha256: 'fe34941ec4374a2e0bc8bef7e63bfb5352295773677cc0a85b87b5e68fdfe1c0',
      contentCapability: Object.freeze({
        status: 'structured-content-bound',
        consumedContentFields: Object.freeze(['nodes[].key','nodes[].x','nodes[].y','edges[].from','edges[].to','edges[].label','edges[].at','focalKey','highlightLabel']),
        schema: Object.freeze({
          type:'object',additionalProperties:false,required:Object.freeze(['nodes','edges','focalKey','highlightLabel']),
          properties:Object.freeze({
            nodes:Object.freeze({
              type:'array',minItems:2,maxItems:8,
              minimumCenterDistancePx:186,canvasPx:Object.freeze({width:1920,height:1080}),
              items:Object.freeze({type:'object',additionalProperties:false,required:Object.freeze(['key','x','y']),properties:Object.freeze({
                key:Object.freeze({type:'string',minLength:1,maxLength:3,lengthUnit:'Unicode code points',pattern:'^[\\p{L}\\p{N}][\\p{L}\\p{N}_-]{0,2}$'}),
                x:Object.freeze({type:'number',minimum:.1,maximum:.9}),
                y:Object.freeze({type:'number',minimum:.1,maximum:.9}),
              })}),
            }),
            edges:Object.freeze({
              type:'array',minItems:1,maxItems:12,uniqueUndirectedNodePair:true,noSelfEdges:true,
              items:Object.freeze({type:'object',additionalProperties:false,required:Object.freeze(['from','to','label','at']),properties:Object.freeze({
                from:Object.freeze({type:'string',minLength:1,maxLength:3,lengthUnit:'Unicode code points',pattern:'^[\\p{L}\\p{N}][\\p{L}\\p{N}_-]{0,2}$',references:'nodes[].key'}),
                to:Object.freeze({type:'string',minLength:1,maxLength:3,lengthUnit:'Unicode code points',pattern:'^[\\p{L}\\p{N}][\\p{L}\\p{N}_-]{0,2}$',references:'nodes[].key'}),
                label:Object.freeze({type:'string',minLength:1,maxLength:8,lengthUnit:'Unicode code points'}),
                at:Object.freeze({type:'number',minimum:0,maximum:8.3,unit:'seconds'}),
              })}),
            }),
            focalKey:Object.freeze({type:'string',references:'nodes[].key'}),
            highlightLabel:Object.freeze({type:'string',matchesExactlyOne:'edges[].label'}),
          }),
        }),
        layoutPreflight: 'Original browser Canvas font metrics are measured across the full source clock; node labels, edge labels and canvas bounds that overflow are rejected.',
      }),
      patches: Object.freeze([
        Object.freeze({field:'content.nodes', expected:'const Nd = { 我: [.5, .55], 爸爸: [.22, .3], 妈妈: [.78, .3], 奶奶: [.5, .12], 学校: [.2, .82], 工作: [.8, .82] };', expectedSha256:'23664f0726b46461d8528f3bebab28c0cc64d3fbc1e2051bee8ad39c49f20af7'}),
        Object.freeze({field:'content.edges', expected:"const E = [['爸爸', '我', '为你好', 1], ['妈妈', '我', '听话', 1.8], ['奶奶', '爸爸', '吃苦', 2.6], ['我', '学校', '要争气', 3.4], ['我', '工作', '不能软弱', 4.2], ['我', '妈妈', '说不出口', 5.2]];", expectedSha256:'6bbffba4ec38c84f4f32628ed8ba0707ae34090d46d4c249b1d6d7a0bfbea52b'}),
        Object.freeze({field:'content.highlightLabel', expected:"const warm = lab === '说不出口';", expectedSha256:'f6b59edca6c95a3aadd1ca84e97352b4089d3fe698af02380744788ebf8f5769'}),
        Object.freeze({field:'content.focalKey', expected:"const me = k === '我';", expectedSha256:'94a73d129090c281696c529e46cad8ecc1be523f0518c5a9c956cca02d7ab869'}),
      ]),
    }),
  }),
});

export const STYLE_CONTENT_ADAPTER_MANIFEST_SHA256 = sha256(Buffer.from(JSON.stringify(STYLE_CONTENT_ADAPTER_MANIFEST)));

function validateF1(content) {
  plainObject(content, 'F1 content');
  exactKeys(content, new Set(['title','data']), 'F1 content');
  text(content.title, 'F1 content.title', {max:24});
  if (!Array.isArray(content.data) || content.data.length < 2 || content.data.length > 8) fail('F1 content.data must contain 2–8 rows');
  const labels = new Set();
  const rows = content.data.map((row, index) => {
    plainObject(row, `F1 content.data[${index}]`);
    exactKeys(row, new Set(['label','value']), `F1 content.data[${index}]`);
    const label = text(row.label, `F1 content.data[${index}].label`, {max:4});
    if (labels.has(label)) fail(`F1 content.data contains duplicate label ${JSON.stringify(label)}`);
    labels.add(label);
    const value = finite(row.value, `F1 content.data[${index}].value`, {min:0,max:60,integer:true});
    return {label,value};
  });
  if (!rows.some((row) => row.value > 0)) fail('F1 content.data must include at least one positive value so the source bars and line carry visible data');
  return {title:content.title,data:rows};
}

function validateF2(content) {
  plainObject(content, 'F2 content');
  exactKeys(content, new Set(['nodes','edges','focalKey','highlightLabel']), 'F2 content');
  if (!Array.isArray(content.nodes) || content.nodes.length < 2 || content.nodes.length > 8) fail('F2 content.nodes must contain 2–8 rows');
  const keyPattern = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,2}$/u;
  const nodeKeys = new Set();
  const nodes = content.nodes.map((node, index) => {
    plainObject(node, `F2 content.nodes[${index}]`);
    exactKeys(node, new Set(['key','x','y']), `F2 content.nodes[${index}]`);
    const key = text(node.key, `F2 content.nodes[${index}].key`, {max:3,pattern:keyPattern});
    if (nodeKeys.has(key)) fail(`F2 content.nodes contains duplicate key ${JSON.stringify(key)}`);
    nodeKeys.add(key);
    return {
      key,
      x:finite(node.x, `F2 content.nodes[${index}].x`, {min:.1,max:.9}),
      y:finite(node.y, `F2 content.nodes[${index}].y`, {min:.1,max:.9}),
    };
  });
  const minimumCenterDistance = 2 * (1080 * .075) + 24;
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const dx = (nodes[left].x - nodes[right].x) * 1920;
      const dy = (nodes[left].y - nodes[right].y) * 1080;
      if (Math.hypot(dx,dy) < minimumCenterDistance) fail(`F2 nodes ${JSON.stringify(nodes[left].key)} and ${JSON.stringify(nodes[right].key)} are too close for the source circle radius`);
    }
  }
  const focalKey = text(content.focalKey, 'F2 content.focalKey', {max:3,pattern:keyPattern});
  if (!nodeKeys.has(focalKey)) fail('F2 content.focalKey must reference a node key');
  const highlightLabel = text(content.highlightLabel, 'F2 content.highlightLabel', {max:8});
  if (!Array.isArray(content.edges) || content.edges.length < 1 || content.edges.length > 12) fail('F2 content.edges must contain 1–12 rows');
  const edgePairs = new Set();
  const edges = content.edges.map((edge, index) => {
    plainObject(edge, `F2 content.edges[${index}]`);
    exactKeys(edge, new Set(['from','to','label','at']), `F2 content.edges[${index}]`);
    const from = text(edge.from, `F2 content.edges[${index}].from`, {max:3,pattern:keyPattern});
    const to = text(edge.to, `F2 content.edges[${index}].to`, {max:3,pattern:keyPattern});
    if (!nodeKeys.has(from) || !nodeKeys.has(to)) fail(`F2 content.edges[${index}] must reference existing node keys`);
    if (from === to) fail(`F2 content.edges[${index}] cannot connect a node to itself`);
    const pair = [from,to].sort().join('\u0000');
    if (edgePairs.has(pair)) fail(`F2 content.edges contains duplicate or opposing edge ${JSON.stringify(from)} ↔ ${JSON.stringify(to)}`);
    edgePairs.add(pair);
    const label = text(edge.label, `F2 content.edges[${index}].label`, {max:8});
    const at = finite(edge.at, `F2 content.edges[${index}].at`, {min:0,max:8.3});
    const a = nodes.find((node) => node.key === from), b = nodes.find((node) => node.key === to);
    const centerDistance = Math.hypot((a.x - b.x) * 1920, (a.y - b.y) * 1080);
    const freeLength = centerDistance - 2 * 1080 * .075 - 12;
    const estimatedLabelWidth = Array.from(label).length * (Math.max(10, 1080 / 20) * .8);
    if (estimatedLabelWidth > freeLength) fail(`F2 content.edges[${index}].label is too long for the source gap estimate; the Remotion Canvas preflight also measures its actual font width`);
    return {from,to,label,at};
  });
  if (edges.filter((edge) => edge.label === highlightLabel).length !== 1) fail('F2 content.highlightLabel must match exactly one edge label so the source warm/dashed emphasis stays attached to one real relationship');
  return {nodes,edges,focalKey,highlightLabel};
}

function applyPatch(sourceCode, patch, replacement, applied) {
  if (sha256(Buffer.from(patch.expected)) !== patch.expectedSha256) fail(`style adaptation manifest expected-snippet hash is invalid for ${patch.field}`);
  const occurrences = sourceCode.split(patch.expected).length - 1;
  if (occurrences !== 1) fail(`style source snippet for ${patch.field} must occur exactly once; found ${occurrences}`);
  const nextCode = sourceCode.replace(patch.expected, replacement);
  if (nextCode === sourceCode) fail(`style source patch for ${patch.field} made no change`);
  applied.push({field:patch.field,sourceSnippetSha256:patch.expectedSha256,derivedSnippetSha256:sha256(Buffer.from(replacement)),occurrences:1});
  return nextCode;
}

export function adaptStyleCodeContent({styleId, sourceCode, sourceSha256, content, parentTextProvided = false} = {}) {
  if (typeof styleId !== 'string' || typeof sourceCode !== 'string') fail('style content adaptation requires a style ID and source function');
  if (typeof parentTextProvided !== 'boolean') fail('parentTextProvided must be a boolean');
  const usesParentText = /\bPARENT\b/.test(sourceCode);
  if (content === undefined) {
    const parentTextConsumed=usesParentText&&parentTextProvided;
    return {code:sourceCode,usesParentText,adaptation:null,consumedContentFields:[],contentBindingStatus:parentTextConsumed?'parent-text-consumed':'fixed-demo-content',consumedFields:parentTextConsumed?['parentText']:[],ignoredFields:parentTextProvided&&!usesParentText?['parentText']:[],demoMode:!parentTextConsumed};
  }
  const entry = STYLE_CONTENT_ADAPTER_MANIFEST.styles[styleId];
  if (!entry) fail(`${styleId} has no source-preserving structured content adapter`);
  if (sourceSha256 !== entry.sourceSha256) fail(`${styleId} source fulltext hash does not match the content-adapter manifest`);
  if (sha256(Buffer.from(sourceCode)) !== entry.sourceFenceSha256) fail(`${styleId} source function hash does not match the content-adapter manifest`);
  const normalized = styleId === 'F1' ? validateF1(content) : validateF2(content);
  const applied = [];
  let code = sourceCode;
  if (styleId === 'F1') {
    const patches = entry.patches;
    code = applyPatch(code, patches[0], `V = ${jsonLiteral(normalized.data.map((row) => row.value))}`, applied);
    code = applyPatch(code, patches[1], `N = ${jsonLiteral(normalized.data.map((row) => row.label))}`, applied);
    code = applyPatch(code, patches[2], `c.fillText(${jsonLiteral(normalized.title)}, l, h * .11);`, applied);
  } else {
    const nodesObject = Object.fromEntries(normalized.nodes.map((node) => [node.key,[node.x,node.y]]));
    const edgeTuples = normalized.edges.map((edge) => [edge.from,edge.to,edge.label,edge.at]);
    const highlightLiteral = jsonLiteral(normalized.highlightLabel);
    code = applyPatch(code, entry.patches[0], `const Nd = ${jsonLiteral(nodesObject)};`, applied);
    code = applyPatch(code, entry.patches[1], `const E = ${jsonLiteral(edgeTuples)};`, applied);
    code = applyPatch(code, entry.patches[2], `const warm = lab === ${highlightLiteral};`, applied);
    code = applyPatch(code, entry.patches[3], `const me = k === ${jsonLiteral(normalized.focalKey)};`, applied);
  }
  const adaptation = {
    format: STYLE_CONTENT_ADAPTER_MANIFEST.format,
    styleId,
    adapterManifestSha256: STYLE_CONTENT_ADAPTER_MANIFEST_SHA256,
    source:{path:entry.sourcePath,sha256:entry.sourceSha256,sourceFenceSha256:entry.sourceFenceSha256},
    derivedCodeSha256:sha256(Buffer.from(code)),
    patches:applied,
    consumedContentFields: entry.contentCapability.consumedContentFields,
    fixedMechanismFields: styleId === 'F1'
      ? ['bar layout','0–60 vertical scale','staggered entrance','counter interpolation','connecting line','palette','8.5-second source clock']
      : ['node and edge drawing','edge line and arrow geometry','node radius','staggered reveal','relationship line styling','font scale','10-second source clock'],
  };
  const parentTextConsumed=usesParentText&&parentTextProvided;
  return {code,usesParentText,adaptation,consumedContentFields:adaptation.consumedContentFields,contentBindingStatus:'structured-content-bound',consumedFields:[...(parentTextConsumed?['parentText']:[]),...adaptation.consumedContentFields],ignoredFields:parentTextProvided&&!usesParentText?['parentText']:[],demoMode:false,content:normalized,contentSha256:sha256(Buffer.from(canonical(normalized)))};
}

export function validateContentSource(contentSource, hasContent) {
  if (contentSource === undefined) return null;
  if (!hasContent) fail('contentSource requires structured content');
  plainObject(contentSource, 'contentSource');
  exactKeys(contentSource, new Set(['path','sha256']), 'contentSource');
  if (typeof contentSource.path !== 'string' || !contentSource.path.trim() || contentSource.path.length > 4096 || contentSource.path.includes('\0')) fail('contentSource.path must be a non-empty path string');
  if (typeof contentSource.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(contentSource.sha256)) fail('contentSource.sha256 must be a SHA-256 digest');
  return {path:contentSource.path,sha256:contentSource.sha256};
}

export const __test = {validateF1,validateF2,sha256,canonical};
