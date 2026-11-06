#!/usr/bin/env python3
"""将保真语义块装配为本地阅读主题；仅 Python 标准库，不安装或调用 WeDraft。"""

import argparse
import html
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

SKILL = Path(__file__).resolve().parents[1]


def themes():
    data = json.loads((SKILL / 'assets/wedraft-reading.json').read_text(encoding='utf-8'))
    return {t['id']: t for t in data['templates']}


def css(values):
    # 沿用接收软件的既有安全样式集合；不为主题放宽软件 guard。
    compatible = {k: v for k, v in values.items() if k not in (
        'overflow-wrap', 'word-break', 'border-spacing', 'text-indent', 'table-layout')}
    if 'border-spacing' in values:
        compatible['border-collapse'] = 'collapse'
    return ';'.join(f'{k}:{v}' for k, v in compatible.items()) + ';'


def element(tag, contents, styles=None, **attrs):
    if styles:
        attrs['style'] = css(styles)
    attributes = ''.join(f' {k}="{html.escape(str(v), quote=True)}"' for k, v in attrs.items())
    return f'<{tag}{attributes}>{contents}</{tag}>'


def leaf(text):
    if not isinstance(text, str):
        raise ValueError('文字必须为字符串；禁止隐式转换或丢弃原文。')
    return '<span leaf="">' + html.escape(text, quote=False) + '</span>'


def safe_url(value):
    if not isinstance(value, str) or not value or any(ord(c) < 32 for c in value):
        raise ValueError('图片/链接地址缺失或含控制字符。')
    scheme = urlsplit(value).scheme.lower()
    if scheme == 'data' and not re.match(r'^data:image/(?:png|jpeg|gif|webp|avif);base64,', value, re.I):
        raise ValueError('只接受栅格图片 data URI。')
    if scheme not in ('', 'http', 'https', 'data'):
        raise ValueError('地址只接受本地路径、HTTP(S) URL 或栅格图片 data URI。')
    return value


def inline(value, theme):
    if isinstance(value, str):
        # 正文明确换行保持为 br；代码分支不走这里。
        return '<br>'.join(leaf(line) for line in value.split('\n'))
    if not isinstance(value, list):
        raise ValueError('行内内容必须为文字或语义标记数组。')
    result = []
    for item in value:
        kind = item['type']
        value = item['text']
        if not isinstance(value, str):
            raise ValueError('行内标记文字必须为字符串。')
        text = '<br>'.join(leaf(line) for line in value.split('\n'))
        styles = {
            'text': {}, 'strong': theme['strong'],
            'mark': {'background-color': theme['tableHeaderCell']['background-color'], 'color': theme['body']['color'], 'font-weight': '600'},
            'underline': {'border-bottom': f"1px solid {theme['accentColor']}"},
            'delete': {'text-decoration': 'line-through'},
            'code': {'font-family': 'Menlo,Consolas,monospace', 'font-size': '14px', 'white-space': 'pre-wrap', 'color': theme['accentColor']},
            'em': {'font-style': 'italic'},
        }
        if kind == 'link':
            # 链接目的地始终可读可复制；不把无法点击的锚点当交付出口。
            url = safe_url(item['url'])
            result.append(element('span', text + leaf('（' + url + '）'), {**theme['link'], 'display': 'inline-block', 'max-width': '100%', 'overflow-x': 'auto', 'vertical-align': 'bottom'}))
        elif kind in styles:
            result.append(element('span', text, styles[kind]) if styles[kind] else text)
        else:
            raise ValueError(f'未知行内类型：{kind}')
    return ''.join(result)


