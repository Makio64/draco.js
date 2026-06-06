import { mangle } from './tools/mangle.js';

// Bundles the three.js loader (src/DRACOLoader.js) with `three` kept external,
// producing a readable ESM build and an aggressively-minified one (see
// tools/mangle.js for how the minified build mangles internal property names).

const banner = `/**
 * Draco.js — pure-JavaScript Draco decoder for three.js.
 * https://mrdoob.github.io/draco.js/  @license MIT
 */`;

export default [
  {
    input: 'src/DRACOLoader.js',
    external: ['three'],
    output: [
      { file: 'build/DRACOLoader.js', format: 'es', banner },
      { file: 'build/DRACOLoader.min.js', format: 'es', banner, plugins: [mangle()] },
    ],
  },
];
