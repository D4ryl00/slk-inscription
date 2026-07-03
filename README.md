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

## Configuration (variables d'environnement)

Copier `.env.example` en `.env` (local) ou renseigner dans **Netlify → Site settings →
Environment variables** (prod). Ne jamais committer de secret.

| Variable | Rôle |
|---|---|
| `HELLOASSO_CLIENT_ID` / `HELLOASSO_CLIENT_SECRET` | Client API HelloAsso (admin de l'asso) |
| `HELLOASSO_ORG_SLUG` | slug de l'organisation (URL HelloAsso) |
| `HELLOASSO_ENV` | `sandbox` (tests) ou `prod` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON de la clé du compte de service (ou `base64:…`) |
| `GOOGLE_SHEET_ID` | id du Sheet (entre `/d/` et `/edit`) |
| `GOOGLE_SHEET_TAB` | nom de l'onglet (défaut « Feuille 1 ») |
| `SITE_URL` | URL publique (construit les returnUrl/backUrl/errorUrl) |

### Créer le compte de service Google (API Sheets uniquement)

1. Console GCP → nouveau projet → **activer « Google Sheets API »** (pas Drive).
2. IAM & Admin → *Comptes de service* → créer → générer une **clé JSON**.
3. Coller le contenu du JSON dans `GOOGLE_SERVICE_ACCOUNT_JSON` (une ligne, ou base64).
4. **Partager le Google Sheet** (bouton *Partager*, accès *Éditeur*) avec l'email du
   compte de service (`…@…iam.gserviceaccount.com`).

### HelloAsso

1. Espace admin de l'asso → *Développeur/API* → générer `clientId`/`clientSecret`.
2. Déclarer l'**URL de notification (webhook)** : `https://<votre-site>/api/helloasso-webhook`.
3. Pour tester : utiliser l'environnement **sandbox** (`HELLOASSO_ENV=sandbox`) et les
   identifiants sandbox + une carte de test.

## Développement local

```bash
npm install
npm test          # tests du calcul de prix et du mapping des colonnes
npm run dev       # netlify dev → http://localhost:8888
```

`npm run dev` sert le front et les fonctions. Sans identifiants HelloAsso, `create-checkout`
renvoie 502 (l'appel HelloAsso échoue) — c'est normal ; renseigner `.env` pour aller au bout.

## Déploiement (Netlify)

1. Pousser le repo sur GitHub, connecter le site à Netlify (ou `netlify deploy`).
2. Build command `vite build`, publish `dist`, functions `netlify/functions` (déjà dans
   `netlify.toml`).
3. Renseigner les variables d'environnement.
4. Basculer `HELLOASSO_ENV=prod`, déclarer le webhook prod, désactiver le Jotform après une
   première inscription réelle validée de bout en bout.

## Points à confirmer avec le club (cherchez « À CONFIRMER » dans le code)

- **Tarifs / liste des formules** (`src/shared/config.js`, `OFFERS`) — repris de la capture
  HelloAsso 2025-2026 ; vérifier notamment l'existence d'un tarif « Karaté seul ».
- **Réduction famille** (`FAMILY_DISCOUNT`) — désactivée par défaut, formule à définir.
- **Montants des aides** PEPS / Pass'Sport (`AIDS`) — à confirmer chaque saison.
- **Cardio Budo = discipline de contact ?** (`DISCIPLINES.cardio.contact`) — défaut : non.
- **Colonnes ambiguës** : `Règlement intérieur` (auto) vs `REGLEMENT` (bureau) ; doublon
  éventuel `Documents coupon sport` vs `PEPS`/`PASS'SPORT`.
- **Vérifier le paiement 3x** (champ `terms` du Checkout) en sandbox.