def block(item, theme, number=0):
    kind = item['type']
    if kind in ('title', 'chapter', 'subheading', 'paragraph', 'quote', 'note'):
        role = {'title': 'heading2', 'chapter': 'heading2', 'subheading': 'heading3',
                'paragraph': 'body', 'quote': 'quote', 'note': 'note'}[kind]
        style = dict(theme[role])
        text = inline(item['text'], theme)
        if kind == 'title':
            style.update({'font-size': '24px', 'margin': '0 8px 28px', 'text-indent': '0'})
        if kind == 'chapter':
            # 编号是结构信息；不另造英文标签、引号、摘要或署名。
            style.update(theme.get('heading2Numbered', {}))
            style['margin-top'] = '36px'
            number_style = dict(theme['headingNumber'])
            if 'width' in number_style:
                number_style['min-width'] = number_style.pop('width')
                if number_style.get('display') == 'block':
                    number_style['display'] = 'inline-block'
            text_style = dict(theme['headingText'])
            if theme.get('heading2Numbered'):
                # 用固定编号列和可换行文字列保留悬挂对齐，兼容接收端既有样式。
                style.update({'display': 'flex', 'align-items': 'baseline', 'padding-left': '0'})
                number_style['flex-shrink'] = '0'
                text_style.update({'display': 'block', 'min-width': '0', 'flex': '1'})
            text = element('span', leaf(f'{number:02d}'), number_style) + element('span', text, text_style)
        return element('h1' if kind == 'title' else 'h2' if kind == 'chapter' else 'h3' if kind == 'subheading' else 'section' if kind == 'quote' else 'p', text, style)
    if kind == 'code':
        return element('section', element('p', leaf(item['text']), {**theme['code'], 'margin': '0', 'overflow-x': 'auto'}), {'margin': '24px 8px 26px'})
    if kind == 'image':
        if not isinstance(item.get('alt'), str):
            raise ValueError('图片必须显式提供来源 alt；确认装饰图后才可为空。')
        src = html.escape(safe_url(item['src']), quote=True)
        alt = html.escape(item['alt'], quote=True)
        image = f'<img src="{src}" alt="{alt}" style="{css(theme["image"])}">'
        caption = element('p', inline(item['caption'], theme), theme['caption']) if item.get('caption') else ''
        return element('section', image + caption, {'margin': '26px 8px'})
    if kind == 'list':
        if not isinstance(item['items'], list) or not item['items']:
            raise ValueError('列表必须保留非空源项。')
        tag = 'ol' if item.get('ordered', False) else 'ul'
        return element(tag, ''.join(element('li', inline(v, theme), theme['listItem']) for v in item['items']), theme['list'])
    if kind == 'table':
        headers, rows = item['headers'], item['rows']
        if not headers or any(len(row) != len(headers) for row in rows):
            raise ValueError('表格行列不齐；请回核源文。')
        head = element('thead', element('tr', ''.join(element('th', inline(v, theme), theme['tableHeaderCell']) for v in headers)))
        body = element('tbody', ''.join(element('tr', ''.join(element('td', inline(v, theme), theme['tableCell']) for v in row)) for row in rows))
        # 宽表局部滚动，不让页面整体横向溢出；不设置固定像素宽度。
        return element('section', element('table', head + body, theme['table']), {**theme['tableWrapper'], 'overflow-x': 'auto'})
    if kind == 'references':
        title = element('p', inline(item['title'], theme), theme['referenceTitle']) if item.get('title') else ''
        entries = ''.join(element('p', inline(v, theme), {**theme['referenceItem'], 'padding-left': '0', 'text-indent': '0', 'overflow-x': 'auto'}) for v in item['items'])
        return element('section', title + entries, theme['references'])
    if kind == 'divider':
        return '<hr style="' + css(theme['divider']) + '">'
    raise ValueError(f'未知区块类型：{kind}；未输出部分结果。')


def render(theme_id, blocks):
    catalog = themes()
    if theme_id not in catalog:
        raise ValueError(f'未登记的阅读主题：{theme_id}')
    if not isinstance(blocks, list) or not blocks:
        raise ValueError('须提供完整、非空的语义块数组。')
    theme, number, result = catalog[theme_id], 0, []
    for item in blocks:
        if item.get('type') == 'chapter':
            number += 1
        result.append(block(item, theme, number))
    return element('section', ''.join(result), theme['article'])


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--list', action='store_true')
    p.add_argument('--theme')
    p.add_argument('--input', type=Path, help='完整语义块 JSON，不接受 Markdown 或任意 HTML')
    p.add_argument('--output', type=Path)
    args = p.parse_args()
    if args.list:
        print(json.dumps([{'id': k, 'name': v['name']} for k, v in themes().items()], ensure_ascii=False))
        return
    if not args.theme or not args.input or not args.output:
        p.error('装配须同时提供 --theme、--input、--output。')
    try:
        value = json.loads(args.input.read_text(encoding='utf-8'))
        output = render(args.theme, value)
        args.output.write_text(output, encoding='utf-8')
    except (ValueError, KeyError, TypeError, OSError) as exc:
        p.exit(1, f'装配失败：{exc}\n')
    print(f'已装配：{args.output}')


if __name__ == '__main__':
    main()
