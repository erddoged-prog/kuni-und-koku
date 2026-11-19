// HTML für Dialoge (Modals). Die Logik (Klicks) liegt in app.ts.
import { CAMPAIGN, CLANS, CLAN_IDS, NEUTRAL_CLAN, PLAYABLE_CLAN_IDS, PROVINCES, TACTICS, TACTIC_IDS, UNIT_TYPES } from '../data';
import type { GameState, ProvinceId, Tactic } from '../data/types';
import { AGENT_TYPES, armiesIn, clanStrength, isAlive, provincesOf, relation, type BattleRecord } from '../campaign';
import { esc, stars, terrainName } from './format';
import { monSvg } from './mon';

export function startDialog(hasAutosave: boolean, hasSlot: boolean): string {
  return `<div class="dialog start">
    <h1><span class="seal-lg">国</span> Kuni &amp; Koku <small>国と石</small></h1>
    <p class="lead">Japan, im Zeitalter der streitenden Reiche. Der Hof in Kyōto ist machtlos, die Provinzen gehören dem, der sie halten kann.
      Wer Kyōto und ${CAMPAIGN.victoryProvinces} Provinzen beherrscht – oder alle Rivalen vernichtet –, eint das Reich.</p>
    ${hasAutosave || hasSlot ? `<div class="row">${hasAutosave ? '<button class="primary" data-action="continue">Weiterspielen (Autosave)</button>' : ''}
      ${hasSlot ? '<button data-action="load">Gespeichertes Spiel laden</button>' : ''}<button data-action="import">Spielstand importieren…</button></div>` : '<div class="row"><button data-action="import">Spielstand importieren…</button></div>'}
    <h2>Wählt euren Clan</h2>
    <div class="clan-grid">${PLAYABLE_CLAN_IDS.map((c) => {
      const d = CLANS[c];
      return `<button class="clan-card" data-action="pick-clan" data-clan="${c}" style="--clan:${d.color};--accent:${d.accent}">
        ${monSvg(c, 64)}<b>${esc(d.name)} <span class="kanji-lg">${d.kanji}</span></b>
        <span class="desc">${esc(d.description)}</span>
        <span class="dim">${d.startProvinces.map((p) => esc(PROVINCES[p].name)).join(' · ')}</span></button>`;
    }).join('')}</div>
  </div>`;
}

export interface TacticOdds {
  tactic: Tactic;
  /** Siegchance 0–1, oder undefined wenn kein Kampf zu erwarten ist. */
  chance?: number;
}

export function tacticDialog(s: GameState, armyId: string, target: ProvinceId, odds: TacticOdds[], kind: 'move' | 'assault'): string {
  const a = s.armies[armyId];
  const prov = s.provinces[target];
  const enemies = armiesIn(s, target).filter((e) => e.owner !== a.owner);
  const garrisonMen = prov.garrison.reduce((x, u) => x + u.men, 0);
  const castle = prov.buildings.castle ?? 0;
  const lines: string[] = [];
  for (const e of enemies) lines.push(`${monSvg(e.owner, 18)} ${esc(e.general.name)} ${stars(e.general.stars)} – ${e.units.length} Einheiten, ${e.units.reduce((x, u) => x + u.men, 0)} Mann`);
  if (garrisonMen) lines.push(`Garnison: ${prov.garrison.length} Einheiten, ca. ${garrisonMen} Mann${castle ? ` hinter Mauern (${esc(['', 'Palisade', 'Bergburg', 'Hauptburg'][castle])})` : ''}`);
  const verdict = (c?: number) =>
    c === undefined ? '<span class="dim">kein Kampf</span>'
      : c >= 0.8 ? `<span class="pos">sehr günstig (~${pct(c)})</span>`
      : c >= 0.6 ? `<span class="pos">günstig (~${pct(c)})</span>`
      : c >= 0.4 ? `<span>offen (~${pct(c)})</span>`
      : c >= 0.2 ? `<span class="neg">ungünstig (~${pct(c)})</span>`
      : `<span class="neg">aussichtslos (~${pct(c)})</span>`;
  const noFight = odds.every((o) => o.chance === undefined);
  return `<div class="dialog tactic">
    <h2>${kind === 'assault' ? 'Sturm auf die Burg von' : 'Angriff auf'} ${esc(PROVINCES[target].name)}</h2>
    <p class="dim">Gelände: ${terrainName(PROVINCES[target].terrain)} · Herr: ${esc(CLANS[prov.owner].name)}</p>
    <div class="forces"><div><h4>Eure Armee</h4>${esc(a.general.name)} ${stars(a.general.stars)}<br>${a.units.length} Einheiten, ${a.units.reduce((x, u) => x + u.men, 0)} Mann</div>
      <div><h4>Gegner</h4>${lines.length ? lines.join('<br>') : '<span class="dim">Keine Truppen.</span>'}</div></div>
    ${noFight ? `<p>${castle && garrisonMen ? 'Die Garnison verschanzt sich – eure Armee beginnt eine Belagerung.' : 'Kein Widerstand zu erwarten.'}</p>
      <div class="row"><button class="primary" data-action="do-attack" data-tactic="attack">Vorrücken</button><button data-action="close">Abbrechen</button></div>`
      : `<p>Wählt die Taktik. Die Berater schätzen die Lage so ein:</p>
    <div class="tactics">${TACTIC_IDS.map((t) => {
      const o = odds.find((x) => x.tactic === t);
      return `<button class="tactic-btn" data-action="do-attack" data-tactic="${t}"><b>${TACTICS[t].name}</b><span>${esc(TACTICS[t].description)}</span><span class="odds">${verdict(o?.chance)}</span></button>`;
    }).join('')}</div>
    <div class="row"><button data-action="close">Abbrechen</button></div>`}
  </div>`;
}

