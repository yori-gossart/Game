#!/bin/sh
# Copie le dépôt dans un instantané servi sur un autre port.
#
# Les bancs longs (prologue07 : trois parcours, plus d'une heure d'horloge sous
# SwiftShader) chargent la page à chaque parcours. Éditer le dépôt pendant ce
# temps fait tourner les parcours suivants sur un code différent — et le
# résultat ne veut plus rien dire. On mesure donc sur un instantané figé, et on
# continue d'écrire dans le dépôt.
#
#   sh tests/_snapshot.sh 8124        # copie + sert sur 8124
#   BASE_URL=http://127.0.0.1:8124 node tests/prologue07.mjs
set -e
PORT="${1:-8124}"
DEST="${SNAP_DIR:-/tmp/fognomad-snap}"
rm -rf "$DEST"
mkdir -p "$DEST"
tar -c --exclude=.git --exclude=.shots --exclude=node_modules . | tar -x -C "$DEST"
cd "$DEST"
(python3 -m http.server "$PORT" >/dev/null 2>&1 &)
sleep 1
echo "instantané servi : http://localhost:$PORT  ($DEST)"
