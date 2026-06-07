# Draco.js

A pure-JavaScript [Draco](https://github.com/google/draco) mesh **loader** for
three.js. It's a drop-in `DRACOLoader` that decodes Draco-compressed triangle
meshes — both the EdgeBreaker connectivity used by glTF's
`KHR_draco_mesh_compression` and Draco's sequential connectivity — directly in
JavaScript.

**[Live demo →](https://mrdoob.github.io/draco.js/)**

Why a JS port instead of the official WASM build?

- **Small** — ~20 KB gzipped (66 KB minified), vs ~100 KB gzipped for the
  `draco3d` WASM decoder + glue (~5× smaller).
- **Simple to ship** — one ES module. No `.wasm` fetch, no cross-origin or CSP
  headaches. The same file is also the decode worker, so even the parallel path
  needs no separate worker file or glue.
- **Fast** — within ~1.0–1.4× of the WASM decoder per mesh, byte-for-byte
  identical output, and a built-in worker pool that decodes multi-primitive
  loads in parallel and off the main thread ([see below](#web-workers)).

You trade decode speed for a much smaller, simpler loader. This pays
off most on pages with a single model, where the decoder is a one-time cost that
isn't amortized across many meshes — the model often **displays sooner**
end-to-end because the network savings outweigh the extra decode time.

## Status

Targets **Draco bitstream version 2.2** — what current Draco encoders and glTF
exporters produce. Older bitstreams (< 2.2) are rejected with an error.

Not implemented:

- **Point-cloud decoding** (sequential and KD-tree) — only triangle meshes are
  decoded.
- **Metadata content** — geometry metadata is parsed (so metadata-bearing files
  still decode correctly) but is not surfaced on the returned geometry.

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

## Web workers

By default the loader decodes through an **adaptive worker pool**. Because the
build is top-level dependency-free, the same single file doubles as its own
module worker (spawned from `import.meta.url`) — so the parallel path needs
nothing extra to fetch or configure.

Decode calls that arrive together are batched and routed as one:

- A **single mesh** or a **small batch** decodes on the **main thread** — a lone
  Draco stream is sequential, so a worker could only add overhead. Never slower
  than single-threaded here.
- A **multi-primitive load with enough total work** (e.g. a glTF scene of many
  Draco meshes) **fans out across the pool**, decoding in parallel across cores.

On a 14-core machine (decode only; ferrari = 51 primitives, LittlestTokyo = 71)
that's **~2.7–2.8× faster** than single-threaded, with single meshes and tiny
batches staying at single-thread speed. Reproduce with `npm run bench:parallel`.
Where module workers aren't available (Node, older browsers) it falls back to
synchronous decode.

### Tuning

```js
const loader = new DRACOLoader();
loader.setWorkerLimit( 8 );            // pool size (default navigator.hardwareConcurrency; 0 = always sync)
loader.setWorkerThreshold( 256 * 1024 ); // min total bytes before a batch uses the pool
loader.setWorkerMode( 'offload' );     // 'adaptive' (default, speed-first) | 'offload' (jank-free)
```

`setWorkerMode('offload')` sends any decode at/above the threshold to a worker —
**even a single mesh** — so a big decode never freezes the main thread (a touch
slower wall-clock, but no frame hitch). Pair with `setWorkerThreshold(0)` to
offload every decode.

## Credits

- Decoder logic is a port of [Google Draco](https://github.com/google/draco)
  (Apache-2.0); it mirrors the original C++ file structure.
- `DRACOLoader.js` follows the API of three.js's
  [`DRACOLoader`](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/loaders/DRACOLoader.js)
  (MIT) so it drops into `GLTFLoader` unchanged.