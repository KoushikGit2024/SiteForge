import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const isWatch = process.argv.includes('--watch');
const distDir = path.resolve('dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy manifest and icons to dist
function copyStaticFiles() {
  const manifestSrc = path.resolve('src/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestSrc, 'utf8'));
  fs.copyFileSync(manifestSrc, path.join(distDir, 'manifest.json'));
  const iconsDist = path.join(distDir, 'icons');
  if (!fs.existsSync(iconsDist)) {
    fs.mkdirSync(iconsDist, { recursive: true });
  }
  const iconsSrc = path.resolve('public/icons');
  const referencedIcons = new Set([
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
  ]);
  for (const icon of referencedIcons) {
    const source = path.resolve('public', icon);
    if (!fs.existsSync(source)) {
      throw new Error(`Manifest icon is missing: ${source}`);
    }
  }
  if (!fs.existsSync(iconsSrc)) {
    throw new Error(`Icon directory is missing: ${iconsSrc}`);
  }
  for (const file of fs.readdirSync(iconsSrc)) {
    fs.copyFileSync(path.join(iconsSrc, file), path.join(iconsDist, file));
  }
}

copyStaticFiles();

const buildOptions = {
  entryPoints: [
    { in: 'src/background/background.ts', out: 'background' },
    { in: 'src/content/siteforge.ts', out: 'siteforge' },
  ],
  bundle: true,
  outdir: 'dist',
  target: ['chrome110'],
  format: 'iife',
  sourcemap: true,
  logLevel: 'info',
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  fs.watchFile(path.resolve('src/manifest.json'), { interval: 500 }, copyStaticFiles);
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('Build completed successfully.');
}
