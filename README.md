# Inscription SLK — Stade Laurentin Karaté Shidokan

Site d'adhésion en ligne : formulaire sur-mesure (tarifs conditionnels par section,
paiement 1x/3x, aides PEPS/Pass'Sport déduites), **paiement CB via HelloAsso Checkout**,
et enregistrement automatique de l'adhérent dans un **Google Sheet** après paiement.

- **Front** statique (Vite) hébergé sur Netlify
- **Fonctions** serverless Netlify (détiennent les secrets)
- **HelloAsso Checkout** = caisse CB (gratuit)
- **Google Sheet** = registre des adhérents (API Sheets seule, pas de Drive)

> Aucun document n'est collecté en ligne : le formulaire informe des pièces à rapporter
> au bureau (attestation mineur / certificat majeur / fond d'œil+ECG pour les disciplines
> de contact / justificatif d'aide). Le suivi des pièces reste manuel dans le Sheet.

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
          └─ APPEND la ligne dans le Google Sheet, puis purge le blob
```

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
    sheet-row.js   mapping soumission+paiement → 39 colonnes
netlify/functions/
  create-checkout.js · helloasso-webhook.js
  lib/helloasso.js   OAuth + checkout-intent + vérification paiement
  lib/google.js      Google Sheets (append + déduplication)
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

### Étape 2 — Compte de service Google (API Sheets uniquement)

1. **Console GCP** (console.cloud.google.com) → nouveau projet.
2. *APIs & Services* → **activer « Google Sheets API »** (surtout **pas** l'API Drive).
3. *IAM & Admin → Comptes de service* → créer un compte de service → onglet *Clés* →
   **Ajouter une clé → JSON** (un fichier `.json` se télécharge).
4. Créer (ou dupliquer) un **Google Sheet de test** dont la **1re ligne** reprend, à partir de
   la **colonne A**, les en-têtes de `FORM_COLUMNS` (`src/shared/config.js`) — ce sont les seules
   colonnes écrites par le site. Le bureau peut ajouter **à droite**, à la main, ses propres
   colonnes de suivi (CERTIF MÉD, PHOTO, ABANDON, Grade…) : le code n'y touche jamais. Noter
   l'**id** du Sheet (dans l'URL).
5. **Partager** ce Sheet (bouton *Partager*, accès **Éditeur**) avec l'email du compte de
   service (`…@…iam.gserviceaccount.com`).

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
   `SITE_URL` = l'URL réelle du site, Google Sheet **de production** partagé au compte de service.
4. Déclarer le **webhook prod** : `https://<site-prod>/api/helloasso-webhook`.
5. Après une **inscription réelle validée de bout en bout**, désactiver le Jotform.

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
