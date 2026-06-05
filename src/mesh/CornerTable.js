// mesh/CornerTable.js - ported from mesh/corner_table.h/cc

const kInvalidCornerIndex = -1;
const kInvalidVertexIndex = -1;
const kInvalidFaceIndex = -1;

class CornerTable {

  constructor() {

    this.corner_to_vertex_map_ = [];
    this.opposite_corners_ = [];
    this.vertex_corners_ = [];
    this.num_original_vertices_ = 0;
    this.num_degenerated_faces_ = 0;
    this.num_isolated_vertices_ = 0;
    this.non_manifold_vertex_parents_ = [];

  }

  static create(faces) {

    const ct = new CornerTable();
    if (!ct.init(faces)) {
      return null;
    }

    return ct;

  }

  // faces: array of [v0, v1, v2] vertex-index triples.
  init(faces) {

    this.corner_to_vertex_map_ = new Array(faces.length * 3);

    for (let fi = 0; fi < faces.length; ++fi) {

      for (let i = 0; i < 3; ++i) {

        this.corner_to_vertex_map_[fi * 3 + i] = faces[fi][i];

      }

    }

    const numVerticesOut = { value: -1 };
    if (!this._computeOppositeCorners(numVerticesOut)) {
      return false;
    }

    if (!this._breakNonManifoldEdges()) {
      return false;
    }

    if (!this._computeVertexCorners(numVerticesOut.value)) {
      return false;
    }

    return true;

  }

  reset(numFaces, numVertices) {

    if (numVertices === undefined) {
      numVertices = numFaces * 3;
    }

    if (numFaces < 0 || numVertices < 0) {
      return false;
    }

    const numCorners = numFaces * 3;
    this.corner_to_vertex_map_ = new Array(numCorners).fill(kInvalidVertexIndex);
    this.opposite_corners_ = new Array(numCorners).fill(kInvalidCornerIndex);
    this.vertex_corners_ = [];
    this.vertex_corners_.length = numVertices;
    return true;

  }

  numVertices() {

    return this.vertex_corners_.length;

  }

  numCorners() {

    return this.corner_to_vertex_map_.length;

  }

  numFaces() {

    return (this.corner_to_vertex_map_.length / 3) | 0;

  }

  opposite(corner) {

    if (corner === kInvalidCornerIndex) {
      return kInvalidCornerIndex;
    }

    return this.opposite_corners_[corner];

  }

  next(corner) {

    if (corner === kInvalidCornerIndex) {
      return kInvalidCornerIndex;
    }

    // rem = corner % 3 via int-divide; corners are grouped in triples.
    const rem = corner - (corner / 3 | 0) * 3;
    return rem === 2 ? corner - 2 : corner + 1;

  }

  previous(corner) {

    if (corner === kInvalidCornerIndex) {
      return kInvalidCornerIndex;
    }

    const rem = corner - (corner / 3 | 0) * 3;
    return rem === 0 ? corner + 2 : corner - 1;

  }

  vertex(corner) {

    if (corner === kInvalidCornerIndex) {
      return kInvalidVertexIndex;
    }

    return this.confidentVertex(corner);

  }

  confidentVertex(corner) {

    return this.corner_to_vertex_map_[corner];

  }

  face(corner) {

    if (corner === kInvalidCornerIndex) {
      return kInvalidFaceIndex;
    }

    return (corner / 3) | 0;

  }

  firstCorner(faceIndex) {

    if (faceIndex === kInvalidFaceIndex) {
      return kInvalidCornerIndex;
    }

    return faceIndex * 3;

  }

  allCorners(faceIndex) {

    const ci = faceIndex * 3;
    return [ci, ci + 1, ci + 2];

  }

  localIndex(corner) {

    return corner - ((corner / 3) | 0) * 3;

  }

  leftMostCorner(v) {

    return this.vertex_corners_[v];

  }

  isValid(c) {

    return this.vertex(c) !== kInvalidVertexIndex;

  }

  // Inlines previous(opposite(previous(corner))) to avoid per-corner dispatch.
  swingRight(corner) {

    if (corner === kInvalidCornerIndex) return kInvalidCornerIndex;
    let rem = corner - ((corner / 3) | 0) * 3;
    let prev = rem === 0 ? corner + 2 : corner - 1;
    const opp = this.opposite_corners_[prev];
    if (opp === kInvalidCornerIndex) return kInvalidCornerIndex;
    rem = opp - ((opp / 3) | 0) * 3;
    return rem === 0 ? opp + 2 : opp - 1;

  }

  // Inlines next(opposite(next(corner))) to avoid per-corner dispatch.
  swingLeft(corner) {

    if (corner === kInvalidCornerIndex) return kInvalidCornerIndex;
    let rem = corner - ((corner / 3) | 0) * 3;
    let nxt = rem === 2 ? corner - 2 : corner + 1;
    const opp = this.opposite_corners_[nxt];
    if (opp === kInvalidCornerIndex) return kInvalidCornerIndex;
    rem = opp - ((opp / 3) | 0) * 3;
    return rem === 2 ? opp - 2 : opp + 1;

  }

