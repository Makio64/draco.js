// tools/lib/glb.mjs
//
// Shared sample reader for the headless benchmarks. A .drc file holds a single
// Draco buffer; a .glb file embeds one Draco buffer per primitive via the
// KHR_draco_mesh_compression extension. Both bench.mjs and bench-parallel.mjs
// decode every returned buffer the same way.

import fs from 'fs';
import path from 'path';

const GLB_MAGIC = 0x46546c67;
const GLB_CHUNK_JSON = 0x4e4f534a;
const GLB_CHUNK_BIN = 0x004e4942;

// Returns the list of Draco-compressed buffers (one Uint8Array per primitive)
// for a sample file in `samplesDir`. .drc -> a single buffer; .glb -> every
// KHR_draco primitive.
export function readSample( samplesDir, name ) {

	const buf = fs.readFileSync( path.join( samplesDir, name ) );
	const u8 = new Uint8Array( buf.buffer, buf.byteOffset, buf.byteLength );
	if ( ! name.endsWith( '.glb' ) ) return [ u8 ];

	const dv = new DataView( u8.buffer, u8.byteOffset, u8.byteLength );
	if ( dv.getUint32( 0, true ) !== GLB_MAGIC ) throw new Error( `${name}: not a GLB` );
	const total = dv.getUint32( 8, true );
	let off = 12;
	let json = null;
	let binOff = 0;
	while ( off < total ) {

		const clen = dv.getUint32( off, true );
		const ctype = dv.getUint32( off + 4, true );
		off += 8;
		if ( ctype === GLB_CHUNK_JSON ) {

			json = JSON.parse( new TextDecoder().decode( u8.subarray( off, off + clen ) ) );

		} else if ( ctype === GLB_CHUNK_BIN ) {

			binOff = off;

		}

		off += clen;

	}

	const buffers = [];
	for ( const mesh of json.meshes ) {

		for ( const prim of mesh.primitives ) {

			const ext = prim.extensions && prim.extensions.KHR_draco_mesh_compression;
			if ( ! ext ) continue;
			const bv = json.bufferViews[ ext.bufferView ];
			const start = binOff + ( bv.byteOffset || 0 );
			buffers.push( u8.subarray( start, start + bv.byteLength ) );

		}

	}

	if ( buffers.length === 0 ) throw new Error( `${name}: no Draco primitives` );
	return buffers;

}
