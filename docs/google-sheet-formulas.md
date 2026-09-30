# Formules du Google Sheet des inscriptions

Notes pour écrire et faire évoluer les onglets calculés du Sheet (Kodomo, etc.).
L'identifiant du Sheet n'est **pas** écrit ici (dépôt public) : c'est la variable
`GOOGLE_SHEET_ID` du `.env` local et de Netlify ; l'URL est
`https://docs.google.com/spreadsheets/d/<GOOGLE_SHEET_ID>/edit`.

## Onglets

| Onglet | Rôle |
|---|---|
| `Inscriptions` | Source. Écrit par le site (colonnes A→AC) + colonnes manuelles du bureau. **Ne jamais y mettre de formule ni de test.** |
| `Kodomo` | Karaté 6-9 ans. |
| `Karaté 10-13` | Karaté 10-13 ans. |
| `Karaté Adultes` | Karaté 14 ans et plus. |
| `Triathlon 8-13` | Triathlon 8-13 ans. |
| `Triathlon Adultes` | Triathlon 14 ans et plus. |

Chaque onglet de cours a les mêmes en-têtes (ligne 1, en gras) et **une seule
formule en A2**, identique à un jeu de paramètres près (voir « Décliner pour un
autre cours »).

Les onglets calculés sont en **lecture seule** : on saisit tout dans `Inscriptions`,
sinon la formule passe en `#REF!`.

## Colonnes de `Inscriptions` utilisées

Colonnes écrites par le site (ordre = `FORM_COLUMNS` dans `src/shared/config.js`) :

| Col. | Contenu | Format |
|---|---|---|
| B | Nouvel adhérent | `Oui` / `Non` |
| C | Prénom | |
| D | Nom | |
| E | Date de naissance | texte `AAAA-MM-JJ` |
| S | Section | libellé de l'offre, ex. `Karaté Shidokan + Shidokan Triathlon — Enfant / Ado` |
| Y | Paiement en ligne | `En ligne …`, `Prévu … en 3× …`, `Aucun paiement en ligne` |
| Z | Règlements hors ligne | `Chèque(s) : 265,00 € — à encaisser au bureau` ; le bureau **retire « à encaisser au bureau »** une fois encaissé |

Colonnes ajoutées à la main :

| Col. | Contenu |
|---|---|
| AD | Certificat médical |
| AE | Sikada (licence FFK prise) |
| AH | COURS — forçage du cours, voir ci-dessous |

Le site écrit en mode `RAW` : **tout est du texte**, y compris dates et montants.

## Règles métier

- **Âge** = année de début de saison − année de naissance (âge atteint dans l'année
  civile). La saison commence en juillet : de juillet 2026 à juin 2027, on compte
  sur 2026. Même règle que `ageInSeason` dans le code.
- **Karaté** = la Section contient « karat » (il n'existe pas d'offre « Karaté seul »).
- **Triathlon** = la Section contient « triathlon » : l'offre combinée
  « Karaté Shidokan + Shidokan Triathlon » **et** « Shidokan Triathlon » seul.
  Un membre de l'offre combinée apparaît donc dans un onglet karaté ET un onglet
  triathlon (sauf les 6-7 ans, trop jeunes pour le triathlon). Le Cardio n'apparaît nulle part.
- **Cours par défaut** (quand COURS est vide) :

  | Onglet | Section | Âge | Code COURS |
  |---|---|---|---|
  | `Kodomo` | karat | 6-9 | `karate_6-9` |
  | `Karaté 10-13` | karat | 10-13 | `karate_10-13` |
  | `Karaté Adultes` | karat | ≥ 14 | `karate_adultes` |
  | `Triathlon 8-13` | triathlon | 8-13 | `triathlon_8-13` |
  | `Triathlon Adultes` | triathlon | ≥ 14 | `triathlon_adultes` |

