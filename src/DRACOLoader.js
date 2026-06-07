import { Decoder } from './compression/Decode.js';
import { DecoderBuffer } from './core/DecoderBuffer.js';
import { EncodedGeometryType } from './compression/config/CompressionShared.js';

// This module is deliberately three-free at the top level. `three` is pulled in
// lazily (see loadThree) only on the main thread, only when a decoded mesh is
// turned into a BufferGeometry. Keeping the static module graph free of `three`
// is what lets the SAME built file be reused as the decode Worker: a module
// Worker spawned from `import.meta.url` re-evaluates this file, and a bare
// `three` import could not be resolved there. The heavy decoder therefore lives
// in exactly one file, downloaded once and instantiated per realm — no second
// chunk, no stringified-blob copy.

const _taskCache = new WeakMap();

const _attributeTypeMap = {
	'POSITION': 0,
	'NORMAL': 1,
	'COLOR': 2,
	'TEX_COORD': 3,
	'GENERIC': 4
};

const _typedArrayMap = {
	'Float32Array': Float32Array,
	'Int8Array': Int8Array,
	'Int16Array': Int16Array,
	'Int32Array': Int32Array,
	'Uint8Array': Uint8Array,
	'Uint16Array': Uint16Array,
	'Uint32Array': Uint32Array
};

// True when this file is running inside a dedicated Worker. In that case the
// only thing we do is install the decode message handler below; the loader
// class and its worker pool are never constructed here.
const _isWorkerScope = typeof self !== 'undefined'
	&& typeof DedicatedWorkerGlobalScope !== 'undefined'
	&& self instanceof DedicatedWorkerGlobalScope;

// Memoised, main-thread-only `three` import. Shared across loader instances.
let _threePromise = null;

function loadThree() {

	if ( _threePromise === null ) _threePromise = import( 'three' );
	return _threePromise;

}

// Pure decode: ArrayBuffer -> a transferable payload of typed arrays, with no
// `three` dependency. Used directly by the synchronous fallback and, unchanged,
// inside the Worker. Both paths feed the identical payload into _buildGeometry,
// so worker output is byte-identical to main-thread output by construction.
function decodeToTransferable( arrayBuffer, taskConfig ) {

	const byteArray = new Uint8Array( arrayBuffer );
	const decoderBuffer = new DecoderBuffer();
	decoderBuffer.init( byteArray, byteArray.length );

	const geometryType = Decoder.getEncodedGeometryType( decoderBuffer );

	const decoder = new Decoder();
	let dracoGeometry;
	let isMesh;

	if ( geometryType === EncodedGeometryType.TRIANGULAR_MESH ) {

		const result = decoder.decodeMeshFromBuffer( decoderBuffer );
		if ( ! result.ok ) throw new Error( 'THREE.DRACOLoader: ' + result.message );
		dracoGeometry = result.mesh;
		isMesh = true;

	} else if ( geometryType === EncodedGeometryType.POINT_CLOUD ) {

		const result = decoder.decodePointCloudFromBuffer( decoderBuffer );
		if ( ! result.ok ) throw new Error( 'THREE.DRACOLoader: ' + result.message );
		dracoGeometry = result.pointCloud;
		isMesh = false;

	} else {

		throw new Error( 'THREE.DRACOLoader: Unexpected geometry type.' );

	}

	const attributeIDs = taskConfig.attributeIDs;
	const attributeTypes = taskConfig.attributeTypes;
	const numPoints = dracoGeometry.numPoints();
	const attributes = [];

	for ( const attributeName in attributeIDs ) {

		const OutputTypedArray = _typedArrayMap[ attributeTypes[ attributeName ] ];
		if ( ! OutputTypedArray ) continue;

		let attribute;

		if ( taskConfig.useUniqueIDs ) {

			attribute = dracoGeometry.getAttributeByUniqueId( attributeIDs[ attributeName ] );

		} else {

			const typeEnum = _attributeTypeMap[ attributeIDs[ attributeName ] ];
			if ( typeEnum === undefined ) continue;
			attribute = dracoGeometry.getNamedAttribute( typeEnum );

		}

		if ( ! attribute ) continue;

		const array = attribute.extractTo( OutputTypedArray, numPoints );

		attributes.push( {
			name: attributeName,
			array: array,
			itemSize: attribute.numComponents,
			isFloat: array instanceof Float32Array
		} );

	}

	let index = null;

	if ( isMesh ) {

		const numFaces = dracoGeometry.numFaces();
		const array = new Uint32Array( numFaces * 3 );
		array.set( dracoGeometry.faces_.subarray( 0, numFaces * 3 ) );
		index = { array: array };

	}

	return { index: index, attributes: attributes, vertexColorSpace: taskConfig.vertexColorSpace };

}

