const chapterWeights = sections.map(section => Math.max(1,
  section.textContent.trim().split(/\s+/u).filter(Boolean).length));
let chapterRead = sections.map(() => 0);
try {
  const saved = JSON.parse(get('chapters'));
  if (saved && typeof saved === 'object')
    chapterRead = sections.map(section => readingMath.clamp(saved[section.id]));
} catch (e) {}
const progressBar = document.getElementById('global-progress');
progressBar.removeAttribute('aria-hidden');
progressBar.setAttribute('role', 'img');
const chapterSegments = sections.map((section, i) => {
  const segment = document.createElement('span');
  segment.className = 'chapter-segment';
  segment.style.flexGrow = chapterWeights[i];
  const fill = document.createElement('span');
  fill.className = 'chapter-fill';
  segment.append(fill);
  progressBar.append(segment);
  return segment;
});
const bookSummary = document.createElement('p');
bookSummary.className = 'book-progress-summary';
bookSummary.id = 'book-progress-summary';
document.getElementById('sommaire').querySelector('nav').before(bookSummary);
const chapterLabels = sections.map(section => {
  const link = document.querySelector(`#sommaire nav a[href="#${section.id}"]`);
  if (!link) return null;
  const label = document.createElement('span');
  label.className = 'chapter-percentage';
  link.append(label);
  return label;
});
function chapterFraction() {
  if (active < 0) return 0;
  const rect = sections[active].getBoundingClientRect();
  const top = document.querySelector('.navbar').getBoundingClientRect().bottom + 12;
  const bottom = document.querySelector('.reader-bottom').getBoundingClientRect().top - 12;
  const distance = rect.height - Math.max(1, bottom - top);
  if (distance <= 0) return 1;
  return readingMath.clamp((top - rect.top) / distance);
}
function updateChapterProgress(record = false) {
  if (record && active >= 0 && !restoringReading) {
    chapterRead = readingMath.advance(chapterRead, active, chapterFraction());
    put('chapters', JSON.stringify(Object.fromEntries(sections.map((section, i) => [section.id, chapterRead[i]]))));
  }
  const total = readingMath.total(chapterWeights, chapterRead);
  const percent = readingMath.percent(total);
  chapterSegments.forEach((segment, i) => {
    const value = readingMath.percent(chapterRead[i]);
    segment.firstChild.style.width = `${chapterRead[i] * 100}%`;
    segment.classList.toggle('current', i === active);
    const title = sections[i].querySelector('h2,h3')?.textContent.trim() || `Partie ${i + 1}`;
    segment.title = `${title} : ${value} %`;
    if (chapterLabels[i]) chapterLabels[i].textContent = `(${value} %)`;
  });
  progressBar.setAttribute('aria-label', `Ouvrage lu à ${percent} %. Progression par chapitre disponible dans le sommaire.`);
  bookSummary.textContent = `Ouvrage lu à ${percent} %`;
  return percent;
}
