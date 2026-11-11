import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MANGAL_FONT_BASE64 } from '@/assets/fonts/mangalBase64';
import { MANGAL_BOLD_FONT_BASE64 } from '@/assets/fonts/mangalBoldBase64';

/**
 * The live server has no fonts at all, so text in the bill images came out as empty boxes. Before
 * the first image is drawn, Mangal (regular and bold, Hindi and English letters) is written to the
 * temp folder with a font settings file that points there and draws every family the images ask
 * for (Arial, sans-serif, Courier...) with Mangal. A computer that has its own fonts is left alone.
 */
let fontsReady = false;
function bundleFonts() {
  if (fontsReady) return;
  fontsReady = true;
  if (process.platform !== 'linux') return;
  const dir = join(tmpdir(), 'ana-fonts');
  mkdirSync(dir, { recursive: true });
  for (const [name, b64] of [['mangal.ttf', MANGAL_FONT_BASE64], ['mangalb.ttf', MANGAL_BOLD_FONT_BASE64]]) {
    const file = join(dir, name);
    if (!existsSync(file)) writeFileSync(file, Buffer.from(b64, 'base64'));
  }
  const alias = (family: string) => `<alias><family>${family}</family><prefer><family>Mangal</family></prefer></alias>`;
  const conf = join(dir, 'fonts.conf');
  writeFileSync(conf, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${dir}</dir>
  <cachedir>${join(dir, 'cache')}</cachedir>
  ${['sans-serif', 'serif', 'monospace', 'Arial', 'Courier New', 'MangalEmbedded'].map(alias).join('\n  ')}
</fontconfig>
`);
  process.env.FONTCONFIG_FILE = conf;
  process.env.FONTCONFIG_PATH = dir;
}

// A bill image drawn as SVG, turned into the PNG sent on WhatsApp
export async function svgToPng(svg: string): Promise<Buffer> {
  bundleFonts();
  return sharp(Buffer.from(svg)).png().toBuffer();
}
