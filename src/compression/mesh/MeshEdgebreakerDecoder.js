// compression/mesh/MeshEdgebreakerDecoder.js - ported from mesh/mesh_edgebreaker_decoder.h/cc

import { MeshDecoder } from './MeshDecoder.js';
import { MeshEdgebreakerDecoderImpl } from './MeshEdgebreakerDecoderImpl.js';
import { MeshEdgebreakerTraversalDecoder } from './MeshEdgebreakerTraversalDecoder.js';
import { MeshEdgebreakerTraversalPredictiveDecoder } from './MeshEdgebreakerTraversalPredictiveDecoder.js';
import { MeshEdgebreakerTraversalValenceDecoder } from './MeshEdgebreakerTraversalValenceDecoder.js';
import { MeshEdgebreakerConnectivityEncodingMethod } from '../config/CompressionShared.js';

// Class for decoding data encoded by MeshEdgebreakerEncoder.
class MeshEdgebreakerDecoder extends MeshDecoder {

  constructor() {
    super();
    this._impl = null;
  }

  getCornerTable() {
    return this._impl ? this._impl.getCornerTable() : null;
  }

  getAttributeCornerTable(attId) {
    return this._impl ? this._impl.getAttributeCornerTable(attId) : null;
  }

  getAttributeEncodingData(attId) {
    return this._impl ? this._impl.getAttributeEncodingData(attId) : null;
  }

  initializeDecoder() {
    const traversalDecoderType = this.buffer().decodeUint8();
    if (traversalDecoderType === undefined) {
      return false;
    }

    this._impl = null;

    if (traversalDecoderType ===
        MeshEdgebreakerConnectivityEncodingMethod.MESH_EDGEBREAKER_STANDARD_ENCODING) {
      this._impl = new MeshEdgebreakerDecoderImpl(
        MeshEdgebreakerTraversalDecoder);
    } else if (traversalDecoderType ===
        MeshEdgebreakerConnectivityEncodingMethod.MESH_EDGEBREAKER_PREDICTIVE_ENCODING) {
      this._impl = new MeshEdgebreakerDecoderImpl(
        MeshEdgebreakerTraversalPredictiveDecoder);
    } else if (traversalDecoderType ===
        MeshEdgebreakerConnectivityEncodingMethod.MESH_EDGEBREAKER_VALENCE_ENCODING) {
      this._impl = new MeshEdgebreakerDecoderImpl(
        MeshEdgebreakerTraversalValenceDecoder);
    }

    if (!this._impl) {
      return false;
    }
    if (!this._impl.init(this)) {
      return false;
    }
    return true;
  }

  createAttributesDecoder(attDecoderId) {
    return this._impl.createAttributesDecoder(attDecoderId);
  }

  decodeConnectivity() {
    return this._impl.decodeConnectivity();
  }

  onAttributesDecoded() {
    return this._impl.onAttributesDecoded();
  }

}

export { MeshEdgebreakerDecoder };
