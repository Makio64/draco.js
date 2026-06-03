// compression/mesh/MeshEdgebreakerTraversalValenceDecoder.js - ported from mesh/mesh_edgebreaker_traversal_valence_decoder.h

import { MeshEdgebreakerTraversalDecoder } from './MeshEdgebreakerTraversalDecoder.js';
import { DRACO_BITSTREAM_VERSION } from '../config/CompressionShared.js';
import { decodeVarint } from '../../core/VarintDecoding.js';
import { decodeSymbols } from '../entropy/SymbolDecoding.js';
import {
  TOPOLOGY_C, TOPOLOGY_S, TOPOLOGY_L, TOPOLOGY_R, TOPOLOGY_E,
  TOPOLOGY_INVALID,
  edgeBreakerSymbolToTopologyId,
  EDGEBREAKER_VALENCE_MODE_2_7
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
    if (this.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 2)) {
      if (!this.decodeTraversalSymbols()) {
        return false;
      }
    }

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

    if (this.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 2)) {
      let numSplitSymbols;
      if (this.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 0)) {
        numSplitSymbols = outBuffer.decodeUint32();
        if (numSplitSymbols === undefined) return false;
      } else {
        numSplitSymbols = decodeVarint(outBuffer);
        if (numSplitSymbols === undefined) return false;
      }
      if (numSplitSymbols >= this._numVertices) {
        return false;
      }
      const mode = outBuffer.decodeInt8();
      if (mode === undefined) return false;
      if (mode === EDGEBREAKER_VALENCE_MODE_2_7) {
        this._minValence = 2;
        this._maxValence = 7;
      } else {
        // Unsupported mode.
        return false;
      }
    } else {
      this._minValence = 2;
      this._maxValence = 7;
    }

    if (this._numVertices < 0) {
      return false;
    }
    // Set the valences of all initial vertices to 0.
    this._vertexValences = new Array(this._numVertices).fill(0);

    const numUniqueValences = this._maxValence - this._minValence + 1;

    // Decode all symbols for all contexts.
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
    // First check if we have a valid context.
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
      if (this.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 2)) {
        // We don't have a predicted symbol or the symbol was mis-predicted.
        // Decode it directly.
        this._lastSymbol = super.decodeSymbol();
      } else {
        // The first symbol must be E.
        this._lastSymbol = TOPOLOGY_E;
      }
    }
    return this._lastSymbol;
  }

  newActiveCornerReached(corner) {
    const ct = this._cornerTable;
    const next = ct.next(corner);
    const prev = ct.previous(corner);

    // Update valences.
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

    // Compute the new context that is going to be used to decode the next
    // symbol.
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
    // Update valences on the merged vertices.
    this._vertexValences[dest] += this._vertexValences[source];
  }

}

export { MeshEdgebreakerTraversalValenceDecoder };
