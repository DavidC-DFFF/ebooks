from pathlib import Path
from urllib.parse import urljoin, urlsplit
import re, json
from lxml import html, etree

ROOT = Path(__file__).parent
SRC = ROOT / 'sources/mises-politique-economique'
BASE = 'http://herve.dequengo.free.fr/Mises/PE/'
OUT = ROOT / 'Mises - Politique économique.html'
files = ['PE_0.htm', 'PE_I.htm', 'PE_AP.htm'] + [f'PE_{i}.htm' for i in range(1, 7)]
ids = {name: f'partie-{i}' for i, name in enumerate(files)}
parts, titles, checks = [], [], []
def normalized(s):
    return re.sub(r'\s+', ' ', s).strip()
for name in files:
    raw = (SRC / name).read_bytes().decode('cp1252')
    # Legacy sources omit semicolons on these HTML entities.
    raw = re.sub(r'&(laquo|raquo|nbsp)(?![A-Za-z0-9;])', r'&\1;', raw)
    doc = html.fromstring(raw)
    body = doc.find('body')
    for navigation in list(body.xpath('.//center[a[contains(@href,"Mises.htm")]]')):
        navigation.drop_tree()
    heading = body.xpath('.//h3')[0]
    title = normalized(heading.text_content())
    start = heading
    while start.getparent() is not body:
        start = start.getparent()
    children = list(body)
    # Repeated book header and final site navigation are outside the book text.
    kept = children[children.index(start)+1:]
    if kept and kept[-1].tag == 'center':
        kept = kept[:-1]
    section = html.Element('section', id=ids[name])
    h = etree.SubElement(section, 'h2'); h.text = title
    for node in kept:
        section.append(node)
    original = normalized(' '.join(n.text_content() for n in section if n.tag != 'h2'))
    for node in list(section.iter()):
        if node.tag in ('font', 'center'):
            node.drop_tag()
        else:
            for attr in list(node.attrib):
                if attr not in ('href', 'id', 'name'):
                    del node.attrib[attr]
            anchor = node.get('id') or node.get('name')
            if anchor and node is not section:
                node.set('id', ids[name] + '-' + anchor)
            node.attrib.pop('name', None)
            if node.tag == 'a' and node.get('href'):
                target = urlsplit(urljoin(BASE + name, node.get('href')))
                filename = target.path.rsplit('/', 1)[-1]
                if target.hostname == 'herve.dequengo.free.fr' and target.path.startswith('/Mises/PE/') and filename in ids:
                    node.set('href', '#' + ids[filename] + ('-' + target.fragment if target.fragment else ''))
                else:
                    node.set('href', urljoin(BASE + name, node.get('href')))
    for p in list(section.xpath('.//p')):
        if not p.text_content().strip() and len(p) == 0:
            p.drop_tree()
    final = normalized(' '.join(n.text_content() for n in section if n.tag != 'h2'))
    assert original == final, f'Texte modifié : {name}'
    checks.append({'source': name, 'titre': title, 'caracteres': len(final), 'texte_identique': True})
    titles.append((ids[name], title))
    parts.append(html.tostring(section, encoding='unicode'))

