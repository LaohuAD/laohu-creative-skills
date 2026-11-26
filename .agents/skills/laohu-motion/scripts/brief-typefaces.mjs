import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const declaration = /^[\t ]*typeface(?:-use)?[\t ]*:/mu;
const registry = /^[\t ]*<screen-text-registry>[\t ]*$/mu;
export const captionSourceDeclaration = /^[\t ]*caption-source[\t ]*[:：]/mu;
const namePattern = /^[a-z][a-z0-9-]{0,47}$/u;
const fontPattern = /^font:[a-z0-9][a-z0-9-]*$/u;
const shaPattern = /^[a-f0-9]{64}$/u;
const extensionByFormat = new Map([['truetype', 'ttf'], ['opentype', 'otf'], ['woff', 'woff'], ['woff2', 'woff2']]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function hasBriefTypefaces(brief) {
  return declaration.test(brief);
}

export function hasControlledBriefText(brief, previousMap) {
  return registry.test(brief) || captionSourceDeclaration.test(brief) || hasBriefTypefaces(brief)
    || Boolean(previousMap?.typefaces?.length || previousMap?.captionSource);
}

export function compileBriefTypefaces(brief, direction, structure, entries) {
  const declarationCount = [
    ...brief.matchAll(/^[\t ]*typeface(?:-use)?[\t ]*:/gmu),
  ].length;
  const styles = new Map();
  const byId = new Map();
  const byRole = new Map();
  let consumed = 0;
  for (const line of direction.split(/\r?\n/u)) {
    const fields = /^[\t ]*typeface[\t ]*:(.*)$/u.exec(line)?.[1]?.split('|').map(field => field.trim());
    if (!fields) continue;
    consumed++;
    const [name, id, weight] = fields;
    if (fields.length !== 3 || !namePattern.test(name) || !fontPattern.test(id ?? '')
      || !/^\d{1,4}$/u.test(weight ?? '') || Number(weight) < 1 || Number(weight) > 1000) {
      fail('brief-typeface-style-invalid', 'Use typeface: <style-name> | <font:resource-id> | <integer weight> in <direction>.');
    }
    if (styles.has(name)) fail('brief-typeface-style-duplicate', `Typeface style ${name} is already declared.`);
    styles.set(name, {name, id, weight: Number(weight)});
  }
  const editable = entries.filter(entry => !entry.caption && !entry.imageText);
  const ids = new Map(editable.map(entry => [entry.id, entry]));
  const roles = new Set(editable.map(entry => entry.role));
  for (const line of structure.split(/\r?\n/u)) {
    const fields = /^[\t ]*typeface-use[\t ]*:(.*)$/u.exec(line)?.[1]?.split('|').map(field => field.trim());
    if (!fields) continue;
    consumed++;
    const [target, name] = fields;
    const selector = /^(id|role)=(.+)$/u.exec(target || '');
    if (fields.length !== 2 || !selector || !styles.has(name)) {
      fail('brief-typeface-binding-invalid', `Invalid typeface-use ${target || ''}. Use id=<registered ID> or role=<registered role>, followed by | <declared style>.`);
    }
    const [, kind, value] = selector;
    const bindings = kind === 'id' ? byId : byRole;
    if (!(kind === 'id' ? ids : roles).has(value)) {
      fail('brief-typeface-target-invalid', `Typeface target ${target} does not match editable screen text. Native captions and external image text use their own consumers.`);
    }
    if (bindings.has(value)) fail('brief-typeface-binding-duplicate', `Typeface target ${target} already has a binding.`);
    bindings.set(value, name);
  }
  if (consumed !== declarationCount) {
    fail('brief-typeface-block-invalid', 'Typeface definitions belong in <direction> and typeface-use bindings belong in <structure>.');
  }
  const used = new Set();
  const boundEntries = entries.map(entry => {
    if (!ids.has(entry.id)) return entry;
    const typeface = byId.get(entry.id) ?? byRole.get(entry.role);
    if (!typeface) return entry;
    used.add(typeface);
    return {...entry, typeface};
  });
  if (styles.size !== used.size) {
    const unused = [...styles.keys()].filter(name => !used.has(name));
    fail('brief-typeface-style-unbound', `Typeface styles must be tied to screen text: ${unused.join(', ')}.`);
  }
  return {entries: boundEntries, typefaces: [...styles.values()]};
}

function assetBytes(repoRoot, asset, label) {
  if (!asset || typeof asset.path !== 'string' || !asset.path || path.isAbsolute(asset.path)
    || asset.path.split(/[\\/]/u).includes('..') || !shaPattern.test(asset.sha256 ?? '')) {
    fail('brief-typeface-asset-invalid', `${label} needs a repository-relative file and SHA-256.`);
  }
  const target = fs.realpathSync(path.join(repoRoot, asset.path));
  const relative = path.relative(repoRoot, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    || !fs.statSync(target).isFile()) {
    fail('brief-typeface-asset-invalid', `${label} must resolve to a file inside the repository.`);
  }
  const bytes = fs.readFileSync(target);
  if (sha256(bytes) !== asset.sha256) fail('brief-typeface-asset-changed', `${label} SHA-256 differs from the catalog: ${asset.path}.`);
  return bytes;
}

export function materializeAsset(target, bytes) {
  fs.mkdirSync(path.dirname(target), {recursive: true});
  const existing = fs.lstatSync(target, {throwIfNoEntry: false});
  if (!existing) {
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
    fs.writeFileSync(temporary, bytes, {flag: 'wx', mode: 0o444});
    try {
      fs.linkSync(temporary, target);
    } catch (error) {
      if (['ENOTSUP', 'EPERM', 'EXDEV'].includes(error.code)) {
        try { fs.copyFileSync(temporary, target, fs.constants.COPYFILE_EXCL); }
        catch (copyError) { if (copyError.code !== 'EEXIST') throw copyError; }
      } else if (error.code !== 'EEXIST') throw error;
    } finally {
      fs.rmSync(temporary);
    }
  }
  if (!fs.lstatSync(target).isFile() || !fs.readFileSync(target).equals(bytes)) {
    fail('brief-typeface-project-asset-conflict', `Existing ${target} differs from the selected catalog asset and was preserved.`);
  }
}

function usesMissingGlyph(text, missing) {
  if (!Object.hasOwn(missing, 'precedingCharacter')) return text.includes(missing.character);
  let precedingCharacter = null;
  for (const character of text) {
    if (character === missing.character && precedingCharacter === missing.precedingCharacter) return true;
    precedingCharacter = /[\r\n\t]/u.test(character) ? null : character;
  }
  return false;
}

/** Resolve all fonts against their actual Brief text before making the map readable by a page. */
export function prepareBriefTypefaces(map, {repoRoot, readFont, outputPath}) {
  if (!map.typefaces?.length) return map;
  const entriesByFont = new Map();
  const styleByName = new Map(map.typefaces.map(style => [style.name, style]));
  for (const entry of map.entries) {
    if (!entry.typeface) continue;
    const {id} = styleByName.get(entry.typeface);
    if (!entriesByFont.has(id)) entriesByFont.set(id, []);
    entriesByFont.get(id).push(entry);
  }
  const fonts = new Map();
  const files = new Map();
  for (const [id, entriesForFont] of entriesByFont) {
    // Variation selectors apply to their actual preceding character. A newline
    // preserves each registered text's boundary while sharing one lookup.
    const sample = [...new Set(entriesForFont.map(entry => entry.exact))].join('\n');
    const font = readFont(id, sample);
    if (font?.availability !== 'local-font' || font.id !== id) {
      fail('brief-typeface-unavailable', `${id} does not have a verified local file and license. Select a usable font asset.`);
    }
    if (font.coverage?.supported !== true || font.coverage?.missing?.length !== 0) {
      const missing = (font.coverage?.missing ?? []).map(item => {
        const affected = entriesForFont.filter(entry => usesMissingGlyph(entry.exact, item)).map(entry => entry.id);
        const sequence = (item.precedingCharacter ?? '') + item.character;
        return `${JSON.stringify(sequence)} ${item.codePoint} (${affected.join(', ')})`;
      });
      fail('brief-typeface-coverage', `${id} cannot render the exact Brief wording: ${missing.join(', ') || 'glyph coverage unavailable'}. Choose a font that covers these entries.`);
    }
    const extension = extensionByFormat.get(font.file?.format);
    if (!extension || !['normal', 'italic', 'oblique'].includes(font.style)
      || !Number.isInteger(font.weight?.min) || !Number.isInteger(font.weight?.max)
      || font.weight.min < 1 || font.weight.min > font.weight.max || font.weight.max > 1000) {
      fail('brief-typeface-asset-invalid', `${id} has an invalid file format, style, or weight range.`);
    }
    const bytes = assetBytes(repoRoot, font.file, `${id} font`);
    const licenseBytes = assetBytes(repoRoot, font.license, `${id} license`);
    const assetPath = `fonts/brief/${font.file.sha256}.${extension}`;
    const licensePath = `fonts/brief/${font.license.sha256}.txt`;
    const copyright = typeof font.copyright === 'string' ? font.copyright.trim() : '';
    const notice = Buffer.from([
      font.family,
      `Resource ${id}`,
      `Font file ${path.posix.basename(assetPath)}`,
      ...(copyright ? ['', 'Font attribution', copyright] : []),
      '',
      `Original license ${font.license.id || ''}`.trimEnd(),
      path.posix.basename(licensePath),
      `License source ${font.license.path}`,
      `Font source ${font.upstream || font.file.path}`,
      '',
    ].join('\n'));
    const noticePath = `fonts/brief/${sha256(notice)}.notice.txt`;
    files.set(assetPath, bytes);
    files.set(licensePath, licenseBytes);
    files.set(noticePath, notice);
    fonts.set(id, {font, assetPath, licensePath, noticePath});
  }
  const typefaces = map.typefaces.map(style => {
    const {font, assetPath, licensePath, noticePath} = fonts.get(style.id);
    if (style.weight < font.weight.min || style.weight > font.weight.max) {
      fail('brief-typeface-weight', `Typeface style ${style.name} requests weight ${style.weight}, but ${style.id} supplies ${font.weight.min}–${font.weight.max}.`);
    }
    return {...style, family: font.family, style: font.style, weightRange: font.weight, assetPath, licensePath, noticePath, sha256: font.file.sha256};
  });
  for (const [relative, bytes] of files) materializeAsset(outputPath(relative), bytes);
  return {...map, typefaces};
}
