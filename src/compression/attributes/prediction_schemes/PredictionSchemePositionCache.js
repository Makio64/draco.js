// src/compression/attributes/prediction_schemes/PredictionSchemePositionCache.js
//
// Shared helper for the mesh predictors that need integer positions in their
// hot loop. Precomputes the integer position of every data entry once into a
// flat Int32Array (3 components per entry), so the per-corner prediction loops
// can do plain array reads instead of per-fetch attribute dispatch.

import { DataType } from '../../../core/DracoTypes.js';

// Returns an Int32Array of length numEntries*3. att is the position
// PointAttribute, map is the entry->point-id map, tempPos is a reusable
// 3-element scratch buffer for the non-INT32 fallback path.
function buildInt32PositionCache(att, map, numEntries, tempPos) {
  const cache = new Int32Array(numEntries * 3);
  const bufData = att.buffer && att.buffer.data;

  if (att.dataType === DataType.INT32 && att.numComponents === 3 && bufData) {
    const src = new Int32Array(bufData.buffer);
    const srcStart = (bufData.byteOffset + att.byteOffset) >> 2;
    const stride = att.byteStride >> 2;
    const isIdentity = att.isMappingIdentity;
    const indicesMap = att.indicesMap;
    if (isIdentity) {
      for (let d = 0; d < numEntries; ++d) {
        const srcOffset = srcStart + map[d] * stride;
        const o = d * 3;
        cache[o] = src[srcOffset];
        cache[o + 1] = src[srcOffset + 1];
        cache[o + 2] = src[srcOffset + 2];
      }
    } else {
      for (let d = 0; d < numEntries; ++d) {
        const srcOffset = srcStart + indicesMap[map[d]] * stride;
        const o = d * 3;
        cache[o] = src[srcOffset];
        cache[o + 1] = src[srcOffset + 1];
        cache[o + 2] = src[srcOffset + 2];
      }
    }
  } else {
    for (let d = 0; d < numEntries; ++d) {
      att.convertValue(att.mappedIndex(map[d]), tempPos);
      const o = d * 3;
      cache[o] = tempPos[0];
      cache[o + 1] = tempPos[1];
      cache[o + 2] = tempPos[2];
    }
  }
  return cache;
}

export { buildInt32PositionCache };