// Collect the underlying ArrayBuffers so they can be transferred (zero-copy)
// back from the Worker to the main thread.
function geometryTransferables( geometry ) {

	const transfer = [];
	if ( geometry.index ) transfer.push( geometry.index.array.buffer );
	for ( const attribute of geometry.attributes ) transfer.push( attribute.array.buffer );
	return transfer;

}

// --- Worker entry point -----------------------------------------------------
// When this file is loaded as a module Worker we only register the decode
// handler. No `three`, no DRACOLoader instance, no nested workers.
if ( _isWorkerScope ) {

	self.onmessage = function ( e ) {

		const message = e.data;
		if ( ! message || message.type !== 'decode' ) return;

		try {

			const geometry = decodeToTransferable( message.buffer, message.taskConfig );
			self.postMessage( { type: 'decode', id: message.id, geometry: geometry }, geometryTransferables( geometry ) );

		} catch ( error ) {

			self.postMessage( { type: 'error', id: message.id, message: error.message } );

		}

	};

}

// Minimal no-op LoadingManager used when the caller doesn't supply one. A real
// three.js LoadingManager (passed in by the caller / shared with GLTFLoader) is
// duck-typed through the same three methods, so its integration still works.
const _defaultManager = {
	itemStart() {},
	itemEnd() {},
	itemError() {}
};

class DRACOLoader {

	constructor( manager ) {

		this.manager = manager || _defaultManager;
		this.crossOrigin = 'anonymous';
		this.withCredentials = false;
		this.path = '';
		this.requestHeader = {};

		this.defaultAttributeIDs = {
			position: 'POSITION',
			normal: 'NORMAL',
			color: 'COLOR',
			uv: 'TEX_COORD'
		};

		this.defaultAttributeTypes = {
			position: 'Float32Array',
			normal: 'Float32Array',
			color: 'Float32Array',
			uv: 'Float32Array'
		};

		// Worker pool. Decoding runs off the main thread and across cores when
		// module Workers are available; otherwise we fall back to synchronous
		// main-thread decode (Node, or older browsers). setWorkerLimit(0) forces
		// the synchronous path.
		this._workerLimit = ( typeof navigator !== 'undefined' && navigator.hardwareConcurrency ) || 4;
		this._workerPool = [];
		this._workerNextTaskID = 1;

		// Routing. Decode calls that arrive together are coalesced (one microtask)
		// and the whole batch is routed at once.
		//   'adaptive' (default): a single Draco buffer is a sequential stream — a
		//     worker can only add round-trip overhead, never split the decode, so a
		//     lone buffer decodes fastest on the main thread. Workers pay off only
		//     when 2+ buffers can decode in parallel AND there is enough total work
		//     to cover the hand-off. So a batch of 2+ buffers totalling
		//     >= _workerThreshold bytes goes to the pool; everything else (lone
		//     buffers, tiny batches) stays on the main thread — never slower than
		//     single-thread.
		//   'offload': jank-free — any decode at/above _workerThreshold goes to a
		//     worker, even a single mesh, so heavy decodes never freeze the main
		//     thread (a touch slower wall-clock, but no frame hitch). Pair with
		//     setWorkerThreshold(0) to offload every decode.
		// setWorkerLimit(0) overrides both and forces the synchronous path.
		this._workerMode = 'adaptive';
		this._workerThreshold = 256 * 1024;
		this._queue = [];
		this._flushScheduled = false;

		// Warm `three` up front so it's ready by the time the first decode lands.
		if ( ! _isWorkerScope ) loadThree();

	}

	// --- Minimal three.js Loader surface (we no longer extend Loader so this
	// file stays three-free; GLTFLoader never relies on instanceof Loader). ----

	setPath( path ) {

		this.path = path;
		return this;

	}

	setCrossOrigin( crossOrigin ) {

		this.crossOrigin = crossOrigin;
		return this;

	}

	setWithCredentials( value ) {

		this.withCredentials = value;
		return this;

	}

	setRequestHeader( requestHeader ) {

		this.requestHeader = requestHeader;
		return this;

	}

	// Kept for drop-in API compatibility with three.js's DRACOLoader.
	setDecoderPath() {

		return this;

	}

	setDecoderConfig() {

		return this;

	}

	setWorkerLimit( workerLimit ) {

		this._workerLimit = workerLimit;
		return this;

	}

	// Minimum total bytes a coalesced batch must reach before it is dispatched to
	// the worker pool. Below it (or, in 'adaptive' mode, for a lone buffer)
	// decoding stays on the main thread, where it's fastest. 0 sends every
	// eligible batch to the pool; Infinity forces the single-thread path.
	setWorkerThreshold( bytes ) {

		this._workerThreshold = bytes;
		return this;

	}

