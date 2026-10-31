"""Extraction traçable et traduction de travail du PDF fourni par David.

Les résultats intermédiaires sont conservés par empreinte pour permettre la reprise.
Le service de traduction ne reçoit que le texte publié du livre.
"""
from pathlib import Path
import concurrent.futures, hashlib, json, re, subprocess, time
import fitz

ROOT = Path(__file__).parent
SOURCE = next((ROOT/'sources_marx').glob('*.pdf'))
WORK = ROOT/'tmp/pdfs/robinson'
WORK.mkdir(parents=True, exist_ok=True)
CACHE = WORK/'translation-cache'
CACHE.mkdir(exist_ok=True)
DEST = ROOT/'sources_marx/Joan Robinson - Essai sur l’économie marxienne.md'
HEADINGS = {
 10:'Préface de la deuxième édition', 26:'Avant-propos',
 29:'I. Introduction', 34:'II. Définitions', 38:'III. La théorie de la valeur-travail',
 51:'Annexe au chapitre III : La valeur dans une économie socialiste',
 57:'IV. La théorie de l’emploi à long terme', 63:'V. La baisse du taux de profit',
 71:'VI. La demande effective', 80:'VII. La théorie orthodoxe du profit',
 91:'VIII. La théorie générale de l’emploi', 101:'IX. La concurrence imparfaite',
 110:'X. Salaires réels et salaires monétaires', 120:'XI. L’analyse dynamique',
 124:'Références au Capital', 131:'Index', 136:'Présentation de la quatrième de couverture'
}

def clean(text):
    text=re.sub(r'([A-Za-z])(?:¬|\xad|-)[ \t]*\n[ \t]*([a-z])',r'\1\2',text)
    text=text.replace('¬','').replace('\xad','')
    text=re.sub(r'\s+',' ',text).strip()
    for a,b in {'dilTerences':'differences','lab our-time':'labour-time','houis':'hours',
                'duccd':'duced','redudes':'reduces','Econonvy':'Economy','Alpha La id':'Alpha Land'}.items():
        text=text.replace(a,b)
    return text

