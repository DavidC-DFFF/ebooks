"""Révision ciblée et signalement explicite des incertitudes OCR restantes."""
from pathlib import Path
import json, re

ROOT=Path(__file__).parent
PATH=ROOT/'sources_marx/Joan Robinson - Essai sur l’économie marxienne.md'

def main():
    text=PATH.read_text(encoding='utf-8')
    # Le résultat de cette étape est idempotent.
    text=re.sub(r'\n> \*\*Vérification OCR requise.*?\n\n','\n',text)
    corrections=json.loads((ROOT/'robinson-corrections.json').read_text(encoding='utf-8'))
    for page,body in corrections.items():
        pattern=rf'(<!-- PDF page {page} -->\n\n\*\*Page .*?\n\n).*?(?=\n<!-- PDF page |\n<a id=|\Z)'
        text,count=re.subn(pattern,lambda m:m[1]+body+'\n\n',text,flags=re.S)
        assert count==1,(page,count)
    replacements={
      'Vol. Moi':'Vol. I','Vol. Malade':'Vol. III','Vol. Mauvais':'Vol. III',
      'Vol. Mauvaise':'Vol. III','Vol. Ill':'Vol. III',
      'Vol. Hanche.':'Vol. III, p.','Vol. je> p.':'Vol. I, p.',
      'maïs':'blé','Maïs':'Blé','sortie nette':'production nette',
      'biens salariés':'biens salariaux','Le diplôme':'Le degré',
      'loyer différentiel':'rente différentielle',
      'période de chiffre d’affaires':'durée de rotation',
      'période de chiffre d\'affaires':'durée de rotation',
      'slogans de bonne foi.':'mots d’ordre d’orthodoxie financière.',
      'finance. L’élément':'L’élément',
      'les universitaires sont impatients de l\'analyse statique':'les universitaires ne se satisfont plus de l’analyse statique',
      'ne m’avaient préparé à m’attendre':'ne m’avaient préparée à attendre',
    }
    for old,new in replacements.items(): text=text.replace(old,new)
    text=re.sub(r'(p{1,2}\.\s*)([0-9iIloOg]{2,4})(?=[\s<(.,;])',
                lambda m:m[1]+m[2].translate(str.maketrans({'i':'1','I':'1','l':'1','o':'0','O':'0','g':'9'})),text)
    # Folios OCR isolés, traduits à tort ou confondant I et l.
    text=re.sub(r'(?m)^(?:\.vi|-Vll|\.?[xivlXVIL]{2,8})\s*\n','',text)
    for page in range(29,130):
        pattern=rf'(<!-- PDF page {page} -->.*?)(?=<!-- PDF page |\Z)'
        text=re.sub(pattern,lambda m:re.sub(rf'(?m)^{page-28}\s*\n', '', m[1]),text,flags=re.S)
    text=re.sub(r'(?m)^je\s*\n(?=\s*Exploitation\.)','1\n',text)
    text=re.sub(r'(?m)^(?P<n>[123])\s*\n(?=\s*[A-ZÉ])',r'### \g<n>\n',text)
    # Références bibliographiques : ne pas laisser les signes OCR devenir du HTML.
    text=re.sub(r'<([0-9IilJ;:,.»()]+)>',lambda m:'('+m[1]+')',text)
    source=json.loads((ROOT/'tmp/pdfs/robinson/pages.json').read_text(encoding='utf-8'))
    flagged=[]
    for page in range(10,130):
        if str(page) in corrections: continue
        raw=source[page-1]['text']
        reasons=[]
        # Fractions éclatées et formules algébriques : contrôle visuel indispensable.
        if re.search(r'(?m)^\s*[scvSCV][ .]*\s*$|[cv][12x,] *\+|[+*=^].*[+*=^]',raw):
            reasons.append('formule ou fraction mal reconnue dans le scan')
        if re.search(r'\d+[<][^ ]{0,12}|\d+\([,;"<>]',raw):
            reasons.append('appels de références ou numéros de notes incertains')
        if reasons:
            flagged.append({'pdf_page':page,'printed_page':page-28 if page>=29 else None,'reasons':reasons})
            pattern=rf'(<!-- PDF page {page} -->\n\n\*\*Page .*?\n\n)'
            warning='> **Vérification OCR requise :** '+', '.join(reasons)+'. Consulter le fac-similé lié ci-dessus ; la notation extraite n’a pas été rétablie avec certitude.\n\n'
            text=re.sub(pattern,lambda m:m[1]+warning,text)
    glossary='''
## Repères terminologiques

- *Surplus* : surplus ; *surplus-value* : plus-value.
- *Constant capital* : capital constant ; *variable capital* : capital variable.
- *Rate of exploitation* : taux d’exploitation ; *organic composition of capital* : composition organique du capital.
- *Effective demand* : demande effective ; *wage goods* : biens salariaux.
- *Corn*, dans l’exemple ricardien, désigne ici le blé ; *plant* désigne l’équipement productif.
- *Turnover period*, pour le capital, désigne la durée de rotation, non le chiffre d’affaires.

'''
    if '## Repères terminologiques' not in text: text=text.replace('## Sommaire\n',glossary+'## Sommaire\n',1)
    edition='''## Indications de l’édition source

Deuxième édition : Macmillan, Londres, Melbourne et Toronto ; St Martin’s Press, New York, 1966. Première édition, 1942 ; nouvelle présentation en 1947 ; réimpressions en 1949, 1952, 1957, 1960, 1963 et 1964. Numéro de catalogue de la Library of Congress : 66-21399. Impression : Lowe and Brydone (Printers) Limited, Londres. La page de droits réserve le copyright dans les pays signataires de la Convention de Berne.

La liste des autres ouvrages de Joan Robinson figurant en tête du volume comprend, sous leurs titres originaux : *The Economics of Imperfect Competition* ; *Introduction to the Theory of Employment* ; *The Accumulation of Capital* (également en édition Papermac) ; *Essays in the Theory of Economic Growth* ; *Exercises in Economic Analysis* (également en édition Papermac).

Les couvertures et pages de titre sont reprises dans l’identification du présent document ; le sommaire original est remplacé par les liens ci-dessous. Les cachets et feuillets de bibliothèque ne font pas partie de la traduction.

'''
    if '## Indications de l’édition source' not in text: text=text.replace('## Repères terminologiques\n',edition+'## Repères terminologiques\n',1)
    PATH.write_text(text,encoding='utf-8')
    report_path=ROOT/'sources_marx/robinson-traduction-verification.json'
    report=json.loads(report_path.read_text(encoding='utf-8'))
    report['revised_pdf_pages']=list(map(int,corrections))
    report['remaining_ocr_flags']=flagged
    report['status']='traduction automatique complète, révision ciblée ; relecture éditoriale exhaustive non effectuée'
    report['output_characters']=len(text)
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    # Couverture vérifiée indépendamment du nombre de mots français.
    expected={p['pdf_page'] for p in report['pages']}
    present=set(map(int,re.findall(r'<!-- PDF page (\d+) -->',text)))
    assert present==expected,(expected-present,present-expected)
    assert all(p['translated_characters']>0 for p in report['pages'])
    assert len(re.findall(r'^## [IVX]+\.',text,re.M))==11
    assert 'c + y + 5-' not in text
    assert 's/(c+v)' in text and '| Alpha | 15 | 120 | 8 |' in text
    print(f'OK : {len(present)} pages éditoriales traduites, 11 chapitres, {len(corrections)} pages révisées ; {len(flagged)} pages signalées pour contrôle OCR.')

if __name__=='__main__': main()
