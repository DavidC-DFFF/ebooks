"""Génère les lecteurs PMTV et l'accueil depuis l'archive locale."""
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urldefrag
from copy import deepcopy
from lxml import html, etree
from collect_books import parse, cache_path, text
import base64, json, re, runpy, mimetypes

ROOT = Path(__file__).parent
STYLE = runpy.run_path(str(ROOT / 'build_mises_html.py'))
BOOKS = json.loads((ROOT / 'collection.json').read_text(encoding='utf-8'))
for book in BOOKS:
    book['title']=re.sub(r'\s*\(complet\)', '', book['title'], flags=re.I)
DEST = ROOT / 'livres'
DEST.mkdir(exist_ok=True)
ALIASES = {'LL_10.htm':'LL_1.htm','PPL_13.htm':'PLL_13.htm','GTPE_01.htm':'GTPE_0_1.htm','GDG_A.htm':'GDG_3_A.htm','ESI_A.htm':'ESI_A1.htm'}
ALIASES.update({f'LL_0_{i}.htm':'LL_0.htm' for i in range(1,7)})

def corrected(url, fragment='', pages=None):
    u = urlsplit(url)
    leaf = u.path.rsplit('/',1)[-1]
    if leaf in ALIASES:
        return urljoin(url, ALIASES[leaf])
    if leaf == 'AH17.htm':
        for suffix in ('a','b'):
            candidate = urljoin(url, f'AH17{suffix}.htm')
            if cache_path(candidate).exists() and (not fragment or fragment in parse(cache_path(candidate).read_bytes()).xpath('//@name|//@id')):
                return candidate
    if leaf == 'NEE_1_2.htm' and fragment:
        for candidate in pages or []:
            if fragment in parse(cache_path(candidate).read_bytes()).xpath('//@name|//@id'):
                return candidate
    return url

def natkey(url):
    return [int(v) if v.isdigit() else v.lower() for v in re.split(r'(\d+)',url)]

def arrange(book):
    pages=book['pages']
    toc=[u for u in pages if 'tdm' in u.lower() or any(text(h.text_content()).lower()=='table des matières' for h in parse(cache_path(u).read_bytes()).xpath('//h2|//h3'))]
    portal=[]
    for u in pages:
        doc=parse(cache_path(u).read_bytes())
        if any(text(a.text_content()).lower()=='début du livre' for a in doc.xpath('//a')):
            portal.append(u)
    content=[u for u in pages if u not in toc+portal]
    if toc and book['url'] in content and len(content)>1:
        main_doc=parse(cache_path(book['url']).read_bytes())
        if not main_doc.xpath('//h2|//h3|//h4'):
            content.remove(book['url'])
    ordered=[]
    for u in toc:
        for a in parse(cache_path(u).read_bytes()).xpath('//a[@href]'):
            target,fragment=urldefrag(urljoin(u,a.get('href')))
            target=corrected(target,fragment,pages)
            if target in content and target not in ordered:
                ordered.append(target)
    # Insérer les suites d'un chapitre après son début, même si le sommaire les omet.
    for u in list(ordered):
        for a in parse(cache_path(u).read_bytes()).xpath('//a[@href]'):
            if 'suite' in text(a.text_content()).lower():
                target=urldefrag(urljoin(u,a.get('href')))[0]
                if target in content and target not in ordered:
                    ordered.insert(ordered.index(u)+1,target)
    for u in sorted(content,key=natkey):
        if u not in ordered:
            # Les commentaires complémentaires cités par une note ne sont pas des parties du livre.
            if toc and 'AECO.htm' in u:
                continue
            ordered.append(u)
    assert ordered, book['title']
    return ordered

