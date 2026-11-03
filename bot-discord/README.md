# Atelier — bot Discord et panneau web

Atelier est un projet auto-hébergé : un processus Node.js garde le bot connecté à Discord et sert le panneau de configuration. Les paramètres de chaque serveur sont stockés dans SQLite.

## Fonctions incluses

- Connexion au panneau avec Discord OAuth2.
- Liste des serveurs où l’utilisateur a « Administrateur » ou « Gérer le serveur ».
- Message d’arrivée configurable, avec `{user}`, `{server}` et `{memberCount}`.
- Image d’accueil configurable par lien HTTPS, en complément du texte.
- Couleur personnalisable de la barre d’embed pour l’accueil et les tickets.
- Attribution d’un rôle automatique à l’arrivée d’un membre.
- Tickets privés avec catégorie, rôle support, image de panneau et types configurables dans un menu déroulant (jusqu’à 25 choix).
- Options de tickets activables individuellement : formulaire par type, prise en charge, transcription, réouverture, fermeture après inactivité et journal d’activité.
- Options d’embed d’arrivée : embed, icône personnalisée et pied de page activables séparément.
- Commandes slash activables une par une : nettoyage des messages, mode lent, informations membre/serveur et avatar.
- Outils FiveM : état du serveur, joueurs en ligne, mode/carte, bouton Cfx.re, commande `/fivemstatus` activable et panneau Discord avec actualisation automatique.
- Sondages interactifs avec choix par boutons, votes modifiables, historique nominatif, résultats persistants, clôture automatique, couleur d’embed et image HTTPS.
- Tirages au sort avec inscriptions par bouton, nombre de gagnants réglable, sélection aléatoire, annonce automatique, couleur d’embed et image HTTPS.
- Salon de messages anonymes activable par serveur : le bot relaie texte et fichiers sous son propre nom, puis supprime l’original.
- Interface redessinée en thème charbon et orange, avec navigation latérale et recherche de pages.
- Créateur de messages personnalisé : texte, embed, image HTTPS, couleur, pied de page et jusqu’à cinq boutons lien ou attribution de rôle avec aperçu en direct.
- Fermeture du ticket par son auteur, un membre du support ou une personne qui gère les salons.
- Interface française, responsive, stockage SQLite et sessions persistantes.

## Prérequis

