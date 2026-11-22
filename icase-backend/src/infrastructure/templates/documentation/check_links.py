"""Valida rutas y anclas locales del sitio construido sin consultar servicios externos."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import sys

ROOT = Path(__file__).resolve().parents[1] / 'site'

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.ids = [], set()
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if 'id' in values:
            self.ids.add(values['id'])
        for key in ('href', 'src'):
            if values.get(key):
                self.links.append(values[key])

def main():
    pages, errors = {}, []
    for source in ROOT.rglob('*.html'):
        parser = Links()
        parser.feed(source.read_text(encoding='utf-8'))
        pages[source.resolve()] = parser
    if not pages:
        raise SystemExit('Construye el sitio con mkdocs build antes de validar enlaces.')
    for source, parser in pages.items():
        for href in parser.links:
            url = urlsplit(href)
            if url.scheme or url.netloc or href.startswith('//'):
                continue
            target = ((ROOT / unquote(url.path).lstrip('/')) if url.path.startswith('/') else (source.parent / unquote(url.path))).resolve() if url.path else source
            if target.is_dir():
                target /= 'index.html'
            if not target.exists():
                errors.append(f'{source.relative_to(ROOT)}: falta {href}')
            elif url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:
                errors.append(f'{source.relative_to(ROOT)}: ancla inexistente {href}')
    if errors:
        raise SystemExit('\n'.join(errors))
    print(f'Enlaces y anclas locales correctos: {len(pages)} páginas')

if __name__ == '__main__':
    main()
