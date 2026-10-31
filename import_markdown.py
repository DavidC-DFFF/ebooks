"""Import Markdown dans le lecteur commun, avec notes et fac-similé hors ligne."""
from pathlib import Path
from urllib.parse import urlsplit, unquote
import html as escape_html
import re, shutil, sys
from lxml import html

def normal(value):
    return re.sub(r'\s+',' ',value).strip()

def import_markdown(book, root):
    try:
        import markdown
    except ImportError:
        sys.path.insert(0,str(root/'.vendor'))
        import markdown
    source=root/book['markdown']
    text=source.read_text(encoding='utf-8')
    def math_text(value):
        value=escape_html.escape(value.strip())
        return re.sub(r'_([0-9]+)',r'<sub>\1</sub>',value)
    text=re.sub(r'\$\$(.*?)\$\$',lambda m:'\n\n<div class="equation">'+math_text(m[1])+'</div>\n\n',text,flags=re.S)
    text=re.sub(r'\$([^\n$]+)\$',lambda m:'<span class="math">'+math_text(m[1])+'</span>',text)
    fragment=markdown.markdown(text,extensions=['tables','footnotes','sane_lists'])
    document=html.fragment_fromstring(fragment,create_parent='div')
    original=normal(document.text_content())
    sections=[]
    def start(title):
        element=html.Element('section',id=f'partie-{len(sections)}')
        section={'element':element,'title':title,'anchors':{},'original':'','url':book['markdown']}
        sections.append(section)
        return section
    current=start('Présentation de la traduction')
    for element in list(document):
        if element.tag=='h2' or element.get('class')=='footnote':
            pending=[]
            # Les ancres explicites du sommaire appartiennent au titre qui suit.
            while len(current['element']):
                last=current['element'][-1]
                if normal(last.text_content()) or not (last.get('id') or last.xpath('.//*[@id]')): break
                current['element'].remove(last); pending.insert(0,last)
            title=normal(element.text_content()) if element.tag=='h2' else 'Notes de la traduction'
            if len(current['element']): current=start(title)
            else: current['title']=title
            for anchor in pending: current['element'].append(anchor)
        if element.tag=='h1': element.tag='h2'
        current['element'].append(element)
    assert normal(' '.join(s['element'].text_content() for s in sections))==original
    assets=[]
    for section in sections:
        section['original']=normal(section['element'].text_content())
        for link in section['element'].xpath('.//a[@href]'):
            url=urlsplit(link.get('href'))
            if url.scheme or not url.path: continue
            local=(source.parent/unquote(url.path)).resolve()
            if local.suffix.lower()=='.pdf':
                assert local.is_relative_to(root.resolve()),local
                destination=root/'assets/robinson-facsimile.pdf'
                destination.parent.mkdir(exist_ok=True)
                if not destination.exists() or destination.read_bytes()!=local.read_bytes(): shutil.copyfile(local,destination)
                path='assets/robinson-facsimile.pdf'
                if path not in assets: assets.append(path)
                link.set('href','../'+path+('#'+url.fragment if url.fragment else ''))
        if not section['element'].xpath('./h2'):
            heading=html.Element('h2'); heading.text=section['title']; section['element'].insert(0,heading)
    book.update(sections=sections,output='livres/'+book['id']+'.html',ordered=[book['markdown']],errors=[],assets=assets)
    return book
