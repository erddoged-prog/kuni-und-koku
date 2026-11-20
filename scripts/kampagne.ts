// Kampagnen-Balancing: lässt die KI viele Spiele allein spielen und zeigt,
// wie viele Provinzen jeder Clan im Schnitt hält und wie oft er gewinnt.
//
//   npm run kampagne                 24 Spiele à 40 Runden
//   npm run kampagne -- --spiele 48 --runden 60
//
// Der Spieler-Clan zieht nicht; deshalb wechselt er zwischen drei Clans,
// und jeder Clan wird nur in den Spielen gezählt, in denen die KI ihn führt.
import { CLANS, PLAYABLE_CLAN_IDS } from '../src/data';
import { createInitialState, endTurn, provincesOf } from '../src/campaign';
import { standardAi } from '../src/ai';

const args = process.argv.slice(2);
const opt = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const games = opt('spiele', 24);
const rounds = opt('runden', 40);
const players = ['akagane', 'kurogane', 'aoyama'];

const provs: Record<string, number[]> = {};
const wins: Record<string, number> = {};
const t0 = Date.now();
for (let g = 0; g < games; g++) {
  const player = players[g % players.length];
  let s = createInitialState(player, 31 * (Math.floor(g / players.length) + 1));
  for (let i = 0; i < rounds && !s.winner; i++) s = endTurn(s, standardAi).state;
  for (const c of PLAYABLE_CLAN_IDS) if (c !== player) (provs[c] ??= []).push(provincesOf(s, c).length);
  if (s.winner) wins[s.winner] = (wins[s.winner] ?? 0) + 1;
}

console.log(`Kampagne: ${games} Spiele à ${rounds} Runden, KI gegen KI (${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
console.log('Clan          Ø Provinzen   min–max   Siege');
for (const c of PLAYABLE_CLAN_IDS) {
  const list = provs[c] ?? [];
  const avg = list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
  console.log(`${CLANS[c].name.padEnd(14)}${avg.toFixed(1).padStart(11)}   ${`${Math.min(...list)}–${Math.max(...list)}`.padStart(7)}   ${String(wins[c] ?? 0).padStart(5)}`);
}
