// mesh/MeshAttributeCornerTable.js - ported from mesh/mesh_attribute_corner_table.h/cc

import { ValenceCache } from './ValenceCache.js';
import { VertexRingIterator } from './CornerTableIterators.js';

const kInvalidCornerIndex = -1;
const kInvalidVertexIndex = -1;

class MeshAttributeCornerTable {

  constructor() {

    this.is_edge_on_seam_ = [];
    this.is_vertex_on_seam_ = [];
    this.no_interior_seams_ = true;
    this.corner_to_vertex_map_ = [];
    this.vertex_to_left_most_corner_map_ = [];
    this.vertex_to_attribute_entry_id_map_ = [];
    this.corner_table_ = null;
    this.valence_cache_ = new ValenceCache(this);

  }

  initEmpty(table) {

    if (table === null) {
      return false;
    }

    this.valence_cache_.clearValenceCache();
    this.valence_cache_.clearValenceCacheInaccurate();

    // Typed arrays keep the hot accessors (isEdgeOnSeam/vertex/opposite, called
    // per corner during attribute connectivity recompute) monomorphic. Uint8Array
    // defaults to 0 (== false); corner_to_vertex_map_ uses signed -1 sentinel.
    this.is_edge_on_seam_ = new Uint8Array(table.numCorners());
    this.is_vertex_on_seam_ = new Uint8Array(table.numVertices());
    this.corner_to_vertex_map_ = new Int32Array(table.numCorners()).fill(kInvalidVertexIndex);
    this.vertex_to_attribute_entry_id_map_ = [];
    this.vertex_to_left_most_corner_map_ = [];
    // Lazily built seam-aware opposite array (see oppositeCornerArray).
    this._effectiveOpposite = null;
    this.corner_table_ = table;
    this.no_interior_seams_ = true;
    return true;

  }

  initFromAttribute(mesh, table, att) {

    if (!this.initEmpty(table)) {
      return false;
    }

    this.valence_cache_.clearValenceCache();
    this.valence_cache_.clearValenceCacheInaccurate();

    for (let c = 0; c < this.corner_table_.numCorners(); ++c) {

      const f = this.corner_table_.face(c);
      if (this.corner_table_.isDegenerated(f)) {
        continue;
      }

      const oppCorner = this.corner_table_.opposite(c);
      if (oppCorner === kInvalidCornerIndex) {

        // Boundary. Mark as seam edge.
        this.is_edge_on_seam_[c] = true;
        let v;
        v = this.corner_table_.vertex(this.corner_table_.next(c));
        this.is_vertex_on_seam_[v] = true;
        v = this.corner_table_.vertex(this.corner_table_.previous(c));
        this.is_vertex_on_seam_[v] = true;
        continue;

      }

      if (oppCorner < c) {
        continue; // Already processed.
      }

      let actC = c;
      let actSiblingC = oppCorner;

      for (let i = 0; i < 2; ++i) {

        actC = this.corner_table_.next(actC);
        actSiblingC = this.corner_table_.previous(actSiblingC);

        const pointId = mesh.cornerToPointId(actC);
        const siblingPointId = mesh.cornerToPointId(actSiblingC);

        if (att.mappedIndex(pointId) !== att.mappedIndex(siblingPointId)) {

          this.no_interior_seams_ = false;
          this.is_edge_on_seam_[c] = true;
          this.is_edge_on_seam_[oppCorner] = true;

          this.is_vertex_on_seam_[this.corner_table_.vertex(this.corner_table_.next(c))] = true;
          this.is_vertex_on_seam_[this.corner_table_.vertex(this.corner_table_.previous(c))] = true;
          this.is_vertex_on_seam_[this.corner_table_.vertex(this.corner_table_.next(oppCorner))] = true;
          this.is_vertex_on_seam_[this.corner_table_.vertex(this.corner_table_.previous(oppCorner))] = true;
          break;

        }

      }

    }

    this.recomputeVertices(mesh, att);
    return true;

  }

  addSeamEdge(c) {

    const cornerToVertex = this.corner_table_.cornerToVertexArray();
    const oppositeCorners = this.corner_table_.oppositeCornerArray();
    const isEdge = this.is_edge_on_seam_;
    const isVert = this.is_vertex_on_seam_;

    isEdge[c] = 1;
    // Inlined next(c)/previous(c).
    let rem = c - ((c / 3) | 0) * 3;
    isVert[cornerToVertex[rem === 2 ? c - 2 : c + 1]] = 1;
    isVert[cornerToVertex[rem === 0 ? c + 2 : c - 1]] = 1;

    const oppCorner = oppositeCorners[c];
    if (oppCorner !== kInvalidCornerIndex) {

      this.no_interior_seams_ = false;
      isEdge[oppCorner] = 1;
      rem = oppCorner - ((oppCorner / 3) | 0) * 3;
      isVert[cornerToVertex[rem === 2 ? oppCorner - 2 : oppCorner + 1]] = 1;
      isVert[cornerToVertex[rem === 0 ? oppCorner + 2 : oppCorner - 1]] = 1;

    }

  }

