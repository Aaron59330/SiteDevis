import os, unicodedata
def slugify(t): return ''.join(c for c in unicodedata.normalize('NFD',t.lower()) if unicodedata.category(c)!='Mn').replace("'",'').replace(' ','-')
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','public')
TEL='06 03 50 82 30'; TELH='+33603508230'; MAIL='pro.ap.couverture@gmail.com'

def ic(p,s=28): return f'<svg class="i" width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{p}</svg>'
I={
 'roof':ic('<path d="M3 12 12 4l9 8"/><path d="M5 10.5V20h14v-9.5"/><path d="M9 20v-6h6v6"/>'),
 'zinc':ic('<path d="M3 7h18v3H3z"/><path d="M6 10v8a2 2 0 0 0 2 2h0"/><path d="M18 10v6"/><path d="M18 19v.01"/>'),
 'gable':ic('<path d="M12 3 4 12v9h16v-9z"/><path d="M12 3v18"/><path d="M4 12h16"/>'),
 'brush':ic('<path d="M14 4l6 6-8 8H6v-6z"/><path d="M4 21l2-3"/><path d="M12 6l6 6"/>'),
 'interior':ic('<path d="M4 21V4h16v17"/><path d="M4 21h16"/><path d="M9 21v-7h6v7"/><path d="M8 8h8"/>'),
 'brick':ic('<rect x="3" y="5" width="18" height="14"/><path d="M3 10h18M3 15h18M9 5v5M15 10v5M9 15v4"/>'),
 'velux':ic('<path d="M3 18 9 6h12l-6 12z"/><path d="m6 12 12 0"/>'),
 'phone':ic('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',22),
 'mail':ic('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',22),
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
<title>{title} | P.A Couverture – Couvreur à Hautmont</title>
<meta name="description" content="{desc}">
<script src="theme.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap">
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="loader" aria-hidden="true"><div class="loader-in"><img src="images/mascotte.png" alt="" width="118" height="68"><span class="loader-bar"></span></div></div>
<div class="topbar"><div class="container"><span class="loc">{I['pin'].replace('width="22" height="22"','width="15" height="15"')} Hautmont (59330) et alentours</span><span class="tb-right"><a class="urg" href="urgence-fuite.html"><i class="dot"></i>Urgence fuite</a><a href="tel:{TELH}">{I['phone'].replace('width="22" height="22"','width="15" height="15"')} {TEL}</a></span></div></div>
<header class="header">
<div class="container nav">
<a href="index.html" class="logo" aria-label="P.A Couverture, accueil"><img src="images/mascotte.png" alt="" width="59" height="34"><span>P.A <b>COUVERTURE</b></span></a>
<button class="burger" aria-label="Ouvrir le menu" aria-expanded="false"><span></span><span></span><span></span></button>
<nav class="menu">{nav}<button class="theme-toggle" type="button" aria-label="Basculer entre mode clair et mode sombre" title="Mode clair / sombre">{SUN}{MOON}</button><a href="devis.html" class="btn btn-sm{' active' if fn=='devis.html' else ''}">Devis gratuit</a></nav>
</div>
</header>
<main>
{body}
</main>
<footer class="footer">
<div class="container fgrid">
<div><a href="index.html" class="logo"><img src="images/mascotte.png" alt="" width="59" height="34"><span>P.A <b>COUVERTURE</b></span></a>
<p>Couverture, zinguerie, pignon, velux, entretien, travaux d'intérieur et petite maçonnerie.<br>Artisan couvreur à Hautmont.</p></div>
<div><h4>Navigation</h4>{''.join(f'<a href="{f}">{n}</a>' for f,n in PAGES)}</div>
<div><h4>Ressources</h4><a href="devis.html">Devis en ligne</a><a href="rendez-vous.html">Prendre rendez-vous</a><a href="guide-materiaux.html">Guide des matériaux</a><a href="urgence-fuite.html">Urgence fuite</a></div>
<div><h4>Contact</h4><a href="tel:{TELH}">{TEL}</a><a href="mailto:{MAIL}">{MAIL}</a><span>59330 Hautmont</span></div>
</div>
<div class="container legal"><span>© <span id="year"></span> P.A Couverture – SIRET 000 000 000 00000</span><span class="legal-links"><a href="mentions-legales.html">Mentions légales</a><a href="confidentialite.html">Confidentialité</a><a href="/admin" class="adm-link" data-noedit>Administration</a></span></div>
</footer>
<script src="script.js"></script>
{EXTRA_JS.get(fn,"")}
</body>
</html>'''

def banner(h,p,crumb):
    return f'<section class="banner"><div class="container"><p class="crumb"><a href="index.html">Accueil</a> / {crumb}</p><h1>{h}</h1><p>{p}</p></div></section>'

cta='''<section class="cta"><div class="container"><div><h2>Un projet de toiture ?</h2><p>Décrivez-nous vos travaux, nous vous répondons rapidement avec un devis gratuit.</p></div><div class="cta-btns"><a href="devis.html" class="btn btn-light">Demander un devis</a><a href="tel:%s" class="btn btn-ghost">%s</a></div></div></section>''' % (TELH,TEL)

ALT={'couverture':'Toiture en ardoises avec fenêtres de toit','zinguerie':'Chéneau en zinc posé le long d\'une toiture en tuiles','pignon':'Pignon habillé d\'ardoises','velux':'Pose d\'une fenêtre de toit sur la charpente','entretien':'Toiture en tuiles avant et après démoussage','travaux-dinterieur':'Combles aménagés en cours de finition','petite-maconnerie':'Souche de cheminée en briques sur une toiture en tuiles'}
SERV=[
('roof','Couverture','Réfection et rénovation complète de votre toiture, quel que soit le matériau.',
 ['Dépose et pose de tuiles, ardoises, bac acier','Remplacement de tuiles cassées ou déplacées','Recherche et réparation de fuites','Pose d\'écran sous-toiture et liteaux','Traitement et nettoyage de toiture']),
('zinc','Zinguerie','Évacuation des eaux pluviales et habillages en zinc, pour protéger durablement votre bâtiment.',
 ['Pose et remplacement de gouttières','Descentes d\'eaux pluviales','Noues, solins et faîtages','Bandes de rives et habillages','Création sur mesure en zinc']),
('gable','Pignon','Travaux de finition et d\'étanchéité sur les pignons, point sensible de toute toiture.',
 ['Réfection de rives et de pignons','Étanchéité et couvertines','Habillage et bardage de pignon','Reprise de maçonnerie en haut de pignon']),
('velux','Velux','Fourniture et pose de fenêtres de toit pour apporter lumière et volume à vos combles.',
 ['Pose de fenêtres de toit neuves','Remplacement de velux existants','Raccords d\'étanchéité soignés','Habillage intérieur et finitions']),
('brush','Entretien','Entretien régulier de votre toiture pour prolonger sa durée de vie et éviter les mauvaises surprises.',
 ['Démoussage et nettoyage de toiture','Traitement anti-mousse et hydrofuge','Peinture de toiture','Ramonage de conduits de cheminée','Nettoyage de gouttières et de chéneaux','Contrôle de l\'état de la toiture']),('interior','Travaux d\'intérieur','Des travaux d\'intérieur pour compléter votre chantier et remettre votre habitation en état.',
 ['Finitions et habillage intérieur','Reprise de plafonds et de murs après une fuite','Travaux de rénovation intérieure','Remise en état après intervention']),
('brick','Petite maçonnerie','De petits travaux de maçonnerie, en complément de la toiture ou de manière indépendante.',
 ['Reprise de maçonnerie en haut de pignon','Réfection de souches de cheminée','Rejointoiement et petites reprises de murs','Scellements, appuis et solins maçonnés']),
]

# ---------- INDEX
cards=''.join(f'<a class="scard" href="services.html#{slugify(t)}"><span class="sico">{I[k]}</span><h3>{t}</h3><p>{d}</p><span class="more">En savoir plus {I["arrow"]}</span></a>' for k,t,d,_ in SERV)
why=[('file','Devis gratuit','Un chiffrage clair et détaillé, sans engagement et sans surprise.'),
     ('user','Un interlocuteur unique','Vous échangez directement avec l\'artisan, du devis à la fin du chantier.'),
     ('shield','Garantie décennale','Vos travaux sont couverts par notre garantie décennale, pour construire en toute sérénité.'),
     ('check','Travail soigné','Des finitions propres et un chantier laissé net à la fin des travaux.')]
whyh=''.join(f'<div class="why"><span class="sico">{I[k]}</span><div><h3>{t}</h3><p>{d}</p></div></div>' for k,t,d in why)
index=f'''<section class="hero"><div class="container hero-in"><div class="hero-txt">
<p class="eyebrow">Couverture · Zinguerie · Pignon · Velux · Entretien · Intérieur · Maçonnerie</p>
<h1>Votre toiture<br>entre de bonnes mains.</h1>
<p class="lead">P.A Couverture réalise la couverture, la zinguerie, les pignons et la pose de velux à Hautmont et dans les environs.</p>
<div class="hero-btns"><a href="devis.html" class="btn">Demander un devis gratuit</a><a href="services.html" class="btn btn-ghost">Découvrir nos services</a></div><p class="hero-note">{I['shield']} Garantie décennale</p></div>
<div class="hero-logo"><div class="logo-shine"><img src="images/logo.png" alt="Logo P.A Couverture et Zinguerie"></div></div></div></section>
<section class="counters"><div class="container counters-grid">
<div><strong class="count">7</strong><span>savoir-faire pour votre toiture et votre habitat</span></div>
<div><strong class="count">10</strong><span>ans de garantie décennale</span></div>
<div><strong class="count">100%</strong><span>de devis gratuits et sans engagement</span></div>
<div><strong class="count">1</strong><span>seul interlocuteur, du devis à la fin du chantier</span></div>
</div></section>
<section class="section"><div class="container"><div class="head"><p class="eyebrow">Nos métiers</p><h2>Ce que nous faisons</h2></div><div class="grid-svc">{cards}</div></div></section>
<section class="section alt"><div class="container"><div class="head"><p class="eyebrow">Étape par étape</p><h2>Notre façon de travailler</h2></div>
<ol class="steps">
<li><span class="num">01</span><h3>Prise de contact</h3><p>Vous nous appelez ou remplissez le formulaire. Nous échangeons sur votre projet et vos besoins.</p></li>
<li><span class="num">02</span><h3>Devis gratuit</h3><p>Nous étudions votre toiture, si besoin sur place, puis nous vous remettons un devis clair et détaillé.</p></li>
<li><span class="num">03</span><h3>Travaux</h3><p>Une fois le devis accepté, nous réalisons les travaux dans les règles de l'art, en protégeant votre habitation.</p></li>
<li><span class="num">04</span><h3>Suivi</h3><p>Chantier nettoyé, contrôle final et garantie décennale : nous restons disponibles après les travaux.</p></li>
</ol></div></section>
<section class="section"><div class="container"><div class="head"><p class="eyebrow">Notre engagement</p><h2>Pourquoi choisir P.A Couverture</h2></div><div class="grid2">{whyh}</div></div></section>
<section data-reviews></section>
{cta}'''

# ---------- SERVICES
sec=''
for n,(k,t,d,l) in enumerate(SERV):
    lis=''.join(f'<li>{I["check"]}<span>{x}</span></li>' for x in l)
    rev=' rev' if n%2 else ''
    sec+=f'<section class="section{" alt" if n%2 else ""}" id="{slugify(t)}"><div class="container srv{rev}"><figure class="srv-photo"><img src="images/services/{slugify(t)}.webp" alt="{ALT[slugify(t)]}" width="1200" height="900" loading="lazy"></figure><div><p class="eyebrow">0{n+1}</p><h2>{t}</h2><p class="lead2">{d}</p><ul class="list">{lis}</ul><a class="btn" href="devis.html">Devis pour {t.lower()}</a></div></div></section>'
services=banner('Nos services','Sept savoir-faire pour votre toiture et votre habitat, de la couverture à la petite maçonnerie.','Services')+sec+cta

# ---------- REALISATIONS
ph=lambda t:f'<figure class="shot"><div class="ph">{I["roof"].replace("width=\"28\" height=\"28\"","width=\"56\" height=\"56\"")}<span>Photo à venir</span></div><figcaption><b>{t}</b></figcaption></figure>'
real=banner('Nos réalisations','Un aperçu de nos chantiers de couverture, zinguerie, pignon, velux, entretien, intérieur et maçonnerie.','Réalisations')+'<section class="section"><div class="container"><div class="gallery" id="gallery"></div></div></section>'+cta

# ---------- A PROPOS
infos=[('SIRET','000 000 000 00000'),('Activité','Couverture, zinguerie, pignon, velux, entretien, travaux d\'intérieur, petite maçonnerie'),('Garantie','Décennale'),('Zone','Hautmont (59330) et alentours'),('Contact',TEL)]
inf=''.join(f'<div class="irow"><span>{a}</span><b>{b}</b></div>' for a,b in infos)
about=banner('À propos','Une entreprise locale de couverture, à votre écoute.','À propos')+f'''<section class="section"><div class="container two"><div>
<p class="eyebrow">Qui sommes-nous</p><h2>P.A Couverture, artisan couvreur</h2>
<p class="para">Basée à Hautmont, P.A Couverture intervient auprès des particuliers et des professionnels pour tous les travaux de toiture : couverture, zinguerie, pignon, pose de velux et entretien (démoussage, ramonage, peinture). Nous réalisons aussi des travaux d'intérieur et de petite maçonnerie.</p>
<p class="para">Notre approche est simple : un diagnostic honnête, un devis clair, des travaux réalisés dans les règles de l'art et un chantier laissé propre.</p>
<a class="btn" href="contact.html">Nous contacter</a></div>
<div class="panel"><h3>Informations</h3>{inf}</div></div></section>
<section class="section alt"><div class="container"><div class="head"><p class="eyebrow">Nos valeurs</p><h2>Notre façon de travailler</h2></div><div class="grid2">{whyh}</div></div></section>
<section class="section" data-needs-doc><div class="container"><div class="doc-card"><span class="sico">{I['file']}</span><div><h3>Attestation de garantie décennale</h3><p>Téléchargez notre attestation d'assurance en cours de validité.</p></div><a class="btn" href="/attestation-decennale.pdf" target="_blank" rel="noopener">Télécharger le PDF</a></div></div></section>'''+cta

# ---------- CONTACT
def row(k,l,v,h=None):
    v=f'<a href="{h}">{v}</a>' if h else v
    return f'<div class="crow"><span class="sico">{I[k]}</span><div><small>{l}</small><b>{v}</b></div></div>'
contact=banner('Contact et devis gratuit','Décrivez votre projet, nous vous répondons rapidement.','Contact')+f'''<section class="section"><div class="container two">
<div><p class="eyebrow">Nos coordonnées</p><h2>Parlons de votre toiture</h2>
{row('phone','Téléphone',TEL,'tel:'+TELH)}{row('mail','E-mail',MAIL,'mailto:'+MAIL)}{row('pin','Adresse','59330 Hautmont')}
<p class="para mt">Vous préférez fixer un créneau ?</p><a class="btn btn-ghost" href="rendez-vous.html">Prendre rendez-vous en ligne</a>
</div>
<form class="form" id="form"><h3>Écrivez-nous</h3><input type="hidden" name="source" value="contact"><div class="hp" aria-hidden="true"><label>Ne pas remplir<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
<div class="frow"><label>Nom<input type="text" name="nom" required></label><label>Téléphone<input type="tel" name="tel" required></label></div>
<label>E-mail<input type="email" name="email" required></label>
<label>Type de travaux<select name="type"><option>Couverture</option><option>Zinguerie</option><option>Pignon</option><option>Velux</option><option>Entretien de toiture</option><option>Travaux d'intérieur</option><option>Petite maçonnerie</option><option>Réparation / fuite</option><option>Urgence fuite</option><option>Autre</option></select></label>
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
  ['Nom commercial : P.A Couverture','Forme juridique : '+TODO,'SIRET : 000 000 000 00000','Adresse : 59330 Hautmont ('+TODO+' : numéro et rue)','Téléphone : '+TEL,'E-mail : '+MAIL,'N° de TVA intracommunautaire : '+TODO+' (si applicable)']]),
 ('Directeur de la publication',['Le directeur de la publication est '+TODO+'.']),
 ('Hébergeur',['Le site est hébergé par '+TODO+' (nom, adresse et téléphone de l\'hébergeur).']),
 ('Assurance',['Garantie décennale souscrite auprès de '+TODO+' (nom et coordonnées de l\'assureur), valable pour les travaux réalisés en France métropolitaine.']),
 ('Médiation de la consommation',['Conformément à la réglementation, en cas de litige non résolu avec un client particulier, celui-ci peut recourir gratuitement à un médiateur de la consommation : '+TODO+' (nom et coordonnées du médiateur).']),
 ('Propriété intellectuelle',['L\'ensemble des contenus du site (textes, photographies, logo, éléments graphiques) est la propriété de P.A Couverture, sauf mention contraire. Toute reproduction, représentation ou réutilisation, totale ou partielle, sans autorisation écrite préalable est interdite.']),
 ('Responsabilité',['Les informations présentées sur ce site sont données à titre indicatif. P.A Couverture s\'efforce de les maintenir exactes et à jour, mais ne saurait être tenue responsable d\'une erreur ou d\'une omission. Seul un devis signé engage l\'entreprise.','Le site peut contenir des liens vers des sites tiers dont P.A Couverture n\'a pas la maîtrise et dont elle ne peut garantir le contenu.']),
 ('Droit applicable',['Le présent site est soumis au droit français. En cas de litige, les tribunaux français sont seuls compétents.']),
],'Mentions légales')

confid=doc('Politique de confidentialité','Comment vos données personnelles sont utilisées et protégées.',[
 ('Responsable du traitement',['P.A Couverture, 59330 Hautmont, joignable à l\'adresse '+MAIL+'.']),
 ('Données collectées',['Lorsque vous utilisez le formulaire de demande de devis, nous collectons les informations que vous saisissez : nom, numéro de téléphone, adresse e-mail, type de travaux, commune, caractéristiques du bâtiment, message, ainsi que les photos que vous choisissez de joindre. Pour la prise de rendez-vous : nom, téléphone, e-mail, adresse éventuelle et créneau choisi. Les photos sont stockées de façon privée et ne sont accessibles qu\'à l\'entreprise.']),
 ('Finalité et base légale',['Ces données sont utilisées uniquement pour répondre à votre demande de devis, organiser un rendez-vous et vous contacter à ce sujet (mesures précontractuelles prises à votre demande). Elles ne sont ni vendues, ni cédées à des tiers à des fins commerciales.']),
 ('Durée de conservation',['Vos données sont conservées le temps nécessaire au traitement de votre demande, puis au maximum 3 ans après notre dernier échange, sauf obligation légale de conservation plus longue (par exemple en cas de contrat signé).']),
 ('Vos droits',['Conformément au RGPD, vous disposez d\'un droit d\'accès, de rectification, d\'effacement, d\'opposition, de limitation et de portabilité de vos données. Pour les exercer, écrivez à '+MAIL+'.','Si vous estimez, après nous avoir contactés, que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr).']),
 ('Cookies et polices',['Ce site n\'utilise aucun cookie publicitaire. Il mesure sa fréquentation de façon anonyme, sans cookie et sans conserver votre adresse IP (nombre de visites, pages vues, provenance) ; les visiteurs qui ont activé « Ne pas me suivre » ne sont pas comptés. Un cookie technique n\'est déposé que pour la session de l\'administrateur. Votre choix de thème clair ou sombre est mémorisé dans votre navigateur.','Les polices de caractères sont chargées depuis le service Google Fonts, ce qui peut transmettre votre adresse IP à Google lors de l\'affichage des pages.']),
],'Confidentialité')


# ---------- ZONE D'INTERVENTION
# positions approximatives (lat, lon) : carte schématique
TOWNS=[('Hautmont',50.2475,3.9245),('Maubeuge',50.2775,3.9733),('Louvroil',50.2700,3.9550),('Feignies',50.2989,3.9167),
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
    return (f'<svg viewBox="0 0 600 520" role="img" aria-label="Carte schématique de la zone d\'intervention autour de Hautmont">'
            f'<rect class="land" x="0" y="0" width="600" height="520"/>{g}'
            f'<circle class="ring" cx="{hx}" cy="{hy}" r="215"/>{towns}'
            f'<g class="home"><circle class="pulse" cx="{hx}" cy="{hy}" r="14"/><circle class="core" cx="{hx}" cy="{hy}" r="9"/>'
            f'<text x="{hx}" y="{hy+30}" text-anchor="middle">HAUTMONT</text></g></svg>')
opts=''.join(f'<option value="{n}">' for n,_,_ in TOWNS)
chips=''.join(f'<li data-c="{slug(n)}">{n}</li>' for n,_,_ in TOWNS)
zone=banner("Zone d'intervention","Hautmont et les communes alentours : vérifiez en un instant si nous intervenons chez vous.","Zone d'intervention")+f"""<section class="section"><div class="container zone"><div>
<p class="eyebrow">Où intervenons-nous ?</p><h2>Autour de Hautmont</h2>
<p class="para">P.A Couverture intervient à Hautmont et dans les communes voisines. Entrez votre commune pour savoir si elle fait partie de notre zone habituelle.</p>
<div class="zone-search"><label for="commune">Votre commune est-elle couverte ?</label><input id="commune" type="text" list="communes" placeholder="Ex : Maubeuge" autocomplete="off"><datalist id="communes">{opts}</datalist><p class="zs-res" id="zs-res" aria-live="polite"></p></div>
<ul class="chips">{chips}</ul>
<p class="para">Votre commune n'apparaît pas ? Contactez-nous : nous étudions toutes les demandes selon la nature et l'importance des travaux.</p>
<a class="btn" href="contact.html">Nous contacter</a></div>
<div class="map">{mapsvg()}<p class="cap">Carte schématique, positions approximatives.</p></div></div></section>"""+cta

# ---------- FAQ
FAQ=[
("Combien de temps dure une réfection de toiture ?","La durée dépend de la surface, du matériau choisi, de la complexité de la toiture et de la météo. Pour une maison individuelle, comptez en général de quelques jours à une ou deux semaines. Un planning précis vous est communiqué avec le devis."),
("Comment savoir si j'ai une fuite de toiture ?","Plusieurs signes doivent vous alerter : des taches ou auréoles au plafond ou sur les murs, de la peinture qui cloque, une odeur d'humidité dans les combles, des tuiles ou ardoises déplacées ou cassées, ou encore de l'eau qui déborde des gouttières. Dans le doute, mieux vaut faire contrôler la toiture rapidement."),
("Que faire en cas de fuite urgente ?","Protégez vos biens, coupez l'électricité si l'eau est proche d'une installation, puis appelez-nous. Retrouvez tous les conseils sur notre page Urgence fuite."),
("Le devis est-il gratuit ?","Oui, nos devis sont gratuits et sans engagement. Par précaution, nous préférons venir voir le chantier sur place avant d'établir un devis précis : il est ainsi clair et détaillé, et vous savez exactement ce qui est prévu avant de vous décider."),
("Quels matériaux de couverture proposez-vous ?","Nous intervenons sur les couvertures en tuiles, en ardoises et en bac acier. Nous vous conseillons selon votre habitation, votre budget et les contraintes de votre commune."),
("Quelles aides existent pour mes travaux ?","Selon la nature des travaux (notamment l'isolation de toiture) et votre situation, des aides peuvent exister : MaPrimeRénov', certificats d'économies d'énergie (CEE), éco-prêt à taux zéro, ou encore une TVA réduite (5,5 % ou 10 % selon les travaux). Les conditions et les montants évoluent régulièrement, et certaines aides dépendent de la certification de l'entreprise : renseignez-vous auprès de France Rénov' (france-renov.gouv.fr) avant de signer un devis."),
("Quelle garantie avez-vous sur les travaux ?","Nous disposons d'une garantie décennale. Elle couvre pendant 10 ans, à compter de la réception des travaux, les dommages qui compromettent la solidité de l'ouvrage ou le rendent impropre à son usage."),
("Faut-il une autorisation pour refaire ma toiture ou poser un velux ?","Cela dépend des travaux. Un changement de matériau, de couleur ou d'aspect, ou la création d'un velux, peut nécessiter une déclaration préalable en mairie, surtout en zone protégée. Renseignez-vous auprès de votre mairie : nous pouvons aussi vous conseiller."),
("À quelle fréquence faut-il faire vérifier sa toiture ?","Nous recommandons un contrôle régulier, ainsi qu'après un épisode de forte tempête ou de grêle. Repérer tôt une tuile déplacée, une mousse envahissante ou une gouttière bouchée évite des réparations bien plus coûteuses."),
("Proposez-vous l'entretien de toiture ?","Oui. Nous assurons le démoussage et le nettoyage de toiture, le traitement anti-mousse et hydrofuge, la peinture de toiture, le ramonage et le nettoyage des gouttières. Un entretien régulier prolonge la durée de vie de la couverture et évite des réparations plus lourdes."),
("Faites-vous aussi des travaux d'intérieur et de maçonnerie ?","Oui. En complément de la toiture, nous réalisons des travaux d'intérieur et de la petite maçonnerie : reprises de plafonds ou de murs, finitions, reprise de pignon ou de souche de cheminée, rejointoiement… Décrivez-nous votre besoin dans une demande de devis."),
("Dans quelles communes intervenez-vous ?","Nous intervenons à Hautmont et dans les communes alentours. Consultez notre page Zone d'intervention pour vérifier votre commune."),
]
faq_items=''.join(f'<div class="faq-item"><div class="faq-q" role="button" tabindex="0" aria-expanded="false"><span>{q}</span><i class="chev"></i></div><div class="faq-a"><div><p>{a}</p></div></div></div>' for q,a in FAQ)
faq=banner('Questions fréquentes','Les réponses aux questions que se posent le plus souvent nos clients.','FAQ')+f'<section class="section"><div class="container"><div class="faq">{faq_items}</div></div></section>'+cta

# ---------- URGENCE FUITE
tips=[("Protégez les personnes et l'électricité","Si l'eau coule près d'une prise, d'un luminaire ou du tableau électrique, coupez le courant au disjoncteur. En cas de danger immédiat (plafond qui s'affaisse), éloignez-vous et appelez les secours : 18 ou 112."),
 ("Limitez les dégâts","Placez seaux, bassines ou bâches sous la fuite, puis déplacez les meubles, tapis et objets fragiles hors de la zone touchée."),
 ("Videz la poche d'eau","Si le plafond gonfle d'eau, percez-le d'un petit trou en son centre avec un tournevis, un récipient dessous, pour éviter qu'il ne s'effondre. À faire uniquement sans danger électrique."),
 ("Ne montez pas sur le toit","Un toit mouillé est très glissant et les chutes sont graves. Laissez cette intervention à un professionnel équipé."),
 ("Photographiez les dégâts","Prenez des photos du plafond, des murs et des biens abîmés : elles serviront de preuves pour votre assurance."),
 ("Prévenez votre assureur","Déclarez le sinistre à votre assurance habitation dans les 5 jours ouvrés, en joignant vos photos.")]
tips_html=''.join(f'<li><span class="num">{i+1}</span><h3>{t}</h3><p>{d}</p></li>' for i,(t,d) in enumerate(tips))
urg=banner('Urgence fuite','Une fuite de toiture ? Gardez votre calme et suivez ces conseils en attendant notre passage.','Urgence fuite')+f"""<section class="section"><div class="container">
<div class="urgent"><p class="lbl">Appelez-nous maintenant</p><a class="bigtel" href="tel:{TELH}">{TEL}</a><p>Précisez qu'il s'agit d'une fuite : nous organisons une intervention au plus vite, selon nos disponibilités.</p></div>
</div></section>
<section class="section alt"><div class="container"><div class="head"><p class="eyebrow">En attendant notre passage</p><h2>Les bons réflexes</h2></div><ol class="tips">{tips_html}</ol>
<p class="warn">En cas de danger pour les personnes (effondrement, risque électrique, incendie), appelez immédiatement les secours : 18 ou 112.</p></div></section>
<section class="section"><div class="container"><div class="head"><p class="eyebrow">Notre intervention</p><h2>Ce que nous faisons</h2></div>
<ol class="steps">
<li><span class="num">01</span><h3>Diagnostic</h3><p>Nous recherchons l'origine de la fuite pour traiter la cause et pas seulement les effets.</p></li>
<li><span class="num">02</span><h3>Mise en sécurité</h3><p>Si nécessaire, nous protégeons provisoirement la zone touchée pour stopper les infiltrations.</p></li>
<li><span class="num">03</span><h3>Réparation</h3><p>Nous réalisons une réparation durable : tuiles, ardoises, zinguerie, solins ou étanchéité.</p></li>
<li><span class="num">04</span><h3>Contrôle</h3><p>Nous vérifions l'étanchéité et laissons le chantier propre.</p></li>
</ol></div></section>"""+cta


# ---------- DEVIS EN LIGNE
def radios(name, items, first=True):
    return ''.join(f'<label class="opt"><input type="radio" name="{name}" value="{v}"{" checked" if first and i==0 else ""}><span>{v}</span></label>' for i,v in enumerate(items))
def selopts(items): return ''.join(f'<option>{x}</option>' for x in items)
CHK='<label class="chk-line"><input type="checkbox" name="consent" value="1" required><span>J\'accepte que mes informations soient utilisées pour traiter ma demande. <a href="confidentialite.html">Politique de confidentialité</a></span></label>'
HP='<div class="hp" aria-hidden="true"><label>Ne pas remplir<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>'
devis=banner('Devis en ligne gratuit','Décrivez votre projet et envoyez-nous des photos : nous vous recontactons pour organiser, par précaution, une visite sur place avant de vous remettre un devis précis.','Devis en ligne')+f"""<section class="section"><div class="container"><div class="wiz" id="devis">
<div class="visit-note"><span class="sico">{I['pin']}</span><div><h3>Pourquoi une visite sur place ?</h3><p>Une toiture se juge de près : état réel des matériaux, support, charpente, accès. Par précaution, nous préférons venir voir votre chantier avant d'établir un devis ferme. Les informations et photos que vous nous envoyez nous aident à préparer cette visite. Le devis reste gratuit et sans engagement.</p></div></div>
<ol class="wiz-steps"><li class="on">Travaux</li><li>Photos</li><li>Logement</li><li>Coordonnées</li></ol>
<form class="wiz-form" id="devis-form" novalidate>
<div class="wiz-pane on" data-step="1"><h2>Quels travaux envisagez-vous ?</h2><p>Choisissez le type de travaux.</p>
<div class="opts">{radios('travaux',['Couverture','Zinguerie','Pignon','Velux','Entretien de toiture',"Travaux d'intérieur",'Petite maçonnerie','Réparation de fuite','Autre'])}</div>
<label class="field">Décrivez votre projet (facultatif)<textarea name="message" rows="4" maxlength="2000"></textarea></label></div>
<div class="wiz-pane" data-step="2"><h2>Ajoutez des photos de votre toiture</h2><p>Elles nous aident à préparer notre visite sur place et à comprendre votre projet.</p>
<label class="drop" id="drop"><input type="file" accept="image/*" multiple id="photos"><b>Cliquez pour choisir vos photos</b><small>ou glissez-les ici · 6 photos maximum</small></label>
<div class="thumbs" id="thumbs"></div>
<p class="tips-box">Idéal : une vue d'ensemble de la toiture, un gros plan des zones abîmées et, en cas de fuite, l'intérieur (plafond, combles). Cette étape est facultative.</p></div>
<div class="wiz-pane" data-step="3"><h2>Votre logement</h2><p>Quelques informations pour préparer votre devis.</p>
<div class="row2"><label class="field">Commune<input name="commune" autocomplete="address-level2" maxlength="80"></label><label class="field">Type de bâtiment<select name="batiment">{selopts(['Maison individuelle','Immeuble','Commerce ou local professionnel','Bâtiment agricole','Autre'])}</select></label></div>
<div class="row2"><label class="field">Surface approximative de toiture (m²)<input name="surface" inputmode="numeric" maxlength="10"></label><label class="field">Délai souhaité<select name="delai">{selopts(['Dès que possible','Dans le mois','Dans les 3 mois','Pas pressé'])}</select></label></div></div>
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
<div class="opts">{radios('kind',['Visite sur place pour devis','Contrôle / diagnostic de toiture','Échange téléphonique'])}</div>
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
 ('index.html','Couvreur à Hautmont','P.A Couverture, couvreur à Hautmont : couverture, zinguerie, pignon, velux, entretien, travaux d\'intérieur et petite maçonnerie. Devis gratuit.',index),
 ('services.html','Services','Couverture, zinguerie, pignon, pose de velux, entretien de toiture (démoussage, ramonage, peinture), travaux d\'intérieur et petite maçonnerie à Hautmont et alentours.',services),
 ('realisations.html','Réalisations','Découvrez les chantiers de toiture réalisés par P.A Couverture.',real),
 ('a-propos.html','À propos','P.A Couverture, artisan couvreur à Hautmont (59330).',about),
 ('mentions-legales.html','Mentions légales','Mentions légales du site P.A Couverture.',mentions),
 ('confidentialite.html','Confidentialité','Politique de confidentialité du site P.A Couverture.',confid),
 ('zone-intervention.html',"Zone d'intervention","Zone d'intervention de P.A Couverture autour de Hautmont (59330) : vérifiez si nous intervenons dans votre commune.",zone),
 ('faq.html','Questions fréquentes',"Durée d'une réfection de toiture, fuites, aides, garantie décennale : les réponses à vos questions.",faq),
 ('urgence-fuite.html','Urgence fuite','Fuite de toiture à Hautmont : conseils pour limiter les dégâts et numéro pour nous appeler.',urg),
 ('devis.html','Devis en ligne gratuit','Demandez un devis gratuit en ligne : décrivez vos travaux et envoyez des photos de votre toiture à P.A Couverture, Hautmont.',devis),
 ('rendez-vous.html','Prendre rendez-vous','Prenez rendez-vous en ligne avec P.A Couverture pour une visite, un devis ou un contrôle de toiture.',rdv),
 ('guide-materiaux.html','Guide des matériaux de couverture','Tuiles, ardoises ou bac acier : durée de vie, avantages et conseils pour choisir le bon matériau de toiture.',guide),
 ('contact.html','Contact','Contactez P.A Couverture pour un devis gratuit : 06 03 50 82 30.',contact)]:
    open(os.path.join(OUT,fn),'w').write(page(fn,t,d,b))
