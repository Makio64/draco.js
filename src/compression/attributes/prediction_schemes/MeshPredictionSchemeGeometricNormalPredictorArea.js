// src/compression/attributes/prediction_schemes/MeshPredictionSchemeGeometricNormalPredictorArea.js
// Ported from draco/compression/attributes/prediction_schemes/mesh_prediction_scheme_geometric_normal_predictor_area.h
// and mesh_prediction_scheme_geometric_normal_predictor_base.h

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
    // Reusable scratch for the per-corner position fetches (hot loop).
    this._posNext = new Array(3);
    this._posPrev = new Array(3);
    // Flat Int32 position cache indexed by data id (built once per decode).
    // The predictor reads the position of a corner's vertex O(valence) times
    // per ring; caching turns O(corners*valence) convertValue calls into one
    // per data entry.
    this._posCache = null;
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

  /** @returns {number} */
  getNormalPredictionMode() {
    return this._normalPredictionMode;
  }

  /**
   * Precomputes the integer position of every data entry once, so the hot
   * per-corner ring traversal reads from a flat Int32Array instead of going
   * through mappedIndex + convertValue on every fetch.
   * @param {number} numEntries
   */
  buildPositionCache(numEntries) {
    const cache = new Int32Array(numEntries * 3);
    const tmp = this._tempPos;
    const att = this._posAttribute;
    const map = this._entryToPointIdMap;
    for (let d = 0; d < numEntries; ++d) {
      att.convertValue(att.mappedIndex(map[d]), tmp);
      const o = d * 3;
      cache[o] = tmp[0];
      cache[o + 1] = tmp[1];
      cache[o + 2] = tmp[2];
    }
    this._posCache = cache;
  }

  /**
   * Gets the 3D position for a given data id.
   * @private
   */
  _getPositionForDataId(dataId, out) {
    const c = this._posCache;
    const o = dataId * 3;
    out[0] = c[o];
    out[1] = c[o + 1];
    out[2] = c[o + 2];
  }

  /**
   * Gets the 3D position for a given corner.
   * @private
   */
  _getPositionForCorner(ci, out) {
    const table = this._meshData.cornerTable;
    const vertId = table.vertex(ci);
    const dataId = this._meshData.vertexToDataMap[vertId];
    this._getPositionForDataId(dataId, out);
  }

  /**
   * Computes predicted normal for a given corner.
   * @param {number} cornerId
   * @param {Int32Array} prediction - output [x, y, z]
   */
  computePredictedValue(cornerId, prediction) {
    const table = this._meshData.cornerTable;
    const posCent = this._tempPos;
    const posNext = this._posNext;
    const posPrev = this._posPrev;
    this._getPositionForCorner(cornerId, posCent);

    let normalX = 0, normalY = 0, normalZ = 0;

    // Iterate over vertex corners.
    if (this._normalPredictionMode === NormalPredictionMode.ONE_TRIANGLE) {
      // Only use the single triangle at cornerId.
      const cNext = table.next(cornerId);
      const cPrev = table.previous(cornerId);
      this._getPositionForCorner(cNext, posNext);
      this._getPositionForCorner(cPrev, posPrev);

      const dNextX = posNext[0] - posCent[0];
      const dNextY = posNext[1] - posCent[1];
      const dNextZ = posNext[2] - posCent[2];
      const dPrevX = posPrev[0] - posCent[0];
      const dPrevY = posPrev[1] - posCent[1];
      const dPrevZ = posPrev[2] - posCent[2];

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
        const cNext = table.next(currentCorner);
        const cPrev = table.previous(currentCorner);
        this._getPositionForCorner(cNext, posNext);
        this._getPositionForCorner(cPrev, posPrev);

        const dNextX = posNext[0] - posCent[0];
        const dNextY = posNext[1] - posCent[1];
        const dNextZ = posNext[2] - posCent[2];
        const dPrevX = posPrev[0] - posCent[0];
        const dPrevY = posPrev[1] - posCent[1];
        const dPrevZ = posPrev[2] - posCent[2];

        // Cross product.
        normalX += dNextY * dPrevZ - dNextZ * dPrevY;
        normalY += dNextZ * dPrevX - dNextX * dPrevZ;
        normalZ += dNextX * dPrevY - dNextY * dPrevX;

        // Advance like VertexCornersIterator::Next().
        if (leftTraversal) {
          currentCorner = table.swingLeft(currentCorner);
          if (currentCorner < 0) {
            // Open boundary reached; cover the other side from the start.
            currentCorner = table.swingRight(cornerId);
            leftTraversal = false;
          } else if (currentCorner === cornerId) {
            // Returned to the start: full ring visited.
            currentCorner = -1;
          }
        } else {
          currentCorner = table.swingRight(currentCorner);
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
