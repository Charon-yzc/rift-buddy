import test from 'node:test';
import assert from 'node:assert/strict';

test('postgame UI styles and badges conform to WeGame aesthetic standards', async () => {
  // Read postgame.css to verify design tokens and anti-slop rules
  const fs = await import('node:fs/promises');
  const css = await fs.readFile('src/postgame.css', 'utf8');

  // Verify theme tokens
  assert.match(css, /--rb-bg:\s*#10151e/);
  assert.match(css, /--rb-accent:\s*#8df1c2/);
  assert.match(css, /--rb-gold:\s*#fbbf24/);
  assert.match(css, /--rb-blue:\s*#38bdf8/);
  assert.match(css, /--rb-red:\s*#f43f5e/);

  // Verify acrylic backdrop blur and rounded border
  assert.match(css, /backdrop-filter:\s*blur\(24px\)/);
  assert.match(css, /border-radius:\s*12px/);

  // Verify MVP and SVP badge styles
  assert.match(css, /\.postgame-badge\.mvp/);
  assert.match(css, /\.postgame-badge\.svp/);
  assert.match(css, /\.postgame-badge\.damage-king/);
  assert.match(css, /\.postgame-badge\.tank-king/);

  // Verify empty item sockets (recessed, not wireframe)
  assert.match(css, /\.postgame-empty-item/);
  assert.match(css, /box-shadow:\s*inset 0 1px 2px/);

  // Verify compact 2x3 item grid and trinket column (layout overflow fix)
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*17px\)\s*17px/);
  assert.match(css, /\.postgame-item-icon\.trinket/);

  // Verify badge cluster overflow protection
  assert.match(css, /\.postgame-badge-cluster[\s\S]*?overflow:\s*hidden/);

  // Verify self player highlight
  assert.match(css, /\.postgame-player-row\.is-self/);
  assert.match(css, /box-shadow:\s*inset 2\.5px 0 0 #8df1c2/);
});
