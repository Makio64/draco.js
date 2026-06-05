// src/compression/attributes/NormalCompressionUtils.js
// Ported from draco/compression/attributes/normal_compression_utils.h

/**
 * OctahedronToolBox provides utilities for converting unit vectors to
 * octahedral coordinates and back, used for normal compression.
 *
 * Key values:
 *   q: number of quantization bits
 *   maxQuantizedValue: max representable value with q bits (odd)
 *   maxValue: maxQuantizedValue - 1 (even)
 *   centerValue: maxValue / 2
 */
class OctahedronToolBox {

  constructor() {
    this._quantizationBits = -1;
    this._maxQuantizedValue = -1;
    this._maxValue = -1;
    this._dequantizationScale = 1.0;
    this._centerValue = -1;
  }

  /**
   * @param {number} q - quantization bits (2..30)
   * @returns {boolean}
   */
  setQuantizationBits(q) {
    if (q < 2 || q > 30) return false;
    this._quantizationBits = q;
    this._maxQuantizedValue = (1 << q) - 1;
    this._maxValue = this._maxQuantizedValue - 1;
    this._dequantizationScale = Math.fround(2.0 / Math.fround(this._maxValue));
    this._centerValue = (this._maxValue / 2) | 0;
    return true;
  }

  /** @returns {boolean} */
  isInitialized() {
    return this._quantizationBits !== -1;
  }

  /** @returns {number} */
  quantizationBits() { return this._quantizationBits; }

  /**
   * Canonicalizes edge points so they are in consistent quadrants. Writes the
   * result into out[0], out[1] (caller-owned reusable 2-element array).
   * @param {number} s
   * @param {number} t
   * @param {number[]|Int32Array} out
   */
  canonicalizeOctahedralCoords(s, t, out) {
    if ((s === 0 && t === 0) || (s === 0 && t === this._maxValue) ||
        (s === this._maxValue && t === 0)) {
      s = this._maxValue;
      t = this._maxValue;
    } else if (s === 0 && t > this._centerValue) {
      t = this._centerValue - (t - this._centerValue);
    } else if (s === this._maxValue && t < this._centerValue) {
      t = this._centerValue + (this._centerValue - t);
    } else if (t === this._maxValue && s < this._centerValue) {
      s = this._centerValue + (this._centerValue - s);
    } else if (t === 0 && s > this._centerValue) {
      s = this._centerValue - (s - this._centerValue);
    }
    out[0] = s;
    out[1] = t;
  }

  /**
   * Converts an integer vector to quantized octahedral coordinates.
   * Precondition: abs sum of intVec must equal centerValue.
   * @param {Int32Array|Array} intVec - [x, y, z]
   * @param {Int32Array|Array} out - output [s, t] or writes to out[0], out[1]
   */
  integerVectorToQuantizedOctahedralCoords(intVec, out) {
    let s, t;
    if (intVec[0] >= 0) {
      // Right hemisphere.
      s = intVec[1] + this._centerValue;
      t = intVec[2] + this._centerValue;
    } else {
      // Left hemisphere.
      if (intVec[1] < 0) {
        s = Math.abs(intVec[2]);
      } else {
        s = this._maxValue - Math.abs(intVec[2]);
      }
      if (intVec[2] < 0) {
        t = Math.abs(intVec[1]);
      } else {
        t = this._maxValue - Math.abs(intVec[1]);
      }
    }
    this.canonicalizeOctahedralCoords(s, t, out);
  }

  /**
   * Normalizes intVec so its abs sum equals centerValue.
   * @param {Int32Array|Array} vec - [x, y, z], modified in place
   */
  canonicalizeIntegerVector(vec) {
    const absSum = Math.abs(vec[0]) + Math.abs(vec[1]) + Math.abs(vec[2]);
    if (absSum === 0) {
      vec[0] = this._centerValue;
      // vec[1] and vec[2] remain 0.
    } else {
      vec[0] = Math.trunc((vec[0] * this._centerValue) / absSum);
      vec[1] = Math.trunc((vec[1] * this._centerValue) / absSum);
      if (vec[2] >= 0) {
        vec[2] = this._centerValue - Math.abs(vec[0]) - Math.abs(vec[1]);
      } else {
        vec[2] = -(this._centerValue - Math.abs(vec[0]) - Math.abs(vec[1]));
      }
    }
  }

  /**
   * Converts quantized octahedral coordinates to a unit vector.
   * @param {number} inS
   * @param {number} inT
   * @param {Float32Array|Array} outVector - [x, y, z]
   */
  quantizedOctahedralCoordsToUnitVector(inS, inT, outVector) {
    // float32 throughout (Math.fround) to stay bit-identical to the WASM
    // decoder, matching the live copy in AttributeOctahedronTransform.js.
    const fround = Math.fround;
    this._octahedralCoordsToUnitVector(
      fround(fround(fround(inS) * this._dequantizationScale) - 1.0),
      fround(fround(fround(inT) * this._dequantizationScale) - 1.0),
      outVector
    );
  }

  /**
   * @private
   */
  _octahedralCoordsToUnitVector(inSScaled, inTScaled, outVector) {
    // float32 throughout (see quantizedOctahedralCoordsToUnitVector) so normals
    // are bit-identical to WASM.
    const fround = Math.fround;
    let y = inSScaled;
    let z = inTScaled;
    const x = fround(fround(1.0 - Math.abs(y)) - Math.abs(z));

    let xOffset = -x;
    if (xOffset < 0) xOffset = 0;

    y = fround(y + (y < 0 ? xOffset : -xOffset));
    z = fround(z + (z < 0 ? xOffset : -xOffset));

    const normSquared = fround(fround(fround(x * x) + fround(y * y)) + fround(z * z));
    if (normSquared < 1e-6) {
      outVector[0] = 0;
      outVector[1] = 0;
      outVector[2] = 0;
    } else {
      const d = fround(1.0 / fround(Math.sqrt(normSquared)));
      outVector[0] = fround(x * d);
      outVector[1] = fround(y * d);
      outVector[2] = fround(z * d);
    }
  }

}

export { OctahedronToolBox };
