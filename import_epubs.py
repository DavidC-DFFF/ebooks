"""Conversion EPUB locale : ordre du spine, chapitres, notes, images et ancres."""
from pathlib import Path
from urllib.parse import urlsplit, unquote
import base64, mimetypes, posixpath, re, zipfile, unicodedata
from lxml import etree, html

def normal(value):
    return re.sub(r'\s+',' ',value).strip()

def import_epub(book, root):
    source=root/book['epub']
    ns={'c':'urn:oasis:names:tc:opendocument:xmlns:container','o':'http://www.idpf.org/2007/opf','n':'http://www.daisy.org/z3986/2005/ncx/'}
    sections=[]; anchors={}; files={}; source_text=[]; unresolved=[]
    current=None; notes=False; counter=0
    with zipfile.ZipFile(source) as archive:
        opf=etree.fromstring(archive.read('META-INF/container.xml')).xpath('//c:rootfile/@full-path',namespaces=ns)[0]
        package=etree.fromstring(archive.read(opf))
        manifest={e.get('id'):posixpath.normpath(posixpath.join(posixpath.dirname(opf),unquote(e.get('href')))) for e in package.xpath('//o:manifest/o:item',namespaces=ns)}
        spine=[manifest[e.get('idref')] for e in package.xpath('//o:spine/o:itemref',namespaces=ns)]
        titles={}
        labels=set()
        for name in archive.namelist():
            if name.endswith('.ncx'):
                toc=etree.fromstring(archive.read(name))
                for entry in toc.xpath('//n:navPoint',namespaces=ns):
                    label=' '.join(entry.xpath('./n:navLabel/n:text/text()',namespaces=ns))
                    href=entry.xpath('./n:content/@src',namespaces=ns)[0]
                    path=urlsplit(href)
                    if path.fragment: titles[(posixpath.normpath(posixpath.join(posixpath.dirname(name),unquote(path.path))),unquote(path.fragment))]=label
                    labels.add(normal(label))
        def new_section(title):
            element=html.Element('section',id=f'partie-{len(sections)}')
            section={'element':element,'title':title,'anchors':{},'url':f'epub/{book["id"]}/{len(sections)}','original':''}
            sections.append(section)
            return section
        for filename in spine:
            if filename.endswith('titlepage.xhtml'): continue  # couverture Calibre sans texte
            raw=archive.read(filename).decode('utf-8-sig')
            doc=html.document_fromstring(re.sub(r'<\?xml.*?\?>','',raw))
            body=doc.find('body')
            if body is None: continue
            for node in list(body.xpath('.//script|.//style|.//link|.//iframe|.//object')): node.drop_tree()
            for node in list(body.xpath('.//div[not(@id) and not(@name)]')): node.drop_tag()
            source_text.append(normal(body.text_content()))
            if body.text and body.text.strip():
                if current is None: current=new_section('Présentation et préfaces')
                paragraph=html.Element('p'); paragraph.text=body.text; current['element'].append(paragraph)
            first=True
            for node in list(body):
                if not isinstance(node.tag,str): continue
                content=normal(node.text_content())
                node_ids=[e.get('id') or e.get('name') for e in node.iter() if isinstance(e.tag,str)]
                toc_title=next((titles[(filename,i)] for i in node_ids if (filename,i) in titles),None)
                is_note=bool(re.match(r'ftn\d+',node.get('id','')))
                heading=(node.tag in ('h1','h2') and bool(content)) or (toc_title and len(content)<350) or (content in labels and len(content)<350)
                if current is None: current=new_section('Présentation et préfaces')
                if heading:
                    # Ne pas conserver une section initiale vide.
                    title=toc_title or content
                    if len(current['element'])==0: current['title']=title
                    else: current=new_section(title)
                    notes=False
                elif is_note and not notes:
                    current=new_section('Notes et références'); notes=True
                if first: files[filename]=current['element'].get('id'); first=False
                for element in node.iter():
                    if not isinstance(element.tag,str): continue
                    old=element.get('id') or element.get('name')
                    if old:
                        counter+=1; ident=f'epub-ancre-{counter}'
                        anchors.setdefault((filename,old),ident)
                        element.set('id',ident)
                    element.attrib.pop('name',None)
                    if element.get('href'): element.set('data-epub-source',filename)
                    if element.tag=='img' and element.get('src'):
                        asset=posixpath.normpath(posixpath.join(posixpath.dirname(filename),unquote(element.get('src'))))
                        if asset not in archive.namelist(): raise ValueError(f'Image EPUB absente : {asset}')
                        mime=mimetypes.guess_type(asset)[0] or 'application/octet-stream'
                        element.set('src','data:'+mime+';base64,'+base64.b64encode(archive.read(asset)).decode())
                        element.set('alt',element.get('alt') or 'Illustration du texte original')
                    for attr in list(element.attrib):
                        if attr not in ('id','href','src','alt','colspan','rowspan','data-epub-source'): del element.attrib[attr]
                    if element.tag=='h1': element.tag='h2'
                current['element'].append(node)
        # Fidélité textuelle contrôlée avant l'ajout de titres de navigation.
        assert normal(' '.join(source_text))==normal(' '.join(s['element'].text_content() for s in sections)),book['id']
        for section in sections:
            section['original']=normal(section['element'].text_content())
            for link in section['element'].xpath('.//a[@href]'):
                filename=link.attrib.pop('data-epub-source')
                url=urlsplit(link.get('href'))
                if url.scheme or url.netloc: continue
                target=posixpath.normpath(posixpath.join(posixpath.dirname(filename),unquote(url.path))) if url.path else filename
                destination=anchors.get((target,unquote(url.fragment))) if url.fragment else files.get(target)
                if not destination and url.fragment:
                    candidates=[value for (file,fragment),value in anchors.items() if fragment==unquote(url.fragment)]
                    if len(candidates)==1: destination=candidates[0]
                if not destination and url.fragment:
                    def fold(value):
                        return ''.join(c for c in unicodedata.normalize('NFD',value.casefold()) if unicodedata.category(c)!='Mn')
                    candidates=[value for (file,fragment),value in anchors.items() if fold(fragment)==fold(unquote(url.fragment))]
                    if len(candidates)==1: destination=candidates[0]
                if destination: link.set('href','#'+destination)
                elif target.endswith('titlepage.xhtml'): link.set('href','#sommaire')
                elif unquote(url.fragment)=='_Hlk16591563':
                    # Signet Word absent de l'EPUB : retour explicite au sommaire.
                    link.set('href','#sommaire')
                    link.set('title','Signet absent de l’EPUB original ; retour au sommaire.')
                else: unresolved.append({'source':filename,'href':link.get('href')})
            if not section['element'].xpath('./h2|./h3'):
                heading=html.Element('h2'); heading.text=section['title']; section['element'].insert(0,heading)
        if unresolved: raise ValueError(f'Renvois EPUB non résolus : {unresolved[:8]}')
    book['sections']=sections
    book['output']='livres/'+book['id']+'.html'
    book['ordered']=spine
    book['errors']=[]
    return book
