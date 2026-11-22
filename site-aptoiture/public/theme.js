// Chargé dans <head> : applique le thème enregistré avant l'affichage (évite un flash) et mémorise la visite
(function () {
  try {
    if (localStorage.getItem('pa-theme') === 'light') document.documentElement.setAttribute('data-theme', 'light');
    if (sessionStorage.getItem('pa-seen')) document.documentElement.classList.add('seen');
    else sessionStorage.setItem('pa-seen', '1');
  } catch (e) {}
})();