def clean_content(url, ident):
    doc=parse(cache_path(url).read_bytes())
    body=doc.find('body')
    if body is None:
        raise ValueError(f'Corps absent : {url}')
    for e in list(body.xpath('.//script|.//style|.//link|.//iframe')):
        e.drop_tree()
    for center in list(body.xpath('.//center')):
        links=center.xpath('.//a[@href]')
        if links and len(text(center.text_content()))<1200 and any('Page d\'accueil' in a.text_content() or 'Page Ludwig' in a.text_content() or 'Table des matières' in a.text_content() for a in links):
            center.drop_tree()
    first=body.xpath('.//h1')
    if first:
        container=first[0].getparent()
        if container.tag=='center' and len(text(container.text_content()))<1000:
            if container.xpath('.//a[@name]') and container.xpath('.//h2|.//h3|.//h4'):
                first[0].drop_tree()
                for p in list(container.xpath('.//p')):
                    if text(p.text_content()).lower().startswith(('par ','correspondant de')):
                        p.drop_tree()
            else:
                container.drop_tree()
        else:
            first[0].drop_tree()
    for child in list(body)[:5]:
        t=text(child.text_content())
        if child.tag=='p' and len(t)<500 and (t.lower().startswith('par ') or t.lower().startswith('traduit par ')):
            child.drop_tree()
    headings=body.xpath('.//h2|.//h3|.//h4')
    title=text(headings[0].text_content()) if headings else 'Texte'
    # Le titre précis du chapitre prime sur un intitulé de partie répété.
    if headings:
        significant=[h for h in headings[:4] if re.match(r'^(Chapitre|Préface|Introduction|Avant-propos|Essai|Annex|Appendice|Conclusion)',text(h.text_content()),re.I)]
        if significant:
            title=text(significant[0].text_content())
        elif 'partie' in title.lower() or title in ('I. Nation et nationalité','II. Le principe des nationalités en politique'):
            if len(headings)>1:
                title=text(headings[1].text_content())
    if title=='Texte':
        title=text(doc.find('head/title').text_content()) if doc.find('head/title') is not None else 'Texte'
    section=html.Element('section',id=ident)
    section.text=body.text
    for e in list(body):
        section.append(e)
    original=text(section.text_content())
    # Le texte est conservé ; seuls les attributs de présentation et les balises héritées sont retirés.
    anchors={}
    for e in list(section.iter()):
        if not isinstance(e.tag,str):
            continue
        if e.tag in ('font','center') and not (e.get('id') or e.get('name')):
            e.drop_tag()
            continue
        if e.tag=='font':
            e.tag='span'
        elif e.tag=='center':
            e.tag='div'
        old=e.get('id') or e.get('name')
        if old and e is not section:
            new=ident+'-'+old
            if old in anchors:
                new+='-'+str(len(anchors))
            else:
                anchors[old]=new
            e.set('id',new)
        e.attrib.pop('name',None)
        for attr in list(e.attrib):
            if attr not in ('id','href','src','alt','colspan','rowspan'):
                del e.attrib[attr]
        if e.tag=='h1':
            e.tag='h2'
    assert text(section.text_content())==original, url
    return section, title, anchors, original

rendered=[]
for book in BOOKS:
    if book['id']=='livre-23':
        book['output']='Mises - Politique économique.html'
        continue
    book['ordered']=arrange(book)
    book['output']='livres/'+book['id']+'.html'
    book['sections']=[]
    for i,url in enumerate(book['ordered']):
        section,title,anchors,original=clean_content(url,f'partie-{i}')
        book['sections'].append({'url':url,'element':section,'title':title,'anchors':anchors,'original':original})

report=[]
for book in BOOKS:
    if book['id']=='livre-23':
        report.append({'id':book['id'],'title':book['title'],'parties':9,'status':'vérifié auparavant','errors':[]})
        continue
    mapping={s['url']:s for s in book['sections']}
    missing_anchors=[]
    missing_images=[]
    for s in book['sections']:
        for a in s['element'].xpath('.//a[@href]'):
            url,fragment=urldefrag(urljoin(s['url'],a.get('href')))
            url=corrected(url,fragment,book['pages'])
            if url in mapping:
                target=mapping[url]
                fragment=re.sub(r'\s+','',fragment)
                if fragment and fragment not in target['anchors']:
                    same_case=[k for k in target['anchors'] if k.lower()==fragment.lower()]
                    if len(same_case)==1:
                        fragment=same_case[0]
                    note=re.fullmatch(r'note([0-9]+)',fragment)
                    if note and 'sdfootnote'+note[1]+'sym' in target['anchors']:
                        fragment='sdfootnote'+note[1]+'sym'
                    if re.fullmatch(r'p[0-9]+',fragment):
                        located=[s for s in book['sections'] if fragment in s['anchors']]
                        if len(located)==1:
                            target=located[0]
                if fragment and fragment not in target['anchors']:
                    # Le texte du renvoi subsiste, avec accès au début de la partie concernée.
                    missing_anchors.append({'source':s['url'],'target':url+'#'+fragment})
                    a.set('title','Renvoi au début de la partie : ancre absente du site source.')
                a.set('href','#'+(target['anchors'].get(fragment) or target['element'].get('id')))
            else:
                a.set('href',url+('#'+fragment if fragment else ''))
        for img in s['element'].xpath('.//img[@src]'):
            asset=urljoin(s['url'],img.get('src'))
            p=cache_path(asset)
            if p.exists():
                mime=mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
                img.set('src','data:'+mime+';base64,'+base64.b64encode(p.read_bytes()).decode())
                img.set('alt',img.get('alt') or 'Illustration du texte original')
            else:
                missing_images.append(asset)
                replacement=html.Element('p')
                replacement.text=img.get('alt') or 'Illustration indisponible sur le site source.'
                img.getparent().replace(img,replacement)
    import html as stdhtml
    esc=stdhtml.escape
    options=''.join(f'<option value="{s["element"].get("id")}">{esc(s["title"])}</option>' for s in book['sections'])
    toc=''.join(f'<a href="#{s["element"].get("id")}">{esc(s["title"])}</a>' for s in book['sections'])
    content=''.join(html.tostring(s['element'],encoding='unicode') for s in book['sections'])
    script=STYLE['pmtv_script'].replace('mises-pe-pmtv-',book['id']+'-')
    css=STYLE['pmtv_css']+'\nimg{max-width:100%;height:auto}table{max-width:100%;display:block;overflow-x:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}section>h2:first-child,section>h3:first-child{margin-top:0}'
    warning=f'<p>{len(missing_images)} illustration(s) indisponible(s) sur le site original.</p>' if missing_images else ''
    page=f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(book['title'])} — {esc(book['author'])}</title><style>{css}</style></head><body>
