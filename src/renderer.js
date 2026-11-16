import * as THREE from '../node_modules/three/build/three.module.js';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from '../node_modules/three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from '../node_modules/three/examples/jsm/environments/RoomEnvironment.js';
import { STLLoader } from '../node_modules/three/examples/jsm/loaders/STLLoader.js';
import { FBXLoader } from '../node_modules/three/examples/jsm/loaders/FBXLoader.js';
import { Rhino3dmLoader } from '../node_modules/three/examples/jsm/loaders/3DMLoader.js';
import { OBJLoader } from '../node_modules/three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from '../node_modules/three/examples/jsm/loaders/PLYLoader.js';
import { ColladaLoader } from '../node_modules/three/examples/jsm/loaders/ColladaLoader.js';
import { TDSLoader } from '../node_modules/three/examples/jsm/loaders/TDSLoader.js';
import { ThreeMFLoader } from '../node_modules/three/examples/jsm/loaders/3MFLoader.js';
import { AMFLoader } from '../node_modules/three/examples/jsm/loaders/AMFLoader.js';
import * as pdfjsLib from '../node_modules/pdfjs-dist/build/pdf.mjs';

const $ = (id) => document.getElementById(id);
const previewMode = new URLSearchParams(location.search).has('preview');
if (previewMode) document.documentElement.classList.add('preview-mode');
const canvas = $('canvas'), viewport = $('viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#25282e');
const environmentGenerator = new THREE.PMREMGenerator(renderer);
const studioEnvironment = environmentGenerator.fromScene(new RoomEnvironment(), 0.04);
environmentGenerator.dispose();
scene.environment = studioEnvironment.texture;
scene.environmentIntensity = 1.8;
scene.add(new THREE.HemisphereLight(0xffffff, 0x535761, 2.15));
const camera = new THREE.PerspectiveCamera(30, 1, 0.001, 100);
camera.up.set(0, 0, 1);
camera.position.set(0.65, -1.3, 0.15);
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(0.2, 0.35, 0.2);
key.target.position.set(0, 0, -1);
camera.add(key, key.target);
scene.add(camera);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.dampingFactor = 0.06; controls.enablePan = true; controls.enableZoom = true; controls.autoRotateSpeed = 1;
const grid = new THREE.GridHelper(10, 20, 0x515c71, 0x343b49);
grid.rotation.x = Math.PI / 2;
grid.material.transparent = true; grid.material.opacity = 0.55; grid.visible = false; scene.add(grid);
const gltfLoader = new GLTFLoader();
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', location.href).href;
let current = null;
let currentIsGlb = false;
let pdfDocument = null;
let pdfRenderTask = null;
let pdfPageNumber = 1;
let pdfZoom = 1;
let imageObjectUrl = null;
const positionInputs = [...document.querySelectorAll('[data-position-axis]')];
const positionNumberInputs = [...document.querySelectorAll('[data-position-value]')];
const rotationInputs = [...document.querySelectorAll('[data-rotation-axis]')];
const rotationNumberInputs = [...document.querySelectorAll('[data-rotation-value]')];
const transformControls = $('transformControls');

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport); resize();

