# Inscription SLK — Stade Laurentin Karaté Shidokan

Site d'adhésion en ligne : formulaire sur-mesure (tarifs conditionnels par section,
paiement 1x/3x, aides PEPS/Pass'Sport déduites), **paiement CB via HelloAsso Checkout**,
et enregistrement automatique de l'adhérent dans un **Google Sheet** après paiement.

- **Front** statique (Vite) hébergé sur Netlify
- **Fonctions** serverless Netlify (détiennent les secrets)
- **HelloAsso Checkout** = caisse CB (gratuit)
- **Google Sheet** = registre des adhérents (API Sheets)
- **Google Drive** = dossier des **photos d'identité** (optionnel, API Drive)

> Une seule pièce est collectée en ligne : la **photo d'identité**, et elle est **facultative**.
> Les autres pièces ne sont pas envoyées en ligne : le formulaire informe de ce qu'il faut rapporter
> au bureau (attestation mineur / certificat majeur / fond d'œil+ECG pour les disciplines
> de contact / justificatif d'aide). Le suivi de ces pièces reste manuel dans le Sheet.

> **Photo d'identité.** Champ facultatif du formulaire (images uniquement — `jpg`, `png`, `webp`,
> `heic`… ; **pas de PDF** ; fichier source ≤ 20 Mo). La photo est redimensionnée côté navigateur
> (JPEG, côté le plus long ≤ 1200 px), donc seuls quelques centaines de Ko sont réellement envoyés.
> Une fois l'inscription finalisée, elle est déposée dans un dossier Google Drive sous le nom
> **« Nom Prénom.jpg »** (un fichier de même nom est **écrasé**), et le **lien Drive** est inscrit dans
> la colonne **Photo** du Sheet. Sans `GOOGLE_DRIVE_PHOTOS_FOLDER_ID`, l'envoi est simplement ignoré
> (la colonne Photo reste vide, le reste fonctionne).

**Paiement mixte.** Le total dû = cotisation − réduction famille − aides (PEPS/Pass'Sport).
L'adhérent peut régler une partie **hors ligne** (chèque, chèques vacances, espèces, encaissés
au bureau) ; le **reste** est payé en CB sur HelloAsso. Si le hors ligne couvre tout, **aucun
paiement en ligne** n'a lieu et la ligne est écrite directement dans le Sheet. Le détail (total,
payé en ligne, chaque moyen hors ligne et sa valeur) est inscrit dans le Sheet.

## Architecture (flux)

```
Front → POST /api/create-checkout
          ├─ recalcule le prix (source de vérité, src/shared/pricing.js)
          ├─ stocke la soumission dans Netlify Blobs (clé = memberId)
          └─ crée le checkout-intent HelloAsso → renvoie l'URL de paiement
Paiement HelloAsso (CB) → webhook POST /api/helloasso-webhook
          ├─ vérifie le paiement via l'API (re-GET, anti-fraude)
          ├─ relit la soumission dans Blobs
          ├─ APPEND la ligne dans le Google Sheet
          ├─ dépose la photo d'identité dans Drive (si fournie) — non bloquant
          └─ purge le blob
```

