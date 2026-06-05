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

  constructor(meshData) {
    this._posAttribute = null;
    this._entryToPointIdMap = null;
    this._meshData = meshData;
    this._normalPredictionMode = NormalPredictionMode.TRIANGLE_AREA;
    this._tempPos = new Array(3);
    // Flat Int32 position cache indexed by data id; turns O(corners*valence)
    // convertValue calls (the ring is read once per vertex corner) into one per
    // data entry.
    this._posCache = null;
    this._cornerToVertex = null;
    this._oppositeCorners = null;
  }

  setPositionAttribute(positionAttribute) {
    this._posAttribute = positionAttribute;
  }

  setEntryToPointIdMap(map) {
    this._entryToPointIdMap = map;
  }

  isInitialized() {
    return this._posAttribute !== null && this._entryToPointIdMap !== null;
  }

  setNormalPredictionMode(mode) {
    if (mode === NormalPredictionMode.ONE_TRIANGLE ||
        mode === NormalPredictionMode.TRIANGLE_AREA) {
      this._normalPredictionMode = mode;
      return true;
    }
    return false;
  }

  buildPositionCache(numEntries) {
    this._posCache = buildInt32PositionCache(
      this._posAttribute, this._entryToPointIdMap, numEntries, this._tempPos);
    const table = this._meshData.cornerTable;
    this._cornerToVertex = table.cornerToVertexArray();
    this._oppositeCorners = table.oppositeCornerArray();
  }

  /** Computes predicted normal for a corner; writes [x, y, z] into prediction. */
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

    if (this._normalPredictionMode === NormalPredictionMode.ONE_TRIANGLE) {
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

      normalX = dNextY * dPrevZ - dNextZ * dPrevY;
      normalY = dNextZ * dPrevX - dNextX * dPrevZ;
      normalZ = dNextX * dPrevY - dNextY * dPrevX;
    } else {
      // TRIANGLE_AREA: iterate every corner around the vertex exactly like C++
      // VertexCornersIterator: swing LEFT until a boundary or full loop, then
      // (only if an open boundary was hit) swing RIGHT to cover the other side.
      // Swinging right only would drop every triangle left of the start corner
      // for boundary vertices, corrupting the normal on meshes with open edges.
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

    // Clamp to int32 with int64 INTEGER division like C++: quotient floored,
    // each component truncated toward zero. Naive float division diverges for
    // UPPER_BOUND < absSum < 2*UPPER_BOUND, where C++ quotient is 1 (no change).
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
