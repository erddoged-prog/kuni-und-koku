// HTML für Kopfleiste und Seitenleiste.
import { BUILDINGS, BUILDING_IDS, CAMPAIGN, CLANS, PROVINCES, SEASONS, TACTICS, TACTIC_IDS, UNIT_TYPES, UNIT_TYPE_IDS, seasonOf, yearOf } from '../data';
import type { Army, GameState, ProvinceId } from '../data/types';
import {
  armiesIn, armyMen, canBuild, canRecruit, clanIncome, clanUpkeep, kokuBonus, plannedLevel, provinceIncome, provincesOf, relation, supplyTurns,
} from '../campaign';
import { buildingLevelName, esc, koku, stars, terrainName, unitRow, unitTooltip } from './format';
import { monSvg } from './mon';

export interface PanelView {
  selectedProvince?: ProvinceId;
  selectedArmy?: string;
  checked: Set<string>;
}

export function renderTopbar(s: GameState): string {
  const me = s.playerClan;
  const season = seasonOf(s.turn);
  const income = clanIncome(s, me);
  const upkeep = clanUpkeep(s, me);
  const net = income - upkeep;
  return `<div class="brand"><span class="seal-lg">国</span> Kuni &amp; Koku</div>
  <div class="clan-badge">${monSvg(me, 30)} <b>${esc(CLANS[me].name)}</b></div>
  <div class="date" title="4 Runden = 1 Jahr"><span class="season-kanji">${season.kanji}</span> ${season.name} ${yearOf(s.turn, s.startYear)}</div>
  <div class="money" title="Einkommen ${income} − Unterhalt ${upkeep} (diese Jahreszeit)">${koku(s.clans[me].treasury)}
    <span class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${net}</span></div>
  <div class="provcount" title="Siegbedingung: Kyōto + ${CAMPAIGN.victoryProvinces} Provinzen">領 ${provincesOf(s, me).length}/${CAMPAIGN.victoryProvinces}</div>
  <div class="spacer"></div>
  <button data-action="diplomacy" title="Diplomatie & Agenten">外交 Diplomatie</button>
  <div class="menu">
    <button data-action="save">Speichern</button><button data-action="load">Laden</button>
    <button data-action="export">Export</button><button data-action="import">Import</button>
    <button data-action="newgame">Neu</button>
  </div>
  <button class="primary" data-action="endturn" title="Taste: Enter">Runde beenden ▸</button>`;
}

export function renderSidebar(s: GameState, v: PanelView): string {
  if (!v.selectedProvince) return overview(s);
  return provincePanel(s, v.selectedProvince, v);
}

function overview(s: GameState): string {
  const me = s.playerClan;
  const season = seasonOf(s.turn);
  const next = SEASONS[(s.turn + 1) % 4];
  const armies = Object.values(s.armies).filter((a) => a.owner === me);
  return `<section class="card intro">
    <h2>${monSvg(me, 40)} Clan ${esc(CLANS[me].name)}</h2>
    <p>${esc(CLANS[me].description)}</p>
    <p class="hint">Wählt eine Provinz oder ein Banner auf der Karte. Mit einer gewählten Armee klickt ihr auf ein markiertes Nachbarland, um zu ziehen –
      <span class="tag-green">grün</span> = eigenes/verbündetes Land, <span class="tag-red">rot</span> = Angriff.</p>
    <p class="hint">Jetzt: <b>${season.name}</b>${season.id === 'winter' ? ' – halbes Einkommen, Seewege gesperrt, Verluste in Feindesland.' : '.'} Danach: ${next.name}.</p>
  </section>
  <section class="card"><h3>Eure Armeen</h3>${armies.length ? armies.map((a) => `<button class="link" data-action="focus-army" data-army="${a.id}">
    ${esc(a.general.name)} ${stars(a.general.stars)} – ${esc(PROVINCES[a.location].name)} (${armyMen(a)} Mann)${a.moved ? ' · <i>bewegt</i>' : ''}</button>`).join('') : '<p class="dim">Keine Armeen.</p>'}</section>`;
}