css = '''
:root{color-scheme:light;--paper:oklch(0.98 0.008 90);--ink:oklch(0.23 0.012 160);--accent:oklch(0.35 0.077 160);--line:oklch(0.83 0.015 160);--size:1.15rem}
*{box-sizing:border-box}html{scroll-padding-top:5rem}body{margin:0;background:var(--paper);color:var(--ink);font-family:Georgia,'Times New Roman',serif;font-size:var(--size);line-height:1.75}body.dark{color-scheme:dark;--paper:oklch(0.2 0.008 160);--ink:oklch(0.91 0.008 90);--accent:oklch(0.82 0.08 160);--line:oklch(0.4 0.015 160)}
main{max-width:42rem;margin:auto;padding:2rem 1.25rem 6rem}header{padding:2rem 0 3rem}h1{font-size:clamp(2.25rem,8vw,3.75rem);line-height:1.12;letter-spacing:-.03em;margin:.5rem 0 1rem}h2{font-size:1.7rem;line-height:1.3;margin:0 0 2rem}h3,h4{line-height:1.4}p{margin:0 0 1.1em}a{color:var(--accent);text-underline-offset:.2em;overflow-wrap:anywhere}section{padding-top:3rem;margin-top:3rem;border-top:1px solid var(--line)}section:target h2{color:var(--accent)}sup{line-height:0}sup a{padding:.25rem}nav a{display:block;padding:.55rem 0}details{border-block:1px solid var(--line);padding:1rem 0}summary{cursor:pointer;font-weight:bold;min-height:44px}.subtitle{font-size:1.35rem;line-height:1.5}.meta{font: .9rem/1.6 system-ui,sans-serif}.tools{position:sticky;top:0;z-index:2;background:var(--paper);border-bottom:1px solid var(--line);display:flex;justify-content:center;gap:.5rem;padding:.5rem;flex-wrap:wrap;font: .9rem system-ui,sans-serif}.tools a,button{font:inherit;color:var(--ink);background:transparent;border:1px solid var(--line);border-radius:.3rem;padding:.6rem .8rem;min-height:44px;text-decoration:none;cursor:pointer}button:hover,.tools a:hover{border-color:var(--accent)}:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.skip{position:absolute;left:1rem;top:-10rem}.skip:focus{top:4rem;background:var(--paper);padding:1rem;z-index:3}footer{margin-top:4rem;border-top:1px solid var(--line);padding-top:1rem}.js-only{display:none}.js .js-only{display:inline-block}@media print{.tools,.skip{display:none}body{font-size:11pt;background:white;color:black}main{max-width:none;padding:0}section{break-before:page}a{color:inherit}}
'''
toc = ''.join(f'<a href="#{i}">{title}</a>' for i,title in titles)
script = '''
document.documentElement.classList.add('js');
let size=1.15;
function save(){try{localStorage.setItem('mises-pe-settings',JSON.stringify({size,dark:document.body.classList.contains('dark')}))}catch(e){}}
function apply(){document.documentElement.style.setProperty('--size',size+'rem')}
try{const s=JSON.parse(localStorage.getItem('mises-pe-settings'));if(s){size=Math.max(.95,Math.min(1.65,Number(s.size)||1.15));document.body.classList.toggle('dark',!!s.dark)}}catch(e){}
apply();
const theme=document.getElementById('theme');function label(){theme.textContent=document.body.classList.contains('dark')?'Mode clair':'Mode sombre';theme.setAttribute('aria-pressed',String(document.body.classList.contains('dark')))}label();
theme.onclick=()=>{document.body.classList.toggle('dark');label();save()};
document.getElementById('smaller').onclick=()=>{size=Math.max(.95,size-.1);apply();save()};
document.getElementById('larger').onclick=()=>{size=Math.min(1.65,size+.1);apply();save()};
'''
page = f'''<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Politique économique — Ludwig von Mises</title><style>{css}</style></head>
<body><a class="skip" href="#lecture">Aller au texte</a><div class="tools" aria-label="Réglages de lecture"><a href="#sommaire">Sommaire</a><button class="js-only" id="smaller" aria-label="Réduire la taille du texte">A−</button><button class="js-only" id="larger" aria-label="Agrandir le texte">A+</button><button class="js-only" id="theme" aria-pressed="false">Mode sombre</button></div>
<main><header><p>Ludwig von Mises</p><h1>Politique économique</h1><p class="subtitle">Réflexions pour aujourd'hui et pour demain</p><p class="meta">Traduit par Raoul Audouin<br>Six conférences données à Buenos Aires</p></header>
<details id="sommaire" open><summary>Table des matières</summary><nav aria-label="Table des matières">{toc}</nav></details><article id="lecture">{''.join(parts)}</article>
<footer class="meta"><p>Source : <a href="{BASE}PE.htm">site d’Hervé de Quengo</a>. Texte et notes conservés ; présentation adaptée à la lecture sur écran.</p><p>Repères bibliographiques du site : première édition anglaise en 1979, traduction française indiquée en 1983 et mention d’édition française de 1986 dans les en-têtes. Ces indications sont conservées sans les harmoniser.</p></footer></main><script>{script}</script></body></html>'''
OUT.write_text(page, encoding='utf-8')
(ROOT / 'Mises - Politique économique - Impeccable.html').write_text(page, encoding='utf-8')
options = ''.join(f'<option value="{i}">{title}</option>' for i,title in titles)
pmtv_css = (ROOT / 'reference-pmtv/style.css').read_text(encoding='utf-8') + '''
*{box-sizing:border-box}html{scroll-padding-top:4rem}nav.navbar{height:auto;min-height:3rem;max-width:600px;padding:.3rem .5rem}nav.navbar button{min-width:44px;min-height:44px}nav.navbar select{min-height:44px;width:50%;font-size:.85rem}main{padding-top:4rem;padding-bottom:7rem}h2{font-family:'Segoe UI',sans-serif;font-size:1.65rem;line-height:1.35;text-align:center}a{color:var(--accent);overflow-wrap:anywhere}header{text-align:center;margin-bottom:2rem}section{margin-top:2rem}body.js article section{display:none}body.js article section.active{display:block}body.js header,body.js details,body.js footer{display:none}body.js.home header,body.js.home details,body.js.home footer{display:block}body.js.home article section{display:none}.chapter-nav{max-width:600px;margin:auto;padding:.5rem;gap:.5rem}.chapter-nav a{min-height:44px;font-size:.9rem;padding:.65rem .4rem}.chapter-nav a[aria-disabled=true]{visibility:hidden}#global-progress{transition:none}.meta{font-size:.85rem;text-align:left}details nav a{display:block;padding:.5rem 0}button:focus-visible,a:focus-visible,select:focus-visible{outline:3px solid var(--accent);outline-offset:2px}sup{line-height:0}sup a{padding:.25rem}.reader-bottom{display:none}.js .reader-bottom{display:flex}@media print{nav.navbar,.reader-bottom,#global-progress{display:none}body.js article section{display:block!important}main{padding:0}section{break-before:page}}
'''
pmtv_css += '''
:root{--bg:oklch(0.98 0.008 90);--background:var(--bg);--text:oklch(0.23 0.012 160);--accent:oklch(0.35 0.077 160);--line:oklch(0.83 0.015 160);--button-bg:var(--bg);--button-hover-bg:oklch(0.94 0.012 90);--progress-color:var(--accent);--size:1.15rem}
html{font-size:16px;transition:none}
[data-theme="dark"]{color-scheme:dark;--bg:oklch(0.2 0.008 160);--background:var(--bg);--text:oklch(0.91 0.008 90);--accent:oklch(0.82 0.08 160);--line:oklch(0.4 0.015 160);--button-bg:var(--bg);--button-hover-bg:oklch(0.27 0.012 160);--progress-color:var(--accent)}
body{font-family:Georgia,'Times New Roman',serif;font-size:var(--size);line-height:1.75}
h1,h2,h3,h4{font-family:Georgia,'Times New Roman',serif}h1{font-size:clamp(2.25rem,8vw,3.75rem);line-height:1.12;letter-spacing:-.03em}h2{font-size:1.7rem;line-height:1.3}h3,h4{line-height:1.4}.subtitle{font-size:1.35rem;line-height:1.5}p{margin:0 0 1.1em}
nav.navbar{font-family:system-ui,sans-serif;box-shadow:none;border-bottom:1px solid var(--line);gap:.3rem}
nav.navbar button{font-size:.9rem;border:1px solid var(--line);border-radius:.3rem;padding:.4rem;min-width:40px}
nav.navbar>a{display:flex;align-items:center;justify-content:center;min-width:32px;min-height:44px;text-decoration:none}
nav.navbar select{border-color:var(--line);width:auto;flex:1}
.chapter-nav a{border-color:var(--line)}.start-button{background:oklch(0.35 0.077 160);color:oklch(0.98 0.008 90)}
@media print{body{font-size:11pt;background:white;color:black}}
'''
pmtv_script = '''
document.body.classList.add('js');
const sections=[...document.querySelectorAll('article section')],toc=document.getElementById('toc'),previous=document.getElementById('previous'),next=document.getElementById('next'),resume=document.getElementById('resume');
function get(k){try{return localStorage.getItem('mises-pe-pmtv-'+k)}catch(e){return null}}function put(k,v){try{localStorage.setItem('mises-pe-pmtv-'+k,v)}catch(e){}}
let size=Math.max(.95,Math.min(1.65,Number(get('size'))||1.15));
function applySize(){document.documentElement.style.setProperty('--size',size+'rem')}applySize();
function sharedTheme(){try{return localStorage.getItem('ebooks-theme')||get('theme')}catch(e){return get('theme')}}
document.documentElement.dataset.theme=sharedTheme()==='dark'?'dark':'light';
const theme=document.getElementById('toggle-theme');function themeLabel(){theme.textContent=document.documentElement.dataset.theme==='dark'?'☀':'☾';theme.setAttribute('aria-pressed',String(document.documentElement.dataset.theme==='dark'))}themeLabel();
theme.onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';put('theme',document.documentElement.dataset.theme);try{localStorage.setItem('ebooks-theme',document.documentElement.dataset.theme)}catch(e){}themeLabel()};
addEventListener('pageshow',()=>{document.documentElement.dataset.theme=sharedTheme()==='dark'?'dark':'light';themeLabel()});
document.getElementById('smaller').onclick=()=>{size=Math.max(.95,Math.round((size-.1)*100)/100);applySize();put('size',String(size))};
document.getElementById('larger').onclick=()=>{size=Math.min(1.65,Math.round((size+.1)*100)/100);applySize();put('size',String(size))};
const last=get('last');if(sections.some(s=>s.id===last)){resume.href='#'+last;resume.textContent='Reprendre la lecture'}
toc.onchange=()=>{saveReadingPosition();location.hash=toc.value||'sommaire'};
let active=-1;
function show(){const id=decodeURIComponent(location.hash.slice(1));const target=document.getElementById(id);const section=target?.closest('article section');active=sections.indexOf(section);sections.forEach(s=>s.classList.toggle('active',s===section));document.body.classList.toggle('home',active<0);toc.value=section?.id||'';previous.href=active>0?'#'+sections[active-1].id:'#sommaire';previous.setAttribute('aria-disabled',String(active<0));next.href=active<sections.length-1?'#'+sections[Math.max(0,active+1)].id:'#sommaire';next.textContent=active===sections.length-1?'Sommaire':'Suivant →';if(section){put('last',section.id);restoreReadingPosition(section,target)}else window.scrollTo(0,0);progress()}
function progress(){const bar=document.getElementById('global-progress');const max=document.documentElement.scrollHeight-innerHeight;const fraction=max>0?Math.min(1,Math.max(0,scrollY/max)):1;bar.style.width=active<0?'0%':((active+fraction)/sections.length*100)+'%'}
addEventListener('hashchange',show);addEventListener('scroll',progress,{passive:true});addEventListener('resize',progress);
'''
pmtv_script += (ROOT / 'reader-position.js').read_text(encoding='utf-8')
pmtv_script += (ROOT / 'offline-client.js').read_text(encoding='utf-8')
pmtv_css += '\nnav.navbar button[hidden]{display:none}nav.navbar{gap:.2rem}nav.navbar button{min-width:36px;padding:.3rem}'
pmtv_page = f'''<!doctype html><html lang="fr" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Politique économique — version PMTV</title><style>{pmtv_css}</style></head><body>
<nav class="navbar" aria-label="Navigation de lecture"><a href="index.html" aria-label="Retour à la bibliothèque" title="Bibliothèque">⌂</a><a href="#sommaire" aria-label="Accueil et sommaire">☰</a><select id="toc" aria-label="Choisir une partie"><option value="">Sommaire</option>{options}</select><button id="smaller" aria-label="Réduire la taille du texte">A−</button><button id="larger" aria-label="Agrandir le texte">A+</button><button id="toggle-theme" aria-label="Changer le thème" aria-pressed="false">☾</button><button id="fullscreen" aria-label="Passer en plein écran" aria-pressed="false">⛶</button></nav>
<main><header><h1>Politique économique</h1><p class="subtitle">Réflexions pour aujourd'hui et pour demain</p><p>Ludwig von Mises<br>Traduit par Raoul Audouin</p><a class="start-button" id="resume" href="#partie-0">Commencer la lecture</a></header><details id="sommaire" open><summary>Table des matières</summary><nav aria-label="Sommaire">{toc}</nav></details><article>{''.join(parts)}</article><footer class="meta"><p>Texte et notes : <a href="{BASE}PE.htm">Hervé de Quengo</a>. Présentation inspirée de <a href="https://github.com/DavidC-DFFF/PMTV">PMTV</a>. Repères du site : 1979, traduction 1983, en-têtes 1986.</p></footer></main><nav class="chapter-nav fixed-bottom reader-bottom" aria-label="Parties précédente et suivante"><a id="previous" href="#sommaire">← Précédent</a><a href="#sommaire">Sommaire</a><a id="next" href="#partie-0">Suivant →</a></nav><div id="global-progress" aria-hidden="true"></div><script>{pmtv_script}</script></body></html>'''
(ROOT / 'Mises - Politique économique - PMTV.html').write_text(pmtv_page, encoding='utf-8')
OUT.write_text(pmtv_page, encoding='utf-8')
for candidate in (page,pmtv_page):
    tree=html.fromstring(candidate)
    assert [normalized(s.text_content()) for s in tree.xpath('//article/section')] == [normalized(html.fromstring(p).text_content()) for p in parts]