- **Colonne COURS (AH)** : si elle est remplie, elle **remplace entièrement** la règle
  par défaut, pour tous les onglets : le membre n'apparaît que dans les onglets dont
  le code figure dans la cellule. Codes séparés par des virgules, majuscules et
  espaces tolérés. Exemples :
  - un grand de 9 ans qui s'entraîne avec les 10-13 → `karate_10-13` ;
  - un enfant de l'offre combinée qui fait karaté 10-13 et triathlon →
    `karate_10-13,triathlon_8-13` (sinon il disparaît de l'onglet triathlon).
- Une date de naissance illisible exclut le membre de tous les onglets
  (garde `anneeNaiss>0`, sinon il serait compté comme adulte).
- **Statut de paiement** :
  - `Payé` : paiement en ligne (1× ou 3×, le 3× compte comme payé) et plus rien « à encaisser » en Z ;
  - `Hors ligne à encaisser` : Z contient encore « encaisser » ;
  - `À vérifier` : Y vide (ligne ajoutée à la main) ;
  - sinon le texte brut de Y (format inconnu).

## Pièges (constatés)

- **Paramètres régionaux France**, option « Toujours utiliser les noms de fonction en
  anglais » décochée → séparateur d'arguments `;`. On peut taper les noms anglais,
  ils sont traduits… **sauf collision** : `TRIM` est lu comme la fonction financière
  française `TRIM` (= MIRR). Utiliser `SUPPRESPACE` ou une regex
  (`REGEXMATCH(x; "^\s*$")` pour « vide ou espaces »).
- **`LET` + plages** : dans un `LET`, `REGEXMATCH` sur une colonne ou `nombre − colonne`
  ne renvoient qu'**une** valeur. Envelopper tout le `LET` dans `ARRAYFORMULA`,
  sinon `FILTER` échoue (« taille de plage incohérente »).
- **Déboguer** : `SIERREUR`/`IFERROR` masque la cause. Recopier la formule sans lui
  dans une cellule libre de l'onglet calculé, survoler l'erreur, puis effacer.
- `FILTER` sans résultat → `#N/A` « Aucune correspondance » (d'où le `IFERROR` final).

## Formule Kodomo (A2 de l'onglet `Kodomo`)

En-têtes en ligne 1 : `NOUVEAU | NOM | PRÉNOM | CERTIF MED | PAIEMENT | SIKADA`.

Version lisible :

```
=IFERROR(ARRAYFORMULA(LET(
  saison;     IF(MONTH(TODAY())>=7; YEAR(TODAY()); YEAR(TODAY())-1);
  anneeNaiss; MAP(Inscriptions!E2:E; LAMBDA(d; IFERROR(
                IF(ISNUMBER(d); YEAR(d);
                IF(MID(d;5;1)="-"; VALUE(LEFT(d;4)); VALUE(RIGHT(d;4))));
              0)));
  age;        saison - anneeNaiss;
  paiement;   MAP(Inscriptions!Y2:Y; Inscriptions!Z2:Z; LAMBDA(enLigne; horsLigne; LET(
                cb;     IFERROR(
                          IF(enLigne=""; "À vérifier";
                          IF(REGEXMATCH(enLigne; "^(En ligne|Prévu|Aucun paiement en ligne)"); "";
                          enLigne));
                        enLigne);
                bureau; IF(REGEXMATCH(horsLigne & ""; "encaisser"); "Hors ligne à encaisser"; "");
                reste;  TEXTJOIN(" + "; TRUE; cb; bureau);
                IF(reste = ""; "Payé"; reste))));
  cours;      Inscriptions!AH2:AH & "";
  parDefaut;  (REGEXMATCH(Inscriptions!S2:S & ""; "(?i)karat") * (age>=6) * (age<=9)) = 1;
  inclus;     IF(REGEXMATCH(cours; "^\s*$");
                parDefaut;
                REGEXMATCH(cours; "(?i)(^|,)\s*karate_6-9\s*(,|$)"));
  lignes;     HSTACK(Inscriptions!B2:B; Inscriptions!D2:D; Inscriptions!C2:C;
                     Inscriptions!AD2:AD; paiement; Inscriptions!AE2:AE);
  SORT(FILTER(lignes; inclus); 2; TRUE; 3; TRUE)
)); "Aucun kodomo")
```

Version sur une ligne (à coller dans la barre de formule — coller du texte
multi-lignes directement sur une cellule le répartit sur plusieurs lignes) :

```
=IFERROR(ARRAYFORMULA(LET(saison; IF(MONTH(TODAY())>=7; YEAR(TODAY()); YEAR(TODAY())-1); anneeNaiss; MAP(Inscriptions!E2:E; LAMBDA(d; IFERROR(IF(ISNUMBER(d); YEAR(d); IF(MID(d;5;1)="-"; VALUE(LEFT(d;4)); VALUE(RIGHT(d;4)))); 0))); age; saison - anneeNaiss; paiement; MAP(Inscriptions!Y2:Y; Inscriptions!Z2:Z; LAMBDA(enLigne; horsLigne; LET(cb; IFERROR(IF(enLigne=""; "À vérifier"; IF(REGEXMATCH(enLigne; "^(En ligne|Prévu|Aucun paiement en ligne)"); ""; enLigne)); enLigne); bureau; IF(REGEXMATCH(horsLigne & ""; "encaisser"); "Hors ligne à encaisser"; ""); reste; TEXTJOIN(" + "; TRUE; cb; bureau); IF(reste = ""; "Payé"; reste)))); cours; Inscriptions!AH2:AH & ""; parDefaut; (REGEXMATCH(Inscriptions!S2:S & ""; "(?i)karat") * (age>=6) * (age<=9)) = 1; inclus; IF(REGEXMATCH(cours; "^\s*$"); parDefaut; REGEXMATCH(cours; "(?i)(^|,)\s*karate_6-9\s*(,|$)")); lignes; HSTACK(Inscriptions!B2:B; Inscriptions!D2:D; Inscriptions!C2:C; Inscriptions!AD2:AD; paiement; Inscriptions!AE2:AE); SORT(FILTER(lignes; inclus); 2; TRUE; 3; TRUE))); "Aucun kodomo")
```

## Décliner pour un autre cours

Les autres onglets reprennent la formule Kodomo en ne changeant que trois choses :
`parDefaut`, le code cherché dans `inclus` et le texte de repli.

| Onglet | `parDefaut` | code dans `inclus` | repli |
|---|---|---|---|
| `Kodomo` | `(REGEXMATCH(Inscriptions!S2:S & ""; "(?i)karat") * (age>=6) * (age<=9)) = 1` | `karate_6-9` | `Aucun kodomo` |
| `Karaté 10-13` | `(REGEXMATCH(Inscriptions!S2:S & ""; "(?i)karat") * (anneeNaiss>0) * (age>=10) * (age<=13)) = 1` | `karate_10-13` | `Aucun enfant en karaté 10-13` |
| `Karaté Adultes` | `(REGEXMATCH(Inscriptions!S2:S & ""; "(?i)karat") * (anneeNaiss>0) * (age>=14)) = 1` | `karate_adultes` | `Aucun adulte en karaté` |
| `Triathlon 8-13` | `(REGEXMATCH(Inscriptions!S2:S & ""; "(?i)triathlon") * (anneeNaiss>0) * (age>=8) * (age<=13)) = 1` | `triathlon_8-13` | `Aucun enfant en triathlon 8-13` |
| `Triathlon Adultes` | `(REGEXMATCH(Inscriptions!S2:S & ""; "(?i)triathlon") * (anneeNaiss>0) * (age>=14)) = 1` | `triathlon_adultes` | `Aucun adulte en triathlon` |

`anneeNaiss>0` écarte les dates de naissance illisibles (année 0 → âge ≈ 2026,
donc « adulte »). Kodomo n'en a pas besoin (un âge de 2026 dépasse 9), mais on peut
l'ajouter par homogénéité.

Pour un nouveau cours : dupliquer un onglet (clic droit → Dupliquer), le renommer,
puis modifier ces trois éléments dans A2 ; ajouter le code dans le tableau des
règles métier ci-dessus.
