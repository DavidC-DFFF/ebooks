// Les colonnes sont paginées par doubles pages, sans modifier le texte source.
const spreadQuery = matchMedia('(min-width: 1100px) and (min-height: 540px)');
const readingArticle = document.querySelector('main article');
const spreadEnd = document.createElement('span');
spreadEnd.setAttribute('aria-hidden', 'true');
spreadEnd.className = 'spread-end';
spreadEnd.style.cssText = 'position:absolute;top:0;width:1px;height:1px;pointer-events:none';
readingArticle.append(spreadEnd);
function isSpreadReading() { return spreadQuery.matches && active >= 0; }
function spreadStep() {
  return readingArticle.clientWidth + parseFloat(getComputedStyle(sections[active]).columnGap);
}
function spreadMax() {
  return Math.max(0, Math.ceil((readingArticle.scrollWidth - readingArticle.clientWidth - 2) / spreadStep()));
}
function spreadIndex() { return Math.round(readingArticle.scrollLeft / spreadStep()); }
function spreadFraction() {
  const max = spreadMax();
  return max ? readingMath.clamp(spreadIndex() / max) : 1;
}
function updateSpreadControls() {
  if (active < 0) return;
  const spread = isSpreadReading();
  const before = spread && spreadIndex() > 0;
  const after = spread && spreadIndex() < spreadMax();
  previous.textContent = before ? '← Page précédente' : '← Précédent';
  previous.setAttribute('aria-disabled', String(active < 0));
  next.textContent = after ? 'Page suivante →' : active === sections.length - 1 ? 'Sommaire' : 'Suivant →';
}
function turnSpread(direction) {
  if (!isSpreadReading()) return false;
  const target = spreadIndex() + direction;
  if (target < 0 || target > spreadMax()) return false;
  saveReadingPosition();
  readingArticle.scrollLeft = target * spreadStep();
  updateSpreadControls();
  progress();
  saveReadingPosition();
  return true;
}
function scrollToReadingBlock(block, offset = 0, fragment = 0) {
  if (!isSpreadReading()) {
    const margin = (document.querySelector('.navbar')?.getBoundingClientRect().height || 60) + 12;
    window.scrollTo(0, Math.max(0, scrollY + block.getBoundingClientRect().top - margin - offset));
    return;
  }
  const fragments = block.getClientRects();
  const first = fragments[Math.min(fragment, fragments.length - 1)];
  if (!first) return;
  const x = readingArticle.scrollLeft + first.left - readingArticle.getBoundingClientRect().left;
  readingArticle.scrollLeft = Math.max(0, Math.floor((x + 1) / spreadStep())) * spreadStep();
}
function sizeSpread() {
  const top = document.querySelector('.navbar').getBoundingClientRect().bottom + 24;
  const bottom = document.querySelector('.reader-bottom').getBoundingClientRect().top - 24;
  document.documentElement.style.setProperty('--reader-top', `${top}px`);
  document.documentElement.style.setProperty('--reader-height', `${Math.max(160, bottom - top)}px`);
  spreadEnd.style.left = '0';
  if (isSpreadReading()) {
    const step = spreadStep();
    const gap = parseFloat(getComputedStyle(sections[active]).columnGap);
    const spreads = Math.ceil((sections[active].scrollWidth + gap - 2) / step);
    spreadEnd.style.left = `${Math.max(0, spreads * step - gap - 1)}px`;
  }
}
previous.addEventListener('click', event => { if (turnSpread(-1)) event.preventDefault(); });
next.addEventListener('click', event => { if (turnSpread(1)) event.preventDefault(); });
readingArticle.addEventListener('scroll', () => {
  if (!isSpreadReading()) return;
  updateSpreadControls();
  progress();
  clearTimeout(readingTimer);
  readingTimer = setTimeout(saveReadingPosition, 200);
}, { passive: true });
let lastWheelTurn = 0;
readingArticle.addEventListener('wheel', event => {
  if (!isSpreadReading() || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  // Laisser défiler un tableau ou un autre contenu imbriqué.
  if (event.target.closest('table,pre')) return;
  event.preventDefault();
  if (Math.abs(event.deltaY) < 8 || Date.now() - lastWheelTurn < 350) return;
  if (turnSpread(event.deltaY > 0 ? 1 : -1)) lastWheelTurn = Date.now();
}, { passive: false });
document.addEventListener('keydown', event => {
  if (!isSpreadReading() || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest('input,select,textarea,[contenteditable]') ||
      (event.key === ' ' && event.target.closest('button,a'))) return;
  const direction = {ArrowRight: 1, ArrowDown: 1, PageDown: 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1}[event.key] || (event.key === ' ' ? (event.shiftKey ? -1 : 1) : 0);
  if (direction && turnSpread(direction)) event.preventDefault();
});
let layoutFrame;
function reflowReading() {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    let saved;
    try { saved = JSON.parse(get('position')); } catch (e) {}
    sizeSpread();
    if (active >= 0 && saved?.section === sections[active].id) {
      const block = readingBlocks(sections[active]).find(e => e.textContent.trim().slice(0, 100) === saved.signature);
      if (block) scrollToReadingBlock(block, saved.offset, saved.fragment || 0);
    }
    updateSpreadControls();
    progress();
  });
}
addEventListener('resize', reflowReading);
document.addEventListener('fullscreenchange', reflowReading);
document.getElementById('smaller').addEventListener('click', reflowReading);
document.getElementById('larger').addEventListener('click', reflowReading);