function frame(object) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3()), sphere = box.getBoundingSphere(new THREE.Sphere());
  const distance = Math.max((sphere.radius * 0.95) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)), 0.02);
  controls.target.copy(center);
  const direction = currentIsGlb
    ? new THREE.Vector3(0.65, 0.15, 1.3).applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    : new THREE.Vector3(1, 0.72, 1.25);
  camera.up.set(0, 0, 1);
  camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));
  camera.near = Math.max(sphere.radius / 1000, 0.001); camera.far = distance + sphere.radius * 5;
  camera.updateProjectionMatrix(); controls.update();
  breathBaseDistance = camera.position.distanceTo(controls.target); breathStartTime = performance.now();
}
function dispose(object) {
  object.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (!node.material) return;
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}
function showStatus(text) { const el = $('status'); el.textContent = text; el.hidden = !text; }
function formatBytes(n) { return n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`; }

function clearDocumentPreview() {
  if (pdfRenderTask) {
    try { pdfRenderTask.cancel(); } catch {}
    pdfRenderTask = null;
  }
  if (pdfDocument) {
    pdfDocument.destroy().catch(() => {});
    pdfDocument = null;
  }
  if (imageObjectUrl) {
    URL.revokeObjectURL(imageObjectUrl);
    imageObjectUrl = null;
  }
  $('documentViewer').hidden = true;
  $('pdfToolbar').hidden = true;
  $('pdfPageViewport').hidden = true;
  $('imagePreview').hidden = true;
  viewport.classList.remove('document-mode');
  canvas.style.display = 'block';
}

function showImage(name, buffer, ext, sourceLabel = null) {
  if (current) { scene.remove(current); dispose(current); current = null; }
  currentIsGlb = false;
  transformControls.disabled = true;
  clearDocumentPreview();
  const mime = ({ svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif', tif: 'image/tiff', tiff: 'image/tiff' })[ext];
  imageObjectUrl = URL.createObjectURL(new Blob([buffer], { type: mime }));
  const image = $('imagePreview');
  image.hidden = false;
  image.src = imageObjectUrl;
  $('pdfPageViewport').hidden = true;
  $('pdfToolbar').hidden = true;
  $('documentViewer').hidden = false;
  viewport.classList.add('document-mode');
  canvas.style.display = 'none';
  $('welcome').hidden = true;
  $('fileName').textContent = name;
  image.onload = () => {
    $('fileInfo').textContent = `${sourceLabel || `${ext.toUpperCase()} image`} · ${image.naturalWidth} × ${image.naturalHeight} · ${formatBytes(buffer.byteLength)}`;
    showStatus('');
    if (previewMode) window.glbApp.previewReady(true);
  };
  image.onerror = () => { showStatus('This image could not be displayed.'); if (previewMode) window.glbApp.previewReady(false); };
}

async function renderPdfPage(pageNumber) {
  if (!pdfDocument) return;
  if (pdfRenderTask) {
    try { pdfRenderTask.cancel(); } catch {}
    pdfRenderTask = null;
  }
  const page = await pdfDocument.getPage(pageNumber);
  const pageViewport = $('pdfPageViewport');
  const baseViewport = page.getViewport({ scale: 1 });
  const fitScale = Math.min((pageViewport.clientWidth - 48) / baseViewport.width, 1.5);
  const scale = Math.max(0.1, fitScale * pdfZoom);
  const view = page.getViewport({ scale });
  const canvas = $('pdfCanvas');
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.ceil(view.width * pixelRatio);
  canvas.height = Math.ceil(view.height * pixelRatio);
  canvas.style.width = `${view.width}px`;
  canvas.style.height = `${view.height}px`;
  const context = canvas.getContext('2d');
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  pdfRenderTask = page.render({ canvasContext: context, viewport: view });
  await pdfRenderTask.promise;
  pdfRenderTask = null;
  pdfPageNumber = pageNumber;
  $('pdfPageNumber').value = String(pageNumber);
  $('pdfZoomLabel').textContent = `${Math.round(pdfZoom * 100)}%`;
  page.cleanup();
}

async function showPdf(name, buffer) {
  if (current) { scene.remove(current); dispose(current); current = null; }
  currentIsGlb = false;
  transformControls.disabled = true;
  clearDocumentPreview();
  $('documentViewer').hidden = false;
  $('pdfToolbar').hidden = false;
  $('pdfPageViewport').hidden = false;
  $('imagePreview').hidden = true;
  viewport.classList.add('document-mode');
  canvas.style.display = 'none';
  $('welcome').hidden = true;
  $('fileName').textContent = name;
  showStatus('Loading PDF…');
  try {
    pdfDocument = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    pdfPageNumber = 1;
    pdfZoom = 1;
    $('pdfPageCount').textContent = String(pdfDocument.numPages);
    $('pdfPageNumber').max = String(pdfDocument.numPages);
    $('fileInfo').textContent = `PDF document · ${pdfDocument.numPages} ${pdfDocument.numPages === 1 ? 'page' : 'pages'} · ${formatBytes(buffer.byteLength)}`;
    await renderPdfPage(1);
    showStatus('');
    if (previewMode) window.glbApp.previewReady(true);
  } catch (error) {
    console.error(error);
    showStatus(error.message || 'This PDF could not be displayed.');
    if (previewMode) window.glbApp.previewReady(false);
  }
}

async function openPath(filePath) {
  if (!filePath) return;
  showStatus('Loading model…');
  try {
    const ext = filePath.split('.').pop().toLowerCase();
    if (ext === 'cdr' || ext === 'cmx') {
      showStatus('Preparing vector drawing…');
      const converted = await window.glbApp.convertCdr(filePath);
      const buffer = converted.data.buffer.slice(converted.data.byteOffset, converted.data.byteOffset + converted.data.byteLength);
      showImage(converted.name, buffer, 'svg', `${ext.toUpperCase()} vector drawing`);
      return;
    }
    const file = await window.glbApp.readModel(filePath);
    const buffer = file.data.buffer.slice(file.data.byteOffset, file.data.byteOffset + file.data.byteLength);
    await loadModel(file.name, buffer);
    if (previewMode && !['pdf', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'].includes(filePath.split('.').pop().toLowerCase())) {
      window.glbApp.previewReady(true);
    }
  } catch (error) {
    console.error(error); showStatus(error.message || 'Could not open this model file.');
    if (previewMode) window.glbApp.previewReady(false);
  }
}
async function loadModel(name, buffer) {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'pdf') { await showPdf(name, buffer); return; }
    if (['svg', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'].includes(ext)) { showImage(name, buffer, ext); return; }
    let object;
    if (ext === 'glb') {
      object = (await gltfLoader.parseAsync(buffer, '')).scene;
      object.rotation.x += Math.PI / 2;
      object.traverse((node) => {
        if (!node.isMesh) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          if ((material?.isMeshStandardMaterial || material?.isMeshPhysicalMaterial) && material.metalness > 0.5) {
            material.envMapIntensity = 1.5;
            material.needsUpdate = true;
          }
        }
      });
    }
    else if (ext === 'obj') object = new OBJLoader().parse(new TextDecoder().decode(buffer));
    else if (ext === 'dae') object = new ColladaLoader().parse(new TextDecoder().decode(buffer), '').scene;
    else if (ext === '3ds') object = new TDSLoader().parse(buffer, '');
    else if (ext === '3mf') object = new ThreeMFLoader().parse(buffer);
    else if (ext === 'amf') object = new AMFLoader().parse(buffer);
    else if (ext === 'ply') {
      const geometry = new PLYLoader().parse(buffer);
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb6c0d1, metalness: 0.08, roughness: 0.64, side: THREE.DoubleSide }));
    }
    else if (ext === 'stl') {
      const geometry = new STLLoader().parse(buffer);
      geometry.computeVertexNormals();
      object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x9eb7ff, metalness: 0.15, roughness: 0.52, side: THREE.DoubleSide }));
    } else if (ext === 'fbx') { object = new FBXLoader().parse(buffer, ''); object.rotation.x += Math.PI / 2; }
    else if (ext === '3dm') {
      const loader = new Rhino3dmLoader();
      loader.setLibraryPath(new URL('vendor/rhino3dm/', location.href).href);
      loader.setWorkerLimit(2);
      object = await new Promise((resolve, reject) => loader.parse(buffer, resolve, reject));
      loader.dispose();
    } else if (['stp', 'step', 'igs', 'iges'].includes(ext)) object = await loadCadModel(ext, buffer);
    else throw new Error('This file format is not supported.');
    const originalBounds = new THREE.Box3().setFromObject(object);
    if (originalBounds.isEmpty()) throw new Error('This model contains no visible geometry.');
    const originalCenter = originalBounds.getCenter(new THREE.Vector3());
    const content = new THREE.Group();
    content.position.copy(originalCenter).negate();
    content.add(object);
    const modelRoot = new THREE.Group();
    modelRoot.add(content);
    clearDocumentPreview();
    if (current) { scene.remove(current); dispose(current); }
    current = modelRoot; currentIsGlb = ext === 'glb'; scene.add(current); frame(current);
    transformControls.disabled = false;
    syncTransformControls();
    $('axisHint').textContent = 'Z axis up';
    $('welcome').hidden = true; $('fileName').textContent = name;
    $('fileInfo').textContent = `${ext.toUpperCase()} model · ${formatBytes(buffer.byteLength)}`; showStatus('');
}
async function loadCadModel(ext, buffer) {
  const occt = await window.occtimportjs();
  const content = new Uint8Array(buffer);
  const result = ['stp', 'step'].includes(ext)
    ? occt.ReadStepFile(content, null)
    : occt.ReadIgesFile(content, null);
  if (!result?.success || !result.meshes?.length) throw new Error('This STEP/IGES file could not be converted to a viewable mesh.');
  const group = new THREE.Group();
  for (const meshData of result.meshes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.attributes.position.array, 3));
    if (meshData.attributes.normal?.array) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(meshData.attributes.normal.array, 3));
    if (meshData.index?.array) geometry.setIndex(meshData.index.array);
    else geometry.computeVertexNormals();
    const rgb = meshData.color || [0.72, 0.76, 0.84];
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(rgb[0], rgb[1], rgb[2]), metalness: 0.08, roughness: 0.62, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(geometry, material));
  }
  return group;
}
async function choose() { try { await openPath(await window.glbApp.openDialog()); } catch (error) { showStatus(error.message); } }
$('openButton').addEventListener('click', choose); $('welcomeOpen').addEventListener('click', choose);
window.glbApp.onOpenPath(openPath);
$('fitButton').onclick = () => current && frame(current);
$('resetButton').onclick = () => {
  controls.autoRotate = false;
  $('rotateToggle').checked = false;
  $('breathToggle').checked = true;
  grid.visible = false;
  $('gridToggle').checked = false;
  renderer.toneMappingExposure = 1.0;
  $('brightness').value = '1';
  $('brightnessValue').textContent = '100%';
  scene.background.set('#25282e');
  $('backgroundColor').value = '#25282e';
  if (current) {
    current.position.set(0, 0, 0);
    current.rotation.set(0, 0, 0);
    syncTransformControls();
    frame(current);
  } else {
    controls.target.set(0, 0, 0);
    camera.up.set(0, 0, 1);
    camera.position.set(0.65, -1.3, 0.15);
    camera.near = 0.001;
    camera.far = 100;
    camera.updateProjectionMatrix();
    controls.update();
  }
};

function view(direction) {
  if (!current) return;
  const box = new THREE.Box3().setFromObject(current), sphere = box.getBoundingSphere(new THREE.Sphere());
  const distance = Math.max((sphere.radius * 0.95) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)), 0.02);
  controls.target.copy(sphere.center); camera.position.copy(sphere.center).add(direction.normalize().multiplyScalar(distance));
  camera.up.set(0, 0, 1);
  camera.lookAt(sphere.center); controls.update();
  breathBaseDistance = camera.position.distanceTo(controls.target); breathStartTime = performance.now();
}
function syncTransformControls() {
  if (!current) return;
  for (const input of positionInputs) {
    const axis = input.dataset.positionAxis;
    const value = current.position[axis];
    input.value = String(value);
    document.querySelector(`[data-position-value="${axis}"]`).value = value.toFixed(3);
  }
  for (const input of rotationInputs) {
    const axis = input.dataset.rotationAxis;
    const value = Math.round(THREE.MathUtils.radToDeg(current.rotation[axis]));
    input.value = String(value);
    document.querySelector(`[data-rotation-value="${axis}"]`).value = String(value);
  }
}
function setPosition(axis, input) {
  if (!current || input.value === '') return;
  const range = document.querySelector(`[data-position-axis="${axis}"]`);
  const value = Number(input.value);
  if (!Number.isFinite(value)) return;
  const position = THREE.MathUtils.clamp(value, Number(range.min), Number(range.max));
  current.position[axis] = position;
  range.value = String(position);
  document.querySelector(`[data-position-value="${axis}"]`).value = position.toFixed(3);
}
function setRotation(axis, input) {
  if (!current || input.value === '') return;
  const range = document.querySelector(`[data-rotation-axis="${axis}"]`);
  const value = Number(input.value);
  if (!Number.isFinite(value)) return;
  const degrees = Math.round(THREE.MathUtils.clamp(value, Number(range.min), Number(range.max)));
  current.rotation[axis] = THREE.MathUtils.degToRad(degrees);
  range.value = String(degrees);
  document.querySelector(`[data-rotation-value="${axis}"]`).value = String(degrees);
}
positionInputs.forEach((input) => input.addEventListener('input', () => setPosition(input.dataset.positionAxis, input)));
positionNumberInputs.forEach((input) => {
  input.addEventListener('input', () => setPosition(input.dataset.positionValue, input));
  input.addEventListener('change', () => setPosition(input.dataset.positionValue, input));
});
rotationInputs.forEach((input) => input.addEventListener('input', () => setRotation(input.dataset.rotationAxis, input)));
rotationNumberInputs.forEach((input) => {
  input.addEventListener('input', () => setRotation(input.dataset.rotationValue, input));
  input.addEventListener('change', () => setRotation(input.dataset.rotationValue, input));
});
$('frontButton').onclick = () => view(currentIsGlb ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 1, 0));
$('sideButton').onclick = () => view(new THREE.Vector3(1, 0, 0));
$('topButton').onclick = () => view(new THREE.Vector3(0, 0, 1));
$('pdfPrevious').onclick = () => pdfDocument && renderPdfPage(Math.max(1, pdfPageNumber - 1));
$('pdfNext').onclick = () => pdfDocument && renderPdfPage(Math.min(pdfDocument.numPages, pdfPageNumber + 1));
$('pdfPageNumber').onchange = (event) => {
  if (!pdfDocument) return;
  const page = THREE.MathUtils.clamp(Math.trunc(Number(event.target.value) || 1), 1, pdfDocument.numPages);
  renderPdfPage(page);
};
$('pdfZoomOut').onclick = () => {
  if (!pdfDocument) return;
  pdfZoom = Math.max(0.5, Math.round((pdfZoom - 0.1) * 10) / 10);
  renderPdfPage(pdfPageNumber);
};
$('pdfZoomIn').onclick = () => {
  if (!pdfDocument) return;
  pdfZoom = Math.min(3, Math.round((pdfZoom + 0.1) * 10) / 10);
  renderPdfPage(pdfPageNumber);
};
$('gridToggle').onchange = (event) => { grid.visible = event.target.checked; };
$('rotateToggle').onchange = (event) => { controls.autoRotate = event.target.checked; };
$('breathToggle').onchange = (event) => { breathEnabled = event.target.checked; breathBaseDistance = camera.position.distanceTo(controls.target); };
let breathEnabled = true;
let breathBaseDistance = 1;
let breathStartTime = performance.now();
controls.addEventListener('start', () => { breathBaseDistance = camera.position.distanceTo(controls.target); });
$('backgroundColor').oninput = (event) => scene.background.set(event.target.value);
$('brightness').oninput = (event) => {
  const value = Number(event.target.value);
  renderer.toneMappingExposure = value;
  $('brightnessValue').textContent = `${Math.round(value * 100)}%`;
};

window.addEventListener('keydown', (event) => {
  if (event.target.matches('input,button')) return;
  if (event.key.toLowerCase() === 'f' && current) frame(current);
  if (event.key.toLowerCase() === 'r' && current) frame(current);
  if (event.key.toLowerCase() === 'o' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); choose(); }
});
viewport.addEventListener('dragover', (event) => { event.preventDefault(); viewport.classList.add('dragover'); });
viewport.addEventListener('dragleave', () => viewport.classList.remove('dragover'));
viewport.addEventListener('drop', (event) => {
  event.preventDefault(); viewport.classList.remove('dragover');
  const file = event.dataTransfer.files[0];
  const filePath = file && window.glbApp.pathForDroppedFile(file);
  if (filePath && /\.(glb|stl|fbx|3dm|stp|step|igs|iges|obj|ply|dae|3ds|3mf|amf|pdf|svg|png|jpe?g|webp|bmp|gif|tiff?|cdr|cmx)$/i.test(filePath)) openPath(filePath);
  else showStatus('Choose a supported 2D document, image, or 3D model file.');
});
function animate(now = performance.now()) {
  controls.update();
  if (breathEnabled && current) {
    const direction = camera.position.clone().sub(controls.target);
    const distance = breathBaseDistance * (1 + 0.035 * Math.sin((now - breathStartTime) / 2200));
    camera.position.copy(controls.target).add(direction.normalize().multiplyScalar(distance));
  }
  renderer.render(scene, camera); requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
