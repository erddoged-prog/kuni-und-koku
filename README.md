# Kuni & Koku (国と石)

Rundenbasierter Strategie-Prototyp im Sengoku-Japan. Eigene Namen, Texte und Grafik.
Schlachten werden simuliert (keine Echtzeitkämpfe).

## Starten
```
npm install
npm run dev      # Spiel im Browser (http://localhost:5173)
npm test         # Vitest
npm run build    # statischer Build nach dist/
```

## Bedienung
- **Provinz anklicken** → Seitenleiste: Gebäude bauen, Truppen ausheben, Garnison, Armeen.
- **Banner anklicken** (oder „Bewegen“) → Zugziele leuchten: grün = eigenes Land, rot = Angriff.
- **Angriff** → Taktik wählen (Angreifen/Halten/Flankieren/Rückzug), die Berater schätzen die Siegchance.
- **Einheiten ankreuzen** → in neue Armee, Garnison oder andere Armee verlegen.
- **Bei Angriff** (Auswahl an der Armee) = Taktik, wenn die KI euch angreift.
- **Enter** = Runde beenden · **Esc** / Rechtsklick = Auswahl aufheben.
- Speichern/Laden (Browser-Speicher), Export/Import als JSON-Datei. Autosave nach jeder Aktion.

## Struktur
- `src/data`     – Datenmodell & Config (Einheiten, Gebäude, Provinzen, Clans, Konter-Matrix, Taktiken)
- `src/sim`      – Kampfsimulation (deterministisch, seeded RNG)
- `src/campaign` – Runden, Wirtschaft, Bewegung, Belagerung, Diplomatie
- `src/ai`       – Gegner-KI
- `src/ui`       – Karte (SVG, Voronoi-Provinzen) + HTML/CSS-Oberfläche
- `scripts`      – Balancing- und Hilfsscripts
