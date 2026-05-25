import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const brand = resolve(root, 'static/brand');
const icons = resolve(root, 'static/icons');

mkdirSync(icons, { recursive: true });

function svgToPng(svgPath, pngPath, size) {
	const svg = readFileSync(svgPath, 'utf8');
	const resvg = new Resvg(svg, {
		fitTo: { mode: 'width', value: size }
	});
	const rendered = resvg.render();
	writeFileSync(pngPath, rendered.asPng());
	console.log(`  ${pngPath} (${size}x${size})`);
}

console.log('Generating PNGs from SVGs...\n');

svgToPng(`${brand}/favicon.svg`, `${brand}/favicon-32.png`, 32);

svgToPng(`${brand}/app-icon.svg`, `${brand}/app-icon-512.png`, 512);
svgToPng(`${brand}/app-icon.svg`, `${brand}/app-icon-192.png`, 192);
svgToPng(`${brand}/app-icon.svg`, `${icons}/icon-512.png`, 512);
svgToPng(`${brand}/app-icon.svg`, `${icons}/icon-192.png`, 192);

svgToPng(`${brand}/app-icon.svg`, `${brand}/apple-touch-icon.png`, 180);

svgToPng(`${brand}/app-icon-ink.svg`, `${brand}/app-icon-ink-512.png`, 512);

svgToPng(`${brand}/app-icon-maskable.svg`, `${brand}/app-icon-maskable-512.png`, 512);
svgToPng(`${brand}/app-icon-maskable.svg`, `${icons}/icon-maskable-512.png`, 512);

console.log('\nDone.');
