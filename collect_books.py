"""Récupération ciblée des ouvrages complets du catalogue de Quengo."""
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote, urldefrag
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor
from lxml import html
import json, re, time

ROOT = Path(__file__).parent
BASE = 'http://herve.dequengo.free.fr/'
CACHE = ROOT / 'sources/collection'

def text(s):
    return re.sub(r'\s+', ' ', s).strip()

def parse(raw):
    try:
        decoded = raw.decode('utf-8')
    except UnicodeDecodeError:
        decoded = raw.decode('cp1252')
    decoded = re.sub(r'&([A-Za-z]+)(?![A-Za-z0-9;])', r'&\1;', decoded)
    def fix_numeric(match):
        value=int(match[1][1:],16) if match[1].lower().startswith('x') else int(match[1])
        if 128 <= value <= 159:
            return bytes([value]).decode('cp1252',errors='replace')
        return match[0]
    decoded=re.sub(r'&#(x[0-9A-Fa-f]+|[0-9]+);?',fix_numeric,decoded)
    return html.document_fromstring(decoded)

def cache_path(url):
    rel = unquote(urlsplit(url).path).lstrip('/')
    p = (CACHE / rel).resolve()
    if not p.is_relative_to(CACHE.resolve()):
        raise ValueError('Chemin hors cache')
    return p

def fetch(url):
    p = cache_path(url)
    if p.exists():
        return p.read_bytes()
    error = None
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'ebooks-personal-archive/1.0'}), timeout=30) as response:
                raw = response.read()
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(raw)
            return raw
        except Exception as e:
            error = e
            time.sleep(.5 * (attempt + 1))
    raise RuntimeError(f'{url}: {error}')

def catalog():
    books = []
    for file, page, author in [
        ('mises-catalogue.htm', 'Mises/Mises.htm', 'Ludwig von Mises'),
        ('molinari-catalogue.htm', 'Molinari/Molinari.htm', 'Gustave de Molinari'),
    ]:
        doc = parse((ROOT / 'sources' / file).read_bytes())
        for li in doc.xpath('//ul')[0].xpath('./li'):
            a = li.xpath('.//a')[0]
            title = re.sub(r'\s*\(\d{4}\)\.?$', '', text(a.text_content()))
            url = urljoin(BASE + page, a.get('href'))
            books.append({'title': title, 'author': author, 'url': url})
    doc = parse((ROOT / 'sources/auteurs.htm').read_bytes())
    author = ''
    authors = {'BAUDIN': 'Louis Baudin', 'HAZLITT': 'Henry Hazlitt', 'MACHLUP': 'Fritz Machlup', 'STRIGL': 'Richard von Strigl', 'FRIEDMAN, Milton': 'Milton Friedman et George Stigler'}
    for node in doc.xpath('//h2|//h3'):
        title = text(node.text_content())
        if node.tag == 'h2':
            author = next((v for k,v in authors.items() if k in title), '')
        elif author and title not in ('Articles', 'Article', 'Essai', 'Conférence') and 'extrait' not in title.lower():
            anchors = node.getnext().xpath('.//a')
            if anchors:
                books.append({'title': re.sub(r'\s*\(Complet\)', '', title, flags=re.I), 'author': author, 'url': urljoin(BASE + 'auteurs.htm', anchors[0].get('href'))})
    for i,b in enumerate(books):
        b['id'] = f'livre-{i+1:02}'
    assert len(books) == 41, len(books)
    return books

def permitted(book, url):
    u, root = urlsplit(url), urlsplit(book['url'])
    if u.hostname != root.hostname or not u.path.lower().endswith(('.htm','.html')):
        return False
    # Brochures autonomes et textes repris dans des recueils : ne pas importer le recueil entier.
    leaf = root.path.rsplit('/', 1)[-1]
    if leaf in ('MMM_18.htm','MMM_9.htm','PLL_9.htm','MMC_3.htm','EAE.htm'):
        return u.path == root.path
    if leaf in ('MMC_1_0.htm', 'MMC_2_0.htm'):
        return u.path.startswith(root.path.rsplit('/',1)[0] + '/' + leaf[:6])
    return u.path.rsplit('/',1)[0] == root.path.rsplit('/',1)[0]

def collect(book):
    queue, seen, pages, errors = [book['url']], set(), [], []
    while queue:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        try:
            doc = parse(fetch(url))
            pages.append(url)
            for a in doc.xpath('//a[@href]'):
                link = urldefrag(urljoin(url, a.get('href')))[0]
                if permitted(book,link) and link not in seen and link not in queue:
                    queue.append(link)
            for image in doc.xpath('//img[@src]'):
                asset = urljoin(url,image.get('src'))
                if urlsplit(asset).hostname == 'herve.dequengo.free.fr':
                    try:
                        fetch(asset)
                    except Exception as e:
                        errors.append(str(e))
        except Exception as e:
            errors.append(str(e))
    return {**book, 'pages':pages, 'errors':errors}

if __name__ == '__main__':
    books = catalog()
    results = []
    # Deux requêtes simultanées au maximum pour ménager le serveur source.
    with ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(collect,books):
            results.append(result)
            print(f"{result['id']} : {len(result['pages'])} pages, {len(result['errors'])} erreurs — {result['title']}", flush=True)
            (ROOT / 'collection.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
