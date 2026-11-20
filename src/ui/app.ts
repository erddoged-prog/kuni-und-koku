// Steuerung: hält den Spielzustand, verarbeitet Klicks, rendert neu, speichert.
import { CLANS, TACTIC_IDS, seasonOf, yearOf } from '../data';
import type { GameState, ProvinceId, Tactic } from '../data/types';
import {
  assault, cancelQueueItem, createInitialState, declareWar, deserialize, disbandUnit, endTurn, legalMoves, moveArmy,
  playerDefeated, proposeAlliance, proposePeace, breakAlliance, queueBuilding, queueUnit, recruitAgent, sendGift,
  serialize, setStance, transferUnits, type ActionResult, type AiHook, type BattleRecord, type UnitHolder,
} from '../campaign';
import { PROVINCE_IDS } from '../data';
import { buildGeometry, pointInPolygon, toPath, type Pt } from './geometry';
import { renderMapBackground, renderMapForeground } from './map';
import { renderLog, renderSidebar, renderTopbar } from './panels';
import { battleReportDialog, diplomacyDialog, endDialog, startDialog, tacticDialog, turnSummaryDialog, type TacticOdds } from './dialogs';

const AUTOSAVE = 'kuni-koku-autosave';
const SLOT = 'kuni-koku-slot1';

/** localStorage kann fehlen oder Fehler werfen (z. B. in eingebetteten Seiten). */
const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
};

export class App {
  game?: GameState;
  private geo = buildGeometry();
  private sel: { province?: ProvinceId; army?: string } = {};
  private checked = new Set<string>();
  private pendingAttack?: { army: string; to: ProvinceId; kind: 'move' | 'assault' };
  private lastTurnBattles: BattleRecord[] = [];
  private endShown = false;
  /** Laufendes Ziehen einer Spielfigur. */
  private drag?: { army: string; pointerId: number; startScreen: Pt; startSvg: Pt; base: Pt; moved: boolean; over?: ProvinceId };
  /** Nach dem Ablegen einer Figur den folgenden Klick verschlucken. */
  private suppressClickUntil = 0;
  /** Armee, die zuletzt gezogen hat (Lande-Animation). */
  private landed?: string;

  constructor(private root: HTMLElement, private ai?: AiHook) {
    root.innerHTML = `<header id="topbar"></header><main><div id="mapwrap"></div><aside id="side"><div id="panel"></div><div id="log"></div></aside></main>
      <div id="modal" hidden></div><div id="toast" hidden></div><input type="file" id="file" accept=".json,application/json" hidden>`;
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('contextmenu', (e) => {
      if ((e.target as Element).closest('#mapwrap')) {
        e.preventDefault();
        this.clearSelection();
      }
    });
    root.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    root.addEventListener('pointermove', (e) => this.onPointerMove(e));
    root.addEventListener('pointerup', (e) => this.onPointerUp(e));
    root.addEventListener('pointercancel', () => this.cancelDrag());
    root.addEventListener('change', (e) => this.onChange(e));
    document.addEventListener('keydown', (e) => this.onKey(e));
    this.$('#file').addEventListener('change', (e) => this.onImportFile(e));
  }

