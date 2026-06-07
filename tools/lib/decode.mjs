// tools/lib/decode.mjs
//
// The pure-JS decode call + a deterministic geometry hash, shared by the
// headless benchmarks (sequential and worker_threads). The core decoder has no
// `three` dependency, so it runs directly in Node and inside a worker thread.

import crypto from 'crypto';
import { DecoderBuffer } from '../../src/core/DecoderBuffer.js';
import { Decoder } from '../../src/compression/Decode.js';
import { EncodedGeometryType } from '../../src/compression/config/CompressionShared.js';

// Decode one buffer into a Mesh/PointCloud. The encoded input is only read, so
// the same Uint8Array can be reused across iterations with a fresh buffer view.
export function decode( u8 ) {

	const db = new DecoderBuffer();
	db.init( u8, u8.length );
	const type = Decoder.getEncodedGeometryType( db );
	const decoder = new Decoder();
	if ( type === EncodedGeometryType.TRIANGULAR_MESH ) {

		const r = decoder.decodeMeshFromBuffer( db );
		if ( ! r.ok ) throw new Error( r.message );
		return { geom: r.mesh, isMesh: true };

	}

	const r = decoder.decodePointCloudFromBuffer( db );
	if ( ! r.ok ) throw new Error( r.message );
	return { geom: r.pointCloud, isMesh: false };

}

// Hash the complete decoded result. Values go through a Float64Array, which
// exactly represents the FLOAT32 / INT32 attribute values, so an identical
// decode always yields an identical digest — letting us assert that worker and
// main-thread decode produce byte-identical geometry.
export function hashGeometry( geom, isMesh ) {

	const h = crypto.createHash( 'sha256' );
	const numPoints = geom.numPoints();
	const numAttributes = geom.numAttributes();
	const numFaces = isMesh ? geom.numFaces() : 0;
	h.update( Buffer.from( Int32Array.from( [ isMesh ? 1 : 0, numFaces, numPoints, numAttributes ] ).buffer ) );

	if ( isMesh ) {

		const faces = new Int32Array( numFaces * 3 );
		for ( let i = 0; i < numFaces; i ++ ) {

			const f = geom.face( i );
			faces[ i * 3 ] = f[ 0 ];
			faces[ i * 3 + 1 ] = f[ 1 ];
			faces[ i * 3 + 2 ] = f[ 2 ];

		}

		h.update( Buffer.from( faces.buffer ) );

	}

	for ( let a = 0; a < numAttributes; a ++ ) {

		const att = geom.attribute( a );
		const nc = att ? att.numComponents : 0;
		const hasBuf = att && att._buffer != null;
		h.update( Buffer.from( Int32Array.from( [
			att ? att.uniqueId : - 1, att ? att.attributeType : - 1, nc, hasBuf ? 1 : 0,
		] ).buffer ) );
		if ( ! hasBuf ) continue;
		const vals = new Float64Array( numPoints * nc );
		const tmp = new Array( nc );
		for ( let i = 0; i < numPoints; i ++ ) {

			const ai = att.mappedIndex( i );
			att.convertValue( ai, tmp );
			const o = i * nc;
			for ( let c = 0; c < nc; c ++ ) vals[ o + c ] = tmp[ c ];

		}

		h.update( Buffer.from( vals.buffer ) );

	}

	return h.digest( 'hex' );

}
