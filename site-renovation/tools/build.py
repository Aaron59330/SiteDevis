import os, unicodedata
def slugify(t): return ''.join(c for c in unicodedata.normalize('NFD',t.lower()) if unicodedata.category(c)!='Mn').replace("'",'').replace(' ','-')
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','public')
TEL='07 89 58 02 24'; TELH='+33789580224'; MAIL='aydenpuche@gmail.com'
ADDR='2A rue Hector Cartigny, 59330 Neuf-Mesnil'; INSTA='pa_renovation59'; FB='PA rénovation'

def ic(p,s=28): return f'<svg class="i" width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{p}</svg>'
I={
 'roof':ic('<path d="M3 12 12 4l9 8"/><path d="M5 10.5V20h14v-9.5"/><path d="M9 20v-6h6v6"/>'),
 'zinc':ic('<path d="M3 7h18v3H3z"/><path d="M6 10v8a2 2 0 0 0 2 2h0"/><path d="M18 10v6"/><path d="M18 19v.01"/>'),
 'gable':ic('<path d="M12 3 4 12v9h16v-9z"/><path d="M12 3v18"/><path d="M4 12h16"/>'),
 'brush':ic('<path d="M14 4l6 6-8 8H6v-6z"/><path d="M4 21l2-3"/><path d="M12 6l6 6"/>'),
 'interior':ic('<path d="M4 21V4h16v17"/><path d="M4 21h16"/><path d="M9 21v-7h6v7"/><path d="M8 8h8"/>'),
 'leaf':ic('<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-5 6-8 10-10"/>'),
 'brick':ic('<rect x="3" y="5" width="18" height="14"/><path d="M3 10h18M3 15h18M9 5v5M15 10v5M9 15v4"/>'),
 'velux':ic('<path d="M3 18 9 6h12l-6 12z"/><path d="m6 12 12 0"/>'),
 'phone':ic('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',22),
 'mail':ic('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',22),
 'insta':ic('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5v.01"/>',22),
 'fb':ic('<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>',22),
 'box':ic('<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
 'pin':ic('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',22),
 'clock':ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',22),
 'check':ic('<path d="m5 12 5 5 9-10"/>',20),
 'arrow':ic('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',20),
 'file':ic('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/>'),
 'shield':ic('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
 'user':ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'),
}
PAGES=[('index.html','Accueil'),('services.html','Services'),('realisations.html','Réalisations'),('zone-intervention.html',"Zone d'intervention"),('faq.html','FAQ'),('a-propos.html','À propos'),('contact.html','Contact')]
SUN='<svg class="sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
MOON='<svg class="moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>'

EXTRA_JS={'devis.html':'<script src="devis.js"></script>','rendez-vous.html':'<script src="rdv.js"></script>'}

def page(fn,title,desc,body,hero=None):
    nav=''.join(f'<a href="{f}"{" class=\"active\"" if f==fn else ""}>{n}</a>' for f,n in PAGES[:-1])
    return f'''<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} | PA Rénovation – Neuf-Mesnil</title>
<meta name="description" content="{desc}">
<script src="theme.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap">
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="loader" aria-hidden="true"><div class="loader-in"><img src="images/mascotte.png" alt="" width="118" height="68"><span class="loader-bar"></span></div></div>
<div class="topbar"><div class="container"><span class="loc">{I['pin'].replace('width="22" height="22"','width="15" height="15"')} Neuf-Mesnil (59330) et tout le secteur</span><span class="tb-right"><a href="tel:{TELH}">{I['phone'].replace('width="22" height="22"','width="15" height="15"')} {TEL}</a></span></div></div>
<header class="header">
<div class="container nav">
<a href="index.html" class="logo" aria-label="PA Rénovation, accueil"><img src="images/mascotte.png" alt="" width="86" height="34"><span>PA <b>RÉNOVATION</b></span></a>
<button class="burger" aria-label="Ouvrir le menu" aria-expanded="false"><span></span><span></span><span></span></button>
<nav class="menu">{nav}<button class="theme-toggle" type="button" aria-label="Basculer entre mode clair et mode sombre" title="Mode clair / sombre">{SUN}{MOON}</button><a href="devis.html" class="btn btn-sm{' active' if fn=='devis.html' else ''}">Devis gratuit</a></nav>
</div>
</header>
<main>
{body}
</main>
<footer class="footer">
<div class="container fgrid">
<div><a href="index.html" class="logo"><img src="images/mascotte.png" alt="" width="86" height="34"><span>PA <b>RÉNOVATION</b></span></a>
<p>Rénovation intérieure et extérieure, espaces verts, débarras et démoussage.<br>Artisan à Neuf-Mesnil.</p></div>
<div><h4>Navigation</h4>{''.join(f'<a href="{f}">{n}</a>' for f,n in PAGES)}</div>
<div><h4>Ressources</h4><a href="devis.html">Devis en ligne</a><a href="rendez-vous.html">Prendre rendez-vous</a><a href="guide-materiaux.html">Guide : matériaux de toiture</a></div>
<div><h4>Contact</h4><a href="tel:{TELH}">{TEL}</a><a href="mailto:{MAIL}">{MAIL}</a><span>{ADDR}</span><a href="https://www.instagram.com/{INSTA}" target="_blank" rel="noopener noreferrer">Instagram : {INSTA}</a><span>Facebook : {FB}</span></div>
</div>
<div class="container legal"><span>© <span id="year"></span> PA Rénovation – SIRET 000 000 000 00000</span><span class="legal-links"><a href="mentions-legales.html">Mentions légales</a><a href="confidentialite.html">Confidentialité</a><a href="/admin" class="adm-link" data-noedit>Administration</a></span></div>
</footer>
<script src="script.js"></script>
{EXTRA_JS.get(fn,"")}
</body>
</html>'''

def banner(h,p,crumb):
    return f'<section class="banner"><div class="container"><p class="crumb"><a href="index.html">Accueil</a> / {crumb}</p><h1>{h}</h1><p>{p}</p></div></section>'

cta='''<section class="cta"><div class="container"><div><h2>Un projet de rénovation ?</h2><p>Décrivez-nous vos travaux, nous vous répondons rapidement avec un devis gratuit.</p></div><div class="cta-btns"><a href="devis.html" class="btn btn-light">Demander un devis</a><a href="tel:%s" class="btn btn-ghost">%s</a></div></div></section>''' % (TELH,TEL)

SIDE={'renovation-interieure':'Intérieur','renovation-exterieure':'Extérieur','espaces-verts':'Extérieur','services-complementaires':'Complémentaire'}
ALT={'renovation-interieure':'Combles aménagés en cours de finition','renovation-exterieure':'Toiture en ardoises avec fenêtres de toit','espaces-verts':'Jardin avec pelouse, massifs de lavande et plantes ornementales'}
def PHOTO(t,k):
    f=os.path.join(OUT,'images','services',slugify(t)+'.webp')
    if os.path.exists(f):
        return f'<figure class="srv-photo"><img src="images/services/{slugify(t)}.webp" alt="{ALT[slugify(t)]}" width="1200" height="900" loading="lazy"></figure>'
    return '<div class="srv-ico">'+I[k].replace('width="28" height="28"','width="90" height="90"')+'</div>'
SERV=[
('interior','Rénovation intérieure','Rénovez votre intérieur, pièce par pièce, avec des finitions soignées.',
 ['Placo et cloisons','Enduit','Mise en peinture','Pose de parquet','Pose de carrelage','Pose de cuisine équipée','Montage de meubles']),
('roof','Rénovation extérieure','Redonnez de l\'éclat à votre toiture, à votre façade et à vos extérieurs.',
 ['Rénovation de toiture','Mise en peinture de toiture','Démoussage de toiture','Nettoyage de façade','Nettoyage extérieur']),
('leaf','Espaces verts','Un jardin entretenu et mis en valeur, toute l\'année.',
 ['Taille de haies','Taille de massifs','Entretien extérieur']),
('box','Services complémentaires','Pour compléter votre chantier ou libérer votre logement.',
 ['Débarras de maison et d\'appartement','Évacuation des déchets en déchetterie']),
]

# ---------- INDEX
cards=''.join(f'<a class="scard" href="services.html#{slugify(t)}"><span class="sico">{I[k]}</span><h3>{t}</h3><p>{d}</p><span class="more">En savoir plus {I["arrow"]}</span></a>' for k,t,d,_ in SERV)
why=[('check','Réactif à votre écoute','Une réponse rapide à vos demandes, dans le respect de votre projet.'),
     ('file','Devis gratuit','Un chiffrage clair et détaillé, sans engagement et sans surprise.'),
     ('user','Travail soigné','Des finitions propres et un chantier laissé net à la fin des travaux.'),
     ('shield','Matériaux de qualité','Nous travaillons avec des matériaux de qualité.')]
whyh=''.join(f'<div class="why"><span class="sico">{I[k]}</span><div><h3>{t}</h3><p>{d}</p></div></div>' for k,t,d in why)
index=f'''<section class="hero"><div class="container hero-in"><div class="hero-txt">
<p class="eyebrow">Intérieur · Extérieur · Débarras · Démoussage</p>
<h1>Tous vos travaux<br>de rénovation,<br>dedans et dehors.</h1>
<p class="lead">PA Rénovation réalise vos travaux de rénovation intérieure et extérieure, l'entretien de vos espaces verts et vos débarras, à Neuf-Mesnil et dans tout le secteur.</p>
<div class="hero-btns"><a href="devis.html" class="btn">Demander un devis gratuit</a><a href="services.html" class="btn btn-ghost">Découvrir nos services</a></div><p class="hero-note slogan">Votre projet, notre savoir-faire.</p></div>
<div class="hero-logo"><div class="logo-shine"><img src="images/logo.png" alt="Logo PA Rénovation, intérieure et extérieure"></div></div></div></section>
<section class="counters"><div class="container counters-grid">
<div><strong class="count">4</strong><span>domaines : intérieur, extérieur, espaces verts, débarras</span></div>
<div><strong class="count">100%</strong><span>de devis gratuits et sans engagement</span></div>
</div></section>
<section class="section"><div class="container"><div class="head"><p class="eyebrow">Nos métiers</p><h2>Ce que nous faisons</h2></div><div class="grid-svc">{cards}</div></div></section>
<section class="section alt"><div class="container"><div class="head"><p class="eyebrow">Étape par étape</p><h2>Notre façon de travailler</h2></div>
<ol class="steps">
<li><span class="num">01</span><h3>Prise de contact</h3><p>Vous nous appelez ou remplissez le formulaire. Nous échangeons sur votre projet et vos besoins.</p></li>
<li><span class="num">02</span><h3>Devis gratuit</h3><p>Nous étudions votre projet, si besoin sur place, puis nous vous remettons un devis clair et détaillé.</p></li>
<li><span class="num">03</span><h3>Travaux</h3><p>Une fois le devis accepté, nous réalisons les travaux dans les règles de l'art, en protégeant votre habitation.</p></li>
<li><span class="num">04</span><h3>Suivi</h3><p>Chantier nettoyé et contrôle final : nous restons disponibles après les travaux.</p></li>
</ol></div></section>
<section class="section"><div class="container"><div class="head"><p class="eyebrow">Notre engagement</p><h2>Pourquoi choisir PA Rénovation</h2></div><div class="grid2">{whyh}</div></div></section>
<section data-reviews></section>
{cta}'''

# ---------- SERVICES
sec=''
for n,(k,t,d,l) in enumerate(SERV):
    lis=''.join(f'<li>{I["check"]}<span>{x}</span></li>' for x in l)
    rev=' rev' if n%2 else ''
    sec+=f'<section class="section{" alt" if n%2 else ""}" id="{slugify(t)}"><div class="container srv{rev}">{PHOTO(t,k)}<div><p class="eyebrow">0{n+1} · {SIDE.get(slugify(t),"Extérieur")}</p><h2>{t}</h2><p class="lead2">{d}</p><ul class="list">{lis}</ul><a class="btn" href="devis.html">Devis pour {t.lower()}</a></div></div></section>'
services=banner('Nos services','Rénovation intérieure et extérieure, espaces verts et débarras : de l\'aménagement de vos pièces à l\'entretien de vos extérieurs.','Services')+sec+cta

# ---------- REALISATIONS
ph=lambda t:f'<figure class="shot"><div class="ph">{I["roof"].replace("width=\"28\" height=\"28\"","width=\"56\" height=\"56\"")}<span>Photo à venir</span></div><figcaption><b>{t}</b></figcaption></figure>'
real=banner('Nos réalisations','Un aperçu de nos chantiers de rénovation, à l\'intérieur comme à l\'extérieur.','Réalisations')+'<section class="section"><div class="container"><div class="gallery" id="gallery"></div></div></section>'+cta

# ---------- A PROPOS
infos=[('SIRET','000 000 000 00000'),('Activité','Rénovation et bâtiment général'),('Adresse',ADDR),('Zone','Neuf-Mesnil et tout le secteur'),('Contact',TEL)]
inf=''.join(f'<div class="irow"><span>{a}</span><b>{b}</b></div>' for a,b in infos)
about=banner('À propos','Une entreprise locale de rénovation, à votre écoute.','À propos')+f'''<section class="section"><div class="container two"><div>
<p class="eyebrow">Qui sommes-nous</p><h2>PA Rénovation, artisan du bâtiment</h2>
<p class="para">Basée à Neuf-Mesnil, PA Rénovation intervient auprès des particuliers et des professionnels pour vos travaux de rénovation, à l'intérieur comme à l'extérieur : placo, peinture, parquet, carrelage, cuisine équipée, toiture, façade, espaces verts et débarras. Nous nous déplaçons dans tout le secteur.</p>
<p class="para">Notre approche est simple : un diagnostic honnête, un devis clair, des travaux réalisés dans les règles de l'art et un chantier laissé propre.</p>
<a class="btn" href="contact.html">Nous contacter</a></div>
<div class="panel"><h3>Informations</h3>{inf}</div></div></section>
<section class="section alt"><div class="container"><div class="head"><p class="eyebrow">Nos valeurs</p><h2>Notre façon de travailler</h2></div><div class="grid2">{whyh}</div></div></section>'''+cta

# ---------- CONTACT
def row(k,l,v,h=None):
    v=f'<a href="{h}">{v}</a>' if h else v
    return f'<div class="crow"><span class="sico">{I[k]}</span><div><small>{l}</small><b>{v}</b></div></div>'
contact=banner('Contact et devis gratuit','Décrivez votre projet, nous vous répondons rapidement.','Contact')+f'''<section class="section"><div class="container two">
<div><p class="eyebrow">Nos coordonnées</p><h2>Parlons de votre projet</h2>
{row('phone','Téléphone',TEL,'tel:'+TELH)}{row('mail','E-mail',MAIL,'mailto:'+MAIL)}{row('pin','Adresse',ADDR)}{row('insta','Instagram',INSTA,'https://www.instagram.com/'+INSTA)}{row('fb','Facebook',FB)}
<p class="para mt">Vous préférez fixer un créneau ?</p><a class="btn btn-ghost" href="rendez-vous.html">Prendre rendez-vous en ligne</a>
</div>
<form class="form" id="form"><h3>Écrivez-nous</h3><input type="hidden" name="source" value="contact"><div class="hp" aria-hidden="true"><label>Ne pas remplir<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
<div class="frow"><label>Nom<input type="text" name="nom" required></label><label>Téléphone<input type="tel" name="tel" required></label></div>
<label>E-mail<input type="email" name="email" required></label>
<label>Type de travaux<select name="type"><option>Rénovation intérieure</option><option>Rénovation extérieure</option><option>Espaces verts</option><option>Débarras</option><option>Bâtiment général</option><option>Autre</option></select></label>
<label>Votre projet<textarea name="message" rows="5"></textarea></label>
<p class="fnote">Les informations saisies servent uniquement à répondre à votre demande. <a href="confidentialite.html">En savoir plus</a></p><button class="btn" type="submit">Envoyer la demande</button>
<p class="ok" hidden>Merci, votre message est envoyé. Nous vous répondons rapidement.</p><p class="wiz-err" hidden></p></form></div></section>'''


TODO='[à compléter]'
def doc(title, intro, blocks, crumb):
    out=''
    for h,items in blocks:
        out+=f'<h3>{h}</h3>'
        for it in items:
            if isinstance(it,list): out+='<ul>'+''.join(f'<li>{x}</li>' for x in it)+'</ul>'
            else: out+=f'<p>{it}</p>'
    return banner(title,intro,crumb)+f'<section class="section"><div class="container"><div class="prose">{out}<p class="upd">Dernière mise à jour : novembre 2026</p></div></div></section>'

mentions=doc('Mentions légales','Informations légales relatives au site et à son éditeur.',[
 ('Éditeur du site',[
  ['Nom commercial : PA Rénovation','Forme juridique : '+TODO,'SIRET : 000 000 000 00000','Adresse : '+ADDR,'Téléphone : '+TEL,'E-mail : '+MAIL,'N° de TVA intracommunautaire : '+TODO+' (si applicable)']]),
 ('Directeur de la publication',['Le directeur de la publication est '+TODO+'.']),
 ('Hébergeur',['Le site est hébergé par '+TODO+' (nom, adresse et téléphone de l\'hébergeur).']),
 ('Médiation de la consommation',['Conformément à la réglementation, en cas de litige non résolu avec un client particulier, celui-ci peut recourir gratuitement à un médiateur de la consommation : '+TODO+' (nom et coordonnées du médiateur).']),
 ('Propriété intellectuelle',['L\'ensemble des contenus du site (textes, photographies, logo, éléments graphiques) est la propriété de PA Rénovation, sauf mention contraire. Toute reproduction, représentation ou réutilisation, totale ou partielle, sans autorisation écrite préalable est interdite.']),
 ('Responsabilité',['Les informations présentées sur ce site sont données à titre indicatif. PA Rénovation s\'efforce de les maintenir exactes et à jour, mais ne saurait être tenue responsable d\'une erreur ou d\'une omission. Seul un devis signé engage l\'entreprise.','Le site peut contenir des liens vers des sites tiers dont PA Rénovation n\'a pas la maîtrise et dont elle ne peut garantir le contenu.']),
 ('Droit applicable',['Le présent site est soumis au droit français. En cas de litige, les tribunaux français sont seuls compétents.']),
],'Mentions légales')

confid=doc('Politique de confidentialité','Comment vos données personnelles sont utilisées et protégées.',[
 ('Responsable du traitement',['PA Rénovation, '+ADDR+', joignable à l\'adresse '+MAIL+'.']),
 ('Données collectées',['Lorsque vous utilisez le formulaire de demande de devis, nous collectons les informations que vous saisissez : nom, numéro de téléphone, adresse e-mail, type de travaux, commune, caractéristiques du bâtiment, message, ainsi que les photos que vous choisissez de joindre. Pour la prise de rendez-vous : nom, téléphone, e-mail, adresse éventuelle et créneau choisi. Les photos sont stockées de façon privée et ne sont accessibles qu\'à l\'entreprise.']),
 ('Finalité et base légale',['Ces données sont utilisées uniquement pour répondre à votre demande de devis, organiser un rendez-vous et vous contacter à ce sujet (mesures précontractuelles prises à votre demande). Elles ne sont ni vendues, ni cédées à des tiers à des fins commerciales.']),
 ('Durée de conservation',['Vos données sont conservées le temps nécessaire au traitement de votre demande, puis au maximum 3 ans après notre dernier échange, sauf obligation légale de conservation plus longue (par exemple en cas de contrat signé).']),
 ('Vos droits',['Conformément au RGPD, vous disposez d\'un droit d\'accès, de rectification, d\'effacement, d\'opposition, de limitation et de portabilité de vos données. Pour les exercer, écrivez à '+MAIL+'.','Si vous estimez, après nous avoir contactés, que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr).']),
 ('Cookies et polices',['Ce site n\'utilise aucun cookie publicitaire. Il mesure sa fréquentation de façon anonyme, sans cookie et sans conserver votre adresse IP (nombre de visites, pages vues, provenance) ; les visiteurs qui ont activé « Ne pas me suivre » ne sont pas comptés. Un cookie technique n\'est déposé que pour la session de l\'administrateur. Votre choix de thème clair ou sombre est mémorisé dans votre navigateur.','Les polices de caractères sont chargées depuis le service Google Fonts, ce qui peut transmettre votre adresse IP à Google lors de l\'affichage des pages.']),
],'Confidentialité')


# ---------- ZONE D'INTERVENTION
# positions approximatives (lat, lon) : carte schématique
TOWNS=[('Neuf-Mesnil',50.2680,3.9400),('Hautmont',50.2475,3.9245),('Maubeuge',50.2775,3.9733),('Louvroil',50.2700,3.9550),('Feignies',50.2989,3.9167),
       ('Jeumont',50.2980,4.1010),('Boussois',50.2860,4.0100),('Aulnoye-Aymeries',50.1990,3.8330),('Bavay',50.2989,3.7919),
       ('Berlaimont',50.2000,3.8250),('Avesnes-sur-Helpe',50.1214,3.9322)]
def proj(lat,lon): return round((lon-3.55)*1000), round((50.40-lat)*1562)
def slug(n): return n.lower().replace(' ','-')
def mapsvg():
    hx,hy=proj(TOWNS[0][1],TOWNS[0][2])
    g=''.join(f'<path class="grid-l" d="M{x} 0V520"/>' for x in range(0,601,50))+''.join(f'<path class="grid-l" d="M0 {y}H600"/>' for y in range(0,521,50))
    towns=''
    for n,la,lo in TOWNS[1:]:
        x,y=proj(la,lo)
        pos={'Louvroil':'l','Berlaimont':'l','Boussois':'u','Jeumont':'l','Feignies':'u'}.get(n,'r')
        anchor='end' if pos=='l' else 'start'
        dx=-10 if pos=='l' else 10
        dy=-8 if pos=='u' else 4
        towns+=f'<g class="town" data-c="{slug(n)}"><circle cx="{x}" cy="{y}" r="5.5"/><text x="{x+dx}" y="{y+dy}" text-anchor="{anchor}">{n}</text></g>'
    return (f'<svg viewBox="0 0 600 520" role="img" aria-label="Carte schématique de la zone d\'intervention autour de Neuf-Mesnil">'
            f'<rect class="land" x="0" y="0" width="600" height="520"/>{g}'
            f'<circle class="ring" cx="{hx}" cy="{hy}" r="215"/>{towns}'
            f'<g class="home"><circle class="pulse" cx="{hx}" cy="{hy}" r="14"/><circle class="core" cx="{hx}" cy="{hy}" r="9"/>'
            f'<text x="{hx}" y="{hy+30}" text-anchor="middle">HAUTMONT</text></g></svg>')
opts=''.join(f'<option value="{n}">' for n,_,_ in TOWNS)
chips=''.join(f'<li data-c="{slug(n)}">{n}</li>' for n,_,_ in TOWNS)
zone=banner("Zone d'intervention","Neuf-Mesnil et tout le secteur : vérifiez en un instant si nous intervenons chez vous.","Zone d'intervention")+f"""<section class="section"><div class="container zone"><div>
<p class="eyebrow">Où intervenons-nous ?</p><h2>Autour de Neuf-Mesnil</h2>
<p class="para">PA Rénovation se déplace dans tout le secteur autour de Neuf-Mesnil. Entrez votre commune pour savoir si elle fait partie de notre zone habituelle.</p>
<div class="zone-search"><label for="commune">Votre commune est-elle couverte ?</label><input id="commune" type="text" list="communes" placeholder="Ex : Maubeuge" autocomplete="off"><datalist id="communes">{opts}</datalist><p class="zs-res" id="zs-res" aria-live="polite"></p></div>
<ul class="chips">{chips}</ul>
<p class="para">Votre commune n'apparaît pas ? Contactez-nous : nous étudions toutes les demandes selon la nature et l'importance des travaux.</p>
<a class="btn" href="contact.html">Nous contacter</a></div>
<div class="map">{mapsvg()}<p class="cap">Carte schématique, positions approximatives.</p></div></div></section>"""+cta

# ---------- FAQ
FAQ=[
("Quels travaux réalisez-vous ?","Nous intervenons à l'intérieur comme à l'extérieur : rénovation intérieure (placo et cloisons, enduit, peinture, parquet, carrelage, pose de cuisine équipée, montage de meubles), rénovation extérieure (toiture, démoussage, nettoyage de façade), espaces verts et services complémentaires comme le débarras. Décrivez votre projet dans une demande de devis, nous vous recontactons."),
("Le devis est-il gratuit ?","Oui, nos devis sont gratuits et sans engagement. Par précaution, nous préférons venir voir le chantier sur place avant d'établir un devis précis : il est ainsi clair et détaillé, et vous savez exactement ce qui est prévu avant de vous décider."),
("Réalisez-vous la peinture, le placo, le carrelage et le parquet ?","Oui. Nous posons placo et cloisons, réalisons enduits et mises en peinture, posons parquet et carrelage, installons des cuisines équipées et montons vos meubles. Décrivez-nous votre besoin dans une demande de devis."),
("Faites-vous les débarras de maison et d'appartement ?","Oui. Nous assurons le débarras de maison et d'appartement, ainsi que l'évacuation des déchets en déchetterie."),
("Faites-vous l'entretien des jardins et espaces verts ?","Oui : taille de haies et de massifs, entretien extérieur. Un entretien régulier garde votre jardin agréable toute l'année."),
("Proposez-vous le démoussage de toiture et le nettoyage de façade ?","Oui. Nous assurons le démoussage et la mise en peinture de toiture, le nettoyage de façade et le nettoyage extérieur. Un entretien régulier prolonge la durée de vie de la toiture et des façades."),
("Comment savoir si j'ai une fuite de toiture ?","Plusieurs signes doivent vous alerter : des taches ou auréoles au plafond ou sur les murs, de la peinture qui cloque, une odeur d'humidité dans les combles, des tuiles ou ardoises déplacées ou cassées, ou encore de l'eau qui déborde des gouttières. Dans le doute, mieux vaut faire contrôler la toiture rapidement."),
("Quelles aides existent pour mes travaux ?","Selon la nature des travaux (notamment l'isolation) et votre situation, des aides peuvent exister : MaPrimeRénov', certificats d'économies d'énergie (CEE), éco-prêt à taux zéro, ou encore une TVA réduite (5,5 % ou 10 % selon les travaux). Les conditions et les montants évoluent régulièrement, et certaines aides dépendent de la certification de l'entreprise : renseignez-vous auprès de France Rénov' (france-renov.gouv.fr) avant de signer un devis."),
("Faut-il une autorisation pour refaire ma toiture ou ma façade ?","Cela dépend des travaux. Un changement de matériau, de couleur ou d'aspect (toiture, façade) peut nécessiter une déclaration préalable en mairie, surtout en zone protégée. Renseignez-vous auprès de votre mairie : nous pouvons aussi vous conseiller."),
("Dans quelles communes intervenez-vous ?","Nous nous déplaçons dans tout le secteur autour de Neuf-Mesnil. Consultez notre page Zone d'intervention pour vérifier votre commune."),
]
faq_items=''.join(f'<div class="faq-item"><div class="faq-q" role="button" tabindex="0" aria-expanded="false"><span>{q}</span><i class="chev"></i></div><div class="faq-a"><div><p>{a}</p></div></div></div>' for q,a in FAQ)
faq=banner('Questions fréquentes','Les réponses aux questions que se posent le plus souvent nos clients.','FAQ')+f'<section class="section"><div class="container"><div class="faq">{faq_items}</div></div></section>'+cta

# ---------- DEVIS EN LIGNE
def radios(name, items, first=True):
    return ''.join(f'<label class="opt"><input type="radio" name="{name}" value="{v}"{" checked" if first and i==0 else ""}><span>{v}</span></label>' for i,v in enumerate(items))
def selopts(items): return ''.join(f'<option>{x}</option>' for x in items)
CHK='<label class="chk-line"><input type="checkbox" name="consent" value="1" required><span>J\'accepte que mes informations soient utilisées pour traiter ma demande. <a href="confidentialite.html">Politique de confidentialité</a></span></label>'
HP='<div class="hp" aria-hidden="true"><label>Ne pas remplir<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>'
devis=banner('Devis en ligne gratuit','Décrivez votre projet et envoyez-nous des photos : nous vous recontactons pour organiser, par précaution, une visite sur place avant de vous remettre un devis précis.','Devis en ligne')+f"""<section class="section"><div class="container"><div class="wiz" id="devis">
<div class="visit-note"><span class="sico">{I['pin']}</span><div><h3>Pourquoi une visite sur place ?</h3><p>Un chantier se juge de près : état réel des supports et des matériaux, accès, contraintes du bâtiment. Par précaution, nous préférons venir voir votre chantier avant d'établir un devis ferme. Les informations et photos que vous nous envoyez nous aident à préparer cette visite. Le devis reste gratuit et sans engagement.</p></div></div>
<ol class="wiz-steps"><li class="on">Travaux</li><li>Photos</li><li>Logement</li><li>Coordonnées</li></ol>
<form class="wiz-form" id="devis-form" novalidate>
<div class="wiz-pane on" data-step="1"><h2>Quels travaux envisagez-vous ?</h2><p>Choisissez le type de travaux.</p>
<div class="opts">{radios('travaux',['Rénovation intérieure','Rénovation extérieure','Espaces verts','Débarras','Bâtiment général','Autre'])}</div>
<label class="field">Décrivez votre projet (facultatif)<textarea name="message" rows="4" maxlength="2000"></textarea></label></div>
<div class="wiz-pane" data-step="2"><h2>Ajoutez des photos de votre projet</h2><p>Elles nous aident à préparer notre visite sur place et à comprendre votre projet.</p>
<label class="drop" id="drop"><input type="file" accept="image/*" multiple id="photos"><b>Cliquez pour choisir vos photos</b><small>ou glissez-les ici · 6 photos maximum</small></label>
<div class="thumbs" id="thumbs"></div>
<p class="tips-box">Idéal : une vue d'ensemble de la zone concernée, un gros plan des parties abîmées et, en cas de fuite, l'intérieur (plafond, combles). Cette étape est facultative.</p></div>
<div class="wiz-pane" data-step="3"><h2>Votre logement</h2><p>Quelques informations pour préparer votre devis.</p>
<div class="row2"><label class="field">Commune<input name="commune" autocomplete="address-level2" maxlength="80"></label><label class="field">Type de bâtiment<select name="batiment">{selopts(['Maison individuelle','Immeuble','Commerce ou local professionnel','Bâtiment agricole','Autre'])}</select></label></div>
<div class="row2"><label class="field">Surface approximative concernée (m²)<input name="surface" inputmode="numeric" maxlength="10"></label><label class="field">Délai souhaité<select name="delai">{selopts(['Dès que possible','Dans le mois','Dans les 3 mois','Pas pressé'])}</select></label></div></div>
<div class="wiz-pane" data-step="4"><h2>Vos coordonnées</h2><p>Pour vous envoyer votre devis.</p>
<div class="row2"><label class="field">Nom<input name="nom" autocomplete="name" maxlength="80"></label><label class="field">Téléphone<input name="tel" type="tel" autocomplete="tel" maxlength="30"></label></div>
<label class="field">E-mail<input name="email" type="email" autocomplete="email" maxlength="120"></label>
{HP}<div class="recap" id="recap"></div>{CHK}</div>
<p class="wiz-err" id="err" role="alert"></p>
<div class="wiz-nav"><button type="button" class="btn btn-ghost" id="prev">Précédent</button><button type="button" class="btn" id="next">Suivant</button></div>
</form>
<div class="wiz-done" id="done" hidden><div class="ok-ico">{I['check'].replace('width="20" height="20"','width="34" height="34"')}</div><h2>Merci, votre demande est envoyée !</h2><p>Nous étudions votre projet et vous contactons pour convenir d'une visite sur place, avant d'établir votre devis.</p><p>Vous pouvez aussi réserver directement un créneau, ou nous appeler au <a href="tel:{TELH}">{TEL}</a> en cas d'urgence.</p><div class="done-btns"><a class="btn" href="rendez-vous.html">Prendre rendez-vous</a><a class="btn btn-ghost" href="index.html">Retour à l'accueil</a></div></div>
<noscript><p class="tips-box">Cette page nécessite JavaScript. Vous pouvez aussi nous appeler au {TEL}.</p></noscript>
</div></div></section>"""

# ---------- RENDEZ-VOUS
rdv=banner('Prendre rendez-vous','Choisissez un créneau pour une visite ou un échange : nous confirmons votre rendez-vous quelques jours avant la date prévue.','Rendez-vous')+f"""<section class="section"><div class="container"><div class="wiz" id="rdv">
<ol class="wiz-steps"><li class="on">Type</li><li>Date et heure</li><li>Coordonnées</li></ol>
<form class="wiz-form" id="rdv-form" novalidate>
<div class="wiz-pane on" data-step="1"><h2>Quel type de rendez-vous ?</h2><p>Choisissez ce qui vous convient.</p>
<div class="opts">{radios('kind',['Visite sur place pour devis','Diagnostic / contrôle du chantier','Échange téléphonique'])}</div>
<p class="tips-box">Votre rendez-vous est enregistré comme une demande. Nous le confirmons <b id="cdb">3</b> jours avant la date prévue, par téléphone ou par e-mail.</p></div>
<div class="wiz-pane" data-step="2"><h2>Choisissez une date et une heure</h2><p>Les jours disponibles sont indiqués en clair.</p>
<div class="cal" id="cal"><div class="cal-head"><button type="button" id="cprev" aria-label="Mois précédent">&lsaquo;</button><span id="cmonth"></span><button type="button" id="cnext" aria-label="Mois suivant">&rsaquo;</button></div><div class="cal-grid" id="cgrid"></div></div>
<p class="cal-empty" id="ctitle" hidden></p><div class="times" id="times"></div></div>
<div class="wiz-pane" data-step="3"><h2>Vos coordonnées</h2><p>Pour confirmer votre rendez-vous.</p>
<div class="row2"><label class="field">Nom<input name="nom" autocomplete="name" maxlength="80"></label><label class="field">Téléphone<input name="tel" type="tel" autocomplete="tel" maxlength="30"></label></div>
<label class="field">E-mail<input name="email" type="email" autocomplete="email" maxlength="120"></label>
<label class="field">Adresse du chantier (facultatif)<input name="adresse" autocomplete="street-address" maxlength="160"></label>
<label class="field">Précisions (facultatif)<textarea name="note" rows="3" maxlength="1000"></textarea></label>
{HP}<div class="recap" id="recap"></div>{CHK}</div>
<p class="wiz-err" id="err" role="alert"></p>
<div class="wiz-nav"><button type="button" class="btn btn-ghost" id="prev">Précédent</button><button type="button" class="btn" id="next">Suivant</button></div>
</form>
<div class="wiz-done" id="done" hidden><div class="ok-ico">{I['check'].replace('width="20" height="20"','width="34" height="34"')}</div><h2>Votre demande de rendez-vous est enregistrée</h2><p>Nous vous la confirmerons par téléphone ou par e-mail avant la date prévue.</p><p>Besoin de nous joindre ? <a href="tel:{TELH}">{TEL}</a></p><a class="btn btn-ghost" href="index.html">Retour à l'accueil</a></div>
<noscript><p class="tips-box">Cette page nécessite JavaScript. Vous pouvez aussi nous appeler au {TEL}.</p></noscript>
</div></div></section>"""

# ---------- GUIDE DES MATÉRIAUX
def mat(title,life,lifelabel,pros,cons,who,care):
    li=lambda xs,c='': ''.join(f'<li{c}>{x}</li>' for x in xs)
    return f'<article><h3>{title}</h3><p class="life"><small>{lifelabel}</small>{life}</p><h4>Avantages</h4><ul>{li(pros)}</ul><h4>Points d\'attention</h4><ul>{li(cons," class=\"con\"")}</ul><h4>Pour qui ?</h4><p>{who}</p><h4>Entretien</h4><p>{care}</p></article>'
mats=''.join([
 mat('Les tuiles','50 à 100 ans','Durée de vie indicative',['Très durables, notamment en terre cuite','Large choix de formes et de couleurs','Bonne tenue dans le temps et bon rendu traditionnel'],['Poids important : la charpente doit pouvoir le supporter','Mousses et lichens à traiter régulièrement'],'Maisons traditionnelles et habitations qui recherchent un aspect classique et durable.','Démoussage régulier et remplacement des tuiles cassées ou déplacées.'),
 mat('Les ardoises','75 ans et plus','Durée de vie indicative',['Très longue durée de vie pour l\'ardoise naturelle','Finition élégante et matériau léger','Excellente étanchéité quand la pose est soignée'],['Budget plus élevé','Pose délicate, à confier à un professionnel expérimenté'],'Bâtiments anciens ou de caractère, secteurs protégés et projets qui privilégient la pérennité.','Contrôle périodique des fixations et remplacement des ardoises abîmées.'),
 mat('Le bac acier','30 à 50 ans','Durée de vie indicative',['Léger et rapide à poser','Bon rapport qualité-prix','Adapté aux toitures à faible pente'],['Aspect plus moderne ou industriel','Bruit de pluie si l\'isolation n\'est pas adaptée'],'Annexes, garages, extensions, bâtiments professionnels ou agricoles et projets contemporains.','Contrôle des fixations et des joints, nettoyage ponctuel pour éviter les dépôts.'),
])
cmp_rows=[('Durée de vie indicative','50 à 100 ans','75 ans et plus','30 à 50 ans'),('Poids','Élevé','Léger','Très léger'),('Budget','Moyen à élevé','Élevé','Économique à moyen'),('Aspect','Traditionnel','Élégant, classique','Moderne, sobre'),('Idéal pour','Maisons traditionnelles','Bâti ancien, secteurs protégés','Annexes, extensions, bâtiments pros')]
cmp_html='<div class="cmp-wrap"><table class="cmp"><thead><tr><th></th><th>Tuiles</th><th>Ardoises</th><th>Bac acier</th></tr></thead><tbody>'+''.join(f'<tr><th>{a}</th><td>{b}</td><td>{c}</td><td>{d}</td></tr>' for a,b,c,d in cmp_rows)+'</tbody></table></div>'
guide=banner('Guide des matériaux de couverture','Tuiles, ardoises ou bac acier : comprendre les différences pour faire le bon choix.','Guide des matériaux')+f"""<section class="section"><div class="container"><div class="head"><p class="eyebrow">Les trois grands choix</p><h2>Comparer les matériaux</h2></div><div class="mat">{mats}</div></div></section>
<section class="section alt"><div class="container"><div class="head"><p class="eyebrow">En un coup d'œil</p><h2>Tableau comparatif</h2></div>{cmp_html}<p class="guide-note">Les durées et appréciations sont données à titre indicatif : elles varient selon la qualité du matériau, la pose, l'exposition et l'entretien.</p></div></section>
<section class="section"><div class="container"><div class="head"><p class="eyebrow">Bien choisir</p><h2>Les questions à se poser</h2></div><div class="choose">
<div class="why"><span class="sico">{I['roof']}</span><div><h3>Le style de votre bâtiment</h3><p>Respectez l'aspect de votre habitation et les règles de votre commune (plan local d'urbanisme, secteurs protégés).</p></div></div>
<div class="why"><span class="sico">{I['gable']}</span><div><h3>La pente et la charpente</h3><p>Certains matériaux sont plus lourds ou exigent une pente minimale : la charpente doit s'y prêter.</p></div></div>
<div class="why"><span class="sico">{I['file']}</span><div><h3>Votre budget sur la durée</h3><p>Comparez le coût de départ avec la durée de vie et l'entretien nécessaire, pas seulement le prix à la pose.</p></div></div>
<div class="why"><span class="sico">{I['shield']}</span><div><h3>Le confort et l'isolation</h3><p>Isolation thermique et phonique dépendent de l'ensemble de la toiture, pas seulement de la couverture.</p></div></div>
</div></div></section>
<section class="cta"><div class="container"><div><h2>Un doute sur le bon matériau ?</h2><p>Envoyez-nous des photos de votre toiture : nous vous conseillons gratuitement.</p></div><div class="cta-btns"><a href="devis.html" class="btn btn-light">Demander un devis</a><a href="rendez-vous.html" class="btn btn-ghost">Prendre rendez-vous</a></div></div></section>"""

for fn,t,d,b in [
 ('index.html','Rénovation intérieure et extérieure à Neuf-Mesnil','PA Rénovation, rénovation intérieure et extérieure à Neuf-Mesnil : placo, peinture, parquet, carrelage, cuisine équipée, toiture, façade, espaces verts et débarras. Devis gratuit.',index),
 ('services.html','Services','Rénovation intérieure et extérieure, espaces verts, débarras et démoussage : les services de PA Rénovation à Neuf-Mesnil et dans tout le secteur.',services),
 ('realisations.html','Réalisations','Découvrez les chantiers de rénovation intérieure et extérieure réalisés par PA Rénovation.',real),
 ('a-propos.html','À propos','PA Rénovation, artisan de la rénovation à Neuf-Mesnil (59330) : intérieur, extérieur, espaces verts et débarras.',about),
 ('mentions-legales.html','Mentions légales','Mentions légales du site PA Rénovation.',mentions),
 ('confidentialite.html','Confidentialité','Politique de confidentialité du site PA Rénovation.',confid),
 ('zone-intervention.html',"Zone d'intervention","Zone d'intervention de PA Rénovation autour de Neuf-Mesnil (59330) : vérifiez si nous intervenons dans votre commune.",zone),
 ('faq.html','Questions fréquentes',"Travaux d'intérieur, espaces verts, travaux extérieurs, aides : les réponses à vos questions.",faq),
 ('devis.html','Devis en ligne gratuit','Demandez un devis gratuit en ligne : décrivez vos travaux de rénovation et envoyez des photos à PA Rénovation, Neuf-Mesnil.',devis),
 ('rendez-vous.html','Prendre rendez-vous','Prenez rendez-vous en ligne avec PA Rénovation pour une visite, un devis ou un diagnostic de chantier.',rdv),
 ('guide-materiaux.html','Guide des matériaux de couverture','Tuiles, ardoises ou bac acier : durée de vie, avantages et conseils pour choisir le bon matériau de toiture.',guide),
 ('contact.html','Contact','Contactez PA Rénovation pour un devis gratuit : 07 89 58 02 24.',contact)]:
    open(os.path.join(OUT,fn),'w').write(page(fn,t,d,b))
