# Guide de déploiement — Bot La Scène RP

De zéro à un bot fonctionnel : application Discord, base MySQL, GitHub, Railway.
Comptez 30 à 45 minutes pour la première fois.

---

## 1. Créer l'application Discord

1. Ouvrez le [portail développeur Discord](https://discord.com/developers/applications) → **New Application**, nommez-la `La Scène RP — Admin`.
2. Onglet **Bot** → **Add Bot** → **Reset Token** → copiez le token. **Il ne s'affiche qu'une fois.**
3. Toujours dans **Bot**, activez les trois *Privileged Gateway Intents* :
   - ✅ Presence Intent
   - ✅ **Server Members Intent** ← indispensable, le bot ne démarre pas sans
   - ✅ Message Content Intent
4. Onglet **OAuth2 → URL Generator** :
   - Scopes : `bot` + `applications.commands`
   - Bot Permissions : `Administrator` (le plus simple pour `/setup`)
5. Ouvrez l'URL générée et invitez le bot sur votre **serveur de test**.

> ⚠️ **Après l'invitation** : Paramètres du serveur → Rôles → remontez le rôle du bot
> **tout en haut** de la liste. Discord interdit à un bot de gérer des rôles situés
> au-dessus du sien : sans cela, `/setup` créera les rôles mais ne pourra pas les ordonner.

### Récupérer l'ID du serveur
Paramètres Discord → Avancés → activez **Mode développeur**. Clic droit sur
l'icône du serveur → **Copier l'identifiant du serveur**.

---

## 2. Publier le code sur GitHub

Le dépôt n'est pas encore initialisé. Depuis `c:\lascenerp` :

```bash
git init
git add .
git commit -m "Bot d'administration La Scène RP — core, setup et module RH"
```

Vérifiez que `.env` **n'est pas** dans le commit (il est déjà couvert par `.gitignore`) :

```bash
git status --short
```

Créez ensuite un dépôt **privé** sur GitHub, puis :

```bash
git remote add origin https://github.com/VOTRE-COMPTE/lascenerp-bot.git
git branch -M main
git push -u origin main
```

> 🔒 Dépôt **privé** obligatoire : même sans `.env`, la structure interne de votre
> organisation n'a pas vocation à être publique.

---

## 3. Créer la base MySQL sur Railway

1. Sur [railway.app](https://railway.app), connectez-vous avec GitHub.
2. **New Project** → **Provision MySQL**.
3. Cliquez sur le service MySQL → onglet **Variables** → copiez la valeur de
   **`MYSQL_PUBLIC_URL`**.

> Distinction importante : `MYSQL_URL` (réseau interne Railway) ne fonctionne
> **que** depuis un service hébergé chez Railway. Pour migrer depuis votre PC,
> il vous faut `MYSQL_PUBLIC_URL`.

---

## 4. Tester en local

Créez `.env` à la racine (fichier non versionné) :

```env
DISCORD_TOKEN=le_token_copie_a_l_etape_1
GUILD_ID=l_id_de_votre_serveur_de_test
DATABASE_URL=mysql://root:xxxx@monorail.proxy.rlwy.net:12345/railway
NODE_ENV=development
LOG_LEVEL=debug
```

Puis :

```bash
npm install
npx prisma generate          # génère le client typé
npx prisma migrate dev --name init   # crée les 29 tables
npm run dev
```

Vous devez voir :

```
✓ Database connected
✓ Loaded command: setup
✓ Loaded command: rh
✓ Connecté en tant que VotreBot#1234
✓ Slash commands registered successfully
```

### Vérifier la base

```bash
npx prisma studio
```

Ouvre une interface web sur `localhost:5555` pour inspecter les tables.

---

## 5. Premier lancement sur Discord

### Étape 1 — Provisionner la structure

Tapez `/setup` sur votre serveur, puis confirmez via le bouton. Après ~30 secondes,
un rapport chiffré s'affiche (rôles / catégories / pôles / salons créés).

> ℹ️ **Amorçage** : `/setup` exige normalement le grade Fondateur — un grade qui
> n'existe pas encore au premier lancement. Le bot gère ce cas : tant qu'aucun rôle
> n'a été provisionné, tout **administrateur Discord** peut lancer `/setup`. Dès que
> la hiérarchie existe, seule elle fait foi et cette dérogation disparaît.

### Étape 2 — S'attribuer le rôle Fondateur

Paramètres du serveur → Membres → votre compte → ajoutez **Fondateur**.

Ce point est structurant : le bot lit le grade depuis vos **rôles Discord**, pas
depuis la base. Sans rôle, aucune commande RH ne vous sera accessible.

### Étape 3 — Vérifier

Relancez `/setup` : le rapport doit afficher « mis à jour / existants » et non
« créés ». C'est la preuve que l'idempotence fonctionne.

---

## 6. Scénario de test du module RH

À dérouler dans l'ordre, avec un second compte (ou un ami) comme cobaye.

| # | Commande | Résultat attendu |
|---|---|---|
| 1 | `/rh candidature pole:Web motivation:Test` | Embed bleu « En attente » dans `#candidatures` avec 3 boutons |
| 2 | Cliquer **Entretien** | L'embed passe orange, les boutons restent |
| 3 | Cliquer **Accepter** → saisir une note | Embed vert, boutons disparus, MP envoyé au candidat |
| 4 | Rejouer `/rh candidature` | ❌ « Une candidature est déjà en cours » |
| 5 | `/rh promouvoir membre:@X grade:Collaborateur` | Embed doré dans `#promotions`, rôle Discord échangé |
| 6 | `/rh promouvoir membre:@X grade:Fondateur` | ❌ « grade supérieur ou égal au vôtre » |
| 7 | `/rh avertir membre:@X motif:Test` | Embed orange dans `#sanctions` + MP au membre |
| 8 | `/rh sanctionner membre:@X type:SUSPENSION gravite:GRAVE motif:Test` | Embed rouge, statut du membre → `SUSPENDU` |
| 9 | `/rh historique membre:@X` | Dossier complet : grade, pôle, compteurs, chronologie |
| 10 | `/rh historique` depuis un compte Recrue | ✅ son propre dossier (règle « soi-même ») |
| 11 | `/rh sanctionner` depuis un compte Chef d'équipe | ❌ « Responsables et au-dessus » |

Les points 4, 6 et 11 sont les plus importants : ils vérifient les garde-fous.

---

## 6 bis. Scénario de test Projets / Tâches

| # | Commande | Résultat attendu |
|---|---|---|
| 1 | `/projet creer titre:Refonte site description:Test priorite:HAUTE pole:Web` | Embed orange publié dans `#projets` du pôle Web, avec 2 boutons |
| 2 | `/projet creer ... echeance:31/02/2026` | ❌ « Date invalide » (le 31 février n'existe pas) |
| 3 | Cliquer **Changer le statut** | Menu déroulant ne proposant **que** les transitions licites |
| 4 | Choisir « En cours » | Confirmation + message de changement dans le salon du pôle |
| 5 | `/projet membre projet:… action:ajouter membre:@X` | ✅ ajouté ; rejouer → ❌ « participe déjà » |
| 6 | Cliquer **Commenter** → saisir un texte | L'embed d'origine se rafraîchit avec le commentaire |
| 7 | `/tache creer titre:Maquettes priorite:NORMALE projet:Refonte site` | Embed publié dans `#taches` du pôle |
| 8 | Cliquer **S'assigner** | Tâche assignée, bouton devenu grisé |
| 9 | Depuis un autre compte, cliquer **S'assigner** | Bouton déjà grisé (tâche prise) |
| 10 | `/tache assigner tache:… membre:@X` depuis un Collaborateur | ❌ « Seuls les Chefs d'équipe… » |
| 11 | `/tache statut` depuis la personne assignée | ✅ menu des transitions |
| 12 | `/tache piece-jointe tache:… fichier:<upload>` | Fichier listé dans l'embed |
| 13 | Clôturer un projet depuis un Chef d'équipe | ❌ « Seuls les Responsables… peuvent clôturer » |

Les points 2, 3, 9, 10 et 13 vérifient les garde-fous : validation de date,
transitions contraintes, et seuils de grade.

> 💡 Les options `projet:` et `tache:` sont **auto-complétées** : commencez à taper
> le titre, Discord propose les correspondances. La valeur envoyée est l'identifiant
> interne, jamais le texte saisi.

---

## 6 ter. Scénario de test Annonces

| # | Action | Résultat attendu |
|---|---|---|
| 1 | `/annonce creer titre:Maintenance contenu:Test priorite:URGENTE` | Aperçu rouge en éphémère + menu de sélection des pôles |
| 2 | Choisir « Web » et « Marketing » | Embed identique publié dans le `#annonces` de **chaque** pôle |
| 3 | Lire le rapport | « 2 pôle(s) sur 2 » |
| 4 | Recliquer sur le menu du message précédent | ⚠️ « Brouillon expiré » — pas de double publication |
| 5 | Choisir « Tous les pôles » sur une nouvelle annonce | Diffusion vers les 8 pôles |
| 6 | Depuis un Chef d'équipe du pôle Web, cibler « Marketing » | ❌ « Vous ne pouvez annoncer que dans votre propre pôle » |
| 7 | Depuis un Chef d'équipe du pôle Web, cibler « Web » | ✅ publication autorisée |
| 8 | Supprimer manuellement le `#annonces` d'un pôle, puis diffuser | ⚠️ « Diffusion partielle », le pôle en échec est nommé |

Les points 4, 6 et 8 sont les plus révélateurs : anti-doublon, cloisonnement par
pôle, et robustesse face à un salon manquant.

> ⏱️ Un brouillon d'annonce expire au bout de **10 minutes**. Passé ce délai, il
> faut relancer `/annonce creer`.

---

## 6 quater. Migration vers la nouvelle structure

Si votre serveur utilise l'ancienne structure (64 salons), il faut repartir
d'une base propre — les deux organisations ne peuvent pas coexister.

```
/reset     → embed rouge listant ce qui sera détruit
           → bouton « Je comprends, continuer »
           → modal : recopier le nom exact du serveur
           → suppression + rapport

/setup     → recrée 24 salons, 13 catégories, 9 rôles
           → publie les 13 panneaux épinglés
```

**Ce qui est conservé** : membres, grades, projets, tâches, historique RH,
journal d'audit — toutes les données métier restent en base. Seuls les salons et
rôles Discord sont recréés.

**Ce qui est perdu** : le contenu des messages dans les salons supprimés
(comptes-rendus rédigés à la main, discussions). Les fiches générées par le bot
sont régénérables depuis la base.

### Tester les panneaux

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Aller dans `#web` | Panneau épinglé avec compteurs et 6 boutons |
| 2 | Cliquer **Nouveau projet** | Modal avec titre, description, priorité, échéance |
| 3 | Valider | Fiche projet postée sous le panneau |
| 4 | Recharger `#web` | Compteur « Projets actifs » incrémenté |
| 5 | Essayer d'écrire dans `#web` | ❌ Impossible (sauf Fondateur — voir README) |
| 6 | Écrire dans `#web-discussion` | ✅ Autorisé |
| 7 | Supprimer le panneau épinglé à la main | Il se recrée à la prochaine action ou au cron |
| 8 | Cliquer **Mes tâches** | Liste éphémère, visible de vous seul |
| 9 | `/journal` | Les actions faites via les panneaux y figurent |

Le point 7 vérifie l'auto-réparation, le point 9 que les panneaux et les
commandes alimentent le même journal d'audit.

---

## 7. Déployer en production sur Railway

1. Dans votre projet Railway : **New** → **GitHub Repo** → sélectionnez votre dépôt.
2. Service créé → onglet **Variables** → ajoutez :

   | Variable | Valeur |
   |---|---|
   | `DISCORD_TOKEN` | votre token |
   | `GUILD_ID` | ID du serveur de production |
   | `DATABASE_URL` | `${{MySQL.MYSQL_URL}}` ← référence interne, pas l'URL publique |
   | `NODE_ENV` | `production` |
   | `LOG_LEVEL` | `info` |

3. Onglet **Settings** → **Deploy** :
   - Build Command : `npm run build`
   - Start Command : `npx prisma migrate deploy && npm start`

`migrate deploy` applique les migrations existantes sans jamais en générer de
nouvelle — c'est la commande correcte en production, contrairement à `migrate dev`.

Suivez l'onglet **Deployments → Logs** pour confirmer le démarrage.

---

## 8. Dépannage

| Symptôme | Cause | Correctif |
|---|---|---|
| `Missing required environment variable` | `.env` absent ou incomplet | Vérifiez les 3 variables obligatoires |
| `Can't reach database server` | Vous utilisez `MYSQL_URL` en local | Basculez sur `MYSQL_PUBLIC_URL` |
| `Used disallowed intents` | Intents non cochés | Portail Discord → Bot → activez les 3 intents |
| `/setup` : rôles créés mais mal ordonnés | Rôle du bot trop bas | Remontez-le en haut de la liste des rôles |
| Commandes absentes de Discord | Mauvais `GUILD_ID` | Vérifiez l'ID ; les commandes de guilde sont instantanées |
| « Aucun grade détecté » | Pas de rôle hiérarchique | Attribuez-vous un rôle créé par `/setup` |
| Salon introuvable dans un message | `/setup` non exécuté | Lancez `/setup` |
| `P3009 migrate found failed migration` | Migration interrompue | `npx prisma migrate resolve --rolled-back <nom>` |
| `ERR_MODULE_NOT_FOUND` sur `@core/...` | Build lancé avec `tsc` seul | Utilisez `npm run build` : il enchaîne `tsc` **et** `tsc-alias`, qui convertit les alias en chemins relatifs |

### Consulter les logs

En local : `logs/all.log` et `logs/error.log`. Sur Railway : onglet **Deployments → Logs**.

---

## 9. Modifier le schéma plus tard

```bash
# 1. Éditez prisma/schema.prisma
# 2. Générez et appliquez la migration en local
npx prisma migrate dev --name description_du_changement
# 3. Commitez le dossier de migration généré
git add prisma/migrations && git commit -m "migration: ..."
git push
```

Railway exécutera `migrate deploy` au déploiement suivant.

Le dossier `prisma/migrations/` est volontairement **versionné** : `migrate deploy`
n'applique que des migrations déjà existantes, il lui faut donc ces fichiers.