comparison='''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comparer les versions de Politique économique</title><style>body{font:18px/1.6 system-ui;margin:2rem auto;padding:1rem;max-width:46rem;color:#18251f;background:#fafaf7}a{color:#245640;display:inline-block;padding:.6rem 0}h1{line-height:1.2}article{border-top:1px solid #bbb;padding:1rem 0}p{margin:.5rem 0}</style><h1>Politique économique</h1><p>Deux présentations, un texte identique : préface, introduction, avant-propos, six leçons et notes.</p><article><h2>Version Impeccable</h2><p>Lecture continue, texte aligné à gauche, fond légèrement ivoire, sommaire dépliable et taille du texte réglable.</p><a href="Mises - Politique économique - Impeccable.html#partie-3">Lire la première leçon — Impeccable →</a></article><article><h2>Version PMTV</h2><p>Lecture par partie, paragraphes justifiés avec alinéas, menu des chapitres, précédent/suivant, progression et reprise de la dernière partie.</p><a href="Mises - Politique économique - PMTV.html#partie-3">Lire la première leçon — PMTV →</a></article><p>Les deux fichiers sont autonomes et fonctionnent hors connexion. Les réglages de lecture sont mémorisés si le navigateur autorise le stockage local.</p></html>'''
(ROOT / 'Comparer les versions.html').write_text(comparison, encoding='utf-8')
parsed = html.fromstring(page)
all_ids = parsed.xpath('//@id')
assert len(all_ids) == len(set(all_ids)), 'Identifiants dupliqués'
for href in parsed.xpath('//a/@href'):
    if href.startswith('#'):
        assert href[1:] in all_ids, f'Ancre manquante : {href}'
assert len(parsed.xpath('//article/section')) == 9
assert '\ufffd' not in page
(ROOT / 'verification-mises.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{OUT.name} : 9 parties, texte conservé, toutes les ancres vérifiées, {len(page.encode("utf-8"))} octets')