La photo est déposée **au moment de la finalisation** (webhook après paiement, ou directement
pour un règlement 100 % hors ligne) : un panier abandonné ne laisse ni ligne ni photo. L'envoi
de la photo est **non bloquant** — un souci Drive n'empêche jamais l'enregistrement d'un adhérent
qui a payé (l'erreur est seulement loguée).

La ligne n'apparaît dans le Sheet **qu'après paiement confirmé**. Un panier abandonné ne
laisse aucune trace. Les lignes ajoutées à la main par le bureau (adhésions hors ligne)
cohabitent : `append` écrit toujours sur la première ligne vide.

## Structure

```
src/
  index.html · merci.html · erreur.html   pages du front
  main.js · styles.css                    logique + style du formulaire
  shared/                                 modules partagés front + fonctions
    config.js      tarifs, disciplines, aides, EN-TÊTES du Sheet   ⚠️ à confirmer
    pricing.js     calcul du prix + échéances (source de vérité)
    docs.js        pièces à rapporter selon la catégorie
    sheet-row.js   mapping soumission+paiement → 29 colonnes (dont le lien photo)
netlify/functions/
  create-checkout.js · helloasso-webhook.js
  lib/helloasso.js   OAuth + checkout-intent + vérification paiement
  lib/google.js      Google Sheets (append + déduplication) + Drive (photo d'identité)
test/pricing.test.js
```

## Variables d'environnement (référence)

Le fichier `.env` est **local uniquement** (gitignoré, jamais committé). En production, les
mêmes clés se renseignent dans **Netlify → Site configuration → Environment variables**.

| Variable | Rôle |
|---|---|
| `HELLOASSO_CLIENT_ID` / `HELLOASSO_CLIENT_SECRET` | Client API HelloAsso (back-office) |
| `HELLOASSO_ORG_SLUG` | slug de l'organisation (dans l'URL HelloAsso) |
| `HELLOASSO_ENV` | `sandbox` (tests) ou `prod` |
| `HELLOASSO_WEBHOOK_SIGNATURE_KEY` | *(optionnel, partenaires)* vérifie la signature `x-ha-signature` du webhook |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON de la clé du compte de service (ou `base64:…`) |
| `GOOGLE_SHEET_ID` | id du Sheet (entre `/d/` et `/edit` dans l'URL) |
| `GOOGLE_SHEET_TAB` | nom de l'onglet (défaut « Feuille 1 ») |
| `GOOGLE_DRIVE_PHOTOS_FOLDER_ID` | *(optionnel)* id du dossier Drive des photos d'identité (après `/folders/`). Non défini → photos ignorées |
| `SITE_URL` | URL publique (construit les returnUrl/backUrl/errorUrl du paiement) |

---

## Prise en main — pas à pas

> Ordre recommandé : on met tout en place en **sandbox HelloAsso** (aucune vraie transaction),
> on valide le flux complet en local, puis seulement on bascule en production.

### Étape 0 — Le projet en local

```bash
npm install
npm test          # tests prix + webhook (doivent être verts)
npm run dev       # netlify dev → http://localhost:8888
```

Sans identifiants, le formulaire s'affiche et `create-checkout` renvoie **502** (l'appel
HelloAsso échoue faute de clés) — c'est normal, on renseigne `.env` aux étapes suivantes.

### Étape 1 — HelloAsso en environnement de TEST (sandbox)  ⟵ commencer ici

1. Créer un compte / une organisation de test sur **https://www.helloasso-sandbox.com**
   (environnement isolé, **aucune vraie transaction** — carte bancaire virtuelle).
2. Dans le back-office **sandbox** : *Mon compte → Intégrations et API* → générer le client API
   → récupérer **`clientId`** et **`clientSecret`**.
3. Créer une **campagne de test** (peu importe le type) : elle n'est utilisée que pour
   percevoir le paiement du Checkout.
4. Les endpoints sandbox (`https://api.helloasso-sandbox.com/oauth2/token` et `/v5`) sont
   déjà branchés automatiquement dès que `HELLOASSO_ENV=sandbox`.

Doc : <https://dev.helloasso.com/docs/obtenir-une-cl%C3%A9-api>

### Étape 2 — Compte de service Google (Sheets + Drive optionnel)

1. **Console GCP** (console.cloud.google.com) → nouveau projet.
2. *APIs & Services* → **activer « Google Sheets API »**. Activer aussi **« Google Drive API »**
   uniquement si vous voulez collecter les **photos d'identité** (facultatif).
3. *IAM & Admin → Comptes de service* → créer un compte de service → onglet *Clés* →
   **Ajouter une clé → JSON** (un fichier `.json` se télécharge).
