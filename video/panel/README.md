# Film « panel » OptiDevis (1 min 30)

Le vrai site (thème sombre d'origine, rubriques du menu client, sans Administration) est filmé, puis présenté en 3D sur fond clair avec des titres en deux lignes.

1. Serveur de démonstration : `PORT=3101 DATA_DIR=… node video/film/server.js`
2. Enregistrement du site : `OUT=/tmp/panel/raw node rec.js` (images + timeline.json avec scènes, clics, survols)
3. Vidéo brute à 30 i/s (VP9, images clés rapprochées) : voir la commande ffmpeg dans l'historique du dépôt (concat des images avec leurs durées réelles).
4. Copier `panel.html` et `render.js` dans /tmp/panel, puis `node render.js` (images + cues.json)
5. Bande-son : `python3 audio.py /tmp/panel/cues.json audio.wav`
6. Assemblage : `ffmpeg -framerate 30 -i frames/f%05d.jpg -i audio.wav -c:v libx264 -crf 19 -pix_fmt yuv420p -c:a aac -shortest optidevis-panel.mp4`