function provincePanel(s: GameState, pid: ProvinceId, v: PanelView): string {
  const p = s.provinces[pid];
  const def = PROVINCES[pid];
  const me = s.playerClan;
  const mine = p.owner === me;
  const rel = relation(s, me, p.owner);
  const relText = p.owner === me ? 'Euer Land' : rel.state === 'war' ? '<span class="neg">Krieg</span>' : rel.state === 'alliance' ? '<span class="pos">Verbündet</span>' : 'Frieden';
  const out: string[] = [];
  out.push(`<section class="card">
    <h2>${monSvg(p.owner, 36)} ${esc(def.name)} <span class="kanji-lg">${def.kanji}</span></h2>
    <div class="facts">
      <span>Herr: <b>${esc(CLANS[p.owner].name)}</b> (${relText})</span>
      <span>Gelände: ${terrainName(def.terrain)}</span>
      <span title="Grundertrag ${def.koku}, Gebäudebonus +${Math.round(kokuBonus(s, pid) * 100)} %">Ertrag: ${koku(provinceIncome(s, pid))} / Runde</span>
      <span>Burg: ${buildingLevelName('castle', p.buildings.castle ?? 0)}</span>
    </div>
    ${p.siege ? `<div class="siege">囲 Belagert von <b>${esc(CLANS[p.siege.besieger].name)}</b> – Runde ${p.siege.turns} von ${supplyTurns(s, pid)} (Vorräte)</div>` : ''}
  </section>`);

  if (mine) {
    out.push(buildSection(s, pid));
    out.push(recruitSection(s, pid));
  }
  // Garnison
  const gKeyPrefix = 'g:';
  const garrisonChecks = [...v.checked].filter((k) => k.startsWith(gKeyPrefix));
  out.push(`<section class="card"><h3>Garnison ${p.garrison.length ? `(${p.garrison.reduce((a, u) => a + u.men, 0)} Mann)` : ''}</h3>
    ${p.garrison.length ? (mine ? p.garrison.map((u, i) => unitRow(u, { key: `g:${i}`, checked: v.checked.has(`g:${i}`) })).join('') : `<p class="dim">${p.garrison.length} Einheiten, ca. ${roughMen(p.garrison.reduce((a, u) => a + u.men, 0))} Mann.</p>`) : '<p class="dim">Keine Garnison.</p>'}
    ${mine && garrisonChecks.length ? transferButtons(s, pid, 'garrison', v) : ''}
  </section>`);
  // Armeen
  for (const a of armiesIn(s, pid)) out.push(armyCard(s, a, v));
  return out.join('');
}

const roughMen = (n: number) => Math.max(10, Math.round(n / 50) * 50);

function buildSection(s: GameState, pid: ProvinceId): string {
  const p = s.provinces[pid];
  const me = s.playerClan;
  const rows = BUILDING_IDS.map((b) => {
    const def = BUILDINGS[b];
    const cur = p.buildings[b] ?? 0;
    const planned = plannedLevel(s, pid, b);
    const next = def.levels[planned];
    const check = canBuild(s, me, pid, b);
    const btn = next
      ? `<button class="small" data-action="build" data-b="${b}" ${check.ok ? '' : 'disabled'} title="${esc(check.ok ? `${next.name}: ${next.cost} Koku, ${next.buildTime} Runde(n)` : check.reason!)}">${esc(next.name)} · ${next.cost}</button>`
      : '<span class="dim small">max.</span>';
    return `<div class="brow" title="${esc(def.description)}"><span class="bname">${esc(def.name)}</span><span class="blvl">${esc(buildingLevelName(b, cur))}</span>${btn}</div>`;
  }).join('');
  const queue = p.queue.length
    ? `<div class="queue">${p.queue.map((q, i) => `<span class="qitem">${q.kind === 'unit' ? '⚔ ' + esc(UNIT_TYPES[q.id].name) : '🏯 ' + esc(BUILDINGS[q.id].name)} <i>${q.turnsLeft} Rd.</i>
        <button class="x" data-action="cancel" data-i="${i}" title="Abbrechen (volle Erstattung)">✕</button></span>`).join('')}</div>`
    : '';
  return `<section class="card"><h3>Gebäude</h3>${rows}${queue ? `<h4>Bauschlange</h4>${queue}` : ''}</section>`;
}

