try { var t = localStorage.getItem('sitedevis.theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