	// 'adaptive' (default): speed-first — single/small decodes run on the main
	// thread, so the loader is never slower than single-thread. 'offload':
	// jank-free — heavy decodes (>= the worker threshold) always go to a worker,
	// even a single mesh, so the main thread never freezes during a decode.
	setWorkerMode( mode ) {

		this._workerMode = mode;
		return this;

	}

	load( url, onLoad, onProgress, onError ) {

		const resolvedURL = ( this.path || '' ) + url;
		this.manager.itemStart( resolvedURL );

		const handleError = ( error ) => {

			if ( onError ) onError( error );
			else console.error( error );
			this.manager.itemError( resolvedURL );
			this.manager.itemEnd( resolvedURL );

		};

		fetch( resolvedURL, {
			credentials: this.withCredentials ? 'include' : 'same-origin',
			headers: this.requestHeader
		} )
			.then( ( response ) => {

				if ( ! response.ok ) {

					throw new Error( `THREE.DRACOLoader: HTTP ${response.status} loading ${resolvedURL}` );

				}

				return response.arrayBuffer();

			} )
			.then( ( buffer ) => {

				this.parse( buffer, ( geometry ) => {

					onLoad( geometry );
					this.manager.itemEnd( resolvedURL );

				}, handleError );

			} )
			.catch( handleError );

	}

	loadAsync( url, onProgress ) {

		return new Promise( ( resolve, reject ) => {

			this.load( url, resolve, onProgress, reject );

		} );

	}

	parse( buffer, onLoad, onError = () => {} ) {

		loadThree()
			.then( ( THREE ) => this.decodeDracoFile( buffer, onLoad, null, null, THREE.SRGBColorSpace, onError ) )
			.catch( onError );

	}

	decodeDracoFile( buffer, callback, attributeIDs, attributeTypes, vertexColorSpace = null, onError = () => {} ) {

		const taskConfig = {
			attributeIDs: attributeIDs || this.defaultAttributeIDs,
			attributeTypes: attributeTypes || this.defaultAttributeTypes,
			useUniqueIDs: !! attributeIDs,
			vertexColorSpace: vertexColorSpace,
		};

		return this.decodeGeometry( buffer, taskConfig ).then( callback ).catch( onError );

	}

	decodeGeometry( buffer, taskConfig ) {

		const taskKey = JSON.stringify( taskConfig );

		if ( _taskCache.has( buffer ) ) {

			const cachedTask = _taskCache.get( buffer );

			if ( cachedTask.key === taskKey ) {

				return cachedTask.promise;

			} else if ( buffer.byteLength === 0 ) {

				throw new Error(

					'THREE.DRACOLoader: Unable to re-decode a buffer with different ' +
					'settings. Buffer has already been transferred.'

				);

			}

		}

		let geometryPending;

		if ( this._useWorkers() ) {

			// Queue the request and route the whole coalesced batch on the next
			// microtask (see _flushQueue). Calls fired together — e.g. GLTFLoader
			// mapping over a mesh's primitives — are decided as one batch.
			geometryPending = new Promise( ( resolve, reject ) => {

				this._queue.push( { buffer, taskConfig, resolve, reject } );

				if ( ! this._flushScheduled ) {

					this._flushScheduled = true;
					queueMicrotask( () => this._flushQueue() );

				}

			} );

		} else {

			geometryPending = Promise.resolve().then( () => this._buildGeometry( decodeToTransferable( buffer, taskConfig ) ) );

		}

		_taskCache.set( buffer, {

			key: taskKey,
			promise: geometryPending

		} );

		return geometryPending;

	}

	// Route a coalesced batch. A lone buffer, or a small batch, decodes on the
	// main thread (a worker could only add overhead). A batch of 2+ buffers with
	// enough total work fans out across the pool, decoding in parallel.
	_flushQueue() {

		this._flushScheduled = false;
		const batch = this._queue;
		this._queue = [];

		let total = 0;
		for ( const item of batch ) total += item.buffer.byteLength;

		// 'offload' drops the 2+-buffer guard so a single heavy mesh can go to a
		// worker (jank-free); 'adaptive' keeps a lone buffer on the main thread
		// (fastest). Either way a sub-threshold load stays on the main thread.
		const enoughWork = total >= this._workerThreshold;
		const haveParallelism = batch.length >= 2 || this._workerMode === 'offload';
		const useWorkers = enoughWork && haveParallelism;

		if ( ! useWorkers ) {

			for ( const item of batch ) this._runSync( item );
			return;

		}

		for ( const item of batch ) {

			this._decodeViaWorker( item.buffer, item.taskConfig )
				.then( ( payload ) => item.resolve( this._buildGeometry( payload ) ) )
				.catch( ( error ) => {

					// Worker unavailable (e.g. module Workers unsupported): disable
					// workers and retry on the main thread. The buffer is untouched
					// because we never reached postMessage.
					if ( error && error._dracoWorkerUnavailable ) {

						this._workerLimit = 0;
						this._runSync( item );

					} else {

						item.reject( error );

					}

				} );

		}

	}

