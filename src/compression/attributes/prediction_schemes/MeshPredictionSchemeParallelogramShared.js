// compression/attributes/prediction_schemes/MeshPredictionSchemeParallelogramShared.js - ported from compression/attributes/prediction_schemes/mesh_prediction_scheme_parallelogram_shared.h

/**
 * Computes parallelogram prediction P = next + prev - opp for a corner/entry.
 *
 * Operates on the flat Int32Array connectivity (oppositeCornerArray /
 * cornerToVertexArray) rather than the table accessors: the table may be a
 * CornerTable or MeshAttributeCornerTable, so method calls would be polymorphic
 * and not inlined; the flat arrays keep this hot path monomorphic.
 * next()/previous() are inlined as corner-triple arithmetic.
 *
 * @returns {boolean} true if a prediction was computed
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
