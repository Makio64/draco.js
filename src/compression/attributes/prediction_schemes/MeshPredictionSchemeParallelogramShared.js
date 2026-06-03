// src/compression/attributes/prediction_schemes/MeshPredictionSchemeParallelogramShared.js
// Ported from draco/compression/attributes/prediction_schemes/mesh_prediction_scheme_parallelogram_shared.h

/**
 * Computes parallelogram prediction for a given corner and data entry id.
 * The prediction is: P = next + prev - opp.
 *
 * Operates directly on the corner table's flat Int32Array connectivity
 * (oppositeCornerArray / cornerToVertexArray) rather than calling the table's
 * accessor methods. The table can be either the base CornerTable or a
 * MeshAttributeCornerTable, so method calls here would be polymorphic and not
 * inlined; the flat arrays are always Int32Arrays and keep this hot path
 * monomorphic. next()/previous() are inlined as corner-triple arithmetic.
 *
 * @param {number} dataEntryId - the current entry being decoded
 * @param {number} ci - corner index
 * @param {Int32Array} oppositeCorners - seam-aware opposite corner per corner
 * @param {Int32Array} cornerToVertex - vertex (data) index per corner
 * @param {Int32Array|Array} vertexToDataMap
 * @param {Int32Array|TypedArray} inData - already decoded data
 * @param {number} numComponents - components per entry
 * @param {Int32Array} outPrediction - buffer to store predicted values
 * @returns {boolean} true if prediction was computed, false otherwise
 */
function computeParallelogramPrediction(dataEntryId, ci, oppositeCorners,
  cornerToVertex, vertexToDataMap, inData, numComponents, outPrediction) {
  const oci = oppositeCorners[ci];
  if (oci < 0) {
    return false;
  }

  // Inlined next(oci)/previous(oci) (corners are grouped in triples).
  const rem = oci - ((oci / 3) | 0) * 3;
  const nextOci = rem === 2 ? oci - 2 : oci + 1;
  const prevOci = rem === 0 ? oci + 2 : oci - 1;

  const vertOpp = vertexToDataMap[cornerToVertex[oci]];
  const vertNext = vertexToDataMap[cornerToVertex[nextOci]];
  const vertPrev = vertexToDataMap[cornerToVertex[prevOci]];

  if (vertOpp < dataEntryId && vertNext < dataEntryId && vertPrev < dataEntryId) {
    const vOppOff = vertOpp * numComponents;
    const vNextOff = vertNext * numComponents;
    const vPrevOff = vertPrev * numComponents;
    for (let c = 0; c < numComponents; ++c) {
      outPrediction[c] =
        (inData[vNextOff + c] + inData[vPrevOff + c]) - inData[vOppOff + c];
    }
    return true;
  }
  return false;
}

export { computeParallelogramPrediction };
