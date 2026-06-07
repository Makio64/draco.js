// tools/parallel-worker.mjs
//
// worker_threads decode worker for bench-parallel.mjs. It holds its shard of
// Draco buffers (handed over once, by transfer) and, on each `go`, decodes them
// `reps` times. The main thread times the round so only decode work is
// measured — buffer hand-off happens once during setup, outside the timer.

import { parentPort } from 'worker_threads';
import { decode, hashGeometry } from './lib/decode.mjs';

let items = []; // [{ index, u8 }]

parentPort.on( 'message', ( msg ) => {

	if ( msg.type === 'load' ) {

		items = msg.items.map( ( it ) => ( { index: it.index, u8: new Uint8Array( it.buffer ) } ) );
		parentPort.postMessage( { type: 'loaded' } );

	} else if ( msg.type === 'go' ) {

		const reps = msg.reps;
		const last = new Array( items.length );
		for ( let r = 0; r < reps; r ++ ) {

			for ( let i = 0; i < items.length; i ++ ) last[ i ] = decode( items[ i ].u8 );

		}

		// Hash once, off the final decode, so worker == main-thread output can be
		// asserted without bloating the timed loop.
		const results = items.map( ( it, i ) => ( {
			index: it.index,
			faces: last[ i ].isMesh ? last[ i ].geom.numFaces() : 0,
			points: last[ i ].geom.numPoints(),
			hash: hashGeometry( last[ i ].geom, last[ i ].isMesh ),
		} ) );

		parentPort.postMessage( { type: 'done', results } );

	}

} );
