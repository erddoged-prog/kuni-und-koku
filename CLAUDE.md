# Kuni & Koku (国と石)

Rundenbasiertes Strategiespiel im Sengoku-Japan (TypeScript + Vite + Vitest). Eigenständiges Projekt,
**nicht** Teil von Krone & Korn – nichts aus dem Krone-&-Korn-Ordner hier verwenden und umgekehrt.
Sprache im Spiel, in Kommentaren und in Commit-Nachrichten: Deutsch.

## Starten und prüfen

```
npm install
npm run dev        # http://localhost:5173 (Claude: preview_start mit Name "kuni")
npm test           # Vitest – muss grün bleiben
npm run typecheck
npm run balance    # Siegquoten je Einheitenpaarung (scripts/balance.ts)
npm run kampagne   # KI gegen KI: Ø Provinzen und Siege je Clan (scripts/kampagne.ts)
```

Node liegt unter `C:\Program Files\nodejs` (in der Git-Bash ggf. `export PATH="$PATH:/c/Program Files/nodejs"`).

## Aufbau

- `src/data`     – Datenmodell & Config (Einheiten, Gebäude, Provinzen, Clans, Konter-Matrix, Startaufstellung)
- `src/sim`      – Kampfsimulation (deterministisch, geseedet)
- `src/campaign` – Runden, Wirtschaft, Bewegung, Belagerung, Diplomatie; jede Aktion liefert einen neuen Zustand
- `src/ai`       – Gegner-KI (`standard.ts`), eingehängt über `endTurn(state, ai)` und `new App(root, ai)` in `src/main.ts`
- `src/ui`       – Karte und Oberfläche:
  - `map.ts` zwei SVG-Ebenen: fester Hintergrund (einmal gezeichnet) und Vordergrund (bei jeder Aktion neu)
  - `painted.ts` malt das Land einmal per Canvas (Pinselstriche) als Bild
  - `ink.ts` Tusche-Ebenen: Meer, Seewege, Clan-Lasur, Grenzen, Goldwolken, Burgen, Jahreszeiten, Rahmen
  - `geometry.ts` Inselumrisse und Provinzflächen (Voronoi); Tests prüfen, dass Grenzen und Nachbarschaften passen
  - `app.ts` Steuerung, Spielfiguren ziehen (Pointer-Events), Speichern im Browser (`kuni-koku-…`)
- `scripts`      – Balancing- und Hilfsscripts

## Balancing

- Änderungen an Einheiten mit `npm run balance` prüfen (Ziel: bei gleichen Kosten 35–65 % im Schnitt).
- Änderungen an Clans/KI mit `npm run kampagne -- --spiele 48` messen – mit 24 Spielen schwanken die Werte stark.

## Git

- Eigenes Repo `erddoged-prog/kuni-und-koku`, Branch `main`.
- Commits mit der anonymen Adresse `erddoged-prog@users.noreply.github.com`.
