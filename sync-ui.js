(() => {
  const form = document.getElementById('sync-login'), status = document.getElementById('sync-status');
  const connected = document.getElementById('account-connected');
  const open = document.getElementById('open-account');
  const dialog = document.getElementById('sync-settings');
  const heading = document.getElementById('account-title');
  const submit = form.querySelector('[type="submit"]');
  let mode = 'login';
  function changeMode(next) {
    mode = next;
    const creating = mode === 'register';
    document.getElementById('confirm-password').hidden = !creating;
    form.elements.confirm.required = creating;
    form.elements.password.minLength = 1;
    form.elements.password.autocomplete = creating ? 'new-password' : 'current-password';
    heading.textContent = creating ? 'Créer un compte' : 'Se connecter';
    submit.textContent = heading.textContent;
    document.getElementById('choose-login').setAttribute('aria-pressed', String(!creating));
    document.getElementById('choose-register').setAttribute('aria-pressed', String(creating));
    form.elements.password.value = ''; form.elements.confirm.value = '';
  }
  function update() {
    const logged = !!globalThis.ebooksSync?.connected();
    form.hidden = logged;
    document.getElementById('account-switch').hidden = logged;
    heading.hidden = logged;
    connected.hidden = !logged;
    open.textContent = logged ? 'Mon compte' : 'Se connecter';
    document.getElementById('account-name').textContent = logged ? 'Connecté : ' + ebooksSync.user().username : '';
  }
  document.getElementById('choose-login').addEventListener('click', () => changeMode('login'));
  document.getElementById('choose-register').addEventListener('click', () => changeMode('register'));
  open.addEventListener('click', () => {
    dialog.showModal();
    if (!ebooksSync.connected()) form.elements.username.focus({preventScroll: true});
  });
  document.getElementById('close-account').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    form.elements.password.value = ''; form.elements.confirm.value = '';
    if (location.hash === '#connexion') history.replaceState(null, '', location.pathname + location.search);
    open.focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (mode === 'register' && form.elements.password.value !== form.elements.confirm.value) {
      status.textContent = 'Les mots de passe sont différents.'; form.elements.confirm.focus(); return;
    }
    submit.disabled = true;
    status.textContent = mode === 'register' ? 'Création du compte…' : 'Connexion…';
    try {
      await ebooksSync[mode](form.elements.username.value, form.elements.password.value, form.elements.remember.checked, form.elements.importLocal.checked);
      form.elements.password.value = ''; form.elements.confirm.value = ''; update();
    } catch (error) { status.textContent = error.message; }
    finally { submit.disabled = false; }
  });
  document.getElementById('sync-disconnect').addEventListener('click', async () => { await ebooksSync.disconnect(); update(); });
  document.getElementById('sync-now').addEventListener('click', () => ebooksSync.sync());
  addEventListener('reading-account-changed', update);
  changeMode('login'); update();
})();
