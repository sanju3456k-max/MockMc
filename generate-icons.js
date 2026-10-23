import fs from 'fs';
import path from 'path';

// Brand-consistent white background round icon with green summation (Sigma) matching top header logo
// The Sigma symbol is centered and scaled down inside the ring with ample padding/margin
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512">
  <!-- Round white background circle with MockMc green accent ring -->
  <circle cx="12" cy="12" r="10.5" fill="#ffffff" stroke="#0da574" stroke-width="1.4" />
  
  <!-- Green summation Sigma symbol cleanly centered inside the ring with generous margin -->
  <g transform="translate(12, 12) scale(0.55) translate(-12, -12)">
    <path d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2" 
          fill="none" 
          stroke="#0da574" 
          stroke-width="2.6" 
          stroke-linecap="round" 
          stroke-linejoin="round" />
  </g>
</svg>`;

// PWA Maskable Icon specification: All design elements fit comfortably inside 80% safe area circle
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512">
  <!-- Clean white background for maskable safe area -->
  <rect width="24" height="24" fill="#ffffff" />
  
  <!-- Inner round white emblem with green ring -->
  <circle cx="12" cy="12" r="9" fill="#ffffff" stroke="#0da574" stroke-width="1.2" />
  
  <!-- Green summation Sigma symbol centered with clean margin inside safe zone -->
  <g transform="translate(12, 12) scale(0.48) translate(-12, -12)">
    <path d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2" 
          fill="none" 
          stroke="#0da574" 
          stroke-width="2.6" 
          stroke-linecap="round" 
          stroke-linejoin="round" />
  </g>
</svg>`;

// Favicon version with white round background and green Sigma
const transparentSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512">
  <circle cx="12" cy="12" r="10.5" fill="#ffffff" stroke="#0da574" stroke-width="1.4" />
  <g transform="translate(12, 12) scale(0.55) translate(-12, -12)">
    <path d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2" 
          fill="none" 
          stroke="#0da574" 
          stroke-width="2.6" 
          stroke-linecap="round" 
          stroke-linejoin="round" />
  </g>
</svg>`;

async function buildIcons() {
  const publicDir = path.resolve('public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Write SVGs
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), transparentSvg);
  fs.writeFileSync(path.join(publicDir, 'icon-192.svg'), svgContent);
  fs.writeFileSync(path.join(publicDir, 'icon-512.svg'), svgContent);
  fs.writeFileSync(path.join(publicDir, 'icon-maskable.svg'), maskableSvg);

  try {
    const sharpPath = path.resolve('node_modules', 'sharp');
    if (fs.existsSync(sharpPath)) {
      const sharpModule = await import('sharp');
      const sharp = sharpModule.default || sharpModule;

      // Generate PNGs using Sharp
      const anySvgBuffer = Buffer.from(svgContent);
      const maskableSvgBuffer = Buffer.from(maskableSvg);

      // 1. Generate standard 'any' purpose circular icons
      await sharp(anySvgBuffer)
        .resize(192, 192)
        .png()
        .toFile(path.join(publicDir, 'icon-192.png'));

      await sharp(anySvgBuffer)
        .resize(512, 512)
        .png()
        .toFile(path.join(publicDir, 'icon-512.png'));

      // 2. Generate maskable purpose square-backdrop icons
      await sharp(maskableSvgBuffer)
        .resize(192, 192)
        .png()
        .toFile(path.join(publicDir, 'icon-maskable-192.png'));

      await sharp(maskableSvgBuffer)
        .resize(512, 512)
        .png()
        .toFile(path.join(publicDir, 'icon-maskable-512.png'));

      console.log('Successfully generated all MockMc premium round and maskable icons and PNGs!');
    } else {
      console.log('Vector icons updated; using pre-generated PNG icons in public/.');
    }
  } catch (err) {
    console.log('Vector icons updated; using pre-generated PNG icons in public/.');
  }
}

buildIcons().catch(err => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