  recomputeVertices(mesh, att) {

    if (mesh !== null && mesh !== undefined && att !== null && att !== undefined) {
      return this._recomputeVerticesInternal(true, mesh, att);
    } else {
      return this._recomputeVerticesInternal(false, null, null);
    }

  }

  _recomputeVerticesInternal(initVertexToAttributeEntryMap, mesh, att) {

    const ct = this.corner_table_;
    const numCorners = ct.numCorners();
    const numBaseVertices = ct.numVertices();
    // Each corner maps to exactly one attribute entry, so the number of new
    // (attribute) vertices is bounded by the corner count. Preallocate the two
    // maps as Int32Arrays indexed by new-vertex id (the push order equals the
    // numNewVertices counter), avoiding per-entry Array.push() growth + GC.
    const attEntryMap = new Int32Array(numCorners);
    const leftMostMap = new Int32Array(numCorners);
    const cornerToVertex = this.corner_to_vertex_map_;
    const isVertexOnSeam = this.is_vertex_on_seam_;
    const isEdgeOnSeam = this.is_edge_on_seam_;
    // Flat connectivity arrays so the per-corner swing operations are inlined
    // typed-array arithmetic instead of polymorphic method dispatch.
    //   - seamOpp: seam-aware opposite (== this.opposite), used by swingLeft.
    //   - baseOpp: raw opposite of the underlying table, used by swingRight
    //     (matches corner_table_.swingRight, which is NOT seam-aware here).
    // Both are final: all seams were added before recomputeVertices() runs.
    const seamOpp = this.oppositeCornerArray();
    const baseOpp = ct.oppositeCornerArray();
    const vertexLeftmost = ct.vertexLeftmostCornerArray();
    let numNewVertices = 0;

    for (let v = 0; v < numBaseVertices; ++v) {

      const c = vertexLeftmost[v];
      if (c === kInvalidCornerIndex) {
        continue; // Isolated vertex.
      }

      let firstVertId = numNewVertices++;
      if (initVertexToAttributeEntryMap) {
        attEntryMap[firstVertId] = att.mappedIndex(mesh.cornerToPointId(c));
      } else {
        attEntryMap[firstVertId] = firstVertId;
      }

      let firstC = c;
      let actC;

      // If vertex is on seam, swing left to find the first attribute entry.
      // swingLeft(x) = next(seamOpp[next(x)]).
      if (isVertexOnSeam[v]) {

        let rem = firstC - ((firstC / 3) | 0) * 3;
        let nx = rem === 2 ? firstC - 2 : firstC + 1;
        let opp = seamOpp[nx];
        actC = opp < 0 ? kInvalidCornerIndex
          : ((opp - ((opp / 3) | 0) * 3) === 2 ? opp - 2 : opp + 1);
        while (actC !== kInvalidCornerIndex) {

          firstC = actC;
          rem = firstC - ((firstC / 3) | 0) * 3;
          nx = rem === 2 ? firstC - 2 : firstC + 1;
          opp = seamOpp[nx];
          actC = opp < 0 ? kInvalidCornerIndex
            : ((opp - ((opp / 3) | 0) * 3) === 2 ? opp - 2 : opp + 1);
          if (actC === c) {
            return false;
          }

        }

      }

      cornerToVertex[firstC] = firstVertId;
      leftMostMap[firstVertId] = firstC;

      // swingRight(x) = previous(baseOpp[previous(x)]).
      let prem = firstC - ((firstC / 3) | 0) * 3;
      let pv = prem === 0 ? firstC + 2 : firstC - 1;
      let bopp = baseOpp[pv];
      actC = bopp < 0 ? kInvalidCornerIndex
        : ((bopp - ((bopp / 3) | 0) * 3) === 0 ? bopp + 2 : bopp - 1);
      while (actC !== kInvalidCornerIndex && actC !== firstC) {

        // isCornerOppositeToSeamEdge(next(actC)).
        const arem = actC - ((actC / 3) | 0) * 3;
        const nAct = arem === 2 ? actC - 2 : actC + 1;
        if (isEdgeOnSeam[nAct]) {

          firstVertId = numNewVertices++;
          if (initVertexToAttributeEntryMap) {
            attEntryMap[firstVertId] = att.mappedIndex(mesh.cornerToPointId(actC));
          } else {
            attEntryMap[firstVertId] = firstVertId;
          }
          leftMostMap[firstVertId] = actC;

        }

        cornerToVertex[actC] = firstVertId;
        prem = actC - ((actC / 3) | 0) * 3;
        pv = prem === 0 ? actC + 2 : actC - 1;
        bopp = baseOpp[pv];
        actC = bopp < 0 ? kInvalidCornerIndex
          : ((bopp - ((bopp / 3) | 0) * 3) === 0 ? bopp + 2 : bopp - 1);

      }

    }

    // Expose exact-length views (no copy) so numVertices() and the per-vertex
    // accessors see the right length.
    this.vertex_to_attribute_entry_id_map_ = attEntryMap.subarray(0, numNewVertices);
    this.vertex_to_left_most_corner_map_ = leftMostMap.subarray(0, numNewVertices);

    return true;

  }

