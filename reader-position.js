// Position indépendante par livre, intégrée aux HTML autonomes.
let restoringReading = false;
let readingTimer;
const initialReadingHash = location.hash;
function readingBlocks(section) {
  return [...section.querySelectorAll('p,h2,h3,h4,li,table')].filter(e => e.textContent.trim());
}
function saveReadingPosition() {
  if (restoringReading || active < 0) return;
  const section = sections[active];
  const margin = (document.querySelector('.navbar')?.getBoundingClientRect().height || 60) + 12;
  const blocks = readingBlocks(section);
  const block = blocks.findIndex(e => e.getBoundingClientRect().bottom > margin);
  if (block < 0) return;
  put('position', JSON.stringify({
    section: section.id, block,
    signature: blocks[block].textContent.trim().slice(0, 100),
    offset: blocks[block].getBoundingClientRect().top - margin
  }));
  const max = document.documentElement.scrollHeight - innerHeight;
  const fraction = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 1;
  put('reading', JSON.stringify({ section: section.id,
    percent: Math.round((active + fraction) / sections.length * 100),
    updated: Date.now() }));
}
function restoreReadingPosition(section, target) {
  restoringReading = true;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    let saved;
    try { saved = JSON.parse(get('position')); } catch (e) {}
    if (target !== section) target.scrollIntoView();
    else if (saved?.section === section.id &&
             (location.hash === initialReadingHash || resumeReadingRequested)) {
      const blocks = readingBlocks(section);
      let block = blocks[saved.block];
      if (block?.textContent.trim().slice(0, 100) !== saved.signature)
        block = blocks.find(e => e.textContent.trim().slice(0, 100) === saved.signature);
      if (block) {
        const margin = (document.querySelector('.navbar')?.getBoundingClientRect().height || 60) + 12;
        window.scrollTo(0, Math.max(0, scrollY + block.getBoundingClientRect().top - margin - saved.offset));
      } else window.scrollTo(0, 0);
    } else window.scrollTo(0, 0);
    resumeReadingRequested = false;
    requestAnimationFrame(() => { restoringReading = false; progress(); saveReadingPosition(); });
  }));
}
let resumeReadingRequested = false;
resume.addEventListener('click', () => { resumeReadingRequested = true; });
addEventListener('scroll', () => {
  clearTimeout(readingTimer);
  readingTimer = setTimeout(saveReadingPosition, 200);
}, { passive: true });
addEventListener('pagehide', saveReadingPosition);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveReadingPosition();
});
document.addEventListener('click', saveReadingPosition, { capture: true });
const fullscreenButton = document.getElementById('fullscreen');
if (fullscreenButton) {
  if (!document.fullscreenEnabled) fullscreenButton.hidden = true;
  else {
    fullscreenButton.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch (e) { fullscreenButton.title = 'Le navigateur ne permet pas le plein écran dans ce contexte.'; }
    });
    document.addEventListener('fullscreenchange', () => {
      const full = !!document.fullscreenElement;
      fullscreenButton.textContent = full ? '⤡' : '⛶';
      fullscreenButton.setAttribute('aria-label', full ? 'Quitter le plein écran' : 'Passer en plein écran');
      fullscreenButton.setAttribute('aria-pressed', String(full));
    });
  }
}
show();
