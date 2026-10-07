"""Regression tests for deterministic WeChat HTML helpers."""

import hashlib
import base64
import json
import re
import shutil
from html import escape
from html.parser import HTMLParser
from unittest.mock import patch
import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = ROOT / ".agents/skills/laohu-htmlshow-gzh/scripts"
sys.dont_write_bytecode = True


def load_script(filename, module_name):
    spec = importlib.util.spec_from_file_location(module_name, SCRIPT_DIR / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


extractor = load_script("extract_docx.py", "extract_docx_test")
validator = load_script("validate_gzh_html.py", "validate_gzh_html_test")
sys.path.insert(0, str(SCRIPT_DIR))
component_lint = load_script("component_lint.py", "component_lint_test")


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def make_docx(path, body, images=None):
    images = images or {}
    document = (f'<w:document xmlns:w="{W}" xmlns:a="{A}" xmlns:r="{R}">'
                f'<w:body>{body}</w:body></w:document>')
    rel_items = "".join(
        f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{name}"/>'
        for i, name in enumerate(images, 1))
    rels = ('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + rel_items + '</Relationships>')
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("word/document.xml", document)
        if images:
            archive.writestr("word/_rels/document.xml.rels", rels)
            for name, data in images.items():
                archive.writestr("word/media/" + name, data)


class GzhToolsTests(unittest.TestCase):
    def setUp(self):
        scratch = ROOT / "tmp"
        scratch.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="gzh-tools-", dir=scratch)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def doc(self, name, body, images=None):
        path = self.root / (name + ".docx")
        make_docx(path, body, images)
        return path

    def run_extract(self, doc, out, *, force=False):
        return extractor.extract(str(doc), str(out), force=force)

    def test_temp_directory_is_project_relative_and_failure_is_explicit(self):
        self.assertEqual(self.root.parent, ROOT / "tmp")
        with patch.object(tempfile, "TemporaryDirectory", side_effect=PermissionError("unwritable")):
            with self.assertRaises(PermissionError):
                GzhToolsTests().setUp()

    def test_table_images_and_inline_order_preserve_occurrences(self):
        picture = '<w:drawing><a:blip r:embed="rId1"/></w:drawing>'
        body = ('<w:p><w:r><w:t>before</w:t>' + picture + '<w:t>after</w:t></w:r></w:p>'
                '<w:tbl><w:tr><w:tc><w:p><w:r>' + picture + '</w:r></w:p></w:tc>'
                '<w:tc><w:p><w:r><w:t>left</w:t>' + picture + '<w:t>right</w:t></w:r></w:p></w:tc>'
                '</w:tr></w:tbl>')
        out = self.root / "table.md"
        self.assertEqual(self.run_extract(self.doc("table", body, {"one.png": b"picture"}), out), 0)
        link = "![](images/" + extractor.image_filename(b"picture") + ")"
        text = out.read_text()
        self.assertIn("before" + link + "after", text)
        self.assertIn("| " + link + " | left" + link + "right |", text)
        self.assertEqual(text.count(link), 3)
        self.assertEqual(len(list((self.root / "images").iterdir())), 1)

    def test_unresolved_relation_or_unsupported_structure_never_writes_partial_output(self):
        examples = [
            '<w:p><w:r><w:drawing><a:blip r:embed="missing"/></w:drawing></w:r></w:p>',
            '<w:p><w:r><w:drawing><a:blip r:link="remote"/></w:drawing></w:r></w:p>',
            '<w:p><w:r><w:drawing><w:txbxContent><w:p/></w:txbxContent></w:drawing></w:r></w:p>',
            '<w:tbl><w:tr><w:tc><w:tbl/></w:tc></w:tr></w:tbl>',
        ]
        out = self.root / "protected.md"
        out.write_text("keep")
        for i, body in enumerate(examples):
            with self.subTest(i=i):
                self.assertEqual(self.run_extract(self.doc(str(i), body), out, force=True), 1)
                self.assertEqual(out.read_text(), "keep")
                self.assertFalse((self.root / "images").exists())

    def test_registered_components_share_the_final_html_policy(self):
        sources = component_lint.component_sources(SCRIPT_DIR.parent)
        self.assertGreater(len(sources), 1)
        self.assertEqual(sources[0].name, "common-components.md")
        self.assertNotIn("theme-generator.md", [source.name for source in sources])
        for source in sources:
            with self.subTest(source=source.name):
                self.assertEqual([msg for level, msg in component_lint.lint_file(source)[1] if level == "ERROR"], [])
        fragment = '<span leaf="">行内文字。</span>'
        self.assertEqual(validator.validate(fragment, article=False)[0], [])
        self.assertTrue(validator.validate(fragment)[0])
        for fragment in ['<section><p>漏包裹</p></section>', '<section><script>x</script></section>',
                         '<section id="bad"><span leaf="">正文。</span></section>']:
            source = self.root / "bad.md"
            source.write_text("```html\n" + fragment + "\n```\n")
            self.assertTrue(validator.validate(fragment)[0])
            self.assertTrue(any(level == "ERROR" for level, _ in component_lint.lint_file(source)[1]))

    def test_truncated_theme_is_not_accepted_as_clean_components(self):
        source = self.root / "theme-truncated.md"
        source.write_text('# 主题\n```html\n<section><span leaf="">残留尾部。</span></section>\n```\n')
        errors = [message for level, message in component_lint.lint_file(source)[1] if level == "ERROR"]
        self.assertTrue(any("必备章节" in message for message in errors))

    def test_structure_rules_distinguish_text_gradient_from_pure_background(self):
        html = ('<section><section style="background:linear-gradient(#fff,#eee)">'
                '<span leaf="">说明文字</span></section>'
                '<section style="background:linear-gradient(#111,#222)"></section></section>')
        errors, warnings, _ = validator.analyze(html)
        self.assertEqual(errors, [])
        gradient = [warning for warning in warnings if warning.startswith("darkmode-no-gradient")]
        self.assertEqual(len(gradient), 1)
        self.assertIn("节点 #2", gradient[0])

        ignored = ('<section><section data-ignore-dm="text-bg-gradient" '
                   'style="background:linear-gradient(#fff,#eee)"><span leaf="">说明</span>'
                   '</section></section>')
        self.assertFalse(any(w.startswith("darkmode-no-gradient") for w in validator.analyze(ignored)[1]))

    def test_width_candidates_respect_image_clamp_percentages_decorations_and_subtree_exception(self):
        html = ('<section>'
                '<span leaf=""><img src="a.png" alt="自适应图" style="max-width:100%;height:auto"></span>'
                '<section style="width:50%"><span leaf="">比例容器</span></section>'
                '<span style="width:12px;height:12px"><span leaf=""><br></span></span>'
                '<section data-ignore-width style="width:720px"><span leaf="">特意保留的固定布局</span></section>'
                '<span leaf=""><img src="b.png" alt="固定宽度图片" width="640"></span>'
                '<section style="width:640px"><span leaf="">固定宽度正文</span></section>'
                '</section>')
        errors, warnings, _ = validator.analyze(html)
        self.assertEqual(errors, [])
        widths = [warning for warning in warnings if warning.startswith("width 候选")]
        self.assertEqual(len(widths), 2, warnings)
        self.assertTrue(any("<img>" in warning and "max-width" in warning for warning in widths))
        self.assertTrue(any("640px" in warning and "<section>" in warning for warning in widths))
        self.assertFalse(any("比例容器" in warning or "12px" in warning or "特意保留" in warning for warning in widths))

    def test_repeated_same_style_single_child_chain_threshold_is_ten(self):
        for depth, expected in ((10, False), (11, True)):
            html = "<section>" * depth + '<span leaf="">内容</span>' + "</section>" * depth
            errors, warnings, _ = validator.analyze(html)
            with self.subTest(depth=depth):
                self.assertFalse(warnings)
                self.assertEqual(any("nest-depth" in error for error in errors), expected, errors)
                if expected:
                    self.assertTrue(any("节点 #1–#11" in error for error in errors), errors)

    def test_nodeleaf_is_checked_but_plain_section_is_allowed(self):
        ordinary = '<section><span leaf="">普通正文。</span></section>'
        marked = '<section nodeleaf><span leaf="">普通正文。</span></section>'
        self.assertFalse(any("section-nodeleaf" in warning for warning in validator.analyze(ordinary)[1]))
        warnings = validator.analyze(marked)[1]
        self.assertEqual(len([warning for warning in warnings if warning.startswith("section-nodeleaf")]), 1)
        result = subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "validate_gzh_html.py"), "--stdin", "--accept-warning",
             "section-nodeleaf@1=保留普通结构且当前来源无可核验白名单"],
            input=marked, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_invisible_zero_opacity_text_does_not_trigger_visible_gradient_candidate(self):
        html = ('<section><section style="opacity:0;background:linear-gradient(#fff,#eee)">'
                '<span leaf="">不可见</span></section></section>')
        warnings = validator.analyze(html)[1]
        self.assertFalse(any("darkmode-no-gradient" in warning for warning in warnings), warnings)

    def test_structure_warning_must_be_repaired_or_accepted_by_exact_node(self):
        html = ('<section><section style="background:linear-gradient(#fff,#eee)">'
                '<span leaf="">文案</span></section></section>')
        script = SCRIPT_DIR / "validate_gzh_html.py"
        rejected = subprocess.run([sys.executable, str(script), "--stdin"], input=html,
                                  capture_output=True, text=True)
        self.assertEqual(rejected.returncode, 1)
        self.assertIn("darkmode-no-gradient", rejected.stdout)
        self.assertIn("节点 #2", rejected.stdout)
        accepted = subprocess.run(
            [sys.executable, str(script), "--stdin", "--accept-warning",
             "darkmode-no-gradient@2=此节点是确认保留的局部设计"],
            input=html, capture_output=True, text=True,
        )
        self.assertEqual(accepted.returncode, 0, accepted.stdout + accepted.stderr)
        self.assertIn("内置静态规则检查通过", accepted.stdout)
        self.assertIn("局部设计", accepted.stdout)

    def test_span_leaf_rejects_nested_block_structure(self):
        html = '<section><span leaf=""><span><p>块级内容。</p></span></span></section>'
        errors, _, _ = validator.analyze(html)
        self.assertTrue(any("span-leaf-block" in error for error in errors), errors)

    def test_code_components_preserve_exact_source_text(self):
        class Text(HTMLParser):
            def __init__(self):
                super().__init__(convert_charrefs=True)
                self.parts = []
            def handle_data(self, value):
                self.parts.append(value)
        source = 'def f(x):\n\tif x < 2:\n\t\treturn "<&>"\n\nprint(f(1))\n'
        document = (SCRIPT_DIR.parent / "references/common-components.md").read_text()
        for name in ("1a.", "1b."):
            section = document.split("### " + name, 1)[1].split("### ", 1)[0]
            block = re.search(r"```html\n(.*?)```", section, re.S).group(1)
            pattern = r'(<p[^>]*white-space:pre-wrap[^>]*><span leaf="">)(.*?)(</span></p>)'
            rendered, count = re.subn(pattern, lambda m: m[1] + escape(source) + m[3], block, flags=re.S)
            self.assertEqual(count, 1)
            encoded = re.search(pattern, rendered, re.S)[2]
            parser = Text(); parser.feed(encoded)
            actual = "".join(parser.parts)
            self.assertEqual(actual, source)
            compile(actual, "rendered-code", "exec")
            self.assertEqual(validator.validate(rendered)[0], [])

    @unittest.skipUnless(shutil.which("node"), "Node required for preview JavaScript execution")
    def test_copy_success_failure_exception_and_selection_failure(self):
        template = (SCRIPT_DIR.parent / "assets/preview-template.html").read_text()
        script = re.search(r"<script>(.*?)</script>", template, re.S)[1]
        harness = r"""
const vm=require('vm'), assert=require('assert');
const script=JSON.parse(process.argv[1]);
async function run(){for(const mode of ['success','false','throw','no-selection']) {
  const body={innerHTML:'<section>article</section>',innerText:'article',textContent:'article'};
  const button={textContent:'copy',blur(){}};
  const selection={ranges:[],removeAllRanges(){this.ranges=[]},addRange(r){this.ranges.push(r)}};
  let copyHandler=null, copied={};
  let toast='';
  const context={setTimeout(){},clearTimeout(){},window:{getSelection(){return mode==='no-selection'?null:selection}},
    document:{getElementById(id){return id==='gzh-content'?body:button},
      createRange(){return {selectNodeContents(el){this.target=el}}},
      addEventListener(type,handler){if(type==='copy')copyHandler=handler},
      removeEventListener(type,handler){if(type==='copy'&&copyHandler===handler)copyHandler=null},
      execCommand(){if(mode==='throw')throw Error('denied');
        if(mode==='success'&&copyHandler)copyHandler({clipboardData:{setData(k,v){copied[k]=v}},preventDefault(){}});
        return mode==='success'}}};
  vm.createContext(context); vm.runInContext(script,context);
  context.gzhShowToast=(message)=>{toast=message};await context.gzhCopy();
  assert.equal(copyHandler,null,'temporary copy listener must always be removed');
  if(mode==='success'){assert.equal(selection.ranges.length,0);assert(toast.includes('已写入剪贴板'));
    assert.deepEqual(copied,{'text/html':body.innerHTML,'text/plain':body.innerText});}
  else if(mode==='no-selection'){assert(toast.includes('干净正文'));assert(!toast.includes('正文已选中'));}
  else {assert.equal(selection.ranges.length,1);assert.equal(selection.ranges[0].target,body);
    assert(toast.includes('正文已选中'));assert(!toast.includes('+A'));assert(!toast.includes('已复制'));}
}console.log('selection and copy-event branches passed');}
run().catch(e=>{console.error(e);process.exitCode=1});
"""
        result = subprocess.run([shutil.which("node"), "-e", harness, json.dumps(script)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("selection and copy-event branches passed", result.stdout)

    @unittest.skipUnless(shutil.which("node"), "Node required for preview JavaScript execution")
    def test_clipboard_item_contains_actual_article_html_and_plain_text(self):
        template = (SCRIPT_DIR.parent / "assets/preview-template.html").read_text()
        script = re.search(r"<script>(.*?)</script>", template, re.S)[1]
        harness = r"""
const vm=require('vm'), assert=require('assert');
const script=JSON.parse(process.argv[1]);
const html='<section><img src="data:image/png;base64,QUJD" alt="图"><p>说明</p></section>';
const plain='图\n说明'; const body={innerHTML:html,innerText:plain,textContent:plain};
const button={textContent:'copy',blur(){}}; let written=null,toast='',execCalls=0;
class FakeBlob{constructor(parts,options){this.value=parts.join('');this.type=options.type}async text(){return this.value}}
class FakeClipboardItem{constructor(items){this.items=items;this.types=Object.keys(items)}}
const context={Blob:FakeBlob,ClipboardItem:FakeClipboardItem,navigator:{clipboard:{async write(items){written=items[0]}}},
  setTimeout(){},clearTimeout(){},window:{getSelection(){throw Error('rich path should not select')}},
  document:{getElementById(id){return id==='gzh-content'?body:button},createRange(){throw Error('not used')},
    addEventListener(){},removeEventListener(){},execCommand(){execCalls++;return false}}};
vm.createContext(context);vm.runInContext(script,context);context.gzhShowToast=m=>toast=m;
context.gzhCopy().then(async()=>{
 assert(written);assert.deepEqual(written.types,['text/html','text/plain']);
 assert.equal(written.items['text/html'].type,'text/html');
 assert.equal(await written.items['text/html'].text(),html);
 assert.equal(written.items['text/plain'].type,'text/plain');
 assert.equal(await written.items['text/plain'].text(),plain);
 assert.equal(execCalls,0);assert(toast.includes('已写入剪贴板'));
 console.log('ClipboardItem carried the actual article payload');
}).catch(e=>{console.error(e);process.exitCode=1});
"""
        result = subprocess.run([shutil.which("node"), "-e", harness, json.dumps(script)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("actual article payload", result.stdout)

    @unittest.skipUnless(shutil.which("node"), "Node required for preview JavaScript execution")
    def test_rejected_clipboard_item_falls_back_to_copy_event_payload(self):
        template = (SCRIPT_DIR.parent / "assets/preview-template.html").read_text()
        script = re.search(r"<script>(.*?)</script>", template, re.S)[1]
        harness = r"""
const vm=require('vm'), assert=require('assert');
const script=JSON.parse(process.argv[1]);
const body={innerHTML:'<section><p>正文</p></section>',innerText:'正文',textContent:'正文'};
const button={textContent:'copy',blur(){}};const selection={ranges:[],removeAllRanges(){this.ranges=[]},addRange(r){this.ranges.push(r)}};
let listener=null,types={},prevented=false,toast='';
class FakeBlob{constructor(parts,options){this.value=parts.join('');this.type=options.type}}
class FakeClipboardItem{constructor(items){this.items=items}}
const context={Blob:FakeBlob,ClipboardItem:FakeClipboardItem,navigator:{clipboard:{write(){return Promise.reject(Error('denied'))}}},
  setTimeout(){},clearTimeout(){},window:{getSelection(){return selection}},
  document:{getElementById(id){return id==='gzh-content'?body:button},createRange(){return {selectNodeContents(el){this.target=el}}},
    addEventListener(type,handler){if(type==='copy')listener=handler},
    removeEventListener(type,handler){if(type==='copy'&&listener===handler)listener=null},
    execCommand(){listener({clipboardData:{setData(k,v){types[k]=v}},preventDefault(){prevented=true}});return true}}};
vm.createContext(context);vm.runInContext(script,context);context.gzhShowToast=m=>toast=m;
context.gzhCopy().then(()=>{
 assert.deepEqual(types,{'text/html':body.innerHTML,'text/plain':body.innerText});
 assert(prevented);assert.equal(listener,null);assert.equal(selection.ranges.length,0);
 assert(toast.includes('已写入剪贴板'));
 console.log('rejected API fell back to one-shot copy-event payload');
}).catch(e=>{console.error(e);process.exitCode=1});
"""
        result = subprocess.run([shutil.which("node"), "-e", harness, json.dumps(script)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("one-shot copy-event payload", result.stdout)

    def test_portable_output_embeds_exact_local_bytes_and_preserves_other_sources(self):
        class Images(HTMLParser):
            def __init__(self):
                super().__init__(convert_charrefs=True)
                self.items = []
            def handle_starttag(self, tag, attrs):
                if tag == "img":
                    self.items.append(dict(attrs))

        assets = self.root / "assets"
        assets.mkdir()
        png = b"\x89PNG\r\n\x1a\nsource-png-bytes"
        gif = b"GIF89a\x02\x00\x02\x00source-gif-bytes"
        png_path = assets / "first image.png"
        gif_path = assets / "second image.gif"
        png_path.write_bytes(png)
        gif_path.write_bytes(gif)
        preexisting = "data:image/png;base64," + base64.b64encode(b"already-data").decode()
        source = self.root / "article.html"
        source_html = (
            '<section><span leaf=""><img src="assets/first%20image.png" alt="第一张" '
            'style="max-width:100%;height:auto;"></span><p><span leaf="">第一图注</span></p>'
            f'<span leaf=""><img src="{gif_path.as_uri()}" alt="第二张"></span>'
            '<span leaf=""><img src="https://example.test/remote.png" alt="远程"></span>'
            f'<span leaf=""><img src="{preexisting}" alt="已内嵌"></span></section>'
        )
        source.write_text(source_html)
        original_bytes = source.read_bytes()
        elsewhere = self.root / "elsewhere"
        elsewhere.mkdir()
        result = subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "wrap_preview.py"), str(source), "--portable"],
            cwd=elsewhere, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        body_path = self.root / "article_便携.html"
        preview_path = self.root / "article_预览.html"
        self.assertTrue(body_path.is_file())
        self.assertTrue(preview_path.is_file())
        self.assertEqual(source.read_bytes(), original_bytes, "portable mode must preserve the source")
        parser = Images()
        portable = body_path.read_text()
        parser.feed(portable)
        self.assertEqual(len(parser.items), 4)
        expected_png = "data:image/png;base64," + base64.b64encode(png).decode()
        expected_gif = "data:image/gif;base64," + base64.b64encode(gif).decode()
        self.assertEqual(parser.items[0]["src"], expected_png)
        self.assertEqual(base64.b64decode(parser.items[0]["src"].split(",", 1)[1]), png)
        self.assertEqual(parser.items[1]["src"], expected_gif)
        self.assertEqual(base64.b64decode(parser.items[1]["src"].split(",", 1)[1]), gif)
        self.assertEqual(parser.items[2]["src"], "https://example.test/remote.png")
        self.assertEqual(parser.items[3]["src"], preexisting)
        self.assertEqual(parser.items[0]["alt"], "第一张")
        self.assertEqual(parser.items[0]["style"], "max-width:100%;height:auto;")
        self.assertIn("第一图注", portable)
        self.assertEqual(validator.validate(portable)[0], [])
        preview = preview_path.read_text()
        self.assertIn(expected_png, preview)
        self.assertNotIn("assets/first%20image.png", preview)

        legacy_source = self.root / "legacy.html"
        legacy_source.write_text('<section><span leaf=""><img src="assets/first%20image.png" alt="图"></span></section>')
        legacy_before = legacy_source.read_bytes()
        legacy_preview = self.root / "legacy-custom-preview.html"
        legacy_result = subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "wrap_preview.py"), str(legacy_source), str(legacy_preview)],
            capture_output=True, text=True,
        )
        self.assertEqual(legacy_result.returncode, 0, legacy_result.stderr)
        self.assertEqual(legacy_source.read_bytes(), legacy_before)
        self.assertIn(expected_png, legacy_preview.read_text())
        self.assertFalse((self.root / "legacy_便携.html").exists())

    def test_portable_failures_and_explicit_source_overwrite_guard(self):
        image = b"\x89PNG\r\n\x1a\nvalid-image"
        for filename, data, message in (
            ("missing.png", None, "不存在或不可读"),
            ("mismatch.jpg", image, "扩展名与实际 MIME 不一致"),
        ):
            with self.subTest(filename=filename):
                if data is not None:
                    (self.root / filename).write_bytes(data)
                source = self.root / (filename + ".html")
                source.write_text(f'<section><span leaf=""><img src="{filename}" alt="图"></span></section>')
                before = source.read_bytes()
                result = subprocess.run(
                    [sys.executable, str(SCRIPT_DIR / "wrap_preview.py"), str(source), "--portable"],
                    capture_output=True, text=True,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(message, result.stderr)
                self.assertEqual(source.read_bytes(), before)
                self.assertFalse(Path(str(source.with_suffix("")) + "_便携.html").exists())
                self.assertFalse(Path(str(source.with_suffix("")) + "_预览.html").exists())

        source = self.root / "guard.html"
        source.write_text('<section><img src="valid.png" alt="图"></section>')
        (self.root / "valid.png").write_bytes(image)
        before = source.read_bytes()
        alias = self.root / "guard-alias.html"
        alias.symlink_to(source)
        for output in (source, alias):
            result = subprocess.run(
                [sys.executable, str(SCRIPT_DIR / "wrap_preview.py"), str(source), "--portable",
                 "--body-output", str(output)], capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("不能覆盖源正文", result.stderr)
            self.assertEqual(source.read_bytes(), before)
        self.assertFalse((self.root / "guard_预览.html").exists())

        result = subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "wrap_preview.py"), str(source), "--portable", "--in-place"],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("data:image/png;base64,", source.read_text())

    def test_docx_images_are_content_addressed_reused_and_never_overwritten(self):
        body = '<w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p>'
        first = self.doc("first", body, {"image1.png": b"\x89PNG\r\n\x1a\nfirst image bytes"})
        second = self.doc("second", body, {"image1.png": b"\x89PNG\r\n\x1a\nsecond image bytes"})
        same = self.doc("same", body, {"different-name.png": b"\x89PNG\r\n\x1a\nfirst image bytes"})
        first_md, second_md, same_md = (self.root / f"{n}.md" for n in ("first", "second", "same"))
        self.assertEqual(self.run_extract(first, first_md), 0)
        first_link = first_md.read_text().split("images/", 1)[1].split(")", 1)[0]
        first_image = self.root / "images" / first_link
        before = first_image.read_bytes()
        self.assertEqual(self.run_extract(second, second_md), 0)
        self.assertEqual(first_image.read_bytes(), before)
        self.assertEqual(self.run_extract(same, same_md), 0)
        self.assertEqual(same_md.read_text(), first_md.read_text())
        self.assertNotEqual(first_md.read_text(), second_md.read_text())
        self.assertEqual(len(list((self.root / "images").iterdir())), 2)

    def test_existing_markdown_is_protected_and_force_is_explicit(self):
        body = '<w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p>'
        doc = self.doc("source", body, {"image1.png": b"image"})
        out = self.root / "existing.md"
        out.write_bytes(b"keep this")
        self.assertEqual(self.run_extract(doc, out), 1)
        self.assertEqual(out.read_bytes(), b"keep this")
        self.assertFalse((self.root / "images").exists())
        self.assertEqual(self.run_extract(doc, out, force=True), 0)
        self.assertIn("sha256-", out.read_text())

    def test_hash_collision_fails_without_replacing_existing_image(self):
        body = '<w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p>'
        image = b"\x89PNG\r\n\x1a\nunique image payload"
        doc = self.doc("collision", body, {"image1.png": image})
        out = self.root / "collision.md"
        image_dir = self.root / "images"
        image_dir.mkdir()
        digest = hashlib.sha256(image).hexdigest()
        target = image_dir / f"sha256-{digest}.png"
        target.write_bytes(b"do not overwrite")
        self.assertEqual(self.run_extract(doc, out), 1)
        self.assertEqual(target.read_bytes(), b"do not overwrite")
        self.assertFalse(out.exists())

    def test_invalid_later_image_does_not_leave_earlier_extracted_files(self):
        document = f'<w:document xmlns:w="{W}" xmlns:a="{A}" xmlns:r="{R}"><w:body>'
        document += ('<w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing>'
                     '<w:drawing><a:blip r:embed="rId2"/></w:drawing></w:r></w:p>')
        document += '</w:body></w:document>'
        rels = ('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" Type="image" Target="media/image1.png"/>'
                '<Relationship Id="rId2" Type="image" Target="media/missing.png"/>'
                '</Relationships>')
        doc = self.root / "broken-media.docx"
        with zipfile.ZipFile(doc, "w") as archive:
            archive.writestr("word/document.xml", document)
            archive.writestr("word/_rels/document.xml.rels", rels)
            archive.writestr("word/media/image1.png", b"valid first image")
        out = self.root / "broken-media.md"
        self.assertEqual(self.run_extract(doc, out), 1)
        self.assertFalse(out.exists())
        self.assertFalse((self.root / "images").exists())

    def test_breaks_tabs_table_cell_breaks_and_pipes_are_preserved(self):
        body = ("<w:p><w:r><w:t>Line one</w:t><w:br/><w:t>Line two</w:t>"
                "<w:tab/><w:t>after tab</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t>"
                "<w:br/><w:t>still bold</w:t></w:r></w:p>"
                "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A|B</w:t><w:tab/><w:t>extra</w:t></w:r></w:p>"
                "<w:p><w:r><w:t>next</w:t><w:br/><w:t>line</w:t></w:r></w:p></w:tc>"
                "<w:tc><w:p><w:r><w:t>C</w:t></w:r></w:p></w:tc></w:tr></w:tbl>")
        doc, out = self.doc("format", body), self.root / "format.md"
        self.assertEqual(self.run_extract(doc, out), 0)
        text = out.read_text()
        self.assertIn("Line one  \nLine two\u00a0\u00a0\u00a0\u00a0after tab**bold  \nstill bold**", text)
        self.assertIn("| A\\|B\u00a0\u00a0\u00a0\u00a0extra<br>next<br>line | C |", text)
        self.assertTrue(text.rstrip().endswith("|---|---|"))

    def test_validator_checks_all_visible_text_and_forbidden_tags(self):
        errors, count = validator.validate('<section><p><span leaf="">正文。</span></p><p>Unwrapped English</p></section>')
        self.assertEqual(count, 1)
        self.assertTrue(any("Unwrapped English" in error for error in errors))
        errors, _ = validator.validate('<section><p><span leaf="">正文。</span></p><button>x</button><video></video><iframe></iframe></section>')
        self.assertTrue(any("<button>" in error for error in errors))
        self.assertTrue(any("<video>" in error for error in errors))
        self.assertTrue(any("<iframe>" in error for error in errors))

    def test_validator_preserves_english_punctuation_and_handles_void_tags(self):
        html = ("<section><p><span leaf=\"\">Don't merge these notes.</span></p>"
                '<p><span leaf="">中文“引号”，英文标点保留。</span></p>'
                '<p><span leaf="">甲<br/>乙</span></p></section>')
        errors, _ = validator.validate(html)
        self.assertEqual(errors, [])
        errors, _ = validator.validate('<section><p aria-hidden="true">visible text still needs leaf</p></section>')
        self.assertTrue(any("visible text" in error for error in errors))
        errors, _ = validator.validate('<section><p><span leaf="">嵌套顺序</p></span></section>')
        self.assertTrue(any("嵌套顺序错误" in error for error in errors))
        code = '<section><pre><code><span leaf="">print("中文, 注释")</span></code></pre></section>'
        self.assertEqual(validator.validate(code)[0], [])
        prose = '<section><pre><span leaf="">正文, 内容</span></pre></section>'
        self.assertTrue(any("半角标点" in error for error in validator.validate(prose)[0]))

    def test_validator_rejects_preview_shell_but_ignores_hidden_and_code_text(self):
        errors, _ = validator.validate('<html><body><section><p><span leaf="">内容。</span></p></section></body></html>')
        self.assertTrue(any("顶层 <section>" in error for error in errors))
        errors, _ = validator.validate('<section><p style="display:none">hidden</p><p style="font-family:monospace"><span leaf="">print("x")</span></p><p><span leaf="">正文。</span></p></section>')
        self.assertEqual(errors, [])

    def test_validator_success_message_limits_claim_to_static_rules(self):
        path = self.root / "article.html"
        path.write_text('<section><p><span leaf="">正文。</span></p></section>', encoding="utf-8")
        result = subprocess.run([sys.executable, str(SCRIPT_DIR / "validate_gzh_html.py"), str(path)],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn("静态规则检查通过", result.stdout)
        self.assertIn("内置静态规则", result.stdout)
        self.assertNotIn("实际粘贴效果", result.stdout)


if __name__ == "__main__":
    unittest.main()