  numOriginalVertices() {

    return this.num_original_vertices_;

  }

  isDegenerated(faceIndex) {

    if (faceIndex === kInvalidFaceIndex) {
      return true;
    }

    const firstCorner = this.firstCorner(faceIndex);
    const v0 = this.vertex(firstCorner);
    const v1 = this.vertex(this.next(firstCorner));
    const v2 = this.vertex(this.previous(firstCorner));
    return v0 === v1 || v0 === v2 || v1 === v2;

  }

  setOppositeCorner(cornerId, oppCornerId) {

    this.opposite_corners_[cornerId] = oppCornerId;

  }

  setOppositeCorners(corner0, corner1) {

    if (corner0 !== kInvalidCornerIndex) {
      this.setOppositeCorner(corner0, corner1);
    }

    if (corner1 !== kInvalidCornerIndex) {
      this.setOppositeCorner(corner1, corner0);
    }

  }

  addNewVertex() {

    this.vertex_corners_.push(kInvalidCornerIndex);
    return this.vertex_corners_.length - 1;

  }

  // ---- Private methods ----

  _computeOppositeCorners(numVerticesOut) {

    const nc = this.numCorners();
    this.opposite_corners_ = new Array(nc).fill(kInvalidCornerIndex);

    // Count outgoing half-edges per vertex.
    const numCornersOnVertices = [];
    for (let c = 0; c < nc; ++c) {

      const v1 = this.vertex(c);
      if (v1 >= numCornersOnVertices.length) {

        while (numCornersOnVertices.length <= v1) {
          numCornersOnVertices.push(0);
        }

      }

      numCornersOnVertices[v1]++;

    }

    const vertexEdges = new Array(nc);
    for (let i = 0; i < nc; ++i) {
      vertexEdges[i] = { sinkVert: kInvalidVertexIndex, edgeCorner: kInvalidCornerIndex };
    }

    const vertexOffset = new Array(numCornersOnVertices.length);
    let offset = 0;
    for (let i = 0; i < numCornersOnVertices.length; ++i) {

      vertexOffset[i] = offset;
      offset += numCornersOnVertices[i];

    }

    for (let c = 0; c < nc; ++c) {

      const tipV = this.vertex(c);
      const sourceV = this.vertex(this.next(c));
      const sinkV = this.vertex(this.previous(c));

      const faceIndex = this.face(c);
      if (c === this.firstCorner(faceIndex)) {

        const v0 = this.vertex(c);
        if (v0 === sourceV || v0 === sinkV || sourceV === sinkV) {

          ++this.num_degenerated_faces_;
          c += 2; // skip the other two corners of this degenerate face
          continue;

        }

      }

      let oppositeC = kInvalidCornerIndex;
      const numCornersOnVert = numCornersOnVertices[sinkV];
      offset = vertexOffset[sinkV];

      for (let i = 0; i < numCornersOnVert; ++i, ++offset) {

        const otherV = vertexEdges[offset].sinkVert;
        if (otherV === kInvalidVertexIndex) {
          break; // No matching half-edge found.
        }

        if (otherV === sourceV) {

          if (tipV === this.vertex(vertexEdges[offset].edgeCorner)) {
            continue; // Don't connect mirrored faces.
          }

          oppositeC = vertexEdges[offset].edgeCorner;

          // Remove the matched half-edge by shifting the rest down.
          for (let j = i + 1; j < numCornersOnVert; ++j, ++offset) {

            vertexEdges[offset] = vertexEdges[offset + 1];
            if (vertexEdges[offset].sinkVert === kInvalidVertexIndex) {
              break;
            }

          }

          vertexEdges[offset].sinkVert = kInvalidVertexIndex;
          break;

        }

      }

      if (oppositeC === kInvalidCornerIndex) {

        // No opposite found, insert the new edge.
        const numCornersOnSourceVert = numCornersOnVertices[sourceV];
        offset = vertexOffset[sourceV];

        for (let i = 0; i < numCornersOnSourceVert; ++i, ++offset) {

          if (vertexEdges[offset].sinkVert === kInvalidVertexIndex) {

            vertexEdges[offset].sinkVert = sinkV;
            vertexEdges[offset].edgeCorner = c;
            break;

          }

        }

      } else {

        this.opposite_corners_[c] = oppositeC;
        this.opposite_corners_[oppositeC] = c;

      }

    }

    numVerticesOut.value = numCornersOnVertices.length;
    return true;

  }