<nav class="navbar" aria-label="Navigation de lecture"><a href="../index.html" aria-label="Retour à la bibliothèque">⌂</a><a href="#sommaire" aria-label="Accueil et sommaire">☰</a><select id="toc" aria-label="Choisir une partie"><option value="">Sommaire</option>{options}</select><button id="smaller" aria-label="Réduire la taille du texte">A−</button><button id="larger" aria-label="Agrandir le texte">A+</button><button id="toggle-theme" aria-label="Changer le thème" aria-pressed="false">☾</button></nav>
<main><header><h1>{esc(book['title'])}</h1><p>{esc(book['author'])}</p><a class="start-button" id="resume" href="#partie-0">Commencer la lecture</a></header><details id="sommaire" open><summary>Table des matières</summary><nav aria-label="Sommaire">{toc}</nav></details><article>{content}</article><footer class="meta"><p>Source : <a href="{esc(book['url'])}">Hervé de Quengo</a>. Texte conservé ; présentation adaptée à la lecture sur écran.</p>{warning}</footer></main><nav class="chapter-nav fixed-bottom reader-bottom" aria-label="Parties précédente et suivante"><a id="previous" href="#sommaire">← Précédent</a><a href="#sommaire">Sommaire</a><a id="next" href="#partie-0">Suivant →</a></nav><div id="global-progress" aria-hidden="true"></div><script>{script}</script></body></html>'''
    tree=html.fromstring(page)
    ids=tree.xpath('//@id')
    assert len(ids)==len(set(ids)),f"Identifiants dupliqués : {book['id']}"
    for href in tree.xpath('//a/@href'):
        if href.startswith('#'):
            assert href[1:] in ids,href
    assert len(tree.xpath('//article/section'))==len(book['sections'])
    assert '\ufffd' not in page,book['id']
    (ROOT / book['output']).write_text(page,encoding='utf-8')
    report.append({'id':book['id'],'title':book['title'],'parties':len(book['sections']),'characters':sum(len(s['original']) for s in book['sections']),'status':'texte et ancres vérifiés','source_errors':book['errors'],'missing_anchor_fallbacks':missing_anchors,'missing_images':missing_images,'sources':book['ordered']})

index=(ROOT/'index.html').read_text(encoding='utf-8')
items=[]
for book in BOOKS:
    author=esc(book['author']); title=esc(book['title']); url=esc(book['output'])
    items.append(f'<li><h2><a href="{url}">{title}</a></h2><p class="author">{author}</p><a class="read" href="{url}">Lire le livre →</a></li>')
index=re.sub(r'<ul aria-label="Livres disponibles">.*?</ul>','<ul aria-label="Livres disponibles">\n'+'\n'.join(items)+'\n</ul>',index,flags=re.S)
(ROOT/'index.html').write_text(index,encoding='utf-8')
(ROOT/'verification-collection.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'catalogue-livres.json').write_text(json.dumps([{k:b[k] for k in ('id','title','author','url','output')} for b in BOOKS],ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(BOOKS)} livres, {sum(r["parties"] for r in report)} parties ; index et ancres vérifiés.')
