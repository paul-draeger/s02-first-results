# S02 — COSMIC: first results

Der Foliensatz S02 als statische Seite, fertig für GitHub Pages.

Der Inhalt wird hier **nicht bearbeitet.** Er entsteht in
`reports/presentations/S02_first_results/` und kommt über `publish.sh` hierher.
Wer hier eine Folie ändert, verliert die Änderung beim nächsten Abgleich.

## Abgleichen

```sh
./publish.sh                 # sucht ../reports
./publish.sh /pfad/zu/reports
```

Das Skript nimmt die Version mit der höchsten Nummer, löst die Symlinks auf
(`theme`, `lib`, `reveal` zeigen im reports-Repo auf `S00_main`; einem Symlink
kann eine Webseite nicht folgen), kopiert aus `Figures/` nur, was der
Foliensatz wirklich lädt, und erzeugt die `index.html`, die auf die neueste
Version weiterleitet. Zum Schluss prüft es jede geladene Datei und bricht ab,
wenn eine fehlt — eine Seite mit leeren Kästen soll gar nicht erst entstehen.

Danach wie üblich `git add -A`, committen, pushen.

## Pages einschalten

Settings → Pages → Source: *Deploy from a branch*, Branch `main`, Ordner `/`.
Die `.nojekyll` liegt schon da, damit die Dateien unverändert ausgeliefert
werden. Die Seite steht dann unter

    https://<konto>.github.io/s02-first-results/

## Bevor das öffentlich geht

Eine GitHub-Pages-Seite ist öffentlich, auch aus einem privaten Repo — private
Seiten gibt es nur mit Enterprise. Damit sind weltweit lesbar:

* der Arbeits- und Zeitplan mit den Meilensteinen,
* die bisher unveröffentlichten Simulationsergebnisse,
* das Foto des Behälters, das aus Dalmon et al. (2019) stammt. Es in einem
  Vortrag zu zeigen ist etwas anderes, als es auf eine öffentliche Webseite zu
  stellen; für die Nutzungsrechte ist der Verlag zuständig.

Die Personenfotos aus S01 kommen nicht mit: `publish.sh` kopiert nur, was
dieser Foliensatz lädt.

## Was hier liegt

| | |
|---|---|
| `index.html` | Weiterleitung auf die neueste Version (erzeugt) |
| `versions/` | die Foliensätze, unverändert aus dem reports-Repo |
| `Figures/` | nur die geladenen Bilder und Videos (17 Dateien) |
| `theme/`, `lib/`, `reveal/` | aufgelöste Kopien aus `S00_main` |
| `publish.sh` | der Abgleich |