  isCornerOppositeToSeamEdge(corner) {

    return this.is_edge_on_seam_[corner];

  }

  opposite(corner) {

    if (corner === kInvalidCornerIndex || this.isCornerOppositeToSeamEdge(corner)) {
      return kInvalidCornerIndex;
    }

    return this.corner_table_.opposite(corner);

  }

  next(corner) {

    return this.corner_table_.next(corner);

  }

  previous(corner) {

    return this.corner_table_.previous(corner);

  }

  isCornerOnSeam(corner) {

    return this.is_vertex_on_seam_[this.corner_table_.vertex(corner)];

  }

  getLeftCorner(corner) {

    return this.opposite(this.previous(corner));

  }

  getRightCorner(corner) {

    return this.opposite(this.next(corner));

  }

  swingRight(corner) {

    return this.previous(this.opposite(this.previous(corner)));

  }

  swingLeft(corner) {

    return this.next(this.opposite(this.next(corner)));

  }

  numVertices() {

    return this.vertex_to_attribute_entry_id_map_.length;

  }

  numFaces() {

    return this.corner_table_.numFaces();

  }

  numCorners() {

    return this.corner_table_.numCorners();

  }

  vertex(corner) {

    return this.confidentVertex(corner);

  }

  confidentVertex(corner) {

    return this.corner_to_vertex_map_[corner];

  }

  // Returns the attribute entry id associated to the given vertex.
  vertexParent(vert) {

    return this.vertex_to_attribute_entry_id_map_[vert];

  }

  leftMostCorner(v) {

    return this.vertex_to_left_most_corner_map_[v];

  }

  face(corner) {

    return this.corner_table_.face(corner);

  }

  firstCorner(faceIndex) {

    return this.corner_table_.firstCorner(faceIndex);

  }

  allCorners(faceIndex) {

    return this.corner_table_.allCorners(faceIndex);

  }

  isOnBoundary(vert) {

    const corner = this.leftMostCorner(vert);
    if (corner === kInvalidCornerIndex) {
      return true;
    }

    if (this.swingLeft(corner) === kInvalidCornerIndex) {
      return true;
    }

    return false;

  }

  // --- Flat-array accessors used by DepthFirstTraverser to avoid polymorphic
  // per-corner method dispatch in the traversal hot loop. ---

  cornerToVertexArray() {
    return this.corner_to_vertex_map_;
  }

  // Returns an Int32Array of seam-aware opposite corners (seam edges map to -1),
  // matching opposite(). Built once on first use; the seam data and underlying
  // connectivity are finalized before traversal, so the result is stable.
  oppositeCornerArray() {
    if (this._effectiveOpposite === null) {
      const nc = this.corner_table_.numCorners();
      const eff = new Int32Array(nc);
      const seam = this.is_edge_on_seam_;
      const ct = this.corner_table_;
      for (let c = 0; c < nc; ++c) {
        eff[c] = seam[c] ? kInvalidCornerIndex : ct.opposite(c);
      }
      this._effectiveOpposite = eff;
    }
    return this._effectiveOpposite;
  }

  vertexLeftmostCornerArray() {
    return this.vertex_to_left_most_corner_map_;
  }

  // Per-(base-)vertex seam flag (Uint8Array). isCornerOnSeam(c) reads this at
  // the corner's base vertex; exposed so hot dedup loops can inline that.
  vertexOnSeamArray() {
    return this.is_vertex_on_seam_;
  }

  isDegenerated(faceIndex) {

    return this.corner_table_.isDegenerated(faceIndex);

  }

  noInteriorSeams() {

    return this.no_interior_seams_;

  }

  cornerTable() {

    return this.corner_table_;

  }

  valence(v) {

    if (v === kInvalidVertexIndex) {
      return -1;
    }

    return this.confidentValenceVertex(v);

  }

  confidentValenceVertex(v) {

    const vi = new VertexRingIterator(this, v);
    let valence = 0;
    while (!vi.end()) {

      ++valence;
      vi.next();

    }

    return valence;

  }

  valenceFromCorner(c) {

    if (c === kInvalidCornerIndex) {
      return -1;
    }

    return this.confidentValenceVertex(this.vertex(c));

  }

  getValenceCache() {

    return this.valence_cache_;

  }

}

export { MeshAttributeCornerTable };
