// src/compression/attributes/prediction_schemes/MeshPredictionSchemeMultiParallelogramDecoder.js
// Ported from draco/compression/attributes/prediction_schemes/mesh_prediction_scheme_multi_parallelogram_decoder.h

import { MeshPredictionSchemeDecoder } from './MeshPredictionSchemeDecoder.js';
import { PredictionSchemeMethod } from '../../config/CompressionShared.js';
import { computeParallelogramPrediction } from './MeshPredictionSchemeParallelogramShared.js';
import { kInvalidCornerIndex } from '../../../mesh/CornerTable.js';

/**
 * Decoder for predictions encoded by multi-parallelogram encoding scheme.
 * Multiple parallelogram predictions around a vertex are averaged to
 * produce the final prediction.
 */
class MeshPredictionSchemeMultiParallelogramDecoder extends MeshPredictionSchemeDecoder {

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
    return PredictionSchemeMethod.MESH_PREDICTION_MULTI_PARALLELOGRAM;
  }

  /** @returns {boolean} */
  isInitialized() {
    return this._meshData.isInitialized();
  }

  /**
   * @param {Int32Array} inCorr
   * @param {Int32Array} outData
   * @param {number} size
   * @param {number} numComponents
   * @param {Array|null} entryToPointIdMap
   * @returns {boolean}
   */
  computeOriginalValues(inCorr, outData, size, numComponents, entryToPointIdMap) {
    this._transform.init(numComponents);

    const predVals = new Int32Array(numComponents);
    const parallelogramPredVals = new Int32Array(numComponents);

    // First value: predicted = 0.
    this._transform.computeOriginalValue(
      predVals, 0, inCorr, 0, outData, 0
    );

    const table = this._meshData.cornerTable;
    const vertexToDataMap = this._meshData.vertexToDataMap;
    const oppositeCorners = table.oppositeCornerArray();
    const cornerToVertex = table.cornerToVertexArray();
    const cornerMapSize = this._meshData.dataToCornerMap.length;

    for (let p = 1; p < cornerMapSize; ++p) {
      const startCornerId = this._meshData.dataToCornerMap[p];
      let cornerId = startCornerId;
      let numParallelograms = 0;

      for (let i = 0; i < numComponents; ++i) {
        predVals[i] = 0;
      }

      while (cornerId !== kInvalidCornerIndex) {
        if (computeParallelogramPrediction(
          p, cornerId, oppositeCorners, cornerToVertex, vertexToDataMap,
          outData, numComponents, parallelogramPredVals)) {
          for (let c = 0; c < numComponents; ++c) {
            predVals[c] = (predVals[c] + parallelogramPredVals[c]) | 0;
          }
          ++numParallelograms;
        }

        cornerId = table.swingRight(cornerId);
        if (cornerId === startCornerId) {
          cornerId = kInvalidCornerIndex;
        }
      }

      const dstOffset = p * numComponents;
      if (numParallelograms === 0) {
        // No valid parallelogram. Use delta from previous point.
        const srcOffset = (p - 1) * numComponents;
        this._transform.computeOriginalValue(
          outData, srcOffset, inCorr, dstOffset, outData, dstOffset
        );
      } else {
        // Average the parallelogram predictions.
        for (let c = 0; c < numComponents; ++c) {
          predVals[c] = (predVals[c] / numParallelograms) | 0;
        }
        this._transform.computeOriginalValue(
          predVals, 0, inCorr, dstOffset, outData, dstOffset
        );
      }
    }
    return true;
  }

}

export { MeshPredictionSchemeMultiParallelogramDecoder };
