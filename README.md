# Draco.js

A pure-JavaScript [Draco](https://github.com/google/draco) mesh **loader** for
three.js. It's a drop-in `DRACOLoader` that decodes Draco-compressed triangle
meshes — both the EdgeBreaker connectivity used by glTF's
`KHR_draco_mesh_compression` and Draco's sequential connectivity — directly in
JavaScript.

**[Live demo →](https://mrdoob.github.io/draco.js/)**

Why a JS port instead of the official WASM build?

- **Small** — ~24 KB gzipped (90 KB minified), vs ~100 KB gzipped for the
  `draco3d` WASM decoder + glue (~4.1× smaller).
- **Simple to ship** — one ES module. No `.wasm` fetch, no worker/glue setup,
  no cross-origin or CSP headaches.
- **Fast** — on substantial meshes it's within ~1.0–1.4× of the WASM decoder,
  and effectively at parity on the largest ones, with byte-for-byte identical
  output (see [Correctness](#correctness)).

On the largest meshes (e.g. a 358k-face glTF) the two are about even; WASM keeps
a lead of up to ~1.35× on smaller and mid-size meshes. You trade, at most, a
modest amount of decode speed for a much smaller, simpler-to-deploy loader.

## Status

Targets **Draco bitstream version 2.2** — what current Draco encoders and glTF
exporters produce. (Older bitstreams aren't a support goal, though many still
decode.)

Both triangle-mesh connectivity paths are implemented — EdgeBreaker (what
glTF/Draco content uses in practice) and sequential — covering positions,
normals, colors, texture coords, and generic attributes, with every prediction
scheme (delta, parallelogram / multi- / constrained-multi-parallelogram,
octahedral-normal, geometric-normal, and portable texcoords), both the
depth-first and max-prediction-degree attribute traversals, and quantization /
octahedral transforms. Geometry metadata is parsed (so metadata-bearing files
decode correctly) but not surfaced on the returned geometry. **Point-cloud**
decoding (sequential and KD-tree) is not implemented yet.

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

Output is **byte-for-byte identical** to Google's reference `draco3d` WASM
decoder. `npm run verify` decodes every sample with both and compares
element-by-element — face indices and every per-point attribute value match
exactly (`eps 0`) across all 260 test primitives. `npm run bench` separately
times decoding and guards against output regressions via a sha256 of the
decoded geometry.

## Project layout

```
src/          decoder source, mirroring draco/src/draco/ file-for-file
build/        bundled output (build/DRACOLoader.js + .min.js)
tools/        bench.mjs (timing + regression) and verify-wasm.mjs (WASM parity)
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