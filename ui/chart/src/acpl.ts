import {
  type ChartConfiguration,
  type ChartDataset,
  type PointStyle,
  Chart,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

import { defined } from 'lib';
import { renderEval, winningChances } from 'lib/ceval';
import { plyToTurn } from 'lib/game/chess';
import { pubsub } from 'lib/pubsub';
import type { TreeNodeBase } from 'lib/tree/types';

import division from './division';
import {
  blackFill,
  fontColor,
  fontFamily,
  maybeChart,
  orangeAccent,
  plyLine,
  selectPly,
  tooltipBgColor,
  whiteFill,
  axisOpts,
} from './index';
import type { AcplChart, AnalyseData, Player } from './interface';
import { classificationPoint } from './moveClassifications';

Chart.register(LineController, LinearScale, PointElement, LineElement, Tooltip, Filler, ChartDataLabels);
export default async function (
  el: HTMLCanvasElement,
  data: AnalyseData,
  mainline: TreeNodeBase[],
): Promise<AcplChart> {
  const possibleChart = maybeChart(el);
  if (possibleChart) return possibleChart as AcplChart;
  const blurBackgroundColorWhite = 'white';
  const blurBackgroundColorBlack = 'black';
  const ply = plyLine(0);
  const divisionLines = division(data.game.division);
  const firstPly = mainline[0].ply;

  const makeDataset = (
    d: AnalyseData,
    mainline: TreeNodeBase[],
  ): { acpl: ChartDataset<'line'>; moveLabels: string[] } => {
    const pointBackgroundColors: string[] = [];
    const pointBorderColors: string[] = [];
    const pointBorderWidths: number[] = [];
    const moveLabels: string[] = [];
    const pointStyles: PointStyle[] = [];
    const pointSizes: number[] = [];
    const winChances: { x: number; y: number }[] = [];
    const blurs = [toBlurArray(d.player), toBlurArray(d.opponent)];
    if (d.player.color === 'white') blurs.reverse();
    mainline.slice(1).forEach(node => {
      const isWhite = (node.ply & 1) === 1;
      let cp: number | undefined = node.eval && 0;
      if (node.eval?.mate) cp = node.eval.mate > 0 ? Infinity : -Infinity;
      else if (node.san?.includes('#')) cp = isWhite ? Infinity : -Infinity;
      if (cp && d.game.variant.key === 'antichess' && node.san?.includes('#')) cp = -cp;
      else if (node.eval?.cp) cp = node.eval.cp;
      const turn = plyToTurn(node.ply);
      const dots = isWhite ? '.' : '...';
      const winchance = winningChances.povChances('white', { cp });
      // Plot winchance because logarithmic but display the corresponding cp.eval from AnalyseData in the tooltip
      winChances.push({ x: node.ply, y: winchance });
      const label = turn + dots + ' ' + node.san;
      let annotation = '';
      const isBlur =
        blurs[isWhite ? 1 : 0][Math.floor((node.ply - (d.game.startedAtTurn || 0) - 1) / 2)] === '1';
      const point = classificationPoint(
        node,
        orangeAccent,
        isBlur ? (isWhite ? blurBackgroundColorWhite : blurBackgroundColorBlack) : undefined,
      );
      const classified = point.classification;
      if (classified) {
        const name = 'advice' in classified ? i18n.site[classified.advice] : classified.name;
        annotation = ` [${classified.symbol} ${name}]`;
      }
      if (isBlur) annotation += ' [blur]';
      moveLabels.push(label + annotation);
      pointStyles.push(point.style);
      pointSizes.push(point.radius);
      pointBackgroundColors.push(point.color);
      pointBorderColors.push(point.border);
      pointBorderWidths.push(point.borderWidth);
    });
    return {
      acpl: {
        label: i18n.site.advantage,
        data: winChances,
        borderWidth: 1,
        fill: {
          target: 'origin',
          below: blackFill,
          above: whiteFill,
        },
        pointRadius: pointSizes,
        pointHoverRadius: 5,
        pointHitRadius: 100,
        borderColor: orangeAccent,
        pointBackgroundColor: pointBackgroundColors,
        pointBorderColor: pointBorderColors,
        pointBorderWidth: pointBorderWidths,
        pointHoverBackgroundColor: pointBackgroundColors,
        pointHoverBorderColor: pointBorderColors,
        pointHoverBorderWidth: pointBorderWidths,
        pointStyle: pointStyles,
        hoverBackgroundColor: orangeAccent,
        order: 5,
        datalabels: { display: false },
      },
      moveLabels,
    };
  };

  const dataset = makeDataset(data, mainline);
  const acpl = dataset.acpl;
  const moveLabels = dataset.moveLabels;
  const config: ChartConfiguration<'line'> = {
    type: 'line',
    data: {
      labels: moveLabels.map((_, index) => index),
      datasets: [acpl, ply, ...divisionLines],
    },
    options: {
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false,
      },
      scales: axisOpts(firstPly + 1, mainline.length + firstPly),
      animation: false,
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        tooltip: {
          borderColor: fontColor,
          borderWidth: 1,
          backgroundColor: tooltipBgColor,
          bodyColor: fontColor,
          titleColor: fontColor,
          titleFont: fontFamily(14, 'bold'),
          bodyFont: fontFamily(13),
          caretPadding: 10,
          displayColors: false,
          filter: item => item.datasetIndex === 0,
          callbacks: {
            label: item => {
              const ev = mainline[item.dataIndex + 1]?.eval;
              if (defined(ev?.mate)) return i18n.site.advantage + ': #' + ev.mate;
              if (defined(ev?.cp)) return i18n.site.advantage + ': ' + renderEval(ev.cp);
              return '';
            },
            title: items => (items[0] ? moveLabels[items[0].dataIndex] : ''),
          },
        },
      },
      onClick(_event, elements, _chart) {
        const data = elements[elements.findIndex(element => element.datasetIndex === 0)];
        if (data) pubsub.emit('analysis.chart.click', data.index);
      },
    },
  };
  const acplChart = new Chart(el, config) as AcplChart;
  acplChart.selectPly = selectPly.bind(acplChart);
  acplChart.updateData = (d: AnalyseData, nodes: TreeNodeBase[]) => {
    mainline = nodes;
    const dataset = makeDataset(d, nodes);
    moveLabels.splice(0, moveLabels.length, ...dataset.moveLabels);
    acplChart.data.labels = moveLabels.map((_, index) => index);
    // Analysis arrives after the initial chart: replace glyph styles and labels too.
    Object.assign(acplChart.data.datasets[0], dataset.acpl);
    acplChart.update('none');
  };
  pubsub.on('ply', acplChart.selectPly);
  pubsub.emit('ply.trigger');
  christmasTree(acplChart, () => mainline);
  return acplChart;
}

const toBlurArray = (player: Player) => player.blurs?.bits?.split('') ?? [];

function christmasTree(chart: AcplChart, mainline: () => TreeNodeBase[]) {
  $(chart.canvas.closest('.analyse') ?? document.body)
    .on('mouseenter', '.advice-summary div.symbol', function (this: HTMLElement) {
      if (!chart.canvas.isConnected) return;
      const symbol = this.getAttribute('data-symbol');
      const playerColorBit = this.getAttribute('data-color') === 'white' ? 1 : 0;
      if (symbol && ['??', '?', '?!', '!!', '!', '!?'].includes(symbol)) {
        const nodes = mainline();
        const points = nodes
          .filter(
            node => node.glyphs?.some(glyph => glyph.symbol === symbol) && (node.ply & 1) === playerColorBit,
          )
          .map(node => ({ datasetIndex: 0, index: node.ply - nodes[0].ply - 1 }));
        chart.setActiveElements(points);
        chart.update('none');
      }
    })
    .on('mouseleave', '.advice-summary div.symbol', function (this: HTMLElement) {
      if (!chart.canvas.isConnected) return;
      chart.setActiveElements([]);
      chart.update('none');
    });
}
