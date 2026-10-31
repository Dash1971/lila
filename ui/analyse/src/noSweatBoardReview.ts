import type { AcplChart, ChartGame } from 'chart';

import { licon } from 'lib/licon';
import { pubsub } from 'lib/pubsub';
import { bind, confirm, hl, onInsert, type VNode } from 'lib/view';

import type AnalyseCtrl from './ctrl';
import { boardPgn, downloadBoardPgn } from './noSweatPgn';

// The free board uses the same local review, chart and summary as game replay.
// The unsaved board separates editable imports from native-styled local exports.
export class BoardReview {
  private selected = 'computer-analysis';
  private panel?: HTMLElement;
  private chart?: AcplChart;
  private pending = false;
  private generation = 0;
  private dirty = false;
  private failed = false;
  private button?: HTMLButtonElement;
  private copied?: 'pgn' | 'fen';
  private copyError = '';
  private copyTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly ctrl: AnalyseCtrl) {}

  view(inputs?: VNode): VNode {
    this.sync();
    const tab = (id: string, label: string) =>
      hl(
        'button',
        {
          attrs: { type: 'button', role: 'tab', 'aria-selected': String(this.selected === id) },
          class: { active: this.selected === id },
          hook: bind('click', () => {
            this.selected = id;
            if (id === 'computer-analysis') this.ctrl.settings.set('showMainlineAnalysis', true);
            this.ctrl.redraw();
            this.chart?.resize();
          }),
        },
        label,
      );
    return hl(
      'div.analyse__underboard',
      {
        hook: {
          ...onInsert(elm => this.ctrl.noSweat?.mountOpening(elm)),
          destroy: () => clearTimeout(this.copyTimer),
        },
      },
      [
        hl('div.analyse__underboard__menu', { attrs: { role: 'tablist' } }, [
          tab('computer-analysis', i18n.site.computerAnalysis),
          tab('import', 'Import'),
          tab('export', 'Export'),
        ]),
        hl('div.analyse__underboard__panels', [
          hl('div.computer-analysis', {
            class: { active: this.selected === 'computer-analysis' },
            hook: {
              ...onInsert(elm => {
                this.panel = elm;
                pubsub.on('analysis.server.progress', this.onAnalysis);
                this.sync();
              }),
              destroy: () => {
                this.reset();
                this.panel = undefined;
                pubsub.off('analysis.server.progress', this.onAnalysis);
              },
            },
          }),
          hl('div.import', { class: { active: this.selected === 'import' } }, [inputs]),
          hl(
            'div.fen-pgn',
            { class: { active: this.selected === 'export' } },
            this.selected === 'export' ? this.exportView() : [],
          ),
        ]),
      ],
    );
  }

  private exportView(): VNode[] {
    const copyButton = (kind: 'pgn' | 'fen') =>
      hl('button.copy-me__button.button', {
        class: { 'button-metal': this.copied !== kind },
        attrs: {
          type: 'button',
          title: `Copy ${kind.toUpperCase()}`,
          'aria-label': this.copied === kind ? `${kind.toUpperCase()} copied` : `Copy ${kind.toUpperCase()}`,
          'data-icon': this.copied === kind ? licon.Checkmark : licon.Clipboard,
        },
        hook: bind('click', event => {
          event.stopPropagation();
          void this.copy(kind);
        }),
      });
    return [
      hl('div', [
        hl('strong', 'FEN'),
        hl('div.copy-me.analyse__underboard__fen', [
          hl('input.copy-me__target', {
            attrs: { readonly: true, spellcheck: 'false', 'aria-label': 'FEN export' },
            props: { value: this.ctrl.node.fen },
          }),
          copyButton('fen'),
        ]),
      ]),
      hl('div', [
        hl('strong', 'PGN'),
        hl('div.copy-me', [
          hl(
            'button.copy-me__target.text',
            {
              attrs: { type: 'button', 'data-icon': licon.Download },
              hook: bind('click', () => downloadBoardPgn(this.ctrl)),
            },
            'Download PGN',
          ),
          copyButton('pgn'),
        ]),
      ]),
      ...(this.copyError ? [hl('p', { attrs: { role: 'status' } }, this.copyError)] : []),
      hl('div.pgn', { attrs: { 'aria-label': 'PGN export', tabindex: 0 } }, boardPgn(this.ctrl)),
    ];
  }

  private async copy(kind: 'pgn' | 'fen'): Promise<void> {
    try {
      await navigator.clipboard.writeText(kind === 'pgn' ? boardPgn(this.ctrl) : this.ctrl.node.fen);
      this.copied = kind;
      this.copyError = '';
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        this.copied = undefined;
        this.ctrl.redraw();
      }, 1000);
    } catch {
      this.copyError = 'Copy is unavailable. Select the FEN or PGN text, or download the PGN.';
    }
    this.ctrl.redraw();
  }

  private readonly start = () => {
    if (!this.ctrl.canAnalyseMainline()) return;
    this.ctrl.settings.set('showMainlineAnalysis', true);
    void site.asset.loadEsm('analyse.local', { init: { ctrl: this.ctrl, start: true } });
  };

  private readonly clear = async () => {
    if (await confirm(i18n.study.clearLocal)) await this.ctrl.idbTree.clear('analysis');
  };

  private readonly onAnalysis = () => {
    this.dirty = true;
  };

  private reset(): void {
    this.generation++;
    if (this.chart) {
      pubsub.off('ply', this.chart.selectPly);
      this.chart.destroy();
    }
    this.chart = undefined;
    this.pending = false;
    this.failed = false;
    this.panel?.replaceChildren();
    this.button = undefined;
  }

  sync(): void {
    const panel = this.panel;
    if (!panel) return;
    if (!this.ctrl.mainlineAnalysis) {
      if (this.chart || this.pending) this.reset();
      if (!this.button) {
        this.button = document.createElement('button');
        this.button.type = 'button';
        this.button.className = 'button text';
        this.button.dataset.icon = licon.Cogs;
        this.button.onclick = this.start;
        panel.append(this.button);
      }
      this.button.disabled = !this.ctrl.canAnalyseMainline();
      this.button.textContent = this.button.disabled ? 'Add moves to analyze' : 'Analyze game';
      return;
    }
    if (this.chart) {
      if (this.dirty) this.chart.updateData(this.ctrl.data, this.ctrl.mainline);
      this.dirty = false;
      return;
    }
    if (this.pending || this.failed) return;
    this.reset();
    const generation = this.generation;
    this.pending = true;
    const container = document.createElement('div');
    container.id = 'acpl-chart-container';
    container.className = 'analysis-chart nosweat-chart';
    const actions = document.createElement('div');
    actions.className = 'analysis-chart-actions';
    for (const [label, icon, click] of [
      ['Analyze game', licon.Cogs, this.start],
      [i18n.study.clearLocal, licon.X, this.clear],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = label;
      button.setAttribute('aria-label', label);
      button.dataset.icon = icon;
      button.onclick = click;
      actions.append(button);
    }
    const plot = document.createElement('div');
    plot.className = 'analysis-chart-plot';
    const canvas = document.createElement('canvas');
    canvas.id = 'acpl-chart';
    plot.append(canvas);
    container.append(actions, plot);
    panel.append(container);
    void site.asset
      .loadEsm<ChartGame>('chart.game')
      .then(async module => {
        if (generation !== this.generation || !canvas.isConnected) return;
        const chart = await module.acpl(canvas, this.ctrl.data, this.ctrl.mainline);
        if (generation !== this.generation || !canvas.isConnected) {
          pubsub.off('ply', chart.selectPly);
          chart.destroy();
          return;
        }
        this.chart = chart;
        this.pending = false;
        this.dirty = true;
        this.sync();
      })
      .catch(() => {
        if (generation !== this.generation) return;
        this.reset();
        this.failed = true;
        const retry = document.createElement('button');
        retry.className = 'button';
        retry.textContent = 'Retry graph';
        retry.onclick = () => {
          this.failed = false;
          this.sync();
        };
        panel.append(retry);
      });
  }
}
