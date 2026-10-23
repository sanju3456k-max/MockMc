import { execSync } from 'child_process';
import fs from 'fs';

try {
  console.log('0. Generating PWA icons...');
  execSync('node scripts/generate-icons.js', { stdio: 'inherit' });

  console.log('1. Building Vite frontend assets...');
  execSync('npx vite build', { stdio: 'inherit' });

  console.log('2. Bundling server.ts...');
  execSync('npx esbuild server.ts --bundle --platform=node --format=esm --outdir=dist --packages=external', { stdio: 'inherit' });

  // Create 404.html fallback for GitHub Pages SPA routing
  if (fs.existsSync('dist/index.html')) {
    fs.copyFileSync('dist/index.html', 'dist/404.html');
  }

  console.log('3. Copying dist to build directory...');
  if (fs.existsSync('dist')) {
    fs.cpSync('dist', 'build', { recursive: true });
  }

  // Copy bundled server.js to root server.js for node server.js fallback compatibility
  if (fs.existsSync('dist/server.js')) {
    fs.copyFileSync('dist/server.js', 'server.js');
  }

  console.log('Build finished successfully!');
} catch (error) {
  console.error('Build step failed:', error);
  process.exit(1);
}
