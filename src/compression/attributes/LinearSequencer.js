// compression/attributes/LinearSequencer.js - ported from compression/attributes/linear_sequencer.h

// A simple sequencer that generates a linear sequence [0, numPoints - 1]; i.e.
// the order of the points is preserved for the input data. Used by the mesh
// sequential decoder, where attribute values are stored directly in point order.
// Implements the same interface the SequentialAttributeDecodersController drives
// (generateSequence / getOutputPointIds / updatePointToAttributeIndexMapping).
class LinearSequencer {

  constructor(numPoints) {
    this._numPoints = numPoints;
    this._outPointIds = new Int32Array(0);
  }

  // Fills the output sequence with [0, numPoints - 1]. (PointsSequencer::
  // GenerateSequence -> LinearSequencer::GenerateSequenceInternal.)
  generateSequence(/* outPointIds */) {
    if (this._numPoints < 0) {
      return false;
    }
    const ids = new Int32Array(this._numPoints);
    for (let i = 0; i < this._numPoints; ++i) {
      ids[i] = i;
    }
    this._outPointIds = ids;
    return true;
  }

  getOutputPointIds() {
    return this._outPointIds;
  }

  // For the linear sequence the value index equals the point index.
  updatePointToAttributeIndexMapping(attribute) {
    attribute.setIdentityMapping();
    return true;
  }

}

export { LinearSequencer };
