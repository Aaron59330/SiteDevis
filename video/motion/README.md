# Film « motion design » OptiDevis (1 min 30)

Animation HTML rendue image par image (fond blanc, noir et blanc, logo doré).

1. Serveur de démonstration : `PORT=3101 DATA_DIR=… node video/film/server.js`
2. Captures d'écran du site : `node assets.js` (écrit dans /tmp/mo/a)
3. Copier `motion.html` dans /tmp/mo, puis rendre les images : `node render.js` (écrit /tmp/mo/frames et /tmp/mo/cues.json)
4. Bande-son : `python3 audio.py /tmp/mo/cues.json audio.wav`
5. Assemblage : `ffmpeg -framerate 30 -i frames/f%05d.jpg -i audio.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -shortest optidevis-motion.mp4`
