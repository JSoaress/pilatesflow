// Regera os ícones do PWA a partir de public/icons/icon.svg (requer `sharp`, já em devDependencies).
// Uso: npm run icons   — substitua icon.svg pelo logo da sua clínica antes, se desejar.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/icons/icon.svg', import.meta.url));
const out = (f) => new URL(`../public/icons/${f}`, import.meta.url).pathname;
await sharp(svg).resize(192, 192).png().toFile(out('icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(out('icon-512.png'));
// maskable: logo reduzido sobre fundo cheio (zona segura de 80%)
const inner = await sharp(svg).resize(368, 368).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#2F6B5A' } }).composite([{ input: inner, gravity: 'center' }]).png().toFile(out('icon-maskable-512.png'));
await sharp({ create: { width: 180, height: 180, channels: 3, background: '#2F6B5A' } }).composite([{ input: await sharp(svg).resize(130, 130).png().toBuffer(), gravity: 'center' }]).png().toFile(out('apple-touch-icon.png'));
console.log('Ícones gerados em public/icons/');