4. Créer (ou dupliquer) un **Google Sheet de test** dont la **1re ligne** reprend, à partir de
   la **colonne A**, les en-têtes de `FORM_COLUMNS` (`src/shared/config.js`) — ce sont les seules
   colonnes écrites par le site. La **dernière** est **Photo** — elle reçoit le **lien Drive** de la
   photo **envoyée en ligne** ; elle reste **vide** quand l'adhérent n'en a pas fourni (le champ est
   facultatif). Ces adhérents apportent leur photo au bureau : le bureau garde donc **sa propre**
   colonne de suivi photo (ex. « PHOTO reçue O/N ») à côté de ses autres colonnes de suivi
   (CERTIF MÉD, ABANDON, Grade…). Le bureau ajoute ces colonnes **à droite** du bloc « site », à la
   main : le code n'y touche jamais. Noter l'**id** du Sheet (dans l'URL).
   ⚠️ Sur un Sheet **déjà en service**, l'ajout de la colonne **Photo** rallonge le bloc « site » :
   insérez-la à sa position (juste après « Aide Pass'Sport »), sinon le lien photo écraserait la
   1re colonne de suivi du bureau (l'écriture est **positionnelle**). Le plus simple reste un
   **nouveau Sheet par saison** : les en-têtes, colonne Photo comprise, sont réécrits tout seuls.
5. **Partager** ce Sheet (bouton *Partager*, accès **Éditeur**) avec l'email du compte de
   service (`…@…iam.gserviceaccount.com`).
6. *(Optionnel — photos d'identité)* Créer un **dossier Google Drive** pour les photos, le
   **partager en Éditeur** avec le compte de service, et noter son **id** (partie après `/folders/`
   dans l'URL) → variable `GOOGLE_DRIVE_PHOTOS_FOLDER_ID`.
   ⚠️ Un compte de service n'a **pas de quota de stockage** propre : un dépôt dans un dossier de
   *Mon Drive* partagé peut échouer (« storage quota exceeded »). Le plus fiable est un **Drive
   partagé** (*Shared Drive*) dont le compte de service est membre (*Gestionnaire de contenu*) —
   le code gère déjà les Drive partagés (`supportsAllDrives`).

### Étape 3 — Remplir le `.env` local

```bash
cp .env.example .env
```

Renseigner : `HELLOASSO_ENV=sandbox`, les `HELLOASSO_CLIENT_ID/SECRET` sandbox,
`HELLOASSO_ORG_SLUG` (slug de l'orga sandbox), `GOOGLE_SHEET_ID`, et le compte de service.

Pour `GOOGLE_SERVICE_ACCOUNT_JSON`, le JSON multi-ligne passe mal : encoder en base64 et
préfixer par `base64:` (le code décode automatiquement) —

```bash
echo "base64:$(base64 -i chemin/vers/service-account.json)" | tr -d '\n'
```

### Étape 4 — Tester le flux complet en local (avec le webhook)

⚠️ **Le webhook HelloAsso doit joindre une URL publique** : `localhost` ne reçoit rien. Deux
options pour exposer le site pendant les tests :

```bash
netlify dev --live      # crée une URL publique temporaire (https://….netlify.live)
```

ou déployer une **preview Netlify**. Puis, dans le back-office **sandbox** (paramètres
développeur / notifications), déclarer l'**URL de notification** :

```
https://<url-publique>/api/helloasso-webhook
```

Mettre la même URL publique dans `SITE_URL`. Parcours de test :
1. Ouvrir le site, remplir une adhésion (tester mineur, puis majeur, puis majeur + Shido-Boxing).
2. Payer avec une **carte de test** sandbox.
3. Vérifier qu'une **ligne apparaît dans le Google Sheet** (colonnes « site » remplies,
   colonnes « bureau » vides, `PAIEMENT` renseigné). Un paiement abandonné ne crée aucune ligne.

### Étape 5 — Passage en production

1. Connecter le repo à **Netlify** (build `vite build`, publish `dist`, functions
   `netlify/functions` — déjà dans `netlify.toml`).
2. Renseigner les variables d'env Netlify — UI, ou en une fois : `netlify link` puis
   `netlify env:import .env`.
3. Basculer sur les valeurs **prod** : `HELLOASSO_ENV=prod`, `clientId/secret` de production,
   `SITE_URL` = l'URL réelle du site, Google Sheet **de production** partagé au compte de service
   (et, si les photos sont activées, le **dossier Drive de production** partagé + son
   `GOOGLE_DRIVE_PHOTOS_FOLDER_ID`).
4. Déclarer le **webhook prod** : `https://<site-prod>/api/helloasso-webhook`.
5. Après une **inscription réelle validée de bout en bout**, désactiver le Jotform.

## À faire à chaque début de saison

Presque toute la config saisonnière est dans **`src/shared/config.js`**. À l'ouverture
d'une nouvelle saison (ex. **2027-2028**), reprendre cette liste dans l'ordre, puis
`npm test` et redéployer.

1. **Titre de la saison** — remplacer l'année dans `src/index.html` (le `<title>` **et** le
   `<h1>`, ex. « Adhésion Stade Laurentin Karaté 2027-2028 »).

2. **Remise « inscription tardive »** (`LATE_SEASON_DISCOUNT`) — c'est l'opération liée au
   changement de titre ci-dessus. Mettre à jour :
   - `startDate` → **1er novembre** de la nouvelle saison (`'2027-11-01'`) ;
   - `endDate` → **fin des inscriptions**, en général **30 juin** suivant (`'2028-06-30'`).
   Entre `endDate` et le `startDate` suivant, la remise est **nulle** : les inscriptions de la
   nouvelle saison (juillet → octobre) paient donc plein tarif automatiquement, même si cette
   édition n'est pas faite dès le 1er juillet (il suffit qu'elle soit faite avant le 1er novembre).
   Vérifier aussi `stepAmount` (−20 €/mois) et `maxAmount` (`0` = pas de plafond).

3. **Tarifs / formules** (`OFFERS`) — prix annuels, liste des formules, `sessions` Cardio et
   tarifs des cours au Ticket (affichés dans `src/index.html`).

4. **Frais nouvel adhérent** (`NEW_MEMBER_FEE.amount`) — forfait ajouté d'office à toute
   première inscription (pas de colonne dédiée : déduit de la colonne « Nouvel adhérent »).

5. **Licences incluses** (`LICENSE_FEES`) — montants FFK (39 €) et Shidokan (20 €) affichés
   dans le détail du règlement. Shidokan est exclu du Cardio-Budo (`licenseFeesForOffer`).

6. **Aides** (`AIDS`) — Pass'Sport / PEPS (les barèmes changent chaque saison).

7. **Réduction famille** (`FAMILY_DISCOUNT`) — barème −50/−70/−100 €.

8. **Grades Shidokan** (`GRADES_SHIDOKAN`) — si la liste évolue.

9. **Liens vers les documents FFKarate** (`src/shared/docs.js`, `DOC_LINKS`) — la **note
   certificat médical** et les **annexes mineur** sont publiées chaque saison (l'URL contient
   l'année, ex. « …-2025-2026… »). Mettre aussi à jour les libellés « Note FFKarate 2025-2026 »
   dans `docs.js` **et** dans `src/merci.html` (liens en dur), ainsi que le lien du formulaire PEPS.
   Vérifier les liens **règlement intérieur / RGPD** (Google Drive) dans `src/index.html`.

10. **Google Sheet** — le plus simple est un **nouveau Sheet (ou un nouvel onglet) par saison**.
    Créer/dupliquer le registre, remettre les en-têtes `FORM_COLUMNS` en 1re ligne (le site les
    écrit tout seul si la feuille est vide), le **partager en Éditeur** au compte de service, puis
    mettre à jour `GOOGLE_SHEET_ID` / `GOOGLE_SHEET_TAB` dans les variables d'env Netlify.

11. **Vérifier & déployer** — `npm test` (doit être vert), puis pousser / redéployer sur Netlify.

## Points à confirmer avec le club (cherchez « À CONFIRMER » dans le code)

- **Tarifs / liste des formules** (`src/shared/config.js`, `OFFERS`) — repris de la capture
  HelloAsso 2025-2026 ; vérifier notamment l'existence d'un tarif « Karaté seul ».
- **Réduction famille** (`FAMILY_DISCOUNT`) — barème −50/−70/−100 € **implémenté** de façon
  incrémentale : chaque adhérent déclare combien de membres du foyer sont déjà inscrits, et la
  remise est répartie pour que le cumul = le barème (appliqué une seule fois). ⚠️ **Déclaratif** :
  repose sur l'honnêteté de la saisie ; le bureau peut recouper via le nom de famille dans le Sheet.
- **Montants des aides** (`AIDS`) — Pass'Sport 70 €, PEPS 30 € (à revérifier chaque saison).
  Le PEPS est aussi appelé « Prime Enfant ».
- **Moyens de paiement hors ligne** (`PAYMENT_METHODS`) — chèque, chèques vacances, espèces.
- **Cardio Budo = discipline de contact ?** (`DISCIPLINES.cardio.contact`) — défaut : non.
- **Colonnes ambiguës** : `Règlement intérieur` (auto) vs `REGLEMENT` (bureau) ; doublon
  éventuel `Documents coupon sport` vs `PEPS`/`PASS'SPORT`.
- **Vérifier le paiement 3x** (champ `terms` du Checkout) en sandbox.
