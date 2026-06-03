// mesh/CornerTableIterators.js - ported from mesh/corner_table_iterators.h

const kInvalidCornerIndex = -1;
const kInvalidVertexIndex = -1;

// Iterates over vertices in the 1-ring around a specified vertex.
class VertexRingIterator {

  constructor(table, vertId) {

    if (table === undefined) {

      this.corner_table_ = null;
      this.start_corner_ = kInvalidCornerIndex;
      this.corner_ = kInvalidCornerIndex;
      this.left_traversal_ = true;

    } else {

      this.corner_table_ = table;
      this.start_corner_ = table.leftMostCorner(vertId);
      this.corner_ = this.start_corner_;
      this.left_traversal_ = true;

    }

  }

  // Gets the last visited ring vertex.
  vertex() {

    const ringCorner = this.left_traversal_
      ? this.corner_table_.previous(this.corner_)
      : this.corner_table_.next(this.corner_);
    return this.corner_table_.vertex(ringCorner);

  }

  // Returns a corner opposite to the edge connecting the current ring vertex
  // with the central vertex.
  edgeCorner() {

    return this.left_traversal_
      ? this.corner_table_.next(this.corner_)
      : this.corner_table_.previous(this.corner_);

  }

  // Returns true when all ring vertices have been visited.
  end() {

    return this.corner_ === kInvalidCornerIndex;

  }

  // Proceeds to the next ring vertex.
  next() {

    if (this.left_traversal_) {

      this.corner_ = this.corner_table_.swingLeft(this.corner_);
      if (this.corner_ === kInvalidCornerIndex) {

        // Open boundary reached.
        this.corner_ = this.start_corner_;
        this.left_traversal_ = false;

      } else if (this.corner_ === this.start_corner_) {

        // End reached (full circle).
        this.corner_ = kInvalidCornerIndex;

      }

    } else {

      // Go to the right until we reach a boundary.
      this.corner_ = this.corner_table_.swingRight(this.corner_);

    }

  }

}

// Iterates over all corners attached to a specified vertex.
class VertexCornersIterator {

  constructor(table, vertOrCorner) {

    if (table === undefined) {

      this.corner_table_ = null;
      this.start_corner_ = kInvalidCornerIndex;
      this.corner_ = kInvalidCornerIndex;
      this.left_traversal_ = true;

    } else {

      this.corner_table_ = table;

      // This overload takes a corner index directly (the C++ has a separate
      // VertexIndex constructor that resolves to LeftMostCorner; that form is
      // handled by the earlier branch).
      this.start_corner_ = vertOrCorner;
      this.corner_ = this.start_corner_;
      this.left_traversal_ = true;

    }

  }

  // Factory method: create iterator from a vertex id.
  static fromVertex(table, vertId) {

    const it = new VertexCornersIterator();
    it.corner_table_ = table;
    it.start_corner_ = table.leftMostCorner(vertId);
    it.corner_ = it.start_corner_;
    it.left_traversal_ = true;
    return it;

  }

  // Factory method: create iterator from a corner id.
  static fromCorner(table, cornerId) {

    const it = new VertexCornersIterator();
    it.corner_table_ = table;
    it.start_corner_ = cornerId;
    it.corner_ = cornerId;
    it.left_traversal_ = true;
    return it;

  }

  corner() {

    return this.corner_;

  }

  end() {

    return this.corner_ === kInvalidCornerIndex;

  }

  next() {

    if (this.left_traversal_) {

      this.corner_ = this.corner_table_.swingLeft(this.corner_);
      if (this.corner_ === kInvalidCornerIndex) {

        // Open boundary reached.
        this.corner_ = this.corner_table_.swingRight(this.start_corner_);
        this.left_traversal_ = false;

      } else if (this.corner_ === this.start_corner_) {

        // End reached (full circle).
        this.corner_ = kInvalidCornerIndex;

      }

    } else {

      // Go to the right until boundary.
      this.corner_ = this.corner_table_.swingRight(this.corner_);

    }

  }

}

export { VertexRingIterator, VertexCornersIterator };
