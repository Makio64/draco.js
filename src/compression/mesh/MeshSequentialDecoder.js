// compression/mesh/MeshSequentialDecoder.js - ported from mesh/mesh_sequential_decoder.h/cc

import { MeshDecoder } from './MeshDecoder.js';
import { DRACO_BITSTREAM_VERSION } from '../config/CompressionShared.js';
import { decodeVarint } from '../../core/VarintDecoding.js';

// Class for decoding data encoded by MeshSequentialEncoder.
class MeshSequentialDecoder extends MeshDecoder {

  constructor() {
    super();
  }

  decodeConnectivity() {
    let numFaces;
    let numPoints;

    if (this.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 2)) {
      numFaces = this.buffer().decodeUint32();
      if (numFaces === undefined) return false;
      numPoints = this.buffer().decodeUint32();
      if (numPoints === undefined) return false;
    } else {
      numFaces = decodeVarint(this.buffer());
      if (numFaces === undefined) return false;
      numPoints = decodeVarint(this.buffer());
      if (numPoints === undefined) return false;
    }

    // Check that numFaces is a valid value.
    // Compressed sequential encoding can only handle (2^32 - 1) / 3 indices.
    if (numFaces > 0xFFFFFFFF / 3) {
      return false;
    }
    if (numFaces > this.buffer().remainingSize / 3) {
      // The number of faces is unreasonably high.
      return false;
    }

    const connectivityMethod = this.buffer().decodeUint8();
    if (connectivityMethod === undefined) {
      return false;
    }

    if (connectivityMethod === 0) {
      if (!this._decodeAndDecompressIndices(numFaces)) {
        return false;
      }
    } else {
      if (numPoints < 256) {
        // Decode indices as uint8.
        for (let i = 0; i < numFaces; ++i) {
          const face = [0, 0, 0];
          for (let j = 0; j < 3; ++j) {
            const val = this.buffer().decodeUint8();
            if (val === undefined) return false;
            face[j] = val;
          }
          this.mesh().addFace(face);
        }
      } else if (numPoints < (1 << 16)) {
        // Decode indices as uint16.
        for (let i = 0; i < numFaces; ++i) {
          const face = [0, 0, 0];
          for (let j = 0; j < 3; ++j) {
            const val = this.buffer().decodeUint16();
            if (val === undefined) return false;
            face[j] = val;
          }
          this.mesh().addFace(face);
        }
      } else if (numPoints < (1 << 21) &&
                 this.bitstreamVersion() >= DRACO_BITSTREAM_VERSION(2, 2)) {
        // Decode indices as varint.
        for (let i = 0; i < numFaces; ++i) {
          const face = [0, 0, 0];
          for (let j = 0; j < 3; ++j) {
            const val = decodeVarint(this.buffer());
            if (val === undefined) return false;
            face[j] = val;
          }
          this.mesh().addFace(face);
        }
      } else {
        // Decode faces as uint32 (default).
        for (let i = 0; i < numFaces; ++i) {
          const face = [0, 0, 0];
          for (let j = 0; j < 3; ++j) {
            const val = this.buffer().decodeUint32();
            if (val === undefined) return false;
            face[j] = val;
          }
          this.mesh().addFace(face);
        }
      }
    }

    this.pointCloud().setNumPoints(numPoints);
    return true;
  }

  createAttributesDecoder(attDecoderId) {
    // Always create the basic attribute decoder.
    // The SequentialAttributeDecodersController with a LinearSequencer
    // would be instantiated here. Dependent on those modules being ported.
    //
    // return this.setAttributesDecoder(
    //   attDecoderId,
    //   new SequentialAttributeDecodersController(
    //     new LinearSequencer(this.pointCloud().numPoints())
    //   )
    // );
    return false;
  }

  // Decodes face indices that were compressed with an entropy code.
  _decodeAndDecompressIndices(numFaces) {
    // Get decoded indices differences that were encoded with an entropy code.
    // This requires the DecodeSymbols function from the entropy module.
    // For now this is a placeholder that mirrors the C++ logic.
    //
    // const indicesBuffer = new Uint32Array(numFaces * 3);
    // if (!decodeSymbols(numFaces * 3, 1, this.buffer(), indicesBuffer)) {
    //   return false;
    // }
    //
    // Reconstruct the indices from the differences.
    // let lastIndexValue = 0;
    // let vertexIndex = 0;
    // for (let i = 0; i < numFaces; ++i) {
    //   const face = [0, 0, 0];
    //   for (let j = 0; j < 3; ++j) {
    //     const encodedVal = indicesBuffer[vertexIndex++];
    //     let indexDiff = (encodedVal >> 1);
    //     if (encodedVal & 1) {
    //       if (indexDiff > lastIndexValue) return false;
    //       indexDiff = -indexDiff;
    //     } else {
    //       if (indexDiff > (0x7FFFFFFF - lastIndexValue)) return false;
    //     }
    //     const indexValue = indexDiff + lastIndexValue;
    //     face[j] = indexValue;
    //     lastIndexValue = indexValue;
    //   }
    //   this.mesh().addFace(face);
    // }
    // return true;
    return false;
  }

}

export { MeshSequentialDecoder };
