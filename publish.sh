#!/usr/bin/env bash
# Holt den Foliensatz S02 aus dem reports-Repo in dieses Repo -- in der Form,
# die eine statische Seite braucht.
#
# Drei Dinge macht das Skript, die ein `cp -r` nicht macht:
#
#   1. Es loest die Symlinks auf. Im reports-Repo zeigen theme/, lib/ und
#      reveal/ auf S00_main; eine Webseite kann einem Symlink nicht folgen.
#   2. Es kopiert aus Figures/ nur, was der Foliensatz wirklich laedt. Der
#      Ordner im reports-Repo traegt auch noch Material aus S01 -- unter
#      anderem die Personenfotos, die auf einer oeffentlichen Seite nichts
#      zu suchen haben.
#   3. Es prueft danach jede geladene Datei. Fehlt eine, bricht es ab, statt
#      eine Seite mit leeren Kaesten zu veroeffentlichen.
#
# Die .html der Version wird dabei nicht angefasst: sie liegt hier unter
# demselben Pfad wie dort, damit ein Abgleich ein reines Kopieren bleibt und
# die relativen Pfade darin weiter stimmen. Die index.html im Wurzelverzeichnis
# verweist auf die jeweils neueste Version und wird hier erzeugt.
#
# Aufruf:  ./publish.sh [pfad/zum/reports-repo]     (Vorgabe: ../reports)

set -euo pipefail

hier=$(cd "$(dirname "$0")" && pwd)
reports=$(cd "${1:-$hier/../reports}" && pwd)
quelle=$reports/presentations/S02_first_results

[ -d "$quelle" ] || { echo "kein S02 unter $quelle" >&2; exit 1; }

# --- neueste Version: die mit der hoechsten Nummer, nicht die juengste Datei --
neueste=$(ls "$quelle"/versions/S02_v*.html \
          | sed 's#.*/S02_v\([0-9]\{1,\}\)_#\1 &#' \
          | sort -n -k1,1 | tail -1 | cut -d' ' -f2)
name=$(basename "$neueste")
echo "Version:  $name"

# --- Aufbau ------------------------------------------------------------------
rm -rf "$hier/versions" "$hier/Figures" "$hier/theme" "$hier/lib" "$hier/reveal"
mkdir -p "$hier/versions" "$hier/Figures"

cp "$quelle"/versions/S02_v*.html "$hier/versions/"

# Symlinks aufloesen (-L), damit hier echte Dateien liegen
cp -rL "$quelle/theme"  "$hier/theme"
cp -rL "$quelle/lib"    "$hier/lib"
cp -rL "$quelle/reveal" "$hier/reveal"

# Das Theme laedt die Logos ueber CSS, nicht ueber die .html -- die muessen mit.
# (cp -rL oben nimmt sie schon mit; die Zeile steht hier als Merkposten, falls
# theme/ einmal aufgeteilt wird.)

# --- nur die geladenen Figures ----------------------------------------------
anzahl=0
for datei in $(grep -ohE '(src|href)="\.\./Figures/[^"]+"' "$quelle"/versions/S02_v*.html \
               | sed 's#.*Figures/##; s#"##' | sort -u); do
  if [ -f "$quelle/Figures/$datei" ]; then
    cp "$quelle/Figures/$datei" "$hier/Figures/"
    anzahl=$((anzahl + 1))
  else
    echo "FEHLT in der Quelle: Figures/$datei" >&2
    exit 1
  fi
done
echo "Figures:  $anzahl Dateien"

# --- Einstiegsseite ----------------------------------------------------------
cat > "$hier/index.html" <<HTML
<!doctype html>
<meta charset="utf-8">
<title>COSMIC: first results</title>
<meta http-equiv="refresh" content="0; url=versions/$name">
<body style="background:#1c1c1c; color:#d9d9d9; font-family:system-ui, sans-serif;
             margin:0; display:grid; place-items:center; height:100vh">
  <p><a href="versions/$name" style="color:#7ba7d7">COSMIC: first results &rarr;</a></p>
</body>
HTML

touch "$hier/.nojekyll"

# --- Gegenprobe: laedt die Seite etwas, das hier nicht liegt? ----------------
fehler=0
for ziel in $(grep -ohE '(src|href)="[^"]+"' "$hier"/versions/*.html \
              | sed 's/.*="//; s/"//' | sort -u); do
  case $ziel in http*|data:*|\#*) continue;; esac
  [ -e "$hier/versions/$ziel" ] || { echo "geladen, aber nicht vorhanden: $ziel" >&2; fehler=1; }
done
[ "$fehler" -eq 0 ] || exit 1

echo "Groesse:  $(du -sh "$hier" --exclude=.git | cut -f1)"
echo "fertig.   Einstieg: index.html -> versions/$name"