  _breakNonManifoldEdges() {

    const nc = this.numCorners();
    const visitedCorners = new Uint8Array(nc);
    const sinkVertices = [];
    let meshConnectivityUpdated = false;

    do {

      meshConnectivityUpdated = false;

      for (let c = 0; c < nc; ++c) {

        if (visitedCorners[c]) {
          continue;
        }

        sinkVertices.length = 0;

        let firstC = c;
        let currentC = c;
        let nextC;

        while (true) {

          nextC = this.swingLeft(currentC);
          if (nextC === firstC || nextC === kInvalidCornerIndex || visitedCorners[nextC]) {
            break;
          }

          currentC = nextC;

        }

        firstC = currentC;

        let breakOuter = false;
        do {

          visitedCorners[currentC] = 1;

          const sinkC = this.next(currentC);
          const sinkV = this.corner_to_vertex_map_[sinkC];
          const edgeCorner = this.previous(currentC);
          let vertexConnectivityUpdated = false;

          for (let k = 0; k < sinkVertices.length; ++k) {

            if (sinkVertices[k][0] === sinkV) {

              const otherEdgeCorner = sinkVertices[k][1];
              const oppEdgeCorner = this.opposite(edgeCorner);

              if (oppEdgeCorner === otherEdgeCorner) {
                continue;
              }

              // Break non-manifold edge connectivity.
              const oppOtherEdgeCorner = this.opposite(otherEdgeCorner);
              if (oppEdgeCorner !== kInvalidCornerIndex) {
                this.setOppositeCorner(oppEdgeCorner, kInvalidCornerIndex);
              }

              if (oppOtherEdgeCorner !== kInvalidCornerIndex) {
                this.setOppositeCorner(oppOtherEdgeCorner, kInvalidCornerIndex);
              }

              this.setOppositeCorner(edgeCorner, kInvalidCornerIndex);
              this.setOppositeCorner(otherEdgeCorner, kInvalidCornerIndex);

              vertexConnectivityUpdated = true;
              break;

            }

          }

          if (vertexConnectivityUpdated) {

            meshConnectivityUpdated = true;
            breakOuter = true;
            break;

          }

          const prevV = this.corner_to_vertex_map_[this.previous(currentC)];
          sinkVertices.push([prevV, sinkC]);

          currentC = this.swingRight(currentC);

        } while (currentC !== firstC && currentC !== kInvalidCornerIndex);

        if (breakOuter) break;

      }

    } while (meshConnectivityUpdated);

    return true;

  }

  _computeVertexCorners(numVertices) {

    this.num_original_vertices_ = numVertices;
    this.vertex_corners_ = new Array(numVertices).fill(kInvalidCornerIndex);

    let visitedVertices = new Uint8Array(numVertices);
    const visitedCorners = new Uint8Array(this.numCorners());

    for (let f = 0; f < this.numFaces(); ++f) {

      const firstFaceCorner = this.firstCorner(f);
      if (this.isDegenerated(f)) {
        continue;
      }

      for (let k = 0; k < 3; ++k) {

        const c = firstFaceCorner + k;
        if (visitedCorners[c]) {
          continue;
        }

        let v = this.corner_to_vertex_map_[c];
        let isNonManifoldVertex = false;

        if (visitedVertices[v]) {

          // Non-manifold vertex: create a new vertex.
          this.vertex_corners_.push(kInvalidCornerIndex);
          this.non_manifold_vertex_parents_.push(v);
          visitedVertices = this._growUint8Array(visitedVertices, numVertices + 1);
          v = numVertices++;
          isNonManifoldVertex = true;

        }

        visitedVertices[v] = 1;

        let actC = c;
        while (actC !== kInvalidCornerIndex) {

          visitedCorners[actC] = 1;
          this.vertex_corners_[v] = actC;
          if (isNonManifoldVertex) {
            this.corner_to_vertex_map_[actC] = v;
          }

          actC = this.swingLeft(actC);
          if (actC === c) {
            break;
          }

        }

        if (actC === kInvalidCornerIndex) {

          // Hit an open boundary; finish the ring by swinging the other way.
          actC = this.swingRight(c);
          while (actC !== kInvalidCornerIndex) {

            visitedCorners[actC] = 1;
            if (isNonManifoldVertex) {
              this.corner_to_vertex_map_[actC] = v;
            }

            actC = this.swingRight(actC);

          }

        }

      }

    }

    this.num_isolated_vertices_ = 0;
    for (let i = 0; i < visitedVertices.length; ++i) {

      if (!visitedVertices[i]) {
        ++this.num_isolated_vertices_;
      }

    }

    return true;

  }

  _growUint8Array(arr, newSize) {

    if (newSize <= arr.length) return arr;
    const newArr = new Uint8Array(newSize);
    newArr.set(arr);
    return newArr;

  }

}

export { CornerTable, kInvalidCornerIndex, kInvalidVertexIndex, kInvalidFaceIndex };
