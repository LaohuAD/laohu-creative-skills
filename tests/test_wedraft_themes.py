import importlib.util
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / '.agents/skills/laohu-htmlshow-gzh/scripts/render_reading_theme.py'


class Texts(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text = []

    def handle_data(self, value):
        self.text.append(value)


class WeDraftThemesTest(unittest.TestCase):
    def renderer(self):
        self.assertTrue(SCRIPT.is_file(), '缺少本地阅读主题装配入口')
        spec = importlib.util.spec_from_file_location('reading_theme', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        return module

    def test_registered_themes_are_reachable(self):
        index = (SCRIPT.parent.parent / 'references/theme-index.md').read_text()
        for name in ('plain-paper', 'ink-journal', 'jade-notes', 'blueprint', 'cinnabar'):
            with self.subTest(name=name):
                self.assertIn(f'theme-wedraft-{name}.md', index)

    def test_code_characters_survive(self):
        m = self.renderer()
        source = '\tif x < 3:\n    print("a & b")\n\n'
        output = m.render('wedraft-blueprint', [{'type': 'code', 'text': source}])
        parser = Texts()
        parser.feed(output)
        self.assertEqual(''.join(parser.text), source)

    def test_images_are_not_forced_to_full_width(self):
        output = self.renderer().render('wedraft-jade-notes', [
            {'type': 'image', 'src': 'images/small.png', 'alt': '原图说明'}])
        self.assertIn('max-width:100%', output)
        self.assertNotIn('width:calc(', output)
        self.assertNotIn(';width:100%', output)
        self.assertIn('alt="原图说明"', output)

    def test_inline_marks_keep_explicit_line_breaks(self):
        m = self.renderer()
        for theme in m.themes():
            with self.subTest(theme=theme):
                out = m.render(theme, [{'type': 'paragraph', 'text': [
                    {'type': 'strong', 'text': '首行'},
                    {'type': 'text', 'text': '\n次行'},
                    {'type': 'em', 'text': '\n末行'},
                ]}])
                self.assertEqual(out.count('<br>'), 2)
                self.assertIn('font-weight:700;', out)

    def test_source_remote_image_addresses_are_preserved(self):
        m = self.renderer()
        for address in ('http://example.com/a.png', '//example.com/a.png',
                        'https://example.com/a.png'):
            with self.subTest(address=address):
                out = m.render('wedraft-blueprint', [
                    {'type': 'image', 'src': address, 'alt': '来源图片'}])
                self.assertIn('src="' + address + '"', out)

    def test_untrusted_input_is_not_executable(self):
        m = self.renderer()
        out = m.render('wedraft-ink-journal', [{'type': 'paragraph', 'text': '<script>x</script>'}])
        self.assertIn('&lt;script&gt;', out)
        with self.assertRaises(ValueError):
            m.render('wedraft-ink-journal', [{'type': 'image', 'src': 'javascript:alert(1)', 'alt': ''}])
        with self.assertRaises(ValueError):
            m.render('wedraft-ink-journal', [{'type': 'invented', 'text': '不能静默丢弃'}])

    def test_theme_structure_and_no_invented_copy(self):
        m = self.renderer()
        plan = [{'type': 'chapter', 'text': '原有章节'}, {'type': 'paragraph', 'text': '正文。'}]
        paper = m.render('wedraft-plain-paper', plan)
        ink = m.render('wedraft-ink-journal', plan)
        self.assertIn('text-align:center', paper)
        self.assertIn('display:flex;align-items:baseline', ink)
        self.assertIn('min-width:26px;', ink)
        self.assertIn('min-width:0;flex:1;', ink)
        p = Texts()
        p.feed(ink)
        self.assertEqual(''.join(p.text), '01原有章节正文。')
        self.assertNotIn('小哈', ink)

    def test_output_uses_existing_studio_style_contract(self):
        output = self.renderer().render('wedraft-blueprint', [
            {'type': 'paragraph', 'text': '正文。'},
            {'type': 'table', 'headers': ['字段'], 'rows': [['值']]},
        ])
        for unsupported in ('overflow-wrap:', 'word-break:', 'border-spacing:', 'text-indent:', 'table-layout:'):
            self.assertNotIn(unsupported, output)

    def test_all_blocks_validate(self):
        m = self.renderer()
        sys.path.insert(0, str(SCRIPT.parent))
        from validate_gzh_html import analyze
        plan = [
            {'type': 'title', 'text': '结构测试'},
            {'type': 'chapter', 'text': '原文章节'},
            {'type': 'subheading', 'text': '子标题'},
            {'type': 'paragraph', 'text': [{'type': 'strong', 'text': '重点'}, {'type': 'text', 'text': '。'}]},
            {'type': 'quote', 'text': '原有引文。'},
            {'type': 'note', 'text': '原有提示。'},
            {'type': 'list', 'items': ['甲', '乙'], 'ordered': True},
            {'type': 'table', 'headers': ['字段', '值'], 'rows': [['甲', '一\n二']]},
            {'type': 'code', 'text': 'x = 1\n'},
            {'type': 'references', 'items': ['https://example.com/a?b=1&c=2']},
            {'type': 'divider'},
        ]
        for theme in m.themes():
            with self.subTest(theme=theme):
                errors, warnings, _ = analyze(m.render(theme, plan), article=True)
                self.assertEqual(errors, [])
                self.assertEqual(warnings, [])


if __name__ == '__main__':
    unittest.main()