- Node.js 24.17 ou plus récent (version requise par la version actuelle de discord.js 14).
- Une application créée dans le [portail développeur Discord](https://discord.com/developers/applications).
- Un serveur où tu peux ajouter un bot.

## Configuration Discord

1. Crée une application dans le portail développeur et ouvre l’onglet **Bot**. Crée le bot et copie son token.
2. Dans **OAuth2 → General**, ajoute l’URI de redirection `http://localhost:3000/auth/callback` pour une installation locale.
3. Dans **Bot → Privileged Gateway Intents**, active **Server Members Intent** et **Message Content Intent**. Ils servent respectivement à détecter les arrivées et à générer les transcriptions.
4. Copie l’identifiant d’application, le secret OAuth2 et le token du bot dans `.env`.
5. Ajoute le bot au serveur avec les permissions proposées par le panneau (gérer les rôles, gérer les salons et les messages, voir et envoyer des messages, intégrer des liens et lire l’historique). Place ensuite le rôle du bot au-dessus du rôle à attribuer.

Dans **Tickets**, choisis un salon de logs si tu actives les journaux ou les transcriptions. Le formulaire pose la question définie pour le type choisi. Les transcriptions contiennent les 100 derniers messages du ticket. La fermeture automatique vérifie les tickets ouverts toutes les 15 minutes.

Le panneau utilise les scopes OAuth2 `identify` et `guilds`. Il n’enregistre pas le jeton OAuth de l’utilisateur.

## Installation locale

```bash
cp .env.example .env
```

Complète au minimum `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` et `SESSION_SECRET`. Pour générer une clé de session :

```bash
openssl rand -hex 32
```

Puis lance le bot et le panneau :

```bash
npm install
npm start
```

Sous Windows PowerShell, utilise `npm.cmd install` puis `npm.cmd start` si PowerShell bloque le script `npm.ps1`.

Ouvre `http://localhost:3000`, connecte-toi avec Discord, choisis ton serveur, puis configure les modules. Pour un changement de configuration fait sur un serveur déjà ouvert, les nouveaux réglages s’appliquent immédiatement; l’arrivée des membres est traitée au moment de leur événement Discord.

Pour afficher le nouveau menu de tickets, enregistre d’abord la configuration, puis clique sur **Publier le panneau**. Cela publie un nouveau message dans le salon sélectionné; supprime manuellement l’ancien panneau si tu en avais déjà publié un.

Dans **Commandes**, active les outils souhaités puis enregistre. Les commandes sont publiées pour le serveur sélectionné. `/clearmessages nombre` efface de 1 à 100 messages récents (Discord bloque les suppressions groupées au-delà de 14 jours) et exige **Gérer les messages** pour l’utilisateur et le bot. `/slowmode secondes` règle un délai de 0 à 21 600 secondes et exige **Gérer les salons** pour l’utilisateur et le bot. `/userinfo`, `/serverinfo` et `/avatar` répondent en privé.

Dans **Messages**, choisis un salon, rédige le message puis active l’embed si tu veux ajouter un titre, une description, une image HTTPS, une couleur et un pied de page. Choisis si l’image doit apparaître en grand sous le texte ou en miniature en haut à droite; Discord ne propose pas de bannière large tout en haut d’un embed classique. Les boutons peuvent ouvrir un lien HTTP/HTTPS ou donner un rôle au membre qui clique (par exemple « Accepter »). Le bot doit avoir **Gérer les rôles** et être placé au-dessus du rôle choisi; les rôles d’administration et de modération sont exclus des boutons. Le bot doit aussi avoir **Intégrer des liens** pour publier un embed.

Pour ajouter les barres grises de citation, sélectionne les lignes dans le texte ou la description de l’embed, puis clique sur **Ajouter une barre grise**. L’aperçu en direct montre le bloc de citation; Discord l’affiche aussi dans le message publié.

Dans **FiveM**, indique l’adresse de ton serveur, son port (par défaut `30120`) et choisis le salon du panneau. L’adresse ne doit pas contenir le protocole ni le port. Le bot essaie les endpoints `dynamic.json` et `info.json`; ils doivent être joignables depuis la machine du bot. Tu peux fournir un lien Cfx.re HTTPS pour le bouton de connexion. Enregistre les réglages, puis publie le panneau. Active séparément `/fivemstatus` et l’actualisation automatique si tu en as besoin; l’intervalle est réglable de 30 à 300 secondes.

Dans **Sondages**, publie une question avec 2 à 10 choix et une durée. Choisis la couleur de la barre d’embed et ajoute une image avec une URL HTTPS directe si tu le souhaites. Les membres votent avec les boutons Discord, peuvent modifier leur choix avant la clôture, et les résultats sont automatiquement archivés. L’historique conserve l’identifiant du votant, son choix et l’heure du vote : ces sondages ne sont pas anonymes. Tu peux aussi clôturer un sondage depuis le panel.

Dans le même espace, crée un **tirage au sort** avec un lot, une durée et jusqu’à 10 gagnants. Tu peux régler sa couleur d’embed et ajouter une image HTTPS. Les membres s’inscrivent depuis le bouton du message. À la fin, le bot sélectionne et annonce aléatoirement les gagnants; tu peux également terminer le tirage depuis le panel.

Dans **Salon anonyme**, active la fonction et sélectionne un salon. Le bot republie le texte et les fichiers joints sans nom d’auteur, puis supprime le message d’origine. Il doit avoir **Envoyer des messages**, **Gérer les messages** et **Joindre des fichiers** dans ce salon; les messages du bot sont ignorés.

## Mise en ligne

Le bot doit tourner en continu sur une machine ou un hébergeur Node.js qui accepte les connexions sortantes vers Discord. Configure un domaine HTTPS, puis renseigne par exemple :

```env
BASE_URL=https://bot.ton-domaine.fr
DISCORD_REDIRECT_URI=https://bot.ton-domaine.fr/auth/callback
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
```

L’URI HTTPS doit aussi être ajoutée dans **OAuth2 → General**. Garde `.env` privé. Le dossier `data` contient la base SQLite et doit être conservé lors des redémarrages ou déploiements.

Avec Docker Compose :

```bash
cp .env.example .env
# Complète .env avant de lancer le service
docker compose up -d --build
```

Place un proxy HTTPS (par exemple Caddy ou nginx) devant le port 3000 en production. Ne publie pas directement ce port sur Internet sans HTTPS.

## Notes

- Les images d’accueil et du panneau de tickets doivent être accessibles par un lien HTTPS direct. Discord ne peut pas récupérer un fichier local depuis un bot auto-hébergé.
- Le panneau ne peut gérer que les serveurs où le bot est installé et où le compte connecté dispose d’« Administrateur » ou « Gérer le serveur ».
- Les rôles gérés par une intégration Discord ne sont pas proposés pour l’auto-rôle.
- Le bot doit disposer des permissions Discord correspondantes et son rôle doit se trouver assez haut dans la hiérarchie.
- Un ticket ouvert par un membre est limité à un ticket à la fois par serveur. La fermeture conserve le salon et verrouille l’auteur pour garder l’historique.
