const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
async function copy(from, to) {
  const destination = path.join(root, 'src', 'vendor', to);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(root, 'node_modules', from), destination);
}
async function copyDirectory(from, to) {
  const source = path.join(root, 'node_modules', from);
  const destination = path.join(root, 'src', 'vendor', to);
  await fs.mkdir(destination, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyDirectory(path.relative(path.join(root, 'node_modules'), sourcePath), path.join(to, entry.name));
    else await fs.copyFile(sourcePath, destinationPath);
  }
}
async function main() {
  const assets = path.join(root, 'src', 'assets');
  await fs.mkdir(assets, { recursive: true });
  const logoSource = path.join(root, '..', 'assets', 'Logo', 'Mazen Logo.png');
  const bundledLogo = path.join(assets, 'mazen-logo.png');
  try {
    await fs.copyFile(logoSource, bundledLogo);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // The standalone project repository already includes this logo.
    await fs.access(bundledLogo);
  }
  await Promise.all([
    copy('occt-import-js/dist/occt-import-js.js', 'occt-import-js.js'),
    copy('occt-import-js/dist/occt-import-js.wasm', 'occt-import-js.wasm'),
    copy('occt-import-js/dist/license.occt.txt', 'license.occt.txt'),
    copy('occt-import-js/dist/license.occt-import-js.txt', 'license.occt-import-js.txt'),
    copy('rhino3dm/rhino3dm.js', 'rhino3dm/rhino3dm.js'),
    copy('rhino3dm/rhino3dm.wasm', 'rhino3dm/rhino3dm.wasm'),
    copy('pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs'),
    copyDirectory('pdfjs-dist/cmaps', 'pdf-assets/cmaps'),
    copyDirectory('pdfjs-dist/standard_fonts', 'pdf-assets/standard_fonts'),
    copyDirectory('pdfjs-dist/wasm', 'pdf-assets/wasm')
  ]);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
