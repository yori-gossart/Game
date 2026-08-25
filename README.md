# Horizon Proto 0.2

Deuxième prototype mobile de **Horizon**, un petit monde 3D procédural qui est généré par morceaux autour du joueur.

## Nouveautés 0.2

- première direction artistique low-poly ;
- palette et biomes distincts ;
- eau ;
- soleil visible et profondeur atmosphérique ;
- personnage plus identifiable avec sac à dos ;
- animation marche/course ;
- joystick tactile ;
- caméra orientable en glissant sur la partie droite de l'écran ;
- terrain procédural en chunks ;
- création/destruction dynamique des chunks ;
- arbres, rochers et petites fleurs procéduraux ;
- sauvegarde locale de la seed, position et orientation de caméra ;
- adaptation légère de la résolution si les FPS sont faibles ;
- Three.js 0.185.1.

## Principe de performance

Le monde entier n'existe jamais comme géométrie active.

Seuls 5 × 5 chunks autour du joueur sont gardés en scène, soit environ 25 chunks. Lorsque le joueur change de zone, les nouveaux chunks sont générés et les chunks devenus trop éloignés sont supprimés.

## Test

Le projet doit être servi via HTTP/HTTPS.

Il est directement adapté à un hébergement statique Vercel.

## Objectif de la prochaine version

La 0.3 ne devrait pas simplement ajouter plus de décor.

Priorité suggérée :
1. premier PNJ autonome ;
2. besoins/états simples ;
3. interaction joueur-PNJ ;
4. persistance d'une modification apportée à un chunk ;
5. premier objectif de jeu.
