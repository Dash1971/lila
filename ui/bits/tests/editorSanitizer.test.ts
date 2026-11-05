import assert from 'node:assert/strict';
import { test } from 'node:test';
// Toast UI reads the browser Element constructor while loading.
Object.defineProperty(globalThis, 'Element', { value: window.Element, configurable: true });
const { Editor } = await import('@toast-ui/editor');

function render(markdown: string): HTMLElement {
  const el = document.createElement('div');
  document.body.append(el);
  const viewer = Editor.factory({ el, viewer: true, initialValue: markdown, usageStatistics: false });
  const copy = el.cloneNode(true) as HTMLElement;
  viewer.destroy();
  el.remove();
  return copy;
}

test('the actual forum editor viewer sanitizes hostile HTML and namespace payloads', () => {
  for (const html of [
    '<img src="x" onerror="window.security279=true"><script>window.security279=true</script>',
    '<svg><style><a id="</style><img src=x onerror=window.security279=true>">',
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=window.security279=true>">',
    '<a href="javascript:window.security279=true">unsafe</a>',
  ]) {
    const output = render(html);
    assert.equal(output.querySelector('script, iframe, object'), null);
    for (const el of output.querySelectorAll('*'))
      for (const attr of el.attributes) {
        assert.ok(!/^on/i.test(attr.name), `${attr.name} survived sanitization`);
        if (['href', 'src'].includes(attr.name)) assert.ok(!/^javascript:/i.test(attr.value));
      }
  }
});

test('the updated editor retains normal forum headings, links, tables and images', () => {
  const output = render('## Chess\n\n**Strong move** [link](https://mutechess.org)\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n![Knight](https://mutechess.org/knight.png)');
  assert.equal(output.querySelector('h2')?.textContent, 'Chess');
  assert.equal(output.querySelector('strong')?.textContent, 'Strong move');
  assert.equal(output.querySelector('a')?.getAttribute('href'), 'https://mutechess.org');
  assert.equal(output.querySelectorAll('td').length, 2);
  assert.equal(output.querySelector('img')?.getAttribute('alt'), 'Knight');
});
