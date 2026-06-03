// compression/mesh/MeshEdgebreakerTraversalDecoder.js - ported from mesh/mesh_edgebreaker_traversal_decoder.h

import { DecoderBuffer } from '../../core/DecoderBuffer.js';
import { DRACO_BITSTREAM_VERSION } from '../config/CompressionShared.js';
import { TOPOLOGY_C } from './MeshEdgebreakerShared.js';
import { RAnsBitDecoder } from '../bit_coders/RAnsBitDecoder.js';

// Default implementation of the edgebreaker traversal decoder that reads the
// traversal data directly from a buffer.
class MeshEdgebreakerTraversalDecoder {

  constructor() {
    this._buffer = new DecoderBuffer();
    this._symbolBuffer = new DecoderBuffer();
    this._startFaceDecoder = null; // RAnsBitDecoder
    this._startFaceBuffer = new DecoderBuffer();
    this._attributeConnectivityDecoders = null; // Array of RAnsBitDecoder
    this._numAttributeData = 0;
    this._decoderImpl = null;
  }

  init(decoder) {
    this._decoderImpl = decoder;
    const srcBuffer = decoder.getDecoder().buffer();
    this._buffer.init(
      srcBuffer.dataHead,
      srcBuffer.remainingSize,
      srcBuffer.bitstreamVersion
    );
  }

  // Returns the Draco bitstream version.
  bitstreamVersion() {
    return this._decoderImpl.getDecoder().bitstreamVersion();
  }

  // Used to tell the decoder what is the number of expected decoded vertices.
  // Ignored by default.
  setNumEncodedVertices(/* numVertices */) {}

  // Set the number of non-position attribute data for which we need to decode
  // the connectivity.
  setNumAttributeData(numData) {
    this._numAttributeData = numData;
  }

  // Called before the traversal decoding is started.
  // Returns true on success and sets outBuffer to data encoded after traversal.
  start(outBuffer) {
    // Decode symbols from the main buffer decoder and face configurations from
    // the start_face_buffer decoder.
    if (!this.decodeTraversalSymbols()) {
      return false;
    }
    if (!this.decodeStartFaces()) {
      return false;
    }
    if (!this.decodeAttributeSeams()) {
      return false;
    }
    // Copy buffer state to outBuffer.
    outBuffer.init(
      this._buffer.dataHead,
      this._buffer.remainingSize,
      this._buffer.bitstreamVersion
    );
    return true;
  }

  // Returns the configuration of a new initial face.
  decodeStartFaceConfiguration() {
    if (this._buffer.bitstreamVersion < DRACO_BITSTREAM_VERSION(2, 2)) {
      const faceConfiguration = this._startFaceBuffer.decodeLeastSignificantBits32(1);
      return faceConfiguration ? true : false;
    } else {
      if (this._startFaceDecoder === null) return false;
      return this._startFaceDecoder.decodeNextBit() ? true : false;
    }
  }

  // Returns the next edgebreaker symbol that was reached during the traversal.
  decodeSymbol() {
    let symbol = this._symbolBuffer.decodeLeastSignificantBits32(1);
    if (symbol === TOPOLOGY_C) {
      return symbol;
    }
    // Else decode two additional bits.
    const symbolSuffix = this._symbolBuffer.decodeLeastSignificantBits32(2);
    symbol |= (symbolSuffix << 1);
    return symbol;
  }

  // Called whenever a new active corner is set in the decoder.
  newActiveCornerReached(/* corner */) {}

  // Called whenever source vertex is about to be merged into the dest vertex.
  mergeVertices(/* dest, source */) {}

  // Returns true if there is an attribute seam for the next processed pair
  // of visited faces.
  decodeAttributeSeam(attribute) {
    return this._attributeConnectivityDecoders[attribute].decodeNextBit() ? true : false;
  }

  // Called when the traversal is finished.
  done() {
    if (this._symbolBuffer.bitDecoderActive) {
      this._symbolBuffer.endBitDecoding();
    }
    if (this._buffer.bitstreamVersion < DRACO_BITSTREAM_VERSION(2, 2)) {
      this._startFaceBuffer.endBitDecoding();
    } else {
      if (this._startFaceDecoder !== null) {
        this._startFaceDecoder.endDecoding();
      }
    }
  }

  // -- Protected methods --

  get buffer() {
    return this._buffer;
  }

  decodeTraversalSymbols() {
    // Copy current buffer state to symbolBuffer.
    this._symbolBuffer.init(
      this._buffer.dataHead,
      this._buffer.remainingSize,
      this._buffer.bitstreamVersion
    );
    const traversalSize = this._symbolBuffer.startBitDecoding(true);
    if (traversalSize === undefined) {
      return false;
    }
    // Update buffer to point after the symbol data.
    this._buffer.init(
      this._symbolBuffer.dataHead,
      this._symbolBuffer.remainingSize,
      this._symbolBuffer.bitstreamVersion
    );
    if (traversalSize > this._buffer.remainingSize) {
      return false;
    }
    this._buffer.advance(traversalSize);
    return true;
  }

  decodeStartFaces() {
    if (this._buffer.bitstreamVersion < DRACO_BITSTREAM_VERSION(2, 2)) {
      this._startFaceBuffer.init(
        this._buffer.dataHead,
        this._buffer.remainingSize,
        this._buffer.bitstreamVersion
      );
      const traversalSize = this._startFaceBuffer.startBitDecoding(true);
      if (traversalSize === undefined) {
        return false;
      }
      this._buffer.init(
        this._startFaceBuffer.dataHead,
        this._startFaceBuffer.remainingSize,
        this._startFaceBuffer.bitstreamVersion
      );
      if (traversalSize > this._buffer.remainingSize) {
        return false;
      }
      this._buffer.advance(traversalSize);
      return true;
    }
    // For version >= 2.2, use the RAnsBitDecoder for start faces.
    // The RAnsBitDecoder must be provided from the bit_coders module.
    // Placeholder: create a lazy-loaded decoder.
    try {
      // Dynamically create RAnsBitDecoder if available
      this._startFaceDecoder = this._createRAnsBitDecoder();
      if (this._startFaceDecoder === null) {
        return false;
      }
      return this._startFaceDecoder.startDecoding(this._buffer);
    } catch (e) {
      return false;
    }
  }

  decodeAttributeSeams() {
    if (this._numAttributeData > 0) {
      this._attributeConnectivityDecoders = [];
      for (let i = 0; i < this._numAttributeData; ++i) {
        const decoder = this._createRAnsBitDecoder();
        if (decoder === null) {
          return false;
        }
        if (!decoder.startDecoding(this._buffer)) {
          return false;
        }
        this._attributeConnectivityDecoders.push(decoder);
      }
    }
    return true;
  }

  // Factory method for creating a RAnsBitDecoder.
  _createRAnsBitDecoder() {
    return new RAnsBitDecoder();
  }

}

export { MeshEdgebreakerTraversalDecoder };