def extract():
    doc=fitz.open(SOURCE)
    pages=[]
    for index in list(range(9,129))+[130,131,135]:
        page=doc[index]
        blocks=[]
        for block in page.get_text('blocks'):
            raw=block[4]
            txt=clean(raw)
            if not txt: continue
            # Titres courants et folios ; conserver les chiffres de tableaux.
            if block[1] < 55 and txt==txt.upper() and len(txt)<100: continue
            if block[1]>page.rect.height*.89 and re.fullmatch(r'[0-9ivxlcIVXLC. ]{1,8}',txt): continue
            if txt in ('CHAPTER I','CHAPTER II','CHAPTER III','CHAPTER IV','CHAPTER V','CHAPTER VI',
                       'CHAPTER VII','CHAPTER VIII','CHAPTER IX','CHAPTER X','CHAPTER XI',
                       'INTRODUCTION','DEFINITIONS','THE LABOUR THEORY OF VALUE',
                       'THE LONG-PERIOD THEORY OF EMPLOYMENT','THE FALLING RATE OF PROFIT',
                       'EFFECTIVE DEMAND','THE ORTHODOX THEORY OF PROFIT','THE GENERAL THEORY OF EMPLOYMENT',
                       'IMPERFECT COMPETITION','REAL AND MONEY WAGES','DYNAMIC ANALYSIS',
                       'FOREWORD','PREFACE TO THE SECOND EDITION','APPENDIX','VALUE IN A SOCIALIST ECONOMY',
                       'REFERENCES TO “CAPITAL”','REFERENCES TO “ CAPITAL ”','INDEX'): continue
            blocks.append(txt)
        pages.append({'pdf_page':index+1,'blocks':blocks})
    (WORK/'extracted.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2),encoding='utf-8')
    return pages

def translate(text):
    key=hashlib.sha256(text.encode()).hexdigest()
    target=CACHE/(key+'.json')
    if target.exists(): return json.loads(target.read_text(encoding='utf-8'))['fr']
    source=CACHE/(key+'.txt')
    source.write_text(text,encoding='utf-8')
    for attempt in range(5):
        try:
            response=subprocess.run(['curl.exe','--silent','--show-error','--fail','--max-time','45',
                '--get','--data-urlencode','client=gtx','--data-urlencode','sl=en','--data-urlencode','tl=fr',
                '--data-urlencode','dt=t','--data-urlencode','q@'+str(source),
                'https://translate.googleapis.com/translate_a/single'],capture_output=True,check=True)
            data=json.loads(response.stdout)
            translated=''.join(sentence[0] for sentence in data[0] if sentence and sentence[0])
            if not translated.strip(): raise ValueError('Traduction vide')
            target.write_text(json.dumps({'en':text,'fr':translated},ensure_ascii=False),encoding='utf-8')
            return translated
        except Exception:
            if attempt==4: raise
            time.sleep(2+attempt*2)

def translate_block(text):
    if len(text)<=3500: return translate(text)
    # Découpage aux frontières de phrases, sans omettre de texte.
    chunks=[]; start=0
    while len(text)-start>3500:
        end=text.rfind('. ',start+1500,start+3400)
        if end<0: end=text.rfind(' ',start+1500,start+3400)
        end+=1
        chunks.append(text[start:end]); start=end
    chunks.append(text[start:])
    return ' '.join(translate(c.strip()) for c in chunks if c.strip())

def main():
    pages=extract()
    tasks=[(page,i,text) for page in pages for i,text in enumerate(page['blocks'])]
    print(f'{len(pages)} pages éditoriales ; {len(tasks)} blocs à traduire.',flush=True)
    results={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        pending={pool.submit(translate_block,text):(page['pdf_page'],i) for page,i,text in tasks}
        for done,future in enumerate(concurrent.futures.as_completed(pending),1):
            results[pending[future]]=future.result()
            if done%25==0: print(f'Traduction : {done}/{len(tasks)} blocs',flush=True)
    intro='''# Essai sur l’économie marxienne

**Joan Robinson**

Traduction française de travail d’*An Essay on Marxian Economics*, deuxième édition, 1966.

> Texte traduit automatiquement avec Google Traduction, à partir de la reconnaissance de caractères du PDF fourni. La structure et certains passages techniques ont été contrôlés ; cette version n’est pas une traduction éditoriale entièrement révisée. Les formules et références dégradées par le scan nécessitent une vérification sur le fac-similé. Les citations de Marx sont retraduites de l’anglais de Robinson et ne constituent pas une reprise d’une édition française publiée du *Capital*.

La pagination ci-dessous est celle du livre imprimé ; les liens de contrôle renvoient aux pages du PDF. Les pages de bibliothèque et les feuillets blancs sont omis. Les notes demeurent à proximité de la page à laquelle elles se rapportent ; leur numérotation est celle du scan.

## Sommaire

'''
    def slug(s):
        import unicodedata
        s=''.join(c for c in unicodedata.normalize('NFD',s.lower()) if unicodedata.category(c)!='Mn')
        return re.sub(r'[^a-z0-9]+','-',s).strip('-')
    out=[intro]+[f'- [{title}](#{slug(title)})\n' for title in HEADINGS.values()]
    source=['# An Essay on Marxian Economics - Joan Robinson\n\nTexte OCR extrait du PDF ; conservation par page.\n']
    coverage=[]
    for page in pages:
        number=page['pdf_page']
        if number in HEADINGS: out.append(f'\n<a id="{slug(HEADINGS[number])}"></a>\n\n## {HEADINGS[number]}\n')
        label=str(number-28) if number>=29 and number<=132 else f'liminaire, PDF {number}'
        out.append(f'\n<!-- PDF page {number} -->\n\n**Page {label}** · [Fac-similé]({SOURCE.name.replace(" ","%20")}#page={number})\n\n')
        source.append(f'\n## PDF page {number}\n\n')
        translated=[]
        for i,en in enumerate(page['blocks']):
            fr=results[(number,i)]
            out.append(fr+'\n\n'); source.append(en+'\n\n'); translated.append(fr)
        coverage.append({'pdf_page':number,'blocks':len(page['blocks']),
                         'source_characters':sum(map(len,page['blocks'])),
                         'translated_characters':sum(map(len,translated))})
    DEST.write_text(''.join(out),encoding='utf-8')
    (ROOT/'sources_marx/Joan Robinson - Texte source anglais.md').write_text(''.join(source),encoding='utf-8')
    (ROOT/'sources_marx/robinson-traduction-verification.json').write_text(json.dumps({
        'source_pdf':SOURCE.name,'source_pdf_pages':136,'editorial_pages':len(pages),
        'provider':'Google Traduction, en vers fr','status':'traduction de travail, révision éditoriale non exhaustive',
        'pages':coverage},ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Terminé : {DEST}',flush=True)
    from review_robinson_translation import main as review
    review()

if __name__=='__main__': main()
