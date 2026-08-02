# Bot Discord d'Administration Interne — La Scène RP

Un bot Discord professionnel conçu pour centraliser l'administration interne de La Scène RP. Gestion d'équipe, projets, tâches, RH, annonces, réunions et bien plus, directement depuis Discord.

## 🎯 Caractéristiques

### Interface : panneaux interactifs

Le serveur s'utilise principalement par **panneaux épinglés** : chaque salon hub
porte un message du bot avec des boutons. On clique, on saisit dans un modal, et
le contenu s'enregistre puis s'affiche en fiche. Les commandes slash restent
disponibles en parallèle.

| Panneau | Salon | Actions |
|---|---|---|
| Pôle (×8) | `#<pole>` | Projet, tâche, objectif, annonce, mes tâches |
| Direction | `#direction` | Dashboard, KPI, alertes, dépense, décision |
| RH | `#rh` | Candidater, absence, mon dossier, candidatures |
| Général | `#general` | Annonce, réunion, objectif, roadmap |
| Documents | `#documents` | Publier, consulter |
| Attente | `#en-attente` | Attribuer un pôle à un arrivant |

### Modules opérationnels — 18 commandes

| Commande | Périmètre | Grade minimum |
|---|---|---|
| `/setup` | Structure Discord complète, idempotente | Fondateur |
| `/pole` | Affectation des membres aux pôles | Chef d'équipe |
| `/reset` | Supprime toute la structure (double confirmation) | Fondateur |
| `/rh` | Candidatures, promotions, sanctions, dossier RH | Recrue |
| `/projet` | Création, workflow, participants, commentaires | Collaborateur |
| `/tache` | Création, assignation, statuts, pièces jointes | Collaborateur |
| `/annonce` | Rédaction assistée, diffusion multi-pôles | Chef d'équipe |
| `/reunion` | Planification, présences, comptes-rendus | Chef d'équipe |
| `/decision` | Propositions, arbitrage, conversion en tâches | Responsable |
| `/depense` | Soumission, validation à deux niveaux | Collaborateur |
| `/objectif` | Objectifs hebdo/mensuels/pôle, clôture | Chef d'équipe |
| `/kpi` | Indicateurs hebdomadaires et tendances | Responsable |
| `/alertes` | Détection d'anomalies | Responsable |
| `/dashboard` | Vue d'ensemble consolidée | Chef d'équipe |
| `/journal` | Journal d'audit filtrable | Responsable |
| `/roadmap` | Feuille de route interne | Responsable |
| `/document` | Bibliothèque documentaire | Collaborateur |
| `/absence` | Déclaration et validation d'absences | Recrue |

### Tâches planifiées

| Fréquence | Traitement |
|---|---|
| Quotidien, 8 h | Clôture des absences échues, réactivation des membres |
| Toutes les 6 h | Détection d'anomalies + rafraîchissement des panneaux |
| Lundi, 9 h | Instantané KPI de la semaine écoulée |

Tous les modules du cahier des charges initial sont implémentés :
Dashboard, Réunions, Décisions, Dépenses, Objectifs, KPI, Alertes, Journal
d'audit, Roadmap, Documents et Absences.

## 📋 Structure

```
lascenerp/
├── prisma/schema.prisma          # Schéma complet (tous les modules)
├── src/
│   ├── core/                      # Moteur Discord.js (Client, CommandHandler, EventHandler, Logger, ErrorHandler)
│   ├── commands/                  # Déclaration slash commands (18 commandes)
│   ├── events/                    # Listeners Discord.js
│   ├── database/                  # Connexion Prisma
│   ├── services/                  # Services transverses (Permission, Member, GuildStructure, Embed)
│   ├── middlewares/               # Middlewares (permissions, erreurs)
│   ├── config/                    # Configuration statique (pôles, structure guild)
│   ├── types/                     # Types TypeScript
│   ├── utils/                     # Fonctions utiles
│   ├── jobs/                      # Tâches planifiées (crons)
│   └── modules/                   # Logique métier par domaine
│       ├── setup/                 # Setup + provisioning rôles/salons
│       ├── rh/                    # RH, candidatures, promotions
│       ├── projects/              # Gestion des projets
│       ├── tasks/                 # Gestion des tâches
│       ├── announcements/         # Annonces + diffusion
│       ├── panels/               # Panneaux interactifs épinglés
│       ├── poleAssignment/       # Affectation aux pôles
│       ├── reset/                # Suppression de la structure
│       └── meetings/ decisions/ expenses/ objectives/ kpi/ alerts/
│           audit/ roadmap/ documents/ absences/ dashboard/
├── .env.example
├── package.json
└── tsconfig.json
```