  start() {
    const auto = storage.get(AUTOSAVE);
    this.showModal(startDialog(!!auto, !!storage.get(SLOT)), false);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  private $(q: string) {
    return this.root.querySelector(q) as HTMLElement;
  }

  render() {
    const g = this.game;
    if (!g) return;
    const targets = this.sel.army && g.armies[this.sel.army] && !g.armies[this.sel.army].moved ? legalMoves(g, this.sel.army) : [];
    this.$('#topbar').innerHTML = renderTopbar(g);
    const wrap = this.$('#mapwrap');
    if (!wrap.querySelector('#mapbg')) wrap.innerHTML = renderMapBackground(this.geo);
    const fg = renderMapForeground(g, this.geo, { selectedProvince: this.sel.province, selectedArmy: this.sel.army, targets, landed: this.landed });
    this.landed = undefined;
    const old = wrap.querySelector('#map');
    if (old) old.outerHTML = fg;
    else wrap.insertAdjacentHTML('beforeend', fg);
    const panel = this.$('#panel');
    const sameProvince = panel.dataset.pid === (this.sel.province ?? '');
    const panelScroll = panel.scrollTop;
    panel.innerHTML = renderSidebar(g, { selectedProvince: this.sel.province, selectedArmy: this.sel.army, checked: this.checked });
    panel.dataset.pid = this.sel.province ?? '';
    panel.scrollTop = sameProvince ? panelScroll : 0;
    this.$('#log').innerHTML = renderLog(g);
    if (!this.endShown && (g.winner || playerDefeated(g))) {
      this.endShown = true;
      this.showModal(endDialog(g));
    }
  }

  private showModal(html: string, closable = true) {
    const m = this.$('#modal');
    m.innerHTML = html;
    m.hidden = false;
    m.dataset.closable = closable ? '1' : '';
  }

  private closeModal() {
    const m = this.$('#modal');
    if (!m.dataset.closable) return;
    m.hidden = true;
    m.innerHTML = '';
  }

  private toast(msg: string, bad = false) {
    const t = this.$('#toast');
    t.textContent = msg;
    t.className = bad ? 'bad' : '';
    t.hidden = false;
    clearTimeout((this as unknown as { _t?: number })._t);
    (this as unknown as { _t?: number })._t = window.setTimeout(() => (t.hidden = true), 2800);
  }

  private clearSelection() {
    this.sel = {};
    this.checked.clear();
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Aktionen
  // ---------------------------------------------------------------------------
  private apply(res: ActionResult, opts: { silent?: boolean } = {}) {
    if (res.ok || res.state !== this.game) this.game = res.state;
    this.autosave();
    if (res.message && !opts.silent) this.toast(res.message, !res.ok);
    if (res.battles.length) this.showModal(battleReportDialog(this.game!, res.battles));
    this.render();
    return res.ok;
  }

  private newGame(clan: string) {
    this.game = createInitialState(clan, (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
    this.sel = { province: CLANS[clan].homeProvince };
    this.checked.clear();
    this.endShown = false;
    this.$('#modal').dataset.closable = '1';
    this.closeModal();
    this.autosave();
    this.render();
  }

  private loadState(state: GameState, source: string) {
    this.game = state;
    this.sel = {};
    this.checked.clear();
    this.endShown = false;
    this.$('#modal').dataset.closable = '1';
    this.closeModal();
    this.render();
    this.toast(`Spielstand geladen (${source}).`);
  }

  private autosave() {
    if (this.game) storage.set(AUTOSAVE, serialize(this.game));
  }

  private doEndTurn() {
    const g = this.game;
    if (!g || g.winner) return;
    const res = endTurn(g, this.ai);
    this.game = res.state;
    this.sel.army = undefined;
    this.checked.clear();
    this.autosave();
    const me = g.playerClan;
    this.lastTurnBattles = res.battles.filter((b) => b.attacker === me || b.defender === me);
    const season = seasonOf(this.game.turn);
    this.render();
    if (!res.events.length && !this.lastTurnBattles.length) this.toast(`${season.name} ${yearOf(this.game.turn, this.game.startYear)} beginnt – eine ruhige Zeit.`);
    else {
      this.showModal(turnSummaryDialog(res.events, this.lastTurnBattles.length).replace('Ereignisse der Runde', `${season.kanji} ${season.name} ${yearOf(this.game.turn, this.game.startYear)}`));
    }
  }

  /** Siegchancen per Monte-Carlo mit anderen Seeds (der echte Ausgang bleibt geheim). */
  private estimate(kind: 'move' | 'assault', army: string, to: ProvinceId): TacticOdds[] {
    const g = this.game!;
    const n = 24;
    return TACTIC_IDS.map((tactic) => {
      let fights = 0;
      let wins = 0;
      for (let i = 0; i < n; i++) {
        const trial = { ...g, seed: (g.seed ^ 0x5bd1e995) + i * 7919 };
        const r = kind === 'move' ? moveArmy(trial, army, to, tactic) : assault(trial, army, tactic);
        if (!r.battles.length) continue;
        fights++;
        if (r.battles.every((b) => b.result.winner === 'attacker')) wins++;
      }
      return { tactic, chance: fights ? wins / fights : undefined };
    });
  }

  private openAttack(kind: 'move' | 'assault', army: string, to: ProvinceId) {
    this.pendingAttack = { army, to, kind };
    this.showModal(tacticDialog(this.game!, army, to, this.estimate(kind, army, to), kind));
  }

  private doAttack(tactic: Tactic) {
    const p = this.pendingAttack;
    if (!p || !this.game) return;
    this.pendingAttack = undefined;
    this.closeModal();
    const res = p.kind === 'move' ? moveArmy(this.game, p.army, p.to, tactic) : assault(this.game, p.army, tactic);
    this.sel = { province: res.ok && res.state.armies[p.army] ? res.state.armies[p.army].location : p.to };
    if (res.ok && res.state.armies[p.army]) this.landed = p.army;
    this.apply(res);
  }

  private onMapClick(target: Element) {
    const g = this.game!;
    const armyEl = target.closest('[data-army]') as HTMLElement | null;
    const provEl = target.closest('[data-pid]') as HTMLElement | null;
    let pid = provEl?.dataset.pid as ProvinceId | undefined;
    if (armyEl) {
      const a = g.armies[armyEl.dataset.army!];
      // Banner in einem Zielgebiet: als Klick auf die Provinz behandeln
      if (this.sel.army && a && a.location !== g.armies[this.sel.army]?.location) pid = a.location;
      else if (a) {
        this.checked.clear();
        this.sel = { province: a.location, army: a.owner === g.playerClan && !a.moved ? a.id : undefined };
        this.render();
        return;
      }
    }
    if (!pid) return;
    if (this.sel.army && g.armies[this.sel.army]) {
      const t = legalMoves(g, this.sel.army).find((m) => m.to === pid);
      if (t) {
        if (t.hostile) this.openAttack('move', this.sel.army, pid);
        else {
          const army = this.sel.army;
          const ok = this.apply(moveArmy(g, army, pid), { silent: true });
          if (ok) {
            this.sel = { province: pid };
            this.landed = army;
          }
          this.render();
        }
        return;
      }
    }
    this.checked.clear();
    this.sel = { province: pid };
    this.render();
  }

  private holderFromKey(key: string): UnitHolder {
    return key === 'garrison' ? 'garrison' : key === 'new' ? 'new' : { army: key };
  }

  private checkedIndices(fromKey: string): number[] {
    const prefix = fromKey === 'garrison' ? 'g:' : `a:${fromKey}:`;
    return [...this.checked].filter((k) => k.startsWith(prefix)).map((k) => Number(k.slice(prefix.length)));
  }

  // ---------------------------------------------------------------------------
  // Spielfiguren ziehen (Maus und Finger)
  // ---------------------------------------------------------------------------
  private svgPoint(e: PointerEvent): Pt | undefined {
    const svg = this.root.querySelector('#map') as SVGSVGElement | null;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return undefined;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }

  private provinceAt(p: Pt): ProvinceId | undefined {
    return PROVINCE_IDS.find((id) => pointInPolygon(p, this.geo.cells[id]));
  }

  private onPointerDown(e: PointerEvent) {
    const g = this.game;
    if (!g || e.button > 0 || !this.$('#modal').hidden) return;
    const el = (e.target as Element).closest('#map [data-army]') as HTMLElement | null;
    const a = el && g.armies[el.dataset.army!];
    if (!a || a.owner !== g.playerClan || a.moved) return;
    // Figur wählen, damit die Zugziele aufleuchten
    if (this.sel.army !== a.id) {
      this.checked.clear();
      this.sel = { province: a.location, army: a.id };
      this.render();
    }
    const pos = this.root.querySelector(`#map [data-army="${a.id}"]`)?.parentElement as HTMLElement | null;
    const start = this.svgPoint(e);
    if (!pos || !start) return;
    this.drag = {
      army: a.id, pointerId: e.pointerId, startScreen: [e.clientX, e.clientY], startSvg: start,
      base: [Number(pos.dataset.x), Number(pos.dataset.y)], moved: false,
    };
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      /* ältere Browser */
    }
    e.preventDefault();
  }

  private onPointerMove(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.startScreen[0], e.clientY - d.startScreen[1]) < 6) return;
    const p = this.svgPoint(e);
    const pos = this.root.querySelector(`#map [data-army="${d.army}"]`)?.parentElement;
    if (!p || !pos) return;
    if (!d.moved) {
      d.moved = true;
      pos.classList.add('dragging');
      pos.parentElement?.appendChild(pos); // nach vorn
    }
    pos.setAttribute('transform', `translate(${(d.base[0] + p[0] - d.startSvg[0]).toFixed(1)},${(d.base[1] + p[1] - d.startSvg[1]).toFixed(1)})`);
    const over = this.provinceAt(p);
    if (over === d.over) return;
    d.over = over;
    const hint = this.root.querySelector('#drophint');
    if (!hint) return;
    const g = this.game!;
    const t = over && over !== g.armies[d.army]?.location ? legalMoves(g, d.army).find((m) => m.to === over) : undefined;
    hint.setAttribute('d', over && over !== g.armies[d.army]?.location ? toPath(this.geo.cells[over]) : '');
    hint.setAttribute('class', `drop-hint${t ? (t.hostile ? ' attack' : ' ok') : ' bad'}`);
  }

  private onPointerUp(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.drag = undefined;
    if (!d.moved) return; // einfacher Klick: übernimmt der Klick-Handler
    this.suppressClickUntil = performance.now() + 400;
    const g = this.game!;
    const t = d.over ? legalMoves(g, d.army).find((m) => m.to === d.over) : undefined;
    if (!t) return this.render(); // zurück an den Platz
    if (t.hostile) {
      this.render();
      return this.openAttack('move', d.army, t.to);
    }
    if (this.apply(moveArmy(g, d.army, t.to), { silent: true })) {
      this.sel = { province: t.to };
      this.landed = d.army;
    }
    this.render();
  }

  private cancelDrag() {
    if (!this.drag) return;
    this.drag = undefined;
    this.render();
  }

  private onClick(e: MouseEvent) {
    const target = e.target as Element;
    if (performance.now() < this.suppressClickUntil && target.closest('#mapwrap')) return;
    if (target.closest('#modal') && target.id === 'modal') return this.closeModal();
    const el = target.closest('[data-action]') as HTMLElement | null;
    if (!el) {
      if (target.closest('#map')) this.onMapClick(target);
      return;
    }
    if (el instanceof HTMLButtonElement && el.disabled) return;
    const g = this.game;
    const me = g?.playerClan;
    const d = el.dataset;
    switch (d.action) {
      case 'pick-clan': return this.newGame(d.clan!);
      case 'continue': {
        const raw = storage.get(AUTOSAVE);
        if (raw) this.tryLoad(raw, 'Autosave');
        return;
      }
      case 'close': return this.closeModal();
      case 'endturn': return this.doEndTurn();
      case 'diplomacy': return g && this.showModal(diplomacyDialog(g));
      case 'save':
        if (g) {
          this.toast(storage.set(SLOT, serialize(g)) ? 'Spiel gespeichert.' : 'Speichern hier nicht möglich – bitte Export nutzen.', !storage.get(SLOT));
        }
        return;
      case 'load': {
        const raw = storage.get(SLOT);
        if (!raw) return this.toast('Kein gespeichertes Spiel vorhanden.', true);
        return this.tryLoad(raw, 'Speicherplatz');
      }
      case 'export': return this.exportGame();
      case 'import': return (this.$('#file') as HTMLInputElement).click();
      case 'newgame':
        this.endShown = false;
        return this.showModal(startDialog(!!storage.get(AUTOSAVE), !!storage.get(SLOT)), !!g);
      case 'show-turn-battles': return g && this.showModal(battleReportDialog(g, this.lastTurnBattles));
      case 'focus-army': {
        const a = g?.armies[d.army!];
        if (a) {
          this.sel = { province: a.location, army: a.moved ? undefined : a.id };
          this.render();
        }
        return;
      }
      case 'select-army':
        this.sel = { province: this.sel.province, army: this.sel.army === d.army ? undefined : d.army };
        return this.render();
      case 'assault': {
        const a = g?.armies[d.army!];
        if (a) this.openAttack('assault', a.id, a.location);
        return;
      }
      case 'do-attack': return this.doAttack(d.tactic as Tactic);
      case 'build': return g && this.sel.province && this.apply(queueBuilding(g, me!, this.sel.province, d.b!));
      case 'recruit': return g && this.sel.province && this.apply(queueUnit(g, me!, this.sel.province, d.u!));
      case 'cancel': return g && this.sel.province && this.apply(cancelQueueItem(g, me!, this.sel.province, Number(d.i)));
      case 'transfer': {
        if (!g || !this.sel.province) return;
        const idx = this.checkedIndices(d.from!);
        const res = transferUnits(g, me!, this.sel.province, this.holderFromKey(d.from!), this.holderFromKey(d.to!), idx);
        if (res.ok) this.checked.clear();
        return this.apply(res);
      }
      case 'disband': {
        if (!g || !this.sel.province) return;
        let s = g;
        // Von hinten entlassen, damit Indizes gültig bleiben
        for (const i of this.checkedIndices(d.from!).sort((a, b) => b - a)) {
          const r = disbandUnit(s, me!, this.sel.province, this.holderFromKey(d.from!), i);
          if (r.ok) s = r.state;
        }
        this.checked.clear();
        return this.apply({ state: s, ok: true, message: 'Einheiten entlassen.', battles: [] });
      }
      case 'dip': {
        if (!g) return;
        const c = d.clan!;
        const op = d.op;
        const res =
          op === 'war' ? declareWar(g, me!, c)
            : op === 'peace' ? proposePeace(g, me!, c)
            : op === 'alliance' ? proposeAlliance(g, me!, c)
            : op === 'break' ? breakAlliance(g, me!, c)
            : sendGift(g, me!, c, 200);
        this.apply(res);
        this.showModal(diplomacyDialog(this.game!));
        return;
      }
      case 'agent': return g && this.apply(recruitAgent(g, me!, this.sel.province ?? CLANS[me!].homeProvince, d.kind as 'ninja' | 'shinobi'));
    }
  }

  private onChange(e: Event) {
    const el = e.target as HTMLElement;
    if (el instanceof HTMLInputElement && el.dataset.check) {
      // Nur aus einer Quelle gleichzeitig auswählen
      const key = el.dataset.check;
      const holder = key.startsWith('g:') ? 'g:' : key.slice(0, key.lastIndexOf(':') + 1);
      for (const k of [...this.checked]) if (!k.startsWith(holder)) this.checked.delete(k);
      if (el.checked) this.checked.add(key);
      else this.checked.delete(key);
      this.render();
    } else if (el instanceof HTMLSelectElement && el.dataset.action === 'stance' && this.game) {
      this.apply(setStance(this.game, this.game.playerClan, el.dataset.army!, el.value as Tactic), { silent: true });
    }
  }

  private onKey(e: KeyboardEvent) {
    const modalOpen = !this.$('#modal').hidden;
    if (e.key === 'Escape') {
      if (modalOpen) this.closeModal();
      else this.clearSelection();
    } else if (e.key === 'Enter' && !modalOpen && this.game && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
      e.preventDefault();
      this.doEndTurn();
    }
  }

  private tryLoad(raw: string, source: string) {
    try {
      this.loadState(deserialize(raw), source);
    } catch (err) {
      this.toast(`Laden fehlgeschlagen: ${(err as Error).message}`, true);
    }
  }

  private exportGame() {
    const g = this.game;
    if (!g) return;
    const blob = new Blob([serialize(g)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kuni-koku-${g.playerClan}-${yearOf(g.turn, g.startYear)}-${seasonOf(g.turn).id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  private onImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    file.text().then((t) => this.tryLoad(t, file.name));
    input.value = '';
  }
}
