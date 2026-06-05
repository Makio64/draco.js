// src/compression/attributes/prediction_schemes/MeshPredictionSchemeGeometricNormalPredictorArea.js
// Ported from draco/compression/attributes/prediction_schemes/mesh_prediction_scheme_geometric_normal_predictor_area.h
// and mesh_prediction_scheme_geometric_normal_predictor_base.h

import { buildInt32PositionCache } from './PredictionSchemePositionCache.js';
import { NormalPredictionMode } from '../../config/CompressionShared.js';

const UPPER_BOUND = 1 << 29;

/**
 * Predictor that estimates the normal via the surrounding triangles of a
 * given corner, weighted by triangle area.
 */
class MeshPredictionSchemeGeometricNormalPredictorArea {

  /**
   * @param {object} meshData - MeshPredictionSchemeData instance
   */
  constructor(meshData) {
    this._posAttribute = null;
    this._entryToPointIdMap = null;
    this._meshData = meshData;
    this._normalPredictionMode = NormalPredictionMode.TRIANGLE_AREA;
    this._tempPos = new Array(3);
    // Flat Int32 position cache indexed by data id (built once per decode).
    // The predictor reads the position of a corner's vertex O(valence) times
    // per ring; caching turns O(corners*valence) convertValue calls into one
    // per data entry.
    this._posCache = null;
    this._cornerToVertex = null;
    this._oppositeCorners = null;
  }

  /**
   * @param {object} positionAttribute - PointAttribute for positions
   */
  setPositionAttribute(positionAttribute) {
    this._posAttribute = positionAttribute;
  }

  /**
   * @param {Array} map
   */
  setEntryToPointIdMap(map) {
    this._entryToPointIdMap = map;
  }

  /** @returns {boolean} */
  isInitialized() {
    return this._posAttribute !== null && this._entryToPointIdMap !== null;
  }

  /**
   * @param {number} mode
   * @returns {boolean}
   */
  setNormalPredictionMode(mode) {
    if (mode === NormalPredictionMode.ONE_TRIANGLE ||
        mode === NormalPredictionMode.TRIANGLE_AREA) {
      this._normalPredictionMode = mode;
      return true;
    }
    return false;
  }

  /**
   * Precomputes the integer position of every data entry once, so the hot
   * per-corner ring traversal reads from a flat Int32Array instead of going
   * through mappedIndex + convertValue on every fetch.
   * @param {number} numEntries
   */
  buildPositionCache(numEntries) {
    this._posCache = buildInt32PositionCache(
      this._posAttribute, this._entryToPointIdMap, numEntries, this._tempPos);
    const table = this._meshData.cornerTable;
    this._cornerToVertex = table.cornerToVertexArray();
    this._oppositeCorners = table.oppositeCornerArray();
  }