## 🚀 Démarrage

### Prérequis
- Node.js 18+
- npm ou yarn
- Une base MySQL (Railway recommandé)
- Un bot Discord v14+ en dev sur un serveur de test

### Installation

```bash
# Cloner/initialiser le projet
cd lascenerp
npm install

# Copier la config d'environnement
cp .env.example .env

# Remplir .env avec :
# - DISCORD_TOKEN : token du bot
# - GUILD_ID : ID du serveur de test
# - DATABASE_URL : chaîne MySQL (voir section Base de données)
```

### Base de données

```bash
# Créer la base de données et appliquer le schéma
npx prisma migrate dev --name init

# (Optionnel) Ouvrir Prisma Studio pour visualiser les données
npx prisma studio
```

### Lancement

```bash
# En développement (rechargement à chaud via tsx)
npm run dev

# Vérification de types seule
npm run typecheck

# Diagnostic de la connexion base de données
npm run check:db

# Production
npm run build
npm start
```

## 🔧 Configuration

### Hiérarchie des grades

8 grades de permission cascade (chaque grade peut agir sur tout ce qui lui est inférieur) :

1. **Fondateur** — accès total (Admin Discord)
2. **Co-Fondateur** — accès total (Admin Discord)
3. **Directeur Général** — gestion globale, rétrogradations
4. **Directeur de Pôle** — gestion du pôle, promotions, validations
5. **Responsable** — validation dépenses/candidatures, signalements
6. **Chef d'équipe** — création projet/tâche, gestion directe, avertissements
7. **Collaborateur** — création tâche, participation projets
8. **Recrue** — accès limité (onboarding + candidatures internes)

### Deux grilles de rôles

Le serveur héberge **deux populations distinctes** :

**1. Le staff du projet global** — 8 grades en cascade qui pilotent l'entreprise :
Fondateur, Co-Fondateur, Directeur Général, Directeur de Pôle, Responsable,
Chef d'équipe, Collaborateur, Recrue.

**2. Le staff opérationnel par pôle** — 32 rôles (4 rangs × 8 pôles) décrivant
l'appartenance à une entité : `Directeur Garry's Mod`, `Responsable Web`,
`Membre Technique`… Ces rôles sont **indépendants** des grades business : un
Admin en jeu sur Garry's Mod n'est pas un « Collaborateur de l'entreprise ».

Les deux grilles coexistent, un membre pouvant porter un grade de chaque.

### Cloisonnement par pôle

Chaque catégorie de pôle n'est visible que par les porteurs d'un de ses 4 rôles.
Le staff RH ne voit pas les salons Technique, le staff Garry's Mod ne voit pas
le Web. Seule la **direction générale** (Directeur Général et au-dessus) garde
une vue d'ensemble — sans quoi piloter l'entreprise imposerait de cumuler les
32 rôles.

### Parcours d'un nouvel arrivant

```
Rejoint le serveur
  → aucun rôle attribué, voit uniquement #en-attente
  → un Chef d'équipe+ clique « Attribuer un pôle » sur le panneau
  → choisit le membre, le pôle, le rang
  → le membre reçoit son rôle et découvre sa catégorie
```

Aucun accès n'est ouvert avant validation humaine.

### Structure du serveur — 35 salons

**Catégories fixes (11 salons)**

| Catégorie | Salons |
|---|---|
| 📋 Direction | `direction` 🔒 · `direction-discussion` · 🔊 Vocal Direction |
| 📢 Général | `general` 🔒 · `general-discussion` · `en-attente` 🔒 · 🔊 Vocal Général |
| 🧑‍💼 RH | `rh` 🔒 · `rh-confidentiel` |
| 📚 Documents | `documents` 🔒 |
| ⚙️ Système | `journal` 🔒 |

**8 pôles × 3 salons** : `#<pole>` (hub 🔒), `#<pole>-discussion` et un vocal
« 🔊 <Pôle> ». Le vocal est cloisonné comme le reste : seuls les membres du pôle
peuvent le voir et s'y connecter.

Pôles : Général, Garry's Mod, Web, Technique, Communautaire, Marketing,
Partenariats, Animation.

🔒 = salon verrouillé, seul le bot y écrit. Les échanges se font dans les salons
`-discussion`.

> ⚠️ Limite Discord : les rôles portant `Administrator` (Fondateur,
> Co-Fondateur) ignorent les refus d'écriture et pourront techniquement écrire
> dans un salon verrouillé. Le bot compense en repositionnant le panneau en bas
> du salon s'il n'est plus le dernier message.

## 📝 Workflows clés

