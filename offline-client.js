(() => {
  const button = document.getElementById('refresh-site');
  const status = document.getElementById('offline-status');
  const root = new URL(document.querySelector('a[aria-label="Retour à la bibliothèque"]')?.getAttribute('href') || './index.html', location.href);
  const say = text => { if (status) status.textContent = text; };
  if (!('serviceWorker' in navigator) || !isSecureContext || location.protocol === 'file:') {
    say('La copie hors connexion nécessite HTTPS ou un serveur local.');
    if (button) button.disabled = true;
    return;
  }
  let registration;
  let busy = false;
  function request(type) {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = ({ data }) => {
        if (data.type === 'PROGRESS') say(`Synchronisation : ${data.done} / ${data.total} fichiers…`);
        else { channel.port1.close(); data.type === 'ERROR' ? reject(new Error(data.message)) : resolve(data.state); }
      };
      const worker = registration.active;
      if (!worker) { reject(new Error('La copie hors connexion est en cours de préparation.')); return; }
      worker.postMessage({ type }, [channel.port2]);
    });
  }
  function available(state) {
    say(state ? `${state.books} livres disponibles hors connexion · ${new Date(state.date).toLocaleString('fr-FR')}` : 'Bibliothèque à télécharger pour la lecture hors connexion.');
  }
  async function sync(manual = false) {
    if (busy) return;
    busy = true;
    if (button) button.disabled = true;
    say('Synchronisation de la bibliothèque…');
    try {
      if (manual) await registration.update();
      const state = await request('SYNC');
      available(state);
      if (manual) location.reload();
    } catch (error) { say('Synchronisation impossible. Vérifiez votre connexion et réessayez. La copie précédente, si elle existe, reste disponible.'); }
    finally { busy = false; if (button) button.disabled = false; }
  }
  if (button) { button.disabled = true; button.onclick = () => sync(true); }
  navigator.serviceWorker.register(new URL('service-worker.js', root), { scope: new URL('./', root).pathname })
    .then(() => navigator.serviceWorker.ready)
    .then(async reg => {
      registration = reg;
      if (button) button.disabled = false;
      const state = await request('STATUS');
      available(state);
      if (!state) await sync();
    }).catch(error => { say('La préparation hors connexion a échoué. Reconnectez-vous et rechargez la page.'); });
})();
