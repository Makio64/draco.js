// src/compression/attributes/prediction_schemes/MeshPredictionSchemeParallelogramDecoder.js
// Ported from draco/compression/attributes/prediction_schemes/mesh_prediction_scheme_parallelogram_decoder.h

import { MeshPredictionSchemeDecoder } from './MeshPredictionSchemeDecoder.js';
import { PredictionSchemeMethod } from '../../config/CompressionShared.js';
import { computeParallelogramPrediction } from './MeshPredictionSchemeParallelogramShared.js';

/**
 * Decoder for attribute values encoded with the standard parallelogram
 * prediction. Uses the parallelogram formed by three vertices of a triangle
 * opposite to the current corner to predict the attribute value.
 */
class MeshPredictionSchemeParallelogramDecoder extends MeshPredictionSchemeDecoder {

  /**
   * @param {object} attribute - PointAttribute
   * @param {object} transform - A decoding transform instance
   * @param {object} meshData - MeshPredictionSchemeData instance
   */
  constructor(attribute, transform, meshData) {
    super(attribute, transform, meshData);
  }

  /** @returns {number} */
  getPredictionMethod() {
    return PredictionSchemeMethod.MESH_PREDICTION_PARALLELOGRAM;
  }

  /** @returns {boolean} */
  isInitialized() {
    return this._meshData.isInitialized();
  }

  /**
   * Computes original values using parallelogram prediction.
   * @param {Int32Array} inCorr
   * @param {Int32Array} outData
   * @param {number} size
   * @param {number} numComponents
   * @param {Array|null} entryToPointIdMap
   * @returns {boolean}
   */
  computeOriginalValues(inCorr, outData, size, numComponents, entryToPointIdMap) {
    this._transform.init(numComponents);

    const table = this._meshData.cornerTable;
    const vertexToDataMap = this._meshData.vertexToDataMap;
    // Flat connectivity arrays (Int32Array) — see computeParallelogramPrediction.
    const oppositeCorners = table.oppositeCornerArray();
    const cornerToVertex = table.cornerToVertexArray();
    const dataToCornerMap = this._meshData.dataToCornerMap;

    // Storage for prediction values (initialized to zero).
    const predVals = new Int32Array(numComponents);

    // Restore the first value.
    this._transform.computeOriginalValue(
      predVals, 0, inCorr, 0, outData, 0
    );

    const cornerMapSize = dataToCornerMap.length;
    for (let p = 1; p < cornerMapSize; ++p) {
      const cornerId = dataToCornerMap[p];
      const dstOffset = p * numComponents;

      const result = computeParallelogramPrediction(
        p, cornerId, oppositeCorners, cornerToVertex, vertexToDataMap,
        outData, numComponents, predVals
      );

      if (!result) {
        // Parallelogram could not be computed. Use delta coding (previous value).
        const srcOffset = (p - 1) * numComponents;
        this._transform.computeOriginalValue(
          outData, srcOffset, inCorr, dstOffset, outData, dstOffset
        );
      } else {
        // Apply the parallelogram prediction.
        this._transform.computeOriginalValue(
          predVals, 0, inCorr, dstOffset, outData, dstOffset
        );
      }
    }
    return true;
  }

}

export { MeshPredictionSchemeParallelogramDecoder };
