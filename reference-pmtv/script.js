// 🎨 Thème clair/sombre avec mémorisation
function setupThemeToggle() {
  const toggleButton = document.getElementById('toggle-theme');
  if (toggleButton) {
    toggleButton.addEventListener('click', () => {
      const currentTheme = document.documentElement.dataset.theme;
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = newTheme;
      localStorage.setItem('theme', newTheme);
    });
  }

  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.dataset.theme = savedTheme;
}

// 📖 Redirection via la table des matières
function goToChapter(selectElement) {
  const page = selectElement.value;
  if (!page) return;

  const currentPath = window.location.pathname;
  const isInChapitres = currentPath.includes('/chapitres/');
  const base = isInChapitres ? '' : 'chapitres/';
  const fullPath = base + page;

  localStorage.setItem('lastPage', fullPath);
  window.location.href = fullPath;
}

// 📌 Mémoriser la page actuelle (sauf index.html)
window.addEventListener('beforeunload', () => {
  const fullPath = window.location.pathname;
  const match = fullPath.match(/\/PMTV\/(chapitres\/chapitre\d+\.html)/);
  if (match) {
    localStorage.setItem('lastPage', match[1]);
  }
});

// 🔗 Intercepter les clics sur le lien "Sommaire"
function setupSommaireInterception() {
  const sommaireBtn = document.querySelector('a.nav-left[href="../index.html"], a.nav-left[href="index.html"]');
  if (sommaireBtn) {
    sommaireBtn.addEventListener('click', () => {
      sessionStorage.setItem('manualIndex', 'true');
    });
  }
}

// 📥 Charger dynamiquement navbar.html
function loadNavbar() {
  const navbarContainer = document.getElementById('navbar');
  if (navbarContainer) {
    const base = window.location.pathname.includes('/chapitres/') ? '../' : './';
    fetch(base + 'navbar.html')
      .then(response => response.text())
      .then(html => {
        navbarContainer.innerHTML = `
          <nav class="navbar">
            <div class="navbar-inner">
              ${html}
            </div>
          </nav>
        `;
        setupThemeToggle();
        setupSommaireInterception();
        selectCurrentChapter();
        setupFontSizeToggle();
      });
  } else {
    setupThemeToggle();
    setupSommaireInterception();
  }
}

// ✅ Marquer automatiquement le chapitre actif dans le menu TOC
function selectCurrentChapter() {
  const toc = document.getElementById('toc');
  if (toc) {
    const current = window.location.pathname.split('/').pop();
    for (let option of toc.options) {
      if (option.value === current) {
        option.selected = true;
        break;
      }
    }
  }
}

// 📊 Barre de progression globale
function updateGlobalProgressBar() {
  const chapterOrder = [
    'index.html',
    'chapitre01.html',
    'chapitre02.html',
    'chapitre03.html',
    'chapitre04.html',
    'chapitre05.html',
    'chapitre06.html',
    'chapitre07.html',
    'chapitre08.html',
    'chapitre09.html',
    'chapitre10.html',
    'chapitre11.html',
    'chapitre12.html',
    'chapitre13.html',
    'chapitre14.html',
    'chapitre15.html',
    'chapitre16.html',
    'chapitre17.html',
    'chapitre18.html',
    'chapitre19.html',
    'chapitre20.html',
    'chapitre21.html',
    'chapitre22.html',
    'chapitre23.html',
    'chapitre24.html',
    'chapitre25.html',
    'chapitre26.html',
    'chapitre27.html',
    'chapitre28.html',
    'chapitre29.html',
    'chapitre30.html',
    'chapitre31.html',
    'chapitre32.html',
    'chapitre33.html',
    'chapitre34.html',
    'chapitre35.html',
    'chapitre36.html',
    'chapitre37.html',
    'chapitre38.html',
    'chapitre39.html',
    'chapitre40.html',
    'chapitre41.html',
    'chapitre42.html',
    'chapitre43.html',
    'chapitre44.html',
    'chapitre45.html',
    'chapitre46.html',
    'chapitre47.html',
    'chapitre48.html',
    'chapitre49.html',
    'chapitre50.html',
    'chapitre51.html',
    'chapitre52.html',
    'chapitre53.html',
    'chapitre54.html',
    'chapitre55.html',
    'chapitre56.html',
    'chapitre57.html',
    'chapitre58.html',
    'chapitre59.html',
    'fin.html'
  ];

  const currentPath = window.location.pathname.split('/').pop();
  const index = chapterOrder.indexOf(currentPath);

  if (index !== -1) {
    const progressPercent = ((index + 1) / chapterOrder.length) * 100;
    const bar = document.getElementById('global-progress');
    if (bar) bar.style.width = progressPercent + '%';
  }
}

// ▶️ Initialisation au chargement
window.addEventListener('DOMContentLoaded', () => {
  loadNavbar();
  setupFontSizeToggle();
  updateGlobalProgressBar();
});

function setupFontSizeToggle() {
  const button = document.getElementById('toggle-font');
  const sizes = ['small', 'medium', 'large'];
  let current = localStorage.getItem('fontSize') || 'medium';
  
  const applySize = (size) => {
    document.documentElement.dataset.font = size;
    localStorage.setItem('fontSize', size);
  };

  applySize(current);

  if (button) {
    button.addEventListener('click', () => {
      const index = (sizes.indexOf(current) + 1) % sizes.length;
      current = sizes[index];
      applySize(current);
    });
  }
}
