# Kuni & Koku (国と石)

Rundenbasierter Strategie-Prototyp im Sengoku-Japan. Eigene Namen, Texte und Grafik.
Schlachten werden simuliert (keine Echtzeitkämpfe).

```
npm install
npm run dev      # Spiel im Browser
npm test         # Vitest
```

## Struktur
- `src/data`     – Datenmodell & Config (Einheiten, Gebäude, Provinzen, Clans, Konter-Matrix, Taktiken)
- `src/sim`      – Kampfsimulation (deterministisch, seeded RNG)
- `src/campaign` – Runden, Wirtschaft, Bewegung, Belagerung, Diplomatie
- `src/ai`       – Gegner-KI
- `src/ui`       – Karte (SVG) + HTML/CSS-Oberfläche
- `scripts`      – Balancing-Script
