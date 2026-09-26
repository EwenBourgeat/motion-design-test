# L'Intendant — Conciergerie Toulouse · Pub Meta 20 s

Motion design vertical **1080×1920 (9:16), 30 i/s, 20 s**, pensé pour Reels, Stories et le fil Meta.
Rendu final : `out/intendant-meta-20s.mp4` (avec son) et `out/intendant-meta-20s-muet.mp4`.

Tout est fait maison : **aucun Remotion ni HyperFrames**. Une page HTML/CSS est animée par un
moteur JS déterministe (chaque propriété est une fonction pure du temps). Chromium en mode headless
la capture image par image, puis ffmpeg l'encode.

## Le film

| Temps | Scène | Rôle |
|---|---|---|
| 0–3 s | **« Propriétaire à Toulouse ? »** : des notifications s'empilent (voyageur à 23 h 47, ménage annulé, avis 3★, code du portail…), la caméra tremble | Hook : on interpelle l'audience, on montre la charge mentale |
| 3–6,5 s | Un volet balaie tout. **« On s'occupe de l'annonce / des voyageurs / du ménage / du linge / des check-in / des prix / de tout. »** puis **« Vous percevez. »** | Soulagement : la promesse du site |
| 6,5–12,5 s | Compteur à rouleaux : **×3** → **+25 %** → **90 %** → **4,82/5**, avec barres, calendrier 27/30 nuits et étoiles | Preuves (chiffres du site) |
| 12,5–15 s | Mur des quartiers (Capitole, Carmes, Saint-Cyprien… Blagnac, Colomiers…) → **« Une équipe toulousaine. »** + 5,0 sur Google | Ancrage local |
| 15–20 s | **« Estimation gratuite sous 48 h. Sans engagement. Vous ne payez que si votre bien rapporte. »**, logo et bouton **Estimer mon bien** | Offre + CTA |

Transitions en continuité : le × pivote en +, les chiffres roulent de 3 à 25, puis 90, puis 4,82,
le surligneur miel envahit l'écran, le volet oblique suit le geste du balayage des notifications.

**Charte** : Dark Slate Grey `#335C67`, Vanilla Custard `#FFF3B0`, Honey Bronze `#E09F3E`,
Brown Red `#9E2A2B`, Black Cherry `#540B0E`. Le rouge brique porte la scène Toulouse (la ville rose).
**Typographies** (libres, OFL) : Archivo (variable, condensée), Instrument Serif, JetBrains Mono.

**Zones de sécurité Meta** : les textes clés tiennent entre y≈285 et y≈1300. Le haut (≈14 %) et
le bas (≈35 %) de l'écran, recouverts par l'interface Reels, ne portent que de la texture.

**Son** : 100 % synthétisé (`scripts/audio.py`). Piano électrique FM, basse, kick, clap, à 120 BPM
en ré mineur qui se résout en fa majeur au logo. Les bruitages sont calés à l'image : un ping par
notification, un clic par chiffre qui passe au compteur, un arpège pour le calendrier, un cliquetis
par quartier qui défile. Le mix est normalisé à −14 LUFS / −1,5 dBTP.

## Rendu

```bash
npm install                      # polices + playwright (Chromium préinstallé)
pip install numpy scipy imageio-ffmpeg

node scripts/render.mjs --stills 2.3,9,19.5   # images clés → out/stills/
node scripts/render.mjs --preview --no-audio  # aperçu rapide 540×960 → out/preview.mp4
python3 scripts/audio.py                      # bande son → build/audio.wav
node scripts/render.mjs                       # final : flou de mouvement, H.264 + AAC
```

Le rendu final moyenne **8 sous-images par image** (obturateur à 180°) pour obtenir un vrai flou de
mouvement. Il tourne sur 4 workers en parallèle. L'encodage suit les recommandations Meta : H.264
High, yuv420p, BT.709, AAC 48 kHz, `+faststart`.

Aperçu en direct dans un navigateur : `npm run preview` puis ouvrir `http://localhost:5173/?play`
(ou `?t=9.5` pour figer une image).

## Fichiers

- `src/index.html`, `src/style.css` : la scène et le système typographique
- `src/main.js` : la timeline et les 5 scènes (constantes `T` = repères temporels)
- `scripts/render.mjs` : capture Chromium → ffmpeg (sous-images, segments parallèles, encodage)
- `scripts/audio.py` : musique et bruitages synchronisés sur `build/cues.json`