  /**
   * Computes predicted normal for a given corner.
   * @param {number} cornerId
   * @param {Int32Array} prediction - output [x, y, z]
   */
  computePredictedValue(cornerId, prediction) {
    const cornerToVertex = this._cornerToVertex;
    const oppositeCorners = this._oppositeCorners;
    const vertexToDataMap = this._meshData.vertexToDataMap;
    const posCache = this._posCache;
    const centerDataId = vertexToDataMap[cornerToVertex[cornerId]];
    const centerOffset = centerDataId * 3;
    const centX = posCache[centerOffset];
    const centY = posCache[centerOffset + 1];
    const centZ = posCache[centerOffset + 2];

    let normalX = 0, normalY = 0, normalZ = 0;

    // Iterate over vertex corners.
    if (this._normalPredictionMode === NormalPredictionMode.ONE_TRIANGLE) {
      // Only use the single triangle at cornerId.
      const rem = cornerId - ((cornerId / 3) | 0) * 3;
      const cNext = rem === 2 ? cornerId - 2 : cornerId + 1;
      const cPrev = rem === 0 ? cornerId + 2 : cornerId - 1;
      let posOffset = vertexToDataMap[cornerToVertex[cNext]] * 3;
      const nextX = posCache[posOffset];
      const nextY = posCache[posOffset + 1];
      const nextZ = posCache[posOffset + 2];
      posOffset = vertexToDataMap[cornerToVertex[cPrev]] * 3;
      const prevX = posCache[posOffset];
      const prevY = posCache[posOffset + 1];
      const prevZ = posCache[posOffset + 2];

      const dNextX = nextX - centX;
      const dNextY = nextY - centY;
      const dNextZ = nextZ - centZ;
      const dPrevX = prevX - centX;
      const dPrevY = prevY - centY;
      const dPrevZ = prevZ - centZ;

      // Cross product.
      normalX = dNextY * dPrevZ - dNextZ * dPrevY;
      normalY = dNextZ * dPrevX - dNextX * dPrevZ;
      normalZ = dNextX * dPrevY - dNextY * dPrevX;
    } else {
      // TRIANGLE_AREA: iterate over all corners around the vertex exactly like
      // C++ VertexCornersIterator(corner_table, corner_id): swing LEFT from the
      // start corner until a boundary or a full loop, then (only if an open
      // boundary was reached) swing RIGHT from the start corner to cover the
      // other side. Only swinging right (as before) silently dropped every
      // triangle to the left of the start corner for boundary vertices, which
      // corrupted the predicted normal on any mesh with open edges.
      let currentCorner = cornerId;
      let leftTraversal = true;

      while (currentCorner >= 0) {
        const rem = currentCorner - ((currentCorner / 3) | 0) * 3;
        const cNext = rem === 2 ? currentCorner - 2 : currentCorner + 1;
        const cPrev = rem === 0 ? currentCorner + 2 : currentCorner - 1;
        let posOffset = vertexToDataMap[cornerToVertex[cNext]] * 3;
        const nextX = posCache[posOffset];
        const nextY = posCache[posOffset + 1];
        const nextZ = posCache[posOffset + 2];
        posOffset = vertexToDataMap[cornerToVertex[cPrev]] * 3;
        const prevX = posCache[posOffset];
        const prevY = posCache[posOffset + 1];
        const prevZ = posCache[posOffset + 2];

        const dNextX = nextX - centX;
        const dNextY = nextY - centY;
        const dNextZ = nextZ - centZ;
        const dPrevX = prevX - centX;
        const dPrevY = prevY - centY;
        const dPrevZ = prevZ - centZ;

        // Cross product.
        normalX += dNextY * dPrevZ - dNextZ * dPrevY;
        normalY += dNextZ * dPrevX - dNextX * dPrevZ;
        normalZ += dNextX * dPrevY - dNextY * dPrevX;

        // Advance like VertexCornersIterator::Next().
        if (leftTraversal) {
          const opp = oppositeCorners[cNext];
          if (opp < 0) {
            currentCorner = -1;
          } else {
            const oppRem = opp - ((opp / 3) | 0) * 3;
            currentCorner = oppRem === 2 ? opp - 2 : opp + 1;
          }
          if (currentCorner < 0) {
            // Open boundary reached; cover the other side from the start.
            const startRem = cornerId - ((cornerId / 3) | 0) * 3;
            const startPrev = startRem === 0 ? cornerId + 2 : cornerId - 1;
            const startOpp = oppositeCorners[startPrev];
            if (startOpp < 0) {
              currentCorner = -1;
            } else {
              const startOppRem = startOpp - ((startOpp / 3) | 0) * 3;
              currentCorner = startOppRem === 0 ? startOpp + 2 : startOpp - 1;
            }
            leftTraversal = false;
          } else if (currentCorner === cornerId) {
            // Returned to the start: full ring visited.
            currentCorner = -1;
          }
        } else {
          const opp = oppositeCorners[cPrev];
          if (opp < 0) {
            currentCorner = -1;
          } else {
            const oppRem = opp - ((opp / 3) | 0) * 3;
            currentCorner = oppRem === 0 ? opp + 2 : opp - 1;
          }
        }
      }
    }

    // Convert to int32, making sure entries are not too large. This mirrors the
    // C++ which does the clamp with int64 INTEGER division: the quotient is
    // floored and each component is divided with truncation toward zero. A naive
    // float division diverges whenever UPPER_BOUND < absSum < 2 * UPPER_BOUND,
    // where the C++ quotient is exactly 1 and the normal is left unchanged.
    let absSum;
    if (this._normalPredictionMode === NormalPredictionMode.ONE_TRIANGLE) {
      // C++ casts AbsSum() to int32_t before the comparison in this branch.
      absSum = (Math.abs(normalX) + Math.abs(normalY) + Math.abs(normalZ)) | 0;
    } else {
      absSum = Math.abs(normalX) + Math.abs(normalY) + Math.abs(normalZ);
    }
    if (absSum > UPPER_BOUND) {
      const quotient = Math.floor(absSum / UPPER_BOUND);
      normalX = Math.trunc(normalX / quotient);
      normalY = Math.trunc(normalY / quotient);
      normalZ = Math.trunc(normalZ / quotient);
    }

    prediction[0] = Math.trunc(normalX);
    prediction[1] = Math.trunc(normalY);
    prediction[2] = Math.trunc(normalZ);
  }

}

export { MeshPredictionSchemeGeometricNormalPredictorArea };
