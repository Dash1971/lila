import { Chessground } from '@lichess-org/chessground';
import { uciToMove } from '@lichess-org/chessground/util';
import { attributesModule, classModule, init } from 'snabbdom';

import { escapeHtml } from '../index';
import { domDialog, type Dialog } from '../view/dialog';
import { hl, type VNode } from '../view/snabbdom';
import { candidateWhiteCp, stockfishWinrate } from './candidateQuality';
import { legalUcis, position, san } from './core';
import { labText, type LabTextKey } from './maiaLabI18n';
import {
  describeLabPosition,
  labMoves,
  labProbability,
  labQualities,
  labScores,
  type MaiaLabSnapshot,
} from './maiaLabModel';
import { ratingChart, ratingSamples } from './ratingChart';

export interface MaiaLabSource {
  snapshot(): MaiaLabSnapshot | undefined;
  start(): void;
  stop(): void;
  hover(uci?: string): void;
  explore(uci: string): void;
}
export class MaiaLab {
  private dialog?: Dialog;
  private opening = false;
  private epoch = 0;
  private board?: CgApi;
  private chart?: VNode | HTMLElement;
  private readonly patch = init([classModule, attributesModule]);
  private key = '';
  private selected = '';
  private rating = 1600;
  private count = 6;
  private tab = 'rating';
  constructor(private readonly source: MaiaLabSource) {}
  open = async (): Promise<void> => {
    if (this.opening || this.dialog || !this.source.snapshot()) return;
    this.opening = true;
    const epoch = ++this.epoch;
    const t = (key: LabTextKey) => escapeHtml(labText(key));
    try {
      const dialog = await domDialog({
        class: 'nosweat-maia-lab',
        modal: true,
        easyClose: 'clickOutside',
        noCloseButton: true,
        attrs: { dialog: { 'aria-label': labText('LabTitle') } },
        htmlText: `<header class="maia-lab-heading"><div><h2>${t('LabTitle')}</h2><span data-lab-context></span></div><button type="button" class="fbt" data-lab-close aria-label="${t('LabClose')}">×</button></header>
          <p class="maia-lab-description" data-lab-description aria-live="polite"></p>
          <div class="maia-lab-layout"><div class="maia-lab-main"><nav class="maia-lab-tabs" aria-label="${t('LabTitle')}"><button type="button" class="fbt" data-lab-tab="rating">${t('LabRatingChart')}</button><button type="button" class="fbt" data-lab-tab="map">${t('LabMoveMap')}</button></nav>
          <div class="maia-lab-controls"><label>${t('LabRating')} <output data-lab-rating-value></output><input type="range" min="600" max="2600" step="100" data-lab-rating></label><label>${t('LabShow')}<select data-lab-count><option value="6">${escapeHtml(labText('LabMoveCount', 6))}</option><option value="8">${escapeHtml(labText('LabMoveCount', 8))}</option></select></label></div>
          <div class="maia-lab-chart"><div data-lab-plot><div></div></div><div data-lab-map hidden></div></div><p data-lab-map-help class="maia-lab-help" hidden>${t('LabMapHelp')}</p><p data-lab-progress role="status"></p><h3>${t('LabCandidates')}</h3><div class="maia-lab-table"><table><thead><tr><th>${t('LabMove')}</th><th>${t('LabProbability')}</th><th>${t('LabEvaluation')}</th></tr></thead><tbody></tbody></table></div></div>
          <aside><div class="cg-wrap is2d" data-lab-board role="img" aria-label="${t('LabBoard')}"></div><p data-lab-model class="maia-lab-help"></p><section class="maia-lab-detail" aria-live="polite"><h3 data-lab-selected></h3><dl data-lab-details></dl><button type="button" class="button button-empty" data-lab-explore>${t('LabExplore')}</button></section></aside></div><p class="maia-lab-help maia-lab-explanation">${t('LabExplain')}</p>`,
        onClose: () => this.cleanup(),
      });
      if (epoch !== this.epoch || !this.source.snapshot()) {
        dialog.close();
        return;
      }
      this.dialog = dialog;
      const view = dialog.view;
      // Keep range/chart/control keys inside the modal; native Escape and Tab
      // still reach the dialog's focus/close handler.
      view.addEventListener('keydown', event => {
        if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
      });
      const boardHost = view.querySelector<HTMLElement>('[data-lab-board]')!;
      const data = this.source.snapshot()!;
      this.board = Chessground(boardHost, {
        fen: data.fen,
        orientation: data.orientation,
        coordinates: false,
        viewOnly: true,
        drawable: { enabled: false, visible: false },
        addDimensionsCssVarsTo: boardHost,
      });
      this.chart = view.querySelector<HTMLElement>('[data-lab-plot] > div')!;
      view.querySelector<HTMLInputElement>('[data-lab-rating]')!.oninput = e => {
        this.rating = Number((e.target as HTMLInputElement).value);
        this.redraw();
      };
      view.querySelector<HTMLSelectElement>('[data-lab-count]')!.onchange = e => {
        this.count = Number((e.target as HTMLSelectElement).value);
        this.redraw();
      };
      view.querySelector<HTMLButtonElement>('[data-lab-close]')!.onclick = () => this.close();
      view.querySelector<HTMLButtonElement>('[data-lab-explore]')!.onclick = () => {
        const current = this.source.snapshot();
        if (!current || current.key !== this.key || !this.selected) return this.close();
        const uci = this.selected;
        this.close();
        this.source.explore(uci);
      };
      view.querySelectorAll<HTMLButtonElement>('[data-lab-tab]').forEach(
        button =>
          (button.onclick = () => {
            this.tab = button.dataset.labTab!;
            this.redraw();
          }),
      );
      this.key = '';
      this.redraw();
      void dialog.show();
      if (legalUcis(data.fen).length) this.source.start();
    } finally {
      this.opening = false;
    }
  };
  close = (): void => {
    ++this.epoch;
    if (this.dialog) this.dialog.close();
  };
  private cleanup(): void {
    this.source.hover();
    this.source.stop();
    this.board?.destroy();
    this.board = undefined;
    if (this.chart) this.patch(this.chart, hl('div'));
    this.chart = undefined;
    this.dialog = undefined;
  }
  redraw = (): void => {
    const dialog = this.dialog;
    if (!dialog) return;
    const data = this.source.snapshot();
    if (!data) return this.close();
    if (data.key !== this.key) {
      this.source.hover();
      this.key = data.key;
      this.selected = '';
      this.rating = Math.max(600, Math.min(2600, Math.round(data.rating / 100) * 100));
    }
    const view = dialog.view;
    const text = (selector: string, value: string) => {
      view.querySelector(selector)!.textContent = value;
    };
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const focus = active && view.contains(active) ? active.dataset.labMove : undefined;
    const descriptionFocused = !!active?.closest('[data-lab-description]');
    const moves = labMoves(data, this.rating, this.count);
    if (!moves.includes(this.selected)) this.selected = moves[0] ?? '';
    const white = position(data.fen).turn === 'white';
    const name = (uci: string) => san(data.fen, uci);
    const probability = (uci: string) => {
      const p = labProbability(data, this.rating, uci);
      return p === undefined ? '—' : (p * 100).toFixed(1) + '%';
    };
    const scores = labScores(data);
    const qualities = labQualities(data);
    const evaluation = (uci: string) => {
      const score = scores.get(uci);
      if (!score) return '—';
      if (score.mate !== undefined)
        return `${(score.mate === 0 ? !white : score.mate > 0) ? '+' : '−'}M${Math.abs(score.mate)}`;
      return `${score.cp! > 0 ? '+' : ''}${(score.cp! / 100).toFixed(2)}`;
    };
    const select = (uci: string) => {
      this.selected = uci;
      this.source.hover(uci);
      this.redraw();
    };
    const moveButton = (uci: string) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fbt';
      button.textContent = name(uci);
      button.dataset.labMove = uci;
      button.setAttribute('aria-label', labText('LabPreview', name(uci)));
      button.setAttribute('aria-pressed', String(this.selected === uci));
      button.style.color = qualities.get(uci)?.color ?? 'var(--c-font-dim)';
      button.onclick = () => select(uci);
      button.onmouseenter = button.onfocus = () => this.source.hover(uci);
      button.onmouseleave = () => {
        if (document.activeElement !== button) this.source.hover();
      };
      button.onblur = () => this.source.hover();
      return button;
    };
    const description = view.querySelector('[data-lab-description]')!;
    description.replaceChildren();
    for (const part of describeLabPosition(data)) {
      const tokens = part.moves?.map(uci => `[[${uci}]]`) ?? [];
      const list =
        tokens.length === 3
          ? labText('LabTriple', ...tokens)
          : tokens.length === 2
            ? labText('LabPair', ...tokens)
            : (tokens[0] ?? '');
      const sentence = labText(part.key as LabTextKey, list);
      for (const fragment of sentence.split(/(\[\[[a-h][1-8][a-h][1-8][qrbn]?\]\])/)) {
        const uci = fragment.match(/^\[\[(.+)\]\]$/)?.[1];
        description.append(uci ? moveButton(uci) : document.createTextNode(fragment));
      }
      description.append(' ');
    }
    text('[data-lab-context]', labText(white ? 'LabWhite' : 'LabBlack'));
    text('[data-lab-model]', labText('LabModel', data.model, labText(data.history ? 'LabOn' : 'LabOff')));
    text('[data-lab-rating-value]', String(this.rating));
    const slider = view.querySelector<HTMLInputElement>('[data-lab-rating]')!;
    slider.value = String(this.rating);
    text(
      '[data-lab-progress]',
      data.failed
        ? labText('LabUnavailable')
        : labText('LabProgress', data.byRating.size, ratingSamples.length),
    );
    view
      .querySelectorAll<HTMLButtonElement>('[data-lab-tab]')
      .forEach(button => button.setAttribute('aria-pressed', String(button.dataset.labTab === this.tab)));
    const tbody = view.querySelector('tbody')!;
    tbody.replaceChildren();
    for (const uci of moves) {
      const row = document.createElement('tr');
      row.classList.toggle('selected', uci === this.selected);
      const cell = row.insertCell();
      cell.append(moveButton(uci));
      row.insertCell().textContent = probability(uci);
      const evalCell = row.insertCell();
      evalCell.textContent = evaluation(uci);
      if (data.scores.has(uci)) evalCell.title = labText('LabDepth', data.scores.get(uci)!.depth);
      tbody.append(row);
    }
    this.board?.set({
      fen: data.fen,
      orientation: data.orientation,
      lastMove: this.selected ? uciToMove(this.selected) : [],
    });
    text(
      '[data-lab-selected]',
      this.selected ? labText('LabSelected', name(this.selected)) : labText('LabPending'),
    );
    const details = view.querySelector('[data-lab-details]')!;
    details.replaceChildren();
    const metric = (key: LabTextKey, value: string) => {
      const dt = document.createElement('dt');
      dt.textContent = labText(key);
      const dd = document.createElement('dd');
      dd.textContent = value;
      details.append(dt, dd);
    };
    metric('LabProbability', probability(this.selected));
    metric('LabEvaluation', evaluation(this.selected));
    const score = scores.get(this.selected);
    if (score) {
      metric('LabWinrate', (stockfishWinrate(score, white)! * 100).toFixed(1) + '%');
      // Mate-to-CP proxies belong to quality mapping, never a pawn-loss metric.
      if ([...scores.values()].every(s => s.mate === undefined)) {
        const moverCp = [...scores.values()].map(s => candidateWhiteCp(s, white)! * (white ? 1 : -1));
        const loss = (Math.max(...moverCp) - candidateWhiteCp(score, white)! * (white ? 1 : -1)) / 100;
        metric('LabEvalLoss', loss.toFixed(2));
      }
    }
    view.querySelector<HTMLButtonElement>('[data-lab-explore]')!.disabled = !this.selected;
    view.querySelector<HTMLElement>('[data-lab-map-help]')!.hidden = this.tab !== 'map';
    view.querySelector<HTMLElement>('[data-lab-plot]')!.hidden = this.tab !== 'rating';
    view.querySelector<HTMLElement>('[data-lab-map]')!.hidden = this.tab !== 'map';
    if (this.tab === 'rating') {
      const width = view.querySelector<HTMLElement>('.maia-lab-chart')!.clientWidth || 560;
      this.chart = this.patch(
        this.chart!,
        ratingChart(
          data.byRating,
          name,
          rating => {
            this.rating = rating;
            this.redraw();
          },
          select,
          this.redraw,
          {
            moves,
            width,
            height: 300,
            selectedRating: this.rating,
            color: uci => qualities.get(uci)?.color ?? 'var(--c-font-dim)',
            hover: uci => this.source.hover(uci),
            ariaLabel: labText('LabChartHelp'),
            probabilityLabel: labText('LabProbability'),
            selectLabel: rating => labText('LabSelectRating', rating),
            describe: (uci, rating, p) =>
              `${name(uci)} · Maia ${rating} · ${(p * 100).toFixed(1)}% · ${labText('LabEvaluation')}: ${evaluation(uci)}`,
          },
        ),
      );
    } else {
      // The map uses the very same empirical SF loss and raw policy as the table.
      const host = document.createElement('div');
      host.className = 'maia-lab-map';
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      const width = view.querySelector<HTMLElement>('.maia-lab-chart')!.clientWidth || 560;
      svg.setAttribute('viewBox', `0 0 ${width} 300`);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', labText('LabMoveMap'));
      const add = (tag: string, attrs: Record<string, string | number>, content = '') => {
        const el = document.createElementNS(ns, tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
        el.textContent = content;
        svg.append(el);
        return el;
      };
      const domain = Math.max(0.6, ...moves.map(uci => labProbability(data, this.rating, uci) ?? 0));
      for (let i = 0; i <= 3; i++) {
        const y = 250 - (i / 3) * 220;
        add('line', { x1: 40, x2: width - 15, y1: y, y2: y, stroke: 'currentColor', opacity: 0.18 });
        add('text', { x: 34, y: y + 4, 'text-anchor': 'end' }, Math.round((i / 3) * domain * 100) + '%');
      }
      for (const loss of [0, 25, 50, 75, 100])
        add(
          'text',
          {
            x: 40 + (loss / 100) * (width - 55),
            y: 270,
            'text-anchor': loss === 0 ? 'start' : loss === 100 ? 'end' : 'middle',
          },
          String(loss),
        );

      for (const uci of moves) {
        const q = qualities.get(uci);
        const p = labProbability(data, this.rating, uci);
        if (!q || p === undefined) continue;
        const x = 40 + Math.min(1, q.loss) * (width - 55);
        const y = 250 - (p / domain) * 220;
        const mark = add('a', {
          href: '#',
          role: 'button',
          tabindex: 0,
          'aria-label': `${name(uci)} · ${probability(uci)} · ${evaluation(uci)}`,
        });
        const circle = document.createElementNS(ns, 'circle');
        for (const [k, v] of Object.entries({
          cx: x,
          cy: y,
          r: uci === this.selected ? 8 : 5,
          fill: q.color,
        }))
          circle.setAttribute(k, String(v));
        const title = document.createElementNS(ns, 'title');
        title.textContent = `${name(uci)} · ${probability(uci)} · ${evaluation(uci)}`;
        mark.append(title, circle);
        mark.addEventListener('click', e => {
          e.preventDefault();
          select(uci);
        });
        mark.addEventListener('focus', () => this.source.hover(uci));
        mark.addEventListener('blur', () => this.source.hover());
        if (uci === this.selected)
          add(
            'text',
            { x: Math.min(width - 30, Math.max(60, x)), y: Math.max(14, y - 12), 'text-anchor': 'middle' },
            name(uci),
          );
        mark.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            select(uci);
          }
        });
        mark.addEventListener('mouseenter', () => this.source.hover(uci));
        mark.addEventListener('mouseleave', () => this.source.hover());
      }
      const axis = document.createElement('p');
      axis.className = 'maia-lab-help';
      axis.textContent = labText('LabMapAxis');
      host.append(svg, axis);
      view.querySelector('[data-lab-map]')!.replaceChildren(host);
    }
    if (focus)
      view
        .querySelector<HTMLButtonElement>(
          `${descriptionFocused ? '[data-lab-description]' : 'tbody'} [data-lab-move="${focus}"]`,
        )
        ?.focus();
  };
}
