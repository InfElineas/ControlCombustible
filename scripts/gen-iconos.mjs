// Genera las imagenes base del icono de la APK a partir del logo de la web.
//
// Salida en assets/, que es donde las busca @capacitor/assets:
//   icon.png             logo completo, para el icono clasico
//   icon-background.png  solo el degradado, a sangre
//   icon-foreground.png  solo el simbolo, centrado y con margen
//   splash.png           pantalla de arranque
//
// Android recorta el icono adaptativo con distintas mascaras segun el
// dispositivo (circulo, cuadrado redondeado, cuadrado) y solo garantiza visible
// el 66% central. Por eso el primer plano lleva solo el simbolo reducido: si se
// usara el logo entero, la mascara se comeria sus esquinas redondeadas.
//
// Uso: node scripts/gen-iconos.mjs

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SALIDA = 'assets';
const LADO = 1024;

const DEGRADADO = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0ea5e9"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
  </defs>`;

// El surtidor, calcado del logo de la web
const SIMBOLO = `
  <path d="M40 34h26c10 0 18 8 18 18v22c0 10-8 18-18 18H40z" fill="#fff" opacity="0.95"/>
  <rect x="46" y="42" width="26" height="20" rx="6" fill="#0ea5e9"/>
  <circle cx="59" cy="87" r="9" fill="#f59e0b"/>
  <path d="M94 48h8v22h-8z" fill="#fff"/>
  <path d="M98 70c0 8-6 14-14 14" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`;

const svg = (contenido, lado = 128) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}">${contenido}</svg>`;

// A sangre y con el simbolo centrado: el logo de la web lleva un margen que
// deja el cuadrado flotando, y en el lanzador eso se veria como un borde blanco
// alrededor del icono. Los lanzadores ya aplican su propia mascara.
const ICONO = svg(`${DEGRADADO}
  <rect x="0" y="0" width="128" height="128" fill="url(#g)"/>
  <g transform="translate(64,64) scale(0.82) translate(-71,-67.5)">
    ${SIMBOLO}
  </g>`);

const FONDO = svg(`${DEGRADADO}
  <rect x="0" y="0" width="128" height="128" fill="url(#g)"/>`);

// El simbolo abarca de 40 a 102 en horizontal y de 34 a 101 en vertical: su
// centro esta en (71, 67.5), no en el del lienzo, asi que se recoloca antes de
// escalarlo al 78% para dejar margen a las mascaras.
const FRENTE = svg(`
  <g transform="translate(64,64) scale(0.78) translate(-71,-67.5)">
    ${SIMBOLO}
  </g>`);

const SPLASH = svg(`${DEGRADADO}
  <rect x="0" y="0" width="512" height="512" fill="#f8fafc"/>
  <g transform="translate(256,256) scale(2.2) translate(-64,-64)">
    <rect x="8" y="8" width="112" height="112" rx="24" fill="url(#g)"/>
    ${SIMBOLO}
  </g>`, 512);

async function generar(nombre, contenidoSvg, lado, fondo) {
  const destino = `${SALIDA}/${nombre}`;
  let img = sharp(Buffer.from(contenidoSvg), { density: 384 }).resize(lado, lado, {
    fit: 'contain',
    background: fondo ?? { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (fondo) img = img.flatten({ background: fondo });
  await img.png().toFile(destino);
  const { width, height, channels } = await sharp(destino).metadata();
  console.log(`${destino}  ${width}x${height}  ${channels} canales`);
}

await mkdir(SALIDA, { recursive: true });
// El icono clasico y el fondo van opacos; el primer plano transparente para que
// Android lo superponga sobre el fondo.
await generar('icon.png', ICONO, LADO, { r: 255, g: 255, b: 255 });
await generar('icon-background.png', FONDO, LADO, { r: 14, g: 165, b: 233 });
await generar('icon-foreground.png', FRENTE, LADO);
await generar('splash.png', SPLASH, 2732, { r: 248, g: 250, b: 252 });
