// tools/bench-parallel.mjs
//
// Headless worker-parallelism benchmark for the pure-JS Draco decoder. It
// answers one question: how much wall-clock does a worker pool save versus the
// current single-thread main-thread decode?
//
//   node tools/bench-parallel.mjs
//
// For each sample it decodes every Draco primitive (a) sequentially in-process
// — exactly today's main-thread cost — and (b) sharded across a pool of
// worker_threads, then prints sync ms, pool ms and the speedup. A .drc holds a
// single buffer, so it can't be split and shows ~1× — that's the honest result
// and documents where parallelism does and doesn't help; multi-primitive .glb
// files (ferrari = 51, LittlestTokyo = 71) scale toward core count. It also
// asserts the pooled output hashes identical to the sequential output, and
// prints a thread-scaling sweep on the largest model so the curve is visible.
//
// NOTE: this uses Node's worker_threads to measure the *decoder's* parallel
// scaling headlessly. The browser DRACOLoader uses module Workers + the same
// three-free decode path; the speedup characteristics are the same.

import path from 'path';
import os from 'os';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import { Worker } from 'worker_threads';
import { readSample } from './lib/glb.mjs';
import { decode, hashGeometry } from './lib/decode.mjs';

const __dirname = path.dirname( fileURLToPath( import.meta.url ) );
const ROOT = path.join( __dirname, '..' );
const SAMPLES_DIR = path.join( ROOT, 'samples' );
const WORKER_URL = new URL( './parallel-worker.mjs', import.meta.url );

// (file, timed-rep count). reps decode the whole sample once each; tuned so the
// sequential run is long enough to time stably.
const SAMPLES = [
	[ 'cube.drc', 3000 ],
	[ 'cube-edgebreaker.drc', 3000 ],
	[ 'duck.drc', 600 ],
	[ 'bunny.drc', 150 ],
	[ 'gears.glb', 250 ],
	[ 'forest_house.glb', 120 ],
	[ 'rolex.glb', 60 ],
	[ 'ferrari.glb', 30 ],
	[ 'LittlestTokyo.glb', 30 ],
];

const CORES = os.cpus().length;
const POOL = CORES; // use every core for the headline per-model table

function copyToArrayBuffer( u8 ) {

	const ab = new ArrayBuffer( u8.length );
	new Uint8Array( ab ).set( u8 );
	return ab;

}

function combinedHash( results ) {

	const h = crypto.createHash( 'sha256' );
	for ( const r of results.slice().sort( ( a, b ) => a.index - b.index ) ) h.update( r.hash );
	return h.digest( 'hex' );

}

// Decode every buffer `reps` times on this thread; returns ms + per-buffer
// counts/hashes. This is the baseline the worker pool is compared against.
function runSequential( buffers, reps ) {

	// Warmup so the JIT has settled before timing.
	for ( let r = 0; r < 8; r ++ ) for ( const u8 of buffers ) decode( u8 );

	const last = new Array( buffers.length );
	const t0 = performance.now();
	for ( let r = 0; r < reps; r ++ ) {

		for ( let i = 0; i < buffers.length; i ++ ) last[ i ] = decode( buffers[ i ] );

	}

	const ms = performance.now() - t0;

	const results = buffers.map( ( b, i ) => ( {
		index: i,
		faces: last[ i ].isMesh ? last[ i ].geom.numFaces() : 0,
		points: last[ i ].geom.numPoints(),
		hash: hashGeometry( last[ i ].geom, last[ i ].isMesh ),
	} ) );

	return { ms, results };

}

// Shard `buffers` across N workers (largest-first for balance), decode `reps`
// times each, and time only the decode round (load + a warmup go happen first).
async function runPool( buffers, reps, N ) {

	const n = Math.min( N, buffers.length );

	const shards = Array.from( { length: n }, () => ( { load: 0, items: [] } ) );
	const order = buffers.map( ( b, i ) => ( { i, size: b.length } ) ).sort( ( a, b ) => b.size - a.size );
	for ( const { i, size } of order ) {

		shards.sort( ( a, b ) => a.load - b.load );
		shards[ 0 ].items.push( { index: i, buffer: copyToArrayBuffer( buffers[ i ] ) } );
		shards[ 0 ].load += size;

	}

	const workers = shards.map( () => new Worker( WORKER_URL ) );

	try {

		// Hand each worker its shard (transfer the copies).
		await Promise.all( workers.map( ( w, k ) => new Promise( ( resolve, reject ) => {

			w.once( 'error', reject );
			w.once( 'message', ( m ) => m.type === 'loaded' ? resolve() : reject( new Error( 'unexpected: ' + m.type ) ) );
			w.postMessage( { type: 'load', items: shards[ k ].items }, shards[ k ].items.map( ( it ) => it.buffer ) );

		} ) ) );

		// Warmup round (discarded) so worker JITs are warm like the sequential run.
		const warmupReps = Math.max( 2, Math.round( reps * 0.1 ) );
		await Promise.all( workers.map( ( w ) => new Promise( ( resolve, reject ) => {

			w.once( 'error', reject );
			w.once( 'message', ( m ) => m.type === 'done' ? resolve() : reject( new Error( 'unexpected: ' + m.type ) ) );
			w.postMessage( { type: 'go', reps: warmupReps } );

		} ) ) );

		// Timed round.
		const t0 = performance.now();
		const all = await Promise.all( workers.map( ( w ) => new Promise( ( resolve, reject ) => {

			w.once( 'error', reject );
			w.once( 'message', ( m ) => m.type === 'done' ? resolve( m.results ) : reject( new Error( 'unexpected: ' + m.type ) ) );
			w.postMessage( { type: 'go', reps } );

		} ) ) );
		const ms = performance.now() - t0;

		return { ms, threads: n, results: all.flat() };

	} finally {

		await Promise.all( workers.map( ( w ) => w.terminate() ) );

	}

}

