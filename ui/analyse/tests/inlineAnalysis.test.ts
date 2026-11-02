import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import type AnalyseCtrl from '../src/ctrl';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
let engines: TestEngine[] = [];
class TestEngine {
  nodes = [];
  isCurrent = true;
  busy = false;
  division = deferred<object>();
  evaluation = deferred<any>();
  classification = deferred<boolean>();
  searches = 0;
  stopped = false;
  constructor() {
    engines.push(this);
  }
  getDivision() {
    return this.division.promise;
  }
  analyse(
    _search: unknown,
    _division: unknown,
    progress: (done: number, total: number, nodes: number) => void,
  ) {
    this.searches++;
    progress(2, 8, 1000);
    return this.evaluation.promise;
  }
  verifyBrilliants(_result: unknown, progress: (done: number, total: number, phase?: string) => void) {
    progress(1, 3, 'Classifying moves');
    return this.classification.promise;
  }
  stop() {
    this.stopped = true;
    this.evaluation.reject('cancelled');
    // A cancelled preparation has not yet awaited evaluation.
    void this.evaluation.promise.catch(() => {});
    this.classification.resolve(false);
  }
}
mock.module('../src/study/studyChapters.ts', { namedExports: { isFinished: () => false } });
mock.module('../src/local/localAnalysisEngine.ts', { namedExports: { LocalAnalysisEngine: TestEngine } });
document.documentElement.lang = 'en-US';
Object.assign(globalThis, { MutationObserver: window.MutationObserver });
const { inlineAnalysis } = await import('../src/local/inlineAnalysis');
const tick = () => new Promise(resolve => setImmediate(resolve));
const result = { localUpdate: { analysis: {}, tree: { id: '', children: [] } } };
function setup(loadI18n = async () => {}) {
  engines = [];
  localStorage.clear();
  document.body.innerHTML =
    '<div class="analyse__underboard__panels"><div class="computer-analysis"><div class="nosweat-review-chart"></div></div></div>';
  const selects = mock.fn();
  const saves = mock.fn(async () => {});
  const merges = mock.fn(() => {
    document.querySelector('.nosweat-review-chart')!.innerHTML = '<canvas id="acpl-chart"></canvas>';
  });
  (site as any).asset = { loadI18n };
  const ctrl = {
    synthetic: true,
    noSweat: { boardReview: { showComputerAnalysis: selects } },
    opts: {},
    data: {},
    settings: { set() {} },
    canAnalyseMainline: () => true,
    idbTree: { saveAnalysis: saves, hasLocalAnalysis: true },
    mergeMainlineAnalysisData: merges,
    ceval: {
      rules: 'chess',
      engines: { supporting: () => [{ id: '__sf_19_smallnet', minThreads: 1, maxThreads: 2 }] },
    },
  } as unknown as AnalyseCtrl;
  return { ctrl, selects, saves, merges };
}

test('inline start deduplicates while assets load and keeps the native graph when classification stops', async () => {
  const assets = deferred<void>();
  const { ctrl, selects, saves, merges } = setup(() => assets.promise);
  const job = inlineAnalysis(ctrl);
  await inlineAnalysis(ctrl);
  assert.equal(document.querySelectorAll('.nosweat-inline-analysis').length, 1);
  assert.equal(engines.length, 0);
  assert.equal(selects.mock.callCount(), 2);
  assets.resolve();
  await tick();
  const engine = engines[0];
  engine.division.resolve({});
  await tick();
  assert.equal(engine.searches, 1);
  assert.equal(document.querySelector('progress')!.getAttribute('value'), '2');
  engine.evaluation.resolve(result);
  await tick();
  assert.equal(saves.mock.callCount(), 1);
  assert.equal(merges.mock.callCount(), 1);
  assert.ok(document.querySelector('#acpl-chart'));
  assert.equal(document.querySelector('progress')!.hasAttribute('value'), false);
  document.querySelector<HTMLButtonElement>('.nosweat-inline-analysis button')!.click();
  await job;
  assert.ok(document.querySelector('#acpl-chart'));
  assert.match(document.querySelector('[role=status]')!.textContent, /classification interrupted/);
  assert.equal(document.querySelector('progress'), null);
  assert.equal(document.querySelector('dialog'), null);
  window.dispatchEvent(new window.Event('pagehide'));
});

test('Stop during preparation prevents engine work and permits another run', async () => {
  const { ctrl, saves } = setup();
  const job = inlineAnalysis(ctrl);
  await tick();
  document.querySelector<HTMLButtonElement>('.nosweat-inline-analysis button')!.click();
  engines[0].division.resolve({});
  await job;
  assert.equal(engines[0].searches, 0);
  assert.equal(saves.mock.callCount(), 0);
  assert.match(document.querySelector('[role=status]')!.textContent, /stopped/);
  const again = inlineAnalysis(ctrl);
  await tick();
  assert.equal(engines.length, 2);
  assert.equal(document.querySelectorAll('.nosweat-inline-analysis').length, 1);
  window.dispatchEvent(new window.Event('pagehide'));
  engines[1].division.resolve({});
  await again;
});

for (const action of ['unmount', 'pagehide'] as const)
  test(`${action} cancels the runner without saving stale results`, async () => {
    const { ctrl, saves } = setup();
    const job = inlineAnalysis(ctrl);
    await tick();
    const engine = engines[0];
    engine.division.resolve({});
    await tick();
    if (action === 'unmount') document.querySelector('.computer-analysis')!.remove();
    else window.dispatchEvent(new window.Event('pagehide'));
    await tick();
    await job;
    assert.equal(engine.stopped, true);
    assert.equal(saves.mock.callCount(), 0);
    assert.equal(document.querySelector('.nosweat-inline-analysis'), null);
  });

test('engine errors appear inline and a completed run retains both native saves', async () => {
  const { ctrl, saves, merges } = setup();
  const failed = inlineAnalysis(ctrl);
  await tick();
  engines[0].division.resolve({});
  await tick();
  engines[0].evaluation.reject(new Error('test engine unavailable'));
  await failed;
  assert.match(document.querySelector('[role=status]')!.textContent, /test engine unavailable/);
  assert.equal(document.querySelector('dialog'), null);
  const complete = inlineAnalysis(ctrl);
  await tick();
  engines[1].division.resolve({});
  await tick();
  engines[1].evaluation.resolve(result);
  await tick();
  engines[1].classification.resolve(true);
  await complete;
  assert.equal(saves.mock.callCount(), 2);
  assert.equal(merges.mock.callCount(), 2);
  assert.ok(document.querySelector('#acpl-chart'));
  assert.equal(document.querySelector('progress'), null);
  window.dispatchEvent(new window.Event('pagehide'));
});
