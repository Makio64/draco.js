import terser from '@rollup/plugin-terser';

// Bundles the three.js loader (src/DRACOLoader.js) with `three` kept external,
// producing a readable ESM build and a minified one.

const banner = `/**
 * Draco.js — a pure-JavaScript Draco mesh loader for three.js.
 *
 * Draco (https://google.github.io/draco/) is an open source library for
 * compressing and decompressing 3D meshes and point clouds. Draco.js is a
 * pure-JavaScript port of its decoder — a drop-in replacement for three.js's
 * DRACOLoader, usable on its own or inside GLTFLoader.
 *
 * https://mrdoob.github.io/draco.js/
 *
 * @license MIT
 */`;

export default [
  {
    input: 'src/DRACOLoader.js',
    external: ['three'],
    output: [
      { file: 'build/DRACOLoader.js', format: 'es', banner },
      { file: 'build/DRACOLoader.min.js', format: 'es', banner, plugins: [terser()] },
    ],
  },
];
