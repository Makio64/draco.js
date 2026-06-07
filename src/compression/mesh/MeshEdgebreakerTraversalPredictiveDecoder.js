// compression/mesh/MeshEdgebreakerTraversalPredictiveDecoder.js - ported from mesh/mesh_edgebreaker_traversal_predictive_decoder.h

import { MeshEdgebreakerTraversalDecoder } from './MeshEdgebreakerTraversalDecoder.js';
import {
  TOPOLOGY_C, TOPOLOGY_S, TOPOLOGY_L, TOPOLOGY_R, TOPOLOGY_E
} from './MeshEdgebreakerShared.js';

// Decoder for traversal encoded with the
// MeshEdgebreakerTraversalPredictiveEncoder. The decoder maintains valences
// of the decoded portion of the traversed mesh and it uses them to predict
// symbols that are about to be decoded.
class MeshEdgebreakerTraversalPredictiveDecoder extends MeshEdgebreakerTraversalDecoder {

  constructor() {
    super();
    this._cornerTable = null;
    this._numVertices = 0;
    this._lastSymbol = -1;
    this._predictedSymbol = -1;
    this._vertexValences = [];
    this._predictionDecoder = null; // RAnsBitDecoder
  }

  init(decoder) {
    super.init(decoder);
    this._cornerTable = decoder.getCornerTable();
  }

  setNumEncodedVertices(numVertices) {
    this._numVertices = numVertices;
  }

  start(outBuffer) {
    if (!super.start(outBuffer)) {
      return false;
    }
    const numSplitSymbols = outBuffer.decodeInt32();
    if (numSplitSymbols === undefined || numSplitSymbols < 0) {
      return false;
    }
    if (numSplitSymbols >= this._numVertices) {
      return false;
    }
    this._vertexValences = new Array(this._numVertices).fill(0);
    this._predictionDecoder = this._createRAnsBitDecoder();
    if (this._predictionDecoder === null) {
      return false;
    }
    if (!this._predictionDecoder.startDecoding(outBuffer)) {
      return false;
    }
    return true;
  }

  decodeSymbol() {
    if (this._predictedSymbol !== -1) {
      // The bit confirms whether the prediction was correct.
      if (this._predictionDecoder.decodeNextBit()) {
        this._lastSymbol = this._predictedSymbol;
        return this._predictedSymbol;
      }
    }
    // No prediction or mis-predicted: decode directly.
    this._lastSymbol = super.decodeSymbol();
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

    if (this._lastSymbol === TOPOLOGY_C || this._lastSymbol === TOPOLOGY_R) {
      const pivot = ct.vertex(ct.next(corner));
      if (this._vertexValences[pivot] < 6) {
        this._predictedSymbol = TOPOLOGY_R;
      } else {
        this._predictedSymbol = TOPOLOGY_C;
      }
    } else {
      this._predictedSymbol = -1;
    }
  }

  mergeVertices(dest, source) {
    this._vertexValences[dest] += this._vertexValences[source];
  }

}

export { MeshEdgebreakerTraversalPredictiveDecoder };
