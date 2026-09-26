"""Regression tests for deterministic WeChat HTML helpers."""

import hashlib
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
for(const mode of ['success','false','throw','no-selection']) {
  const body={text:'article'}, button={textContent:'copy',blur(){}};
  const selection={ranges:[],removeAllRanges(){this.ranges=[]},addRange(r){this.ranges.push(r)}};
  let toast='';
  const context={setTimeout(){},clearTimeout(){},window:{getSelection(){return mode==='no-selection'?null:selection}},
    document:{getElementById(id){return id==='gzh-content'?body:button},
      createRange(){return {selectNodeContents(el){this.target=el}}},
      execCommand(){if(mode==='throw')throw Error('denied'); return mode==='success'}}};
  vm.createContext(context); vm.runInContext(script,context);
  context.gzhShowToast=(message)=>{toast=message};context.gzhCopy();
  if(mode==='success'){assert.equal(selection.ranges.length,0);assert(toast.includes('已复制'));}
  else if(mode==='no-selection'){assert(toast.includes('干净正文'));assert(!toast.includes('正文已选中'));}
  else {assert.equal(selection.ranges.length,1);assert.equal(selection.ranges[0].target,body);
    assert(toast.includes('正文已选中'));assert(!toast.includes('+A'));assert(!toast.includes('已复制'));}
}
console.log('four copy branches passed');
"""
        result = subprocess.run([shutil.which("node"), "-e", harness, json.dumps(script)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("four copy branches passed", result.stdout)

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
        self.assertIn("未验证微信公众号编辑器实际粘贴效果", result.stdout)


if __name__ == "__main__":
    unittest.main()
