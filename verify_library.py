"""Contrôles de livraison de la bibliothèque statique."""
from pathlib import Path
from urllib.parse import unquote, urlsplit
from lxml import html
import json

ROOT=Path(__file__).parent
catalog=json.loads((ROOT/'catalogue-livres.json').read_text(encoding='utf-8'))
assert len(catalog)==41
index=html.fromstring((ROOT/'index.html').read_bytes())
assert len(index.xpath('//ul[@aria-label="Livres disponibles"]/li'))==len(catalog)
parts=0
for book in catalog:
    path=ROOT/book['output']
    raw=path.read_text(encoding='utf-8')
    assert '\ufffd' not in raw, path
    assert not any(chr(i) in raw for i in range(128,160)),path
    doc=html.fromstring(raw)
    ids=doc.xpath('//@id')
    assert len(ids)==len(set(ids)),path
    sections=doc.xpath('//article/section')
    assert sections,path
    parts+=len(sections)
    assert len(doc.xpath('//select[@id="toc"]/option'))==len(sections)+1,path
    assert doc.xpath('//*[@id="smaller"]') and doc.xpath('//*[@id="larger"]'),path
    for link in doc.xpath('//a/@href'):
        url=urlsplit(link)
        if link.startswith('#'):
            assert unquote(link[1:]) in ids,(path,link)
        elif not url.scheme and url.path:
            assert (path.parent/unquote(url.path)).is_file(),(path,link)
    for image in doc.xpath('//img/@src'):
        assert image.startswith('data:'),(path,image)
for link in index.xpath('//a/@href'):
    assert (ROOT/link).is_file(),link
print(f'OK : {len(catalog)} livres, {parts} parties, liens, ancres, images et UTF-8 vérifiés.')
