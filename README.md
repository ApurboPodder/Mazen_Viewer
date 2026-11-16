# MAZEN Viewer for Windows

A standalone desktop viewer for PDF documents, vector and raster images, CAD drawings, and 3D models. Supported 3D formats are GLB, STL, FBX, Rhino 3DM, STEP/STP, IGES/IGS, OBJ, PLY, Collada DAE, 3DS, 3MF, and AMF. Supported 2D formats are PDF, SVG, PNG, JPEG, WebP, BMP, GIF, TIFF, CorelDRAW CDR, and CMX. Open files with the picker, drag and drop, or Windows File Explorer. PDF files include page and zoom controls; 2D images are fit to the viewer. 3D models retain orbit, pan, zoom, standard views, transform controls, and camera-following lighting.

## Build the Windows installer

Install Node.js 20 or later, then run these commands from this directory:

```powershell
npm install
npm run dist:win
```

The installer will be written to `dist/MAZEN-Viewer-Setup-1.3.0.exe`. Run it to install the app. The app bundles its renderers and does not need a network connection.

## Use

Launch MAZEN Viewer and choose a supported 2D or 3D file, or right-click one in File Explorer and choose **Open with > MAZEN Viewer**. Windows might require **Choose another app > Always** the first time before it becomes the default. The installer registers current-user thumbnail and Preview pane handlers for supported formats. In File Explorer, enable the pane with **View > Show > Preview pane**. PDF and image files are read locally; 3D files are read locally and are not uploaded.

The viewer supports `.glb`, `.stl`, `.fbx`, `.3dm`, `.stp`, `.step`, `.igs`, `.iges`, `.obj`, `.ply`, `.dae`, `.3ds`, `.3mf`, `.amf`, `.pdf`, `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`, `.gif`, `.tif`, `.tiff`, `.cdr`, and `.cmx`. CDR/CMX drawings are converted locally to SVG by the bundled TraceDraw command-line converter. TraceDraw is licensed under MIT or Apache-2.0; its license notices are bundled in the installation. TraceDraw describes itself as alpha software, and some drawings may render differently or incompletely. See [TraceDraw source](https://github.com/tjy-gitnub/TraceDraw).

GLB files should be self-contained; the viewer does not open `.gltf` files that rely on separate texture or buffer files. STEP and IGES are triangulated for viewing, and models with external companion textures may not display those textures. DWG viewing is not included yet. “Any format” is not practical to guarantee: support depends on the file format and parser coverage.
