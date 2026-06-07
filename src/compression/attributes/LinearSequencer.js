// compression/attributes/LinearSequencer.js - ported from compression/attributes/linear_sequencer.h

// Sequencer that preserves point order: generates the sequence [0, numPoints-1].
// Used by the mesh sequential decoder. Implements the interface driven by
// SequentialAttributeDecodersController.
class LinearSequencer {

  constructor(numPoints) {
    this._numPoints = numPoints;
    this._outPointIds = new Int32Array(0);
  }

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

  updatePointToAttributeIndexMapping(attribute) {
    attribute.setIdentityMapping();
    return true;
  }

}

export { LinearSequencer };
