import assert from 'node:assert/strict';
import { test } from 'node:test';

test('the native QR module initializes dynamically and redraws a replacement invoice', async () => {
  const original = globalThis.document;
  const frames: Uint8ClampedArray[] = [];
  const canvas = {
    dataset: { qrUrl: 'LIGHTNING:INVOICE-ONE' },
    width: 0,
    height: 0,
    style: {},
    getContext: () => ({
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      }),
      clearRect: () => {},
      putImageData: (image: { data: Uint8ClampedArray }) => frames.push(image.data.slice()),
    }),
  };
  globalThis.document = { querySelectorAll: () => [canvas] } as unknown as Document;
  try {
    const { initModule } = await import('../src/bits.qrcode');
    await initModule();
    const first = frames.at(-1);
    assert.equal(canvas.width, 320);
    assert.ok(first?.some(value => value !== 0));
    canvas.dataset.qrUrl = 'LIGHTNING:INVOICE-TWO';
    await initModule();
    assert.notDeepEqual(frames.at(-1), first);
  } finally {
    globalThis.document = original;
  }
});
