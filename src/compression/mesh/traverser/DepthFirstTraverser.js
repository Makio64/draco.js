// compression/mesh/traverser/DepthFirstTraverser.js
// Ported from compression/mesh/traverser/depth_first_traverser.h

const kInvalidCornerIndex = -1;
const kInvalidFaceIndex = -1;
const kInvalidVertexIndex = -1;

// Basic traverser that traverses a mesh in a DFS like fashion using the
// CornerTable data structure.
class DepthFirstTraverser {

  constructor() {
    this._cornerTable = null;
    this._observer = null;
    this._isFaceVisited = null;
    this._isVertexVisited = null;
    this._cornerTraversalStack = [];
  }

  init(cornerTable, observer) {
    this._cornerTable = cornerTable;
    this._observer = observer;
    // Uint8Array (0/1) instead of Array(bool): these flags are read and written
    // on every corner of the hottest decode loop (traverseFromCorner).
    this._isFaceVisited = new Uint8Array(cornerTable.numFaces());
    this._isVertexVisited = new Uint8Array(cornerTable.numVertices());
    // Extract the corner table's connectivity as flat arrays once, so the
    // traversal reads them directly (via the monomorphic _* helpers below)
    // instead of dispatching through the corner table on every corner. The
    // corner table is one of two classes, so direct ct.vertex()/opposite()
    // calls in the hot loop are polymorphic and not inlined by the JIT.
    this._cornerToVertex = cornerTable.cornerToVertexArray();
    this._oppositeCorners = cornerTable.oppositeCornerArray();
    this._vertexLeftmost = cornerTable.vertexLeftmostCornerArray();
    this._numCorners = cornerTable.numCorners();
  }

  cornerTable() {
    return this._cornerTable;
  }

  // Connectivity accessors operating on the extracted flat arrays. They mirror
  // the corner table's methods exactly but are monomorphic (the receiver is
  // always this traverser and the arrays are always typed), so the JIT inlines
  // them. next/previous are only ever called with a valid (>= 0) corner here.
  _next(c) {
    const r = c - ((c / 3) | 0) * 3;
    return r === 2 ? c - 2 : c + 1;
  }
  _previous(c) {
    const r = c - ((c / 3) | 0) * 3;
    return r === 0 ? c + 2 : c - 1;
  }
  _vertex(c) {
    return (c < 0 || c >= this._numCorners) ? -1 : this._cornerToVertex[c];
  }
  _getRightCorner(c) {
    return c < 0 ? -1 : this._oppositeCorners[this._next(c)];
  }
  _getLeftCorner(c) {
    return c < 0 ? -1 : this._oppositeCorners[this._previous(c)];
  }
  _isOnBoundary(v) {
    const lc = this._vertexLeftmost[v];
    if (lc === undefined || lc < 0) return true;
    // swingLeft(lc) is invalid iff the opposite across next(lc) is invalid.
    return this._oppositeCorners[this._next(lc)] < 0;
  }

  onTraversalStart() {}
  onTraversalEnd() {}

  traverseFromCorner(cornerId) {
    if (this._isFaceVisited[(cornerId / 3) | 0]) {
      return true; // Already traversed.
    }

    this._cornerTraversalStack.length = 0;
    this._cornerTraversalStack.push(cornerId);

    // For the first face, check the remaining corners as they may not be
    // processed yet.
    const nextCorner = this._next(cornerId);
    const prevCorner = this._previous(cornerId);
    const nextVert = this._vertex(nextCorner);
    const prevVert = this._vertex(prevCorner);
    if (nextVert === kInvalidVertexIndex || prevVert === kInvalidVertexIndex) {
      return false;
    }
    if (!this._isVertexVisited[nextVert]) {
      this._isVertexVisited[nextVert] = true;
      this._observer.onNewVertexVisited(nextVert, nextCorner);
    }
    if (!this._isVertexVisited[prevVert]) {
      this._isVertexVisited[prevVert] = true;
      this._observer.onNewVertexVisited(prevVert, prevCorner);
    }

    // Start the actual traversal.
    while (this._cornerTraversalStack.length > 0) {
      cornerId = this._cornerTraversalStack[this._cornerTraversalStack.length - 1];
      let faceId = (cornerId / 3) | 0;

      // Make sure the face hasn't been visited yet.
      if (cornerId === kInvalidCornerIndex || this._isFaceVisited[faceId]) {
        this._cornerTraversalStack.pop();
        continue;
      }

      while (true) {
        this._isFaceVisited[faceId] = true;
        this._observer.onNewFaceVisited(faceId);

        const vertId = this._vertex(cornerId);
        if (vertId === kInvalidVertexIndex) {
          return false;
        }
        if (!this._isVertexVisited[vertId]) {
          const onBoundary = this._isOnBoundary(vertId);
          this._isVertexVisited[vertId] = true;
          this._observer.onNewVertexVisited(vertId, cornerId);
          if (!onBoundary) {
            cornerId = this._getRightCorner(cornerId);
            faceId = (cornerId / 3) | 0;
            continue;
          }
        }

        // The current vertex has been already visited or it was on a boundary.
        const rightCornerId = this._getRightCorner(cornerId);
        const leftCornerId = this._getLeftCorner(cornerId);
        const rightFaceId = rightCornerId === kInvalidCornerIndex
          ? kInvalidFaceIndex : (rightCornerId / 3) | 0;
        const leftFaceId = leftCornerId === kInvalidCornerIndex
          ? kInvalidFaceIndex : (leftCornerId / 3) | 0;

        const isRightVisited = rightFaceId === kInvalidFaceIndex ||
          this._isFaceVisited[rightFaceId];
        const isLeftVisited = leftFaceId === kInvalidFaceIndex ||
          this._isFaceVisited[leftFaceId];

        if (isRightVisited) {
          if (isLeftVisited) {
            // Both neighboring faces are visited. End reached.
            this._cornerTraversalStack.pop();
            break;
          } else {
            // Go to the left face.
            cornerId = leftCornerId;
            faceId = leftFaceId;
          }
        } else {
          if (isLeftVisited) {
            // Left face visited, go to the right one.
            cornerId = rightCornerId;
            faceId = rightFaceId;
          } else {
            // Both neighboring faces are unvisited, split the traversal.
            this._cornerTraversalStack[this._cornerTraversalStack.length - 1] = leftCornerId;
            this._cornerTraversalStack.push(rightCornerId);
            break;
          }
        }
      }
    }
    return true;
  }

}

export { DepthFirstTraverser };
