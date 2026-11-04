import assert from 'node:assert/strict';
import { test } from 'node:test';
import QRCode from 'qrcode';

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

test('payment and authenticator QR codes retain four quiet modules at Retina resolution', async () => {
  const originalDocument = globalThis.document;
  const originalRatio = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  let frame: Uint8ClampedArray | undefined;
  const canvas = {
    dataset: { qrUrl: 'LIGHTNING:LNBC1' + 'A'.repeat(1500), width: '320' },
    width: 0,
    height: 0,
    style: { width: '', height: '' },
    getContext: () => ({
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      }),
      clearRect: () => {},
      putImageData: (image: { data: Uint8ClampedArray }) => {
        frame = image.data.slice();
      },
    }),
  };
  globalThis.document = { querySelectorAll: () => [canvas] } as unknown as Document;
  Object.defineProperty(globalThis, 'devicePixelRatio', { value: 2, configurable: true });
  try {
    const { initModule } = await import('../src/bits.qrcode');
    for (const [payload, width] of [
      [canvas.dataset.qrUrl, 320],
      ['otpauth://totp/Mute%20Chess:player?secret=TEST&issuer=Mute%20Chess', 200],
    ] as const) {
      canvas.dataset.qrUrl = payload;
      canvas.dataset.width = String(width);
      await initModule();
      assert.equal(canvas.width, width * 2);
      assert.equal(canvas.height, width * 2);
      assert.equal(canvas.style.width, `${width}px`);
      assert.equal(canvas.style.height, 'auto');
      assert.ok(frame);
      const cells = QRCode.create(payload).modules.size + 8;
      const border = Math.floor((canvas.width * 4) / cells);
      let darkPixels = 0;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++)
          if (frame[(y * canvas.width + x) * 4] === 0) {
            darkPixels++;
            assert.ok(x >= border && y >= border && x < canvas.width - border && y < canvas.height - border);
          }
      assert.ok(darkPixels > 0);
    }
  } finally {
    globalThis.document = originalDocument;
    if (originalRatio) Object.defineProperty(globalThis, 'devicePixelRatio', originalRatio);
    else Reflect.deleteProperty(globalThis, 'devicePixelRatio');
  }
});