### Setup automatique (`/setup`)
1. Crée 8 rôles hiérarchiques colorés avec permissions Discord adaptées
2. Crée catégories + salons complets (Direction, Général, 8 pôles, RH, Documents, Archives)
3. Applique overwrites de permissions basés sur les grades
4. Persiste IDs générés en DB (`GuildConfig`)
5. Rapport d'exécution indiquant succès/erreurs

### RH — Candidature → Promotion
1. Candidat lance `/rh candidature` → modal motivation
2. Annonce dans `#candidatures` avec boutons Accepter/Refuser/Entretien
3. Si acceptée → création `Member` DB + historique `ARRIVEE`
4. Promotion effective via `/rh promouvoir` (Directeur de Pôle+ only) → mise à jour grade + échange rôles Discord

### Annonces
1. `/annonce creer` → modal (titre, contenu) + option priorité
2. Select menu : pôles concernés (ou "Tous")
3. Un `Announcement` + une ligne `AnnouncementPoleTarget` par pôle
4. Diffusion automatique dans chaque salon `annonces` cible
5. Rapport éphémère d'exécution

### Projets/Tâches
1. Statuts contrôlés (À faire → En cours → En attente → En test → Terminé)
2. Select menu pour transitions (pas de saisie libre)
3. Chaque changement loggé comme `ProjectComment` système
4. Commentaires et pièces jointes supportés

## 🔐 Permissions

- Basées sur **rôles Discord natifs** (pas de table séparée)
- Cascade hiérarchique : un grade N gère les actions de tous les grades < N
- Exceptions métier documentées par module (ex: promotion réservée Directeur de Pôle+)
- Middleware centralisé qui vérifie `minGrade` avant `execute()`

## 📊 Architecture

### Découplage commandes ↔ logique métier
- `commands/` : fichiers fins qui déclarent la structure et délèguent aux handlers
- `modules/<nom>/handlers/` : handlers de commandes slash
- `modules/<nom>/services/` : logique pure (indépendante de Discord.js)
- `modules/<nom>/embeds/` : générateurs d'embeds
- `modules/<nom>/buttons/`, `/modals/`, `/selectMenus/` : handlers d'interactions

### Routage des interactions
- Slash commands : `CommandHandler` → `client.commands` → `execute()`
- Boutons/selects/modals : `interactionCreate` event → routeur par `customId` prefix → module handler

### Services transverses
- `PermissionService` : résolution rôle Discord → grade, vérification cascade
- `MemberService` : CRUD `Member` + sync avec Discord ID
- `GuildStructureService` : persist/lecture IDs rôles/salons en DB (`GuildConfig`)
- `EmbedFactory` : styles/couleurs communs

## 🛠️ Développement

### Ajouter une nouvelle commande

1. Créer `src/commands/mycommand.ts`
2. Implémenter `CommandModule` (data + minGrade + execute)
3. Si logique métier complexe → créer `src/modules/mymodule/handlers/` + `services/`

### Ajouter un bouton/select/modal

1. Créer handler dans `src/modules/mymodule/buttons/`, `selectMenus/`, ou `modals/`
2. Exporter avec `customIdPrefix`
3. Enregistrer dans `client.buttons`/`selectMenus`/`modals` au démarrage (automatisé par EventHandler futur)
4. Routeur `interactionCreate` dispatch sur le prefix

### Styles d'embeds

Utiliser `EmbedFactory` pour cohérence :
- `.baseEmbed()` — base + timestamp
- `.errorEmbed(title, desc)` — rouge
- `.successEmbed(title, desc)` — vert
- `.infoEmbed(title, desc)` — bleu
- `.warningEmbed(title, desc)` — orange
- `.getPriorityColor(priority)` — couleur selon priorité

## 📂 Premier lancement

1. **Serveur de test** : créer un Discord privé de test
2. **Bot setup** : créer application Discord, générer token, inviter sur le serveur de test
3. **Env** : remplir `.env` avec token et guild ID de test
4. **DB** : `npx prisma migrate dev --name init`
5. **Lancer** : `npm run dev`
6. **Exécuter `/setup`** (Fondateur seul) → création structure complète
7. **Tester les commandes** selon les workflows

## 🔍 Validation

- **Types** : `npm run typecheck` (TypeScript strict, sans émission)
- **Build** : `npm run build` (compile puis résout les alias de chemins)
- **Schéma Prisma** : `npm run prisma:validate`
- **Logs** : `logs/all.log` et `logs/error.log`

## 📚 Documentation

Voir `plan.md` pour l'architecture détaillée, la hiérarchie complète et les workflows.

## 📄 Licence

MIT

## 👥 Auteur

La Scène RP — 2024
