import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultEnginePreferences } from '../src/nosweat/preferences';
import { ReviewMaia, reviewAllowed, type MaiaInference } from '../src/nosweat/reviewMaia';
const fen = makeFen(Chess.default().toSetup());
const context = { id: 'first', fens: [fen], preferences: defaultEnginePreferences };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

test('review assistance never loads without an allowed context; cancellation withholds pending results', async () => {
  let loads = 0;
  let releases = 0;
  let predictions = 0;
  const result = deferred<Float32Array>();
  const engine = new ReviewMaia(
    async () => {
      loads++;
      return {
        predict: async () => {
          predictions++;
          return result.promise;
        },
        release: () => releases++,
      };
    },
    () => {},
  );
  engine.set(undefined);
  await tick();
  assert.equal(loads, 0);
  engine.set(context);
  await tick();
  assert.equal(predictions, 1);
  engine.cancel();
  result.resolve(new Float32Array(4352));
  await tick();
  assert.equal(releases, 1);
  assert.deepEqual(engine.primary, []);
  assert.deepEqual(engine.secondary, []);
  assert.equal(predictions, 1);
});

test('navigation rejects old policy and preserves two independent Maia inputs', async () => {
  const old = deferred<Float32Array>();
  const inputs: number[] = [];
  const engine = new ReviewMaia(
    async () => ({
      predict: async input => {
        inputs.push(input.selfElo);
        return inputs.length === 1 ? old.promise : new Float32Array(4352);
      },
      release: () => {},
    }),
    () => {},
  );
  engine.set(context);
  await tick();
  engine.set({ ...context, id: 'second' });
  old.resolve(new Float32Array(4352));
  await tick();
  await tick();
  assert.deepEqual(inputs, [1500, 1500, 2400]);
  assert.ok(engine.primary.length);
  assert.ok(engine.secondary.length);
  engine.cancel();
  assert.deepEqual(engine.primary, []);
});

test('a client created after cancellation is released and never performs inference', async () => {
  const loaded = deferred<MaiaInference>();
  let released = 0;
  let predicted = 0;
  const engine = new ReviewMaia(
    () => loaded.promise,
    () => {},
  );
  engine.set(context);
  await tick();
  engine.cancel();
  loaded.resolve({
    predict: async () => {
      predicted++;
      return new Float32Array(4352);
    },
    release: () => released++,
  });
  await tick();
  assert.equal(released, 1);
  assert.equal(predicted, 0);
});

test('puzzle assistance is available only in visible review with the engine enabled', () => {
  for (const mode of ['play', 'try', 'view'])
    for (const enabled of [false, true])
      for (const hidden of [false, true])
        for (const threat of [false, true])
          assert.equal(
            reviewAllowed(mode, enabled, hidden, threat),
            mode === 'view' && enabled && !hidden && !threat,
          );
});

test('arrow color and visibility changes preserve completed policy without new inference', async () => {
  let predictions = 0;
  const engine = new ReviewMaia(
    async () => ({
      predict: async () => {
        predictions++;
        return new Float32Array(4352);
      },
      release: () => {},
    }),
    () => {},
  );
  engine.set(context);
  await tick();
  await tick();
  assert.equal(predictions, 2);
  const primary = engine.primary;
  engine.set({
    ...context,
    preferences: {
      ...context.preferences,
      maiaArrows: false,
      arrowColors: { ...context.preferences.arrowColors, maia: '#abcdef' },
    },
  });
  await tick();
  assert.equal(predictions, 2);
  assert.equal(engine.primary, primary);
  engine.set({ ...context, preferences: { ...context.preferences, secondMaiaEnabled: false } });
  await tick();
  await tick();
  assert.equal(predictions, 3);
  assert.deepEqual(engine.secondary, []);
  engine.cancel();
});

test('each puzzle Maia conditions both rating inputs at its own selected rating', async () => {
  const inputs: [number, number][] = [];
  const engine = new ReviewMaia(
    async () => ({
      predict: async input => {
        inputs.push([input.selfElo, input.opponentElo]);
        return new Float32Array(4352);
      },
      release: () => {},
    }),
    () => {},
  );
  engine.set({
    ...context,
    preferences: { ...context.preferences, selfElo: 1600, opponentElo: 600, secondMaiaElo: 2600 },
  });
  await tick();
  await tick();
  assert.deepEqual(inputs, [
    [1600, 1600],
    [2600, 2600],
  ]);
  engine.cancel();
});
