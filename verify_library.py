"""Contrôles de livraison de la bibliothèque statique."""
from pathlib import Path
from urllib.parse import unquote, urlsplit
from lxml import html
import json
import hashlib

ROOT=Path(__file__).parent
catalog=json.loads((ROOT/'catalogue-livres.json').read_text(encoding='utf-8'))
assert len(catalog)==41
index=html.fromstring((ROOT/'index.html').read_bytes())
assert len(index.xpath('//*[@id="catalogue"]//li'))==len(catalog)
groups=index.xpath('//*[@id="catalogue"]/details')
assert len(groups)==len(set(b['author'] for b in catalog))
assert all(not g.get('open') for g in groups)
assert not index.xpath('//a[@class="read"]')
assert len(index.xpath('//*[@class="reading-state"]'))==len(catalog)
assert index.xpath('//dialog[@id="reading-dialog"]')
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
    assert doc.xpath('//*[@id="fullscreen"]'),path
    assert "put('reading'" in raw,path
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
manifest=json.loads((ROOT/'offline-manifest.json').read_text(encoding='utf-8'))
assert manifest['books']==len(catalog)
for entry in manifest['files']:
    assert hashlib.sha256((ROOT/entry['path']).read_bytes()).hexdigest()==entry['sha256'],entry['path']
assert {b['output'] for b in catalog}.issubset({e['path'] for e in manifest['files']})
print(f'OK : {len(catalog)} livres, {parts} parties, liens, ancres, images et UTF-8 vérifiés.')