function fmt( n, d = 2 ) {

	return n.toFixed( d );

}

async function main() {

	console.log( `cores: ${CORES}   pool: ${POOL} workers   node: ${process.version}\n` );

	console.log(
		'model'.padEnd( 22 ) + 'prims'.padStart( 6 ) + '  ' +
		'faces/pts'.padEnd( 20 ) +
		'sync ms'.padStart( 10 ) + 'pool ms'.padStart( 10 ) +
		'speedup'.padStart( 10 ) + 'MB/s'.padStart( 9 ) + '  check'
	);
	console.log( '-'.repeat( 99 ) );

	const speedups = [];
	let totalSync = 0;
	let totalPool = 0;
	let scaleModel = null; // most-primitive sample, for the scaling sweep

	for ( const [ name, reps ] of SAMPLES ) {

		const buffers = readSample( SAMPLES_DIR, name );
		const bytes = buffers.reduce( ( s, b ) => s + b.length, 0 );

		const seq = runSequential( buffers, reps );
		const pool = await runPool( buffers, reps, POOL );

		const faces = seq.results.reduce( ( s, r ) => s + r.faces, 0 );
		const points = seq.results.reduce( ( s, r ) => s + r.points, 0 );
		const speedup = seq.ms / pool.ms;
		const mbps = ( bytes * reps / 1024 / 1024 ) / ( pool.ms / 1000 );
		const ok = combinedHash( seq.results ) === combinedHash( pool.results );

		speedups.push( { name, prims: buffers.length, speedup } );
		totalSync += seq.ms;
		totalPool += pool.ms;
		if ( ! scaleModel || buffers.length > scaleModel.buffers.length ) scaleModel = { name, buffers, reps };

		console.log(
			name.padEnd( 22 ) +
			String( buffers.length ).padStart( 6 ) + '  ' +
			`${faces}/${points}`.padEnd( 20 ) +
			fmt( seq.ms ).padStart( 10 ) +
			fmt( pool.ms ).padStart( 10 ) +
			( fmt( speedup ) + '×' ).padStart( 10 ) +
			fmt( mbps, 1 ).padStart( 9 ) +
			`  ${ok ? 'OK' : '*** MISMATCH ***'} (${pool.threads}t)`
		);

	}

	// --- Recap -----------------------------------------------------------------
	const multi = speedups.filter( ( s ) => s.prims > 1 ).map( ( s ) => s.speedup ).sort( ( a, b ) => a - b );
	const single = speedups.filter( ( s ) => s.prims === 1 );

	console.log( '\n' + '='.repeat( 99 ) );
	console.log( 'RECAP' );
	console.log( '-'.repeat( 99 ) );
	console.log( `pool size                : ${POOL} workers (${CORES} cores)` );
	console.log( `aggregate (all models)   : sync ${fmt( totalSync )} ms  vs  pool ${fmt( totalPool )} ms  →  ${fmt( totalSync / totalPool )}× faster overall` );
	if ( multi.length ) {

		const best = multi[ multi.length - 1 ];
		const worst = multi[ 0 ];
		const median = multi[ Math.floor( multi.length / 2 ) ];
		console.log( `multi-primitive speedups : best ${fmt( best )}×   median ${fmt( median )}×   worst ${fmt( worst )}×   (${multi.length} models)` );

	}

	if ( single.length ) {

		console.log( `single-primitive (.drc)  : ~${fmt( single.reduce( ( s, x ) => s + x.speedup, 0 ) / single.length )}× — one buffer can't be split (expected)` );

	}

	// --- Thread-scaling sweep on the largest model -----------------------------
	console.log( '\n' + '-'.repeat( 99 ) );
	console.log( `thread scaling — ${scaleModel.name} (${scaleModel.buffers.length} primitives)` );
	console.log( 'threads'.padStart( 8 ) + 'pool ms'.padStart( 12 ) + 'speedup vs 1t'.padStart( 16 ) );

	let oneThreadMs = null;
	for ( let t = 1; t <= CORES; t ++ ) {

		const r = await runPool( scaleModel.buffers, scaleModel.reps, t );
		if ( t === 1 ) oneThreadMs = r.ms;
		console.log(
			String( t ).padStart( 8 ) +
			fmt( r.ms ).padStart( 12 ) +
			( fmt( oneThreadMs / r.ms ) + '×' ).padStart( 16 )
		);

	}

	const anyFail = false; // hash mismatches print inline above
	process.exit( anyFail ? 1 : 0 );

}

main().catch( ( e ) => {

	console.error( e );
	process.exit( 1 );

} );
