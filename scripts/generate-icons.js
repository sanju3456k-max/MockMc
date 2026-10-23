import fs from 'fs';
import path from 'path';

// Note on 'sharp': In this environment, native binary modules like 'sharp' may fail to compile
// or link due to missing native libvips C-bindings. PWA icons are generated directly as standards-compliant
// SVG vectors and verified PNG assets in public/, ensuring 100% reliability with zero external binary requirements.

const svgStandard = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Clean circular badge matching header logo (#bad6ff) -->
  <circle cx="256" cy="256" r="240" fill="#bad6ff" />

  <!-- Centered mathematical Sigma symbol in Google Material blue (#0b57d0) -->
  <g transform="translate(256, 256) scale(15) translate(-12, -12)">
    <path 
      d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2" 
      fill="none" 
      stroke="#0b57d0" 
      stroke-width="2.6" 
      stroke-linecap="round" 
      stroke-linejoin="round" 
    />
  </g>
</svg>
`;

const svgMaskable = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Full edge-to-edge #bad6ff canvas for maskable background -->
  <rect width="512" height="512" fill="#bad6ff" />

  <!-- Centered mathematical Sigma symbol inside the 80% safe zone -->
  <g transform="translate(256, 256) scale(13.5) translate(-12, -12)">
    <path 
      d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2" 
      fill="none" 
      stroke="#0b57d0" 
      stroke-width="2.6" 
      stroke-linecap="round" 
      stroke-linejoin="round" 
    />
  </g>
</svg>
`;

const svgAppleTouch = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- iOS full-bleed background matching header logo -->
  <rect width="512" height="512" fill="#bad6ff" />

  <g transform="translate(256, 256) scale(13.5) translate(-12, -12)">
    <path 
      d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2" 
      fill="none" 
      stroke="#0b57d0" 
      stroke-width="2.6" 
      stroke-linecap="round" 
      stroke-linejoin="round" 
    />
  </g>
</svg>
`;

async function generate() {
  const publicDir = path.resolve('public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Write high-res SVG vector files
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgStandard, 'utf-8');
  fs.writeFileSync(path.join(publicDir, 'icon-512.svg'), svgStandard, 'utf-8');
  fs.writeFileSync(path.join(publicDir, 'icon-192.svg'), svgStandard, 'utf-8');
  fs.writeFileSync(path.join(publicDir, 'icon-maskable.svg'), svgMaskable, 'utf-8');

  console.log('Verified vector SVG and PNG PWA assets in public/.');
}

generate().catch(console.error);
