// mesh/ValenceCache.js - ported from mesh/valence_cache.h

// Sentinel value for invalid indices (matches uint32 max).
const kInvalidVertexIndex = -1;
const kInvalidCornerIndex = -1;

class ValenceCache {

  constructor(table) {

    this.table_ = table;
    this.vertex_valence_cache_8_bit_ = null;
    this.vertex_valence_cache_32_bit_ = null;

  }

  valenceFromCacheInaccurate(c) {

    if (c === kInvalidCornerIndex) {
      return -1;
    }

    return this.valenceFromCacheInaccurateVertex(this.table_.vertex(c));

  }

  valenceFromCache(c) {

    if (c === kInvalidCornerIndex) {
      return -1;
    }

    return this.valenceFromCacheVertex(this.table_.vertex(c));

  }

  confidentValenceFromCacheVertex(v) {

    return this.vertex_valence_cache_32_bit_[v];

  }

  // Cache all vertex valences (8-bit, clamped to 127).
  cacheValencesInaccurate() {

    if (this.vertex_valence_cache_8_bit_ === null) {

      const vertexCount = this.table_.numVertices();
      this.vertex_valence_cache_8_bit_ = new Int8Array(vertexCount);

      for (let v = 0; v < vertexCount; ++v) {

        this.vertex_valence_cache_8_bit_[v] = Math.min(127, this.table_.valence(v));

      }

    }

  }

  // Cache all vertex valences (32-bit, accurate).
  cacheValences() {

    if (this.vertex_valence_cache_32_bit_ === null) {

      const vertexCount = this.table_.numVertices();
      this.vertex_valence_cache_32_bit_ = new Int32Array(vertexCount);

      for (let v = 0; v < vertexCount; ++v) {

        this.vertex_valence_cache_32_bit_[v] = this.table_.valence(v);

      }

    }

  }

  confidentValenceFromCacheInaccurateCorner(c) {

    return this.confidentValenceFromCacheInaccurateVertex(this.table_.confidentVertex(c));

  }

  confidentValenceFromCacheCorner(c) {

    return this.confidentValenceFromCacheVertex(this.table_.confidentVertex(c));

  }

  valenceFromCacheInaccurateVertex(v) {

    if (v === kInvalidVertexIndex || v >= this.table_.numVertices()) {
      return -1;
    }

    return this.confidentValenceFromCacheInaccurateVertex(v);

  }

  confidentValenceFromCacheInaccurateVertex(v) {

    return this.vertex_valence_cache_8_bit_[v];

  }

  valenceFromCacheVertex(v) {

    if (v === kInvalidVertexIndex || v >= this.table_.numVertices()) {
      return -1;
    }

    return this.confidentValenceFromCacheVertex(v);

  }

  clearValenceCacheInaccurate() {

    this.vertex_valence_cache_8_bit_ = null;

  }

  clearValenceCache() {

    this.vertex_valence_cache_32_bit_ = null;

  }

  isCacheEmpty() {

    return this.vertex_valence_cache_8_bit_ === null &&
           this.vertex_valence_cache_32_bit_ === null;

  }

}

export { ValenceCache };
