Tu reprends HORIZON PROTO 0.2.

Cette version n'est plus uniquement un test technique de chunks : elle doit être un PETIT PROTOTYPE MOBILE JOUABLE ET VISUELLEMENT COHÉRENT.

IMPORTANT
Ne détruis pas la direction artistique existante pour repartir sur un template générique. Inspecte et améliore la base.

OBJECTIFS À VALIDER
- Android tactile prioritaire.
- Three.js léger.
- 25 chunks actifs environ autour du joueur.
- Nouveaux chunks générés pendant l'exploration.
- Chunks éloignés réellement retirés de la scène.
- Monde visuellement low-poly cohérent.
- Joystick tactile.
- Course.
- Caméra rotative au doigt sur la partie droite.
- Animation du personnage.
- Eau, soleil, brouillard et biomes.
- Sauvegarde locale seed + position.
- Aucun backend.
- Aucun compte.
- Aucune API payante.

TA MISSION
1. Inspecte tous les fichiers.
2. Lance le projet.
3. Corrige toute erreur de syntaxe, import, WebGL ou runtime.
4. Vérifie l'affichage mobile.
5. Vérifie les contrôles au tactile si l'environnement le permet.
6. Fais parcourir plusieurs chunks au personnage.
7. Confirme que les chunks éloignés sont détruits et que le nombre actif reste borné.
8. Vérifie qu'un rechargement reprend le même monde et la position sauvegardée.
9. Contrôle les performances et évite les ajouts lourds.
10. Si une optimisation est nécessaire, préfère InstancedMesh, mutualisation de géométries/matériaux et réduction de pixel ratio avant de réduire fortement la qualité visuelle.
11. Push sur le dépôt GitHub `horizon-proto`.
12. Si Vercel est authentifié, déploie en production et vérifie l'URL publique.

NE PAS FAIRE
- pas de React si ce n'est pas nécessaire ;
- pas de moteur physique lourd ;
- pas de backend ;
- pas de multijoueur ;
- pas de génération IA ;
- pas de textures lourdes ;
- pas de grande refonte architecturale ;
- pas de nouvelles fonctionnalités avant d'avoir vérifié la V0.2.

RÉPONSE FINALE OBLIGATOIRE

HORIZON 0.2 : PASS / FAIL
AFFICHAGE MOBILE : PASS / FAIL
JOYSTICK : PASS / FAIL
CAMÉRA : PASS / FAIL
ANIMATION : PASS / FAIL
CHUNKS GÉNÉRATION : PASS / FAIL
CHUNKS DÉCHARGEMENT : PASS / FAIL
SAUVEGARDE : PASS / FAIL
PERFORMANCES : FPS ou NON MESURABLE
GITHUB : URL / NON DISPONIBLE
VERCEL : URL / NON DÉPLOYÉ
BLOQUANTS : AUCUN ou liste courte