const pct = (x: number) => `${Math.round(x * 10) * 10} %`;

export function battleReportDialog(s: GameState, battles: BattleRecord[]): string {
  return `<div class="dialog report">${battles.map((b) => battleReport(s, b)).join('<hr>')}
    <div class="row"><button class="primary" data-action="close">Schließen</button></div></div>`;
}

function battleReport(s: GameState, b: BattleRecord): string {
  const r = b.result;
  const me = s.playerClan;
  const won = (r.winner === 'attacker' ? b.attacker : b.defender) === me;
  const involved = b.attacker === me || b.defender === me;
  const sideTable = (side: 'attacker' | 'defender') => {
    const clan = side === 'attacker' ? b.attacker : b.defender;
    const o = r[side];
    return `<div class="side"><h4>${monSvg(clan, 22)} ${esc(CLANS[clan].name)} ${side === 'attacker' ? '(Angreifer)' : '(Verteidiger)'}</h4>
      <table><tr><th>Einheit</th><th>vorher</th><th>nachher</th><th>gefallen</th><th>gefangen</th></tr>
      ${o.units.map((u) => `<tr class="${u.routed ? 'routed' : ''}"><td>${esc(UNIT_TYPES[u.type].name)}${u.routed ? ' <i>(geflohen)</i>' : ''}</td><td>${u.menBefore}</td><td>${u.menAfter}</td><td>${u.killed}</td><td>${u.captured}</td></tr>`).join('')}
      <tr class="sum"><td>Summe</td><td>${o.totalBefore}</td><td>${o.totalAfter}</td><td>${o.killed}</td><td>${o.captured}</td></tr></table>
      <div class="dim">General-Erfahrung +${o.generalXp}</div></div>`;
  };
  return `<h2 class="${involved ? (won ? 'pos' : 'neg') : ''}">${b.kind === 'assault' ? 'Sturm auf' : 'Schlacht um'} ${esc(PROVINCES[b.province].name)}
      ${involved ? (won ? '– Sieg!' : '– Niederlage') : ''}</h2>
    ${r.report.filter((p) => p.id !== 'result').map((p) => `<div class="phase"><h4>${esc(p.title)}</h4>${p.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`).join('')}
    <div class="sides">${sideTable('attacker')}${sideTable('defender')}</div>`;
}

export function turnSummaryDialog(events: string[], playerBattles: number): string {
  return `<div class="dialog summary"><h2>${esc(events.length ? 'Ereignisse der Runde' : 'Eine ruhige Jahreszeit')}</h2>
    <div class="events">${events.map((e) => `<p>${esc(e)}</p>`).join('') || '<p class="dim">Nichts Bemerkenswertes.</p>'}</div>
    <div class="row">${playerBattles ? `<button data-action="show-turn-battles">Schlachtberichte (${playerBattles})</button>` : ''}<button class="primary" data-action="close">Weiter</button></div></div>`;
}

export function diplomacyDialog(s: GameState): string {
  const me = s.playerClan;
  const myStr = clanStrength(s, me);
  const rows = CLAN_IDS.filter((c) => c !== me && c !== NEUTRAL_CLAN).map((c) => {
    const alive = isAlive(s, c);
    const r = relation(s, me, c);
    const ratio = clanStrength(s, c) / Math.max(1, myStr);
    const strength = ratio > 1.5 ? 'weit stärker' : ratio > 1.1 ? 'stärker' : ratio > 0.9 ? 'ebenbürtig' : ratio > 0.6 ? 'schwächer' : 'weit schwächer';
    const state = r.state === 'war' ? '<span class="neg">Krieg</span>' : r.state === 'alliance' ? '<span class="pos">Bündnis</span>' : 'Frieden';
    const bar = `<span class="relbar"><span style="left:50%;width:${Math.abs(r.value) / 2}%;${r.value < 0 ? `transform:translateX(-100%);background:#a8261c` : 'background:#4e7a32'}"></span></span>`;
    const actions = !alive ? '<span class="dim">vernichtet</span>' : [
      r.state !== 'war' ? `<button class="small danger" data-action="dip" data-op="war" data-clan="${c}">Krieg erklären</button>` : '',
      r.state === 'war' ? `<button class="small" data-action="dip" data-op="peace" data-clan="${c}">Frieden anbieten</button>` : '',
      r.state === 'peace' ? `<button class="small" data-action="dip" data-op="alliance" data-clan="${c}">Bündnis anbieten</button>` : '',
      r.state === 'alliance' ? `<button class="small" data-action="dip" data-op="break" data-clan="${c}">Bündnis lösen</button>` : '',
      `<button class="small" data-action="dip" data-op="gift" data-clan="${c}" title="200 Koku schenken">Geschenk (200)</button>`,
    ].join('');
    return `<tr class="${alive ? '' : 'dead'}"><td>${monSvg(c, 26)}</td><td><b>${esc(CLANS[c].name)}</b><br><span class="dim">${provincesOf(s, c).length} Provinzen · ${strength}</span></td>
      <td>${state}</td><td title="Beziehung ${r.value}">${bar} ${r.value}</td><td class="actions">${actions}</td></tr>`;
  }).join('');
  const agents = Object.values(AGENT_TYPES).map((a) => `<div class="agent"><span class="kanji-lg">${a.kanji}</span><div><b>${esc(a.name)}</b> <span class="dim">(${a.cost} Koku)</span><br>${esc(a.description)}<br>
    <span class="dim">Geplant: ${a.actions.map(esc).join(', ')}</span></div><button class="small" data-action="agent" data-kind="${a.kind}">Anwerben</button></div>`).join('');
  return `<div class="dialog diplomacy"><h2>外交 Diplomatie</h2>
    <p class="dim">Krieg erlaubt den Einmarsch. Verbündete eures Ziels treten dem Krieg bei. Unterlegene schließen eher Frieden; Bündnisse brauchen eine Beziehung ab ${CAMPAIGN.allianceThreshold}.</p>
    <table class="dip">${rows}</table>
    <h3>Agenten <span class="dim small">(Platzhalter im Prototyp)</span></h3><div class="agents">${agents}</div>
    <div class="row"><button class="primary" data-action="close">Schließen</button></div></div>`;
}

export function endDialog(s: GameState): string {
  const won = s.winner === s.playerClan;
  return `<div class="dialog end"><h1>${won ? '天下統一 – Das Reich ist geeint!' : 'Euer Haus ist gefallen.'}</h1>
    ${s.winner ? `<p>${monSvg(s.winner, 64)}</p><p>${esc(CLANS[s.winner].name)} herrschen über Japan.</p>` : '<p>Der Clan ' + esc(CLANS[s.playerClan].name) + ' existiert nicht mehr.</p>'}
    <div class="row"><button class="primary" data-action="newgame">Neues Spiel</button><button data-action="close">Karte ansehen</button></div></div>`;
}
