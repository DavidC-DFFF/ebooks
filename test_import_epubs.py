"""Vérifie l'import des EPUB sans espaces entre blocs et à sommaire numérique."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

from import_epubs import import_epub


class EpubImportTests(unittest.TestCase):
    def test_explicit_headings_preserve_text_and_note_links(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with ZipFile(root / 'book.epub', 'w') as archive:
                archive.writestr('META-INF/container.xml', '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>')
                archive.writestr('book.opf', '<package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="text" href="book.html"/></manifest><spine><itemref idref="text"/></spine></package>')
                archive.writestr('toc.ncx', '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint><navLabel><text>1</text></navLabel><content src="book.html#note"/></navPoint></navMap></ncx>')
                archive.writestr('book.html', '<html><body><p class="chapter">CHAPITRE 1</p><p>Premier titre</p><p>Texte initial.</p><p class="chapter">CHAPITRE 2</p><p>Second titre</p><p>Suite du texte<a href="#note">1</a>.</p><p id="note">1</p><p>Texte de la note.</p></body></html>')
            book = import_epub({'id': 'test-book', 'epub': 'book.epub', 'section_heading_xpath': "self::p[@class='chapter']"}, root)
            self.assertEqual([s['title'] for s in book['sections']], ['CHAPITRE 1 — Premier titre', 'CHAPITRE 2 — Second titre'])
            second = book['sections'][1]['element']
            self.assertIn('Texte de la note.', second.text_content())
            self.assertEqual(second.xpath('.//a/@href'), ['#epub-ancre-1'])
            self.assertEqual(len(second.xpath('.//*[@id="epub-ancre-1"]')), 1)
            self.assertEqual(book['errors'], [])


if __name__ == '__main__':
    unittest.main()
