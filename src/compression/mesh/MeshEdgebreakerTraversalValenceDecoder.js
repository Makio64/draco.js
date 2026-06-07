// compression/mesh/MeshEdgebreakerTraversalValenceDecoder.js - ported from mesh/mesh_edgebreaker_traversal_valence_decoder.h

import { MeshEdgebreakerTraversalDecoder } from './MeshEdgebreakerTraversalDecoder.js';
import { decodeVarint } from '../../core/VarintDecoding.js';
import { decodeSymbols } from '../entropy/SymbolDecoding.js';
import {
  TOPOLOGY_C, TOPOLOGY_S, TOPOLOGY_L, TOPOLOGY_R, TOPOLOGY_E,
  TOPOLOGY_INVALID,
  edgeBreakerSymbolToTopologyId
} from './MeshEdgebreakerShared.js';

// Decoder for traversal encoded with MeshEdgebreakerTraversalValenceEncoder.
// The decoder maintains valences of the decoded portion of the traversed mesh
// and it uses them to select entropy context used for decoding of the actual
// symbols.
class MeshEdgebreakerTraversalValenceDecoder extends MeshEdgebreakerTraversalDecoder {

  constructor() {
    super();
    this._cornerTable = null;
    this._numVertices = 0;
    this._lastSymbol = -1;
    this._activeContext = -1;
    this._minValence = 2;
    this._maxValence = 7;
    this._vertexValences = [];
    this._contextSymbols = [];
    this._contextCounters = [];
  }

  init(decoder) {
    super.init(decoder);
    this._cornerTable = decoder.getCornerTable();
  }

  setNumEncodedVertices(numVertices) {
    this._numVertices = numVertices;
  }

  start(outBuffer) {
    if (!this.decodeStartFaces()) {
      return false;
    }
    if (!this.decodeAttributeSeams()) {
      return false;
    }
    outBuffer.init(
      this.buffer.dataHead,
      this.buffer.remainingSize,
      this.buffer.bitstreamVersion
    );

    this._minValence = 2;
    this._maxValence = 7;

    if (this._numVertices < 0) {
      return false;
    }
    this._vertexValences = new Array(this._numVertices).fill(0);

    const numUniqueValences = this._maxValence - this._minValence + 1;

    this._contextSymbols = new Array(numUniqueValences);
    this._contextCounters = new Array(numUniqueValences);

    for (let i = 0; i < numUniqueValences; ++i) {
      const numSymbols = decodeVarint(outBuffer);
      if (numSymbols === undefined) {
        return false;
      }
      if (numSymbols > this._cornerTable.numFaces()) {
        return false;
      }
      if (numSymbols > 0) {
        this._contextSymbols[i] = new Uint32Array(numSymbols);
        if (!decodeSymbols(numSymbols, 1, outBuffer, this._contextSymbols[i])) {
          return false;
        }
        // All symbols are going to be processed from the back.
        this._contextCounters[i] = numSymbols;
      } else {
        this._contextSymbols[i] = new Uint32Array(0);
        this._contextCounters[i] = 0;
      }
    }
    return true;
  }

  decodeSymbol() {
    if (this._activeContext !== -1) {
      const contextCounter = --this._contextCounters[this._activeContext];
      if (contextCounter < 0) {
        return TOPOLOGY_INVALID;
      }
      const symbolId = this._contextSymbols[this._activeContext][contextCounter];
      if (symbolId > 4) {
        return TOPOLOGY_INVALID;
      }
      this._lastSymbol = edgeBreakerSymbolToTopologyId[symbolId];
    } else {
      // The first symbol is always E.
      this._lastSymbol = TOPOLOGY_E;
    }
    return this._lastSymbol;
  }

  newActiveCornerReached(corner) {
    const ct = this._cornerTable;
    const next = ct.next(corner);
    const prev = ct.previous(corner);

    switch (this._lastSymbol) {
      case TOPOLOGY_C:
      case TOPOLOGY_S:
        this._vertexValences[ct.vertex(next)] += 1;
        this._vertexValences[ct.vertex(prev)] += 1;
        break;
      case TOPOLOGY_R:
        this._vertexValences[ct.vertex(corner)] += 1;
        this._vertexValences[ct.vertex(next)] += 1;
        this._vertexValences[ct.vertex(prev)] += 2;
        break;
      case TOPOLOGY_L:
        this._vertexValences[ct.vertex(corner)] += 1;
        this._vertexValences[ct.vertex(next)] += 2;
        this._vertexValences[ct.vertex(prev)] += 1;
        break;
      case TOPOLOGY_E:
        this._vertexValences[ct.vertex(corner)] += 2;
        this._vertexValences[ct.vertex(next)] += 2;
        this._vertexValences[ct.vertex(prev)] += 2;
        break;
      default:
        break;
    }

    // The clamped valence of the next vertex selects the entropy context.
    const activeValence = this._vertexValences[ct.vertex(next)];
    let clampedValence;
    if (activeValence < this._minValence) {
      clampedValence = this._minValence;
    } else if (activeValence > this._maxValence) {
      clampedValence = this._maxValence;
    } else {
      clampedValence = activeValence;
    }
    this._activeContext = clampedValence - this._minValence;
  }

  mergeVertices(dest, source) {
    this._vertexValences[dest] += this._vertexValences[source];
  }

}

export { MeshEdgebreakerTraversalValenceDecoder };
