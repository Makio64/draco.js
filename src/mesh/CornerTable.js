// mesh/CornerTable.js - ported from mesh/corner_table.h/cc

import { ValenceCache } from './ValenceCache.js';
import { VertexRingIterator, VertexCornersIterator } from './CornerTableIterators.js';

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
    this.valence_cache_ = new ValenceCache(this);

  }

  static create(faces) {

    const ct = new CornerTable();
    if (!ct.init(faces)) {
      return null;
    }

    return ct;

  }

  // Initializes the CornerTable from an array of faces.
  // Each face is an array of 3 vertex indices.
  init(faces) {

    this.valence_cache_.clearValenceCache();
    this.valence_cache_.clearValenceCacheInaccurate();
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

  // Resets the corner table to the given number of invalid faces.
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
    this.valence_cache_.clearValenceCache();
    this.valence_cache_.clearValenceCacheInaccurate();
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

    // Equivalent to: localIndex = (corner % 3); return localIndex === 2 ? corner - 2 : corner + 1
    // Branchless mod-3 avoidance using the fact that corners are grouped in triples.
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

  // Returns the left-most corner of a single vertex 1-ring.
  leftMostCorner(v) {

    return this.vertex_corners_[v];

  }

  // Returns the parent vertex index of a given corner table vertex.
  vertexParent(vertex) {

    if (vertex < this.num_original_vertices_) {
      return vertex;
    }

    return this.non_manifold_vertex_parents_[vertex - this.num_original_vertices_];

  }

  isValid(c) {

    return this.vertex(c) !== kInvalidVertexIndex;

  }

  // Returns the valence (degree) of a vertex. Returns -1 if invalid.
  valence(v) {

    if (v === kInvalidVertexIndex) {
      return -1;
    }

    return this.confidentValence(v);

  }

  confidentValence(v) {

    const vi = new VertexRingIterator(this, v);
    let valence = 0;
    while (!vi.end()) {

      ++valence;
      vi.next();

    }

    return valence;

  }

  // Returns the valence of the vertex at the given corner.
  valenceFromCorner(c) {

    if (c === kInvalidCornerIndex) {
      return -1;
    }

    return this.confidentValence(this.confidentVertex(c));

  }

  isOnBoundary(vert) {

    const corner = this.leftMostCorner(vert);
    if (this.swingLeft(corner) === kInvalidCornerIndex) {
      return true;
    }

    return false;

  }

  // Returns the corner on the right adjacent face that maps to the same vertex.
  swingRight(corner) {

    if (corner === kInvalidCornerIndex) return kInvalidCornerIndex;
    // Inline: previous(corner)
    let rem = corner - ((corner / 3) | 0) * 3;
    let prev = rem === 0 ? corner + 2 : corner - 1;
    // Inline: opposite(prev)
    const opp = this.opposite_corners_[prev];
    if (opp === kInvalidCornerIndex) return kInvalidCornerIndex;
    // Inline: previous(opp)
    rem = opp - ((opp / 3) | 0) * 3;
    return rem === 0 ? opp + 2 : opp - 1;

  }

  // Returns the corner on the left face that maps to the same vertex.
  swingLeft(corner) {

    if (corner === kInvalidCornerIndex) return kInvalidCornerIndex;
    // Inline: next(corner)
    let rem = corner - ((corner / 3) | 0) * 3;
    let nxt = rem === 2 ? corner - 2 : corner + 1;
    // Inline: opposite(nxt)
    const opp = this.opposite_corners_[nxt];
    if (opp === kInvalidCornerIndex) return kInvalidCornerIndex;
    // Inline: next(opp)
    rem = opp - ((opp / 3) | 0) * 3;
    return rem === 2 ? opp - 2 : opp + 1;

  }

  getLeftCorner(cornerId) {

    if (cornerId === kInvalidCornerIndex) {
      return kInvalidCornerIndex;
    }

    return this.opposite(this.previous(cornerId));

  }

  getRightCorner(cornerId) {

    if (cornerId === kInvalidCornerIndex) {
      return kInvalidCornerIndex;
    }

    return this.opposite(this.next(cornerId));

  }

  numNewVertices() {

    return this.numVertices() - this.num_original_vertices_;

  }

  numOriginalVertices() {

    return this.num_original_vertices_;

  }

  numDegeneratedFaces() {

    return this.num_degenerated_faces_;

  }

  numIsolatedVertices() {

    return this.num_isolated_vertices_;

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

  // Sets the opposite corner mapping between two corners.
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

  mapCornerToVertex(cornerId, vertId) {

    this.corner_to_vertex_map_[cornerId] = vertId;

  }

  addNewVertex() {

    this.vertex_corners_.push(kInvalidCornerIndex);
    return this.vertex_corners_.length - 1;

  }

  addNewFace(vertices) {

    const newFaceIndex = this.numFaces();
    for (let i = 0; i < 3; ++i) {

      this.corner_to_vertex_map_.push(vertices[i]);
      this.setLeftMostCorner(vertices[i], this.corner_to_vertex_map_.length - 1);

    }

    while (this.opposite_corners_.length < this.corner_to_vertex_map_.length) {
      this.opposite_corners_.push(kInvalidCornerIndex);
    }

    return newFaceIndex;

  }

  setLeftMostCorner(vert, corner) {

    if (vert !== kInvalidVertexIndex) {
      this.vertex_corners_[vert] = corner;
    }

  }

  setNumVertices(numVertices) {

    while (this.vertex_corners_.length < numVertices) {
      this.vertex_corners_.push(kInvalidCornerIndex);
    }

    this.vertex_corners_.length = numVertices;

  }

  makeVertexIsolated(vert) {

    this.vertex_corners_[vert] = kInvalidCornerIndex;

  }

  makeFaceInvalid(faceIndex) {

    if (faceIndex !== kInvalidFaceIndex) {

      const firstCorner = this.firstCorner(faceIndex);
      for (let i = 0; i < 3; ++i) {

        this.corner_to_vertex_map_[firstCorner + i] = kInvalidVertexIndex;

      }

    }

  }

  updateFaceToVertexMap(vertex) {

    const it = VertexCornersIterator.fromVertex(this, vertex);
    while (!it.end()) {

      this.corner_to_vertex_map_[it.corner()] = vertex;
      it.next();

    }

  }

  getValenceCache() {

    return this.valence_cache_;

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

    // Storage for half-edges on each vertex.
    const vertexEdges = new Array(nc);
    for (let i = 0; i < nc; ++i) {
      vertexEdges[i] = { sinkVert: kInvalidVertexIndex, edgeCorner: kInvalidCornerIndex };
    }

    // Compute offsets for each vertex.
    const vertexOffset = new Array(numCornersOnVertices.length);
    let offset = 0;
    for (let i = 0; i < numCornersOnVertices.length; ++i) {

      vertexOffset[i] = offset;
      offset += numCornersOnVertices[i];

    }

    // Process all half-edges.
    for (let c = 0; c < nc; ++c) {

      const tipV = this.vertex(c);
      const sourceV = this.vertex(this.next(c));
      const sinkV = this.vertex(this.previous(c));

      const faceIndex = this.face(c);
      if (c === this.firstCorner(faceIndex)) {

        // Check for degenerated face.
        const v0 = this.vertex(c);
        if (v0 === sourceV || v0 === sinkV || sourceV === sinkV) {

          ++this.num_degenerated_faces_;
          c += 2; // Skip remaining corners of this face.
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

          // Remove the half-edge from sink vertex by shifting.
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

        // Swing left to find the left-most corner.
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

        // Swing right from the first corner and check uniqueness.
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

          // Insert new sink vertex info.
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

        // Swing left to mark all corners.
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

          // Open boundary: swing right from the initial corner.
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

    // Count isolated vertices.
    this.num_isolated_vertices_ = 0;
    for (let i = 0; i < visitedVertices.length; ++i) {

      if (!visitedVertices[i]) {
        ++this.num_isolated_vertices_;
      }

    }

    return true;

  }

  // Helper to grow a Uint8Array while preserving existing data.
  _growUint8Array(arr, newSize) {

    if (newSize <= arr.length) return arr;
    const newArr = new Uint8Array(newSize);
    newArr.set(arr);
    return newArr;

  }

}

export { CornerTable, kInvalidCornerIndex, kInvalidVertexIndex, kInvalidFaceIndex };
