// src/compression/attributes/prediction_schemes/MeshPredictionSchemeTexCoordsPortableDecoder.js
// Ported from draco/compression/attributes/prediction_schemes/mesh_prediction_scheme_tex_coords_portable_decoder.h

import { MeshPredictionSchemeDecoder } from './MeshPredictionSchemeDecoder.js';
import { PredictionSchemeMethod } from '../../config/CompressionShared.js';
import { MeshPredictionSchemeTexCoordsPortablePredictor } from './MeshPredictionSchemeTexCoordsPortablePredictor.js';
import { RAnsBitDecoder } from '../../bit_coders/RAnsBitDecoder.js';

const GEOMETRY_ATTRIBUTE_POSITION = 0;

/**
 * Decoder for predictions of UV coordinates using the portable texture
 * coordinate predictor. This is the preferred version over the deprecated
 * MeshPredictionSchemeTexCoordsDecoder.
 */
class MeshPredictionSchemeTexCoordsPortableDecoder extends MeshPredictionSchemeDecoder {

  /**
   * @param {object} attribute - PointAttribute
   * @param {object} transform - A decoding transform instance
   * @param {object} meshData - MeshPredictionSchemeData instance
   */
  constructor(attribute, transform, meshData) {
    super(attribute, transform, meshData);
    this._predictor = new MeshPredictionSchemeTexCoordsPortablePredictor(meshData);
  }

  /** @returns {number} */
  getPredictionMethod() {
    return PredictionSchemeMethod.MESH_PREDICTION_TEX_COORDS_PORTABLE;
  }

  /** @returns {boolean} */
  isInitialized() {
    if (!this._predictor.isInitialized()) return false;
    if (!this._meshData.isInitialized()) return false;
    return true;
  }

  /** @returns {number} */
  getNumParentAttributes() {
    return 1;
  }

  /**
   * @param {number} i
   * @returns {number}
   */
  getParentAttributeType(i) {
    return GEOMETRY_ATTRIBUTE_POSITION;
  }

  /**
   * @param {object} att - PointAttribute
   * @returns {boolean}
   */
  setParentAttribute(att) {
    if (!att || att.attributeType !== GEOMETRY_ATTRIBUTE_POSITION) return false;
    if (att.numComponents !== 3) return false;
    this._predictor.setPositionAttribute(att);
    return true;
  }

  /**
   * Decodes orientation flags.
   * @param {DecoderBuffer} buffer
   * @returns {boolean}
   */
  decodePredictionData(buffer) {
    let numOrientations = buffer.decodeInt32();
    if (numOrientations === undefined || numOrientations < 0) return false;

    this._predictor.resizeOrientations(numOrientations);
    let lastOrientation = true;
    const decoder = new RAnsBitDecoder();
    if (!decoder.startDecoding(buffer)) return false;
    for (let i = 0; i < numOrientations; ++i) {
      if (!decoder.decodeNextBit()) {
        lastOrientation = !lastOrientation;
      }
      this._predictor.setOrientation(i, lastOrientation);
    }
    decoder.endDecoding();
    return super.decodePredictionData(buffer);
  }

  /**
   * @param {Int32Array} inCorr
   * @param {Int32Array} outData
   * @param {number} size
   * @param {number} numComponents
   * @param {Array} entryToPointIdMap
   * @returns {boolean}
   */
  computeOriginalValues(inCorr, outData, size, numComponents, entryToPointIdMap) {
    if (numComponents !== MeshPredictionSchemeTexCoordsPortablePredictor.NUM_COMPONENTS) {
      return false;
    }
    this._predictor.setEntryToPointIdMap(entryToPointIdMap);
    this._transform.init(numComponents);

    const cornerMapSize = this._meshData.dataToCornerMap.length;
    // Cache integer positions once (see predictor) to avoid per-fetch
    // mappedIndex + convertValue in the prediction loop.
    this._predictor.buildPositionCache(cornerMapSize);
    for (let p = 0; p < cornerMapSize; ++p) {
      const cornerId = this._meshData.dataToCornerMap[p];
      if (!this._predictor.computePredictedValue(cornerId, outData, p)) {
        return false;
      }

      const dstOffset = p * numComponents;
      this._transform.computeOriginalValue(
        this._predictor.predictedValue, 0,
        inCorr, dstOffset,
        outData, dstOffset
      );
    }
    return true;
  }

}

export { MeshPredictionSchemeTexCoordsPortableDecoder };
