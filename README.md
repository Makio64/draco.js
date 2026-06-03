# Draco.js

A pure-JavaScript [Draco](https://github.com/google/draco) mesh **loader** for
three.js. It's a drop-in `DRACOLoader` that decodes Draco-compressed triangle
meshes (the EdgeBreaker connectivity used by glTF's `KHR_draco_mesh_compression`)
directly in JavaScript.

**[Live demo →](https://mrdoob.github.io/draco.js/)**

Why a JS port instead of the official WASM build?

- **Small** — ~24 KB gzipped, vs ~104 KB for the `draco3d` WASM decoder + glue
  (~4.3× smaller).
- **Simple to ship** — one ES module. No `.wasm` fetch, no worker/glue setup,
  no cross-origin or CSP headaches.
- **Fast** — within ~1.4–1.6× of the WASM decoder on substantial meshes (it
  decodes byte-for-byte identical output; see [Correctness](#correctness)).

WASM is still faster in absolute terms — this trades a modest amount of decode
speed for a much smaller, simpler-to-deploy loader.

## Status

The EdgeBreaker triangle-mesh path is complete and is what glTF/Draco content
uses in practice (positions, normals, colors, texture coords, generic
attributes; quantization, octahedral-normal, and parallelogram/multi-parallelogram
prediction). Point-cloud, KD-tree, and the sequential connectivity paths, plus
metadata decoding, are not implemented yet.

## Usage

`DRACOLoader` is a drop-in replacement for three.js's own `DRACOLoader` — plug it
into `GLTFLoader` the usual way. There's no decoder path or WASM to configure
(`setDecoderPath` / `setDecoderConfig` are accepted but do nothing).

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from './build/DRACOLoader.js';

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader( new DRACOLoader() );

gltfLoader.load( 'model.glb', ( gltf ) => scene.add( gltf.scene ) );
```

It can also load standalone `.drc` files:

```js
const geometry = await new DRACOLoader().loadAsync( 'model.drc' ); // BufferGeometry
```

## Build

`npm run build` bundles `src/DRACOLoader.js` (via Rollup) into `build/DRACOLoader.js`
(readable ESM) and `build/DRACOLoader.min.js` (minified), with `three` kept
external. Prebuilt copies are checked in.

## Correctness

Output is validated against Google's reference `draco3d` WASM decoder: every
sample is decoded by both and compared element-by-element — face indices must
match exactly and per-point attribute values within a small epsilon. All
samples match.

## Project layout

```
src/          decoder source, mirroring draco/src/draco/ file-for-file
build/        bundled output (build/DRACOLoader.js + .min.js)
libs/         three.js's WASM Draco loader, vendored for the comparison
samples/      .drc and Draco-compressed .glb test models
index.html    JS-vs-WASM comparison viewer
```

## Credits

- Decoder logic is a port of [Google Draco](https://github.com/google/draco)
  (Apache-2.0); it mirrors the original C++ file structure.
- `DRACOLoader.js` follows the API of three.js's
  [`DRACOLoader`](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/DRACOLoader.js)
  (MIT) so it drops into `GLTFLoader` unchanged.