function recruitSection(s: GameState, pid: ProvinceId): string {
  const me = s.playerClan;
  const btns = UNIT_TYPE_IDS.map((t) => {
    const def = UNIT_TYPES[t];
    const check = canRecruit(s, me, pid, t);
    return `<button class="recruit role-${def.role}" data-action="recruit" data-u="${t}" ${check.ok ? '' : 'disabled'}
      title="${esc(check.ok ? unitTooltip(t) + `\nAusbildung: ${def.recruitTime} Runde(n)` : `${def.name}: ${check.reason}`)}">
      <b>${esc(def.name)}</b><span>${def.cost} 石 · ${def.recruitTime} Rd.</span></button>`;
  }).join('');
  return `<section class="card"><h3>Truppen ausheben</h3><div class="recruit-grid">${btns}</div></section>`;
}

function armyCard(s: GameState, a: Army, v: PanelView): string {
  const me = s.playerClan;
  const own = a.owner === me;
  const selected = v.selectedArmy === a.id;
  const prefix = `a:${a.id}:`;
  const checks = [...v.checked].filter((k) => k.startsWith(prefix));
  const prov = s.provinces[a.location];
  const canAssault = own && prov.siege?.besieger === me && !a.moved;
  const units = own
    ? a.units.map((u, i) => unitRow(u, { key: `${prefix}${i}`, checked: v.checked.has(`${prefix}${i}`) })).join('')
    : a.units.map((u) => unitRow(u)).join('');
  return `<section class="card army-card${selected ? ' selected' : ''}" style="border-left-color:${CLANS[a.owner].color}">
    <h3>${monSvg(a.owner, 24)} ${esc(a.general.name)} ${a.general.isDaimyo ? '<span class="daimyo" title="Daimyo">大名</span>' : ''}
      <span class="stars" title="General-Sterne (Erfahrung ${a.general.xp})">${stars(a.general.stars)}</span></h3>
    <div class="army-meta">${a.units.length} Einheiten · ${armyMen(a)} Mann${own ? ` · ${a.moved ? '<i>hat gezogen</i>' : 'bereit'}` : ''}</div>
    ${units}
    ${own ? `<div class="army-actions">
      <button class="${selected ? 'primary' : ''}" data-action="select-army" data-army="${a.id}" ${a.moved ? 'disabled title="Diese Armee hat sich schon bewegt."' : ''}>${selected ? 'Ziel auf Karte wählen…' : 'Bewegen'}</button>
      ${canAssault ? `<button class="danger" data-action="assault" data-army="${a.id}">Burg stürmen</button>` : ''}
      <label class="stance" title="Taktik, wenn diese Armee angegriffen wird">Bei Angriff:
        <select data-action="stance" data-army="${a.id}">${TACTIC_IDS.map((t) => `<option value="${t}" ${a.stance === t ? 'selected' : ''}>${TACTICS[t].name}</option>`).join('')}</select></label>
    </div>${checks.length ? transferButtons(s, a.location, { army: a.id }, v) : ''}` : ''}
  </section>`;
}

function transferButtons(s: GameState, pid: ProvinceId, from: 'garrison' | { army: string }, _v: PanelView): string {
  const me = s.playerClan;
  const fromKey = from === 'garrison' ? 'garrison' : from.army;
  const others = armiesIn(s, pid, me).filter((a) => from === 'garrison' || a.id !== from.army);
  const btns = [`<button class="small" data-action="transfer" data-from="${fromKey}" data-to="new">→ Neue Armee</button>`];
  if (from !== 'garrison' && s.provinces[pid].owner === me) btns.push(`<button class="small" data-action="transfer" data-from="${fromKey}" data-to="garrison">→ Garnison</button>`);
  for (const o of others) btns.push(`<button class="small" data-action="transfer" data-from="${fromKey}" data-to="${o.id}">→ ${esc(o.general.name)}</button>`);
  btns.push(`<button class="small" data-action="disband" data-from="${fromKey}" title="Gewählte Einheiten entlassen">Entlassen</button>`);
  return `<div class="transfer">Gewählte Einheiten: ${btns.join('')}</div>`;
}

export function renderLog(s: GameState): string {
  return s.log.slice(-40).reverse().map((l) => `<div>${esc(l)}</div>`).join('');
}