	_runSync( item ) {

		try {

			item.resolve( this._buildGeometry( decodeToTransferable( item.buffer, item.taskConfig ) ) );

		} catch ( error ) {

			item.reject( error );

		}

	}

	async _buildGeometry( payload ) {

		const THREE = await loadThree();

		const geometry = new THREE.BufferGeometry();

		for ( const attribute of payload.attributes ) {

			const bufferAttribute = new THREE.BufferAttribute( attribute.array, attribute.itemSize );

			if ( attribute.name === 'color' ) {

				this._assignVertexColorSpace( THREE, bufferAttribute, payload.vertexColorSpace );
				bufferAttribute.normalized = attribute.isFloat === false;

			}

			geometry.setAttribute( attribute.name, bufferAttribute );

		}

		if ( payload.index ) {

			geometry.setIndex( new THREE.BufferAttribute( payload.index.array, 1 ) );

		}

		return geometry;

	}

	_assignVertexColorSpace( THREE, attribute, inputColorSpace ) {

		if ( inputColorSpace !== THREE.SRGBColorSpace ) return;

		const _color = new THREE.Color();

		for ( let i = 0, il = attribute.count; i < il; i ++ ) {

			_color.fromBufferAttribute( attribute, i );
			THREE.ColorManagement.colorSpaceToWorking( _color, THREE.SRGBColorSpace );
			attribute.setXYZ( i, _color.r, _color.g, _color.b );

		}

	}

	// --- Worker pool ----------------------------------------------------------

	_useWorkers() {

		return this._workerLimit > 0 && typeof Worker !== 'undefined' && ! _isWorkerScope;

	}

	_getWorker( taskCost ) {

		if ( this._workerPool.length < this._workerLimit ) {

			let worker;

			try {

				worker = new Worker( new URL( import.meta.url ), { type: 'module' } );

			} catch ( error ) {

				const wrapped = new Error( 'THREE.DRACOLoader: Worker unavailable, decoding on the main thread. ' + error.message );
				wrapped._dracoWorkerUnavailable = true;
				throw wrapped;

			}

			worker._callbacks = {};
			worker._taskCosts = {};
			worker._taskLoad = 0;
			worker.onmessage = ( e ) => this._onWorkerMessage( worker, e );
			worker.onerror = ( e ) => this._onWorkerError( worker, e );

			this._workerPool.push( worker );

		} else {

			// Pick the least-loaded worker (sorted so the lightest is last).
			this._workerPool.sort( ( a, b ) => ( a._taskLoad > b._taskLoad ? - 1 : 1 ) );

		}

		const worker = this._workerPool[ this._workerPool.length - 1 ];
		worker._taskLoad += taskCost;
		return worker;

	}

	_decodeViaWorker( buffer, taskConfig ) {

		return new Promise( ( resolve, reject ) => {

			let worker;

			try {

				worker = this._getWorker( buffer.byteLength );

			} catch ( error ) {

				reject( error );
				return;

			}

			const taskID = this._workerNextTaskID ++;
			worker._callbacks[ taskID ] = { resolve, reject };
			worker._taskCosts[ taskID ] = buffer.byteLength;

			worker.postMessage( { type: 'decode', id: taskID, buffer: buffer, taskConfig: taskConfig }, [ buffer ] );

		} );

	}

	_onWorkerMessage( worker, e ) {

		const message = e.data;
		const callback = worker._callbacks[ message.id ];
		if ( ! callback ) return;

		this._releaseTask( worker, message.id );

		if ( message.type === 'decode' ) {

			callback.resolve( message.geometry );

		} else if ( message.type === 'error' ) {

			callback.reject( new Error( 'THREE.DRACOLoader: ' + message.message ) );

		}

	}

	_onWorkerError( worker, e ) {

		const error = new Error( 'THREE.DRACOLoader: Worker error. ' + ( e && e.message ? e.message : '' ) );

		for ( const taskID in worker._callbacks ) {

			worker._callbacks[ taskID ].reject( error );

		}

		worker._callbacks = {};
		worker._taskCosts = {};
		worker._taskLoad = 0;

	}

	_releaseTask( worker, taskID ) {

		worker._taskLoad -= worker._taskCosts[ taskID ] || 0;
		delete worker._callbacks[ taskID ];
		delete worker._taskCosts[ taskID ];

	}

	preload() {

		if ( this._useWorkers() ) {

			try {

				this._getWorker( 0 );

			} catch ( error ) {

				this._workerLimit = 0;

			}

		}

		return this;

	}

	dispose() {

		for ( const worker of this._workerPool ) worker.terminate();
		this._workerPool.length = 0;
		return this;

	}

}

export { DRACOLoader };
