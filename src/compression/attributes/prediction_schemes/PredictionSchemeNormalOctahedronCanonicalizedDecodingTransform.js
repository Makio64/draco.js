// src/compression/attributes/prediction_schemes/PredictionSchemeNormalOctahedronCanonicalizedDecodingTransform.js
// Ported from draco/compression/attributes/prediction_schemes/prediction_scheme_normal_octahedron_canonicalized_decoding_transform.h

import { PredictionSchemeTransformType } from '../../config/CompressionShared.js';
import { OctahedronToolBox } from '../NormalCompressionUtils.js';

/**
 * Decodes correction values that were transformed using the canonicalized
 * octahedral normal transform back to original values.
 */
class PredictionSchemeNormalOctahedronCanonicalizedDecodingTransform {

  constructor() {
    this._octahedronToolBox = new OctahedronToolBox();
    // Reusable scratch for invertDiamond (per-normal hot path).
    this._scratch = [0, 0];
  }

  /**
   * @returns {number}
   */
  getType() {
    return PredictionSchemeTransformType.PREDICTION_TRANSFORM_NORMAL_OCTAHEDRON_CANONICALIZED;
  }

  /**
   * @returns {boolean}
   */
  areCorrectionsPositive() {
    return true;
  }

  /**
   * Dummy init to fulfill interface.
   * @param {number} numComponents
   */
  init(numComponents) {}

  /**
   * @returns {number}
   */
  quantizationBits() {
    return this._octahedronToolBox.quantizationBits();
  }

  /**
   * @returns {number}
   */
  maxQuantizedValue() {
    return this._octahedronToolBox.maxQuantizedValue();
  }

  /**
   * @returns {number}
   */
  centerValue() {
    return this._octahedronToolBox.centerValue();
  }

  /**
   * Decodes the transform data from the buffer.
   * @param {DecoderBuffer} buffer
   * @returns {boolean}
   */
  decodeTransformData(buffer) {
    const maxQuantizedValue = buffer.decodeInt32();
    if (maxQuantizedValue === undefined) return false;
    // center_value is read but ignored.
    const centerValue = buffer.decodeInt32();
    if (centerValue === undefined) return false;

    if (!this._setMaxQuantizedValue(maxQuantizedValue)) return false;

    if (this._octahedronToolBox.quantizationBits() < 2) return false;
    if (this._octahedronToolBox.quantizationBits() > 30) return false;

    return true;
  }

  /**
   * Computes the original value from predicted and correction values.
   * @param {Int32Array|TypedArray} predVals
   * @param {number} predOffset
   * @param {Int32Array|TypedArray} corrVals
   * @param {number} corrOffset
   * @param {Int32Array|TypedArray} outOrigVals
   * @param {number} outOffset
   */
  computeOriginalValue(predVals, predOffset, corrVals, corrOffset,
    outOrigVals, outOffset) {
    // Hoist the toolbox bounds into locals and inline isInDiamond / modMax
    // (both tiny and called per normal) to avoid the per-normal method dispatch.
    const toolBox = this._octahedronToolBox;
    const center = toolBox._centerValue;
    const maxQuantizedValue = toolBox._maxQuantizedValue;
    const corrS = corrVals[corrOffset];
    const corrT = corrVals[corrOffset + 1];

    let predS = predVals[predOffset] - center;
    let predT = predVals[predOffset + 1] - center;

    const scratch = this._scratch;
    const predIsInDiamond =
      (Math.abs(predS) + Math.abs(predT)) <= center;
    if (!predIsInDiamond) {
      toolBox.invertDiamond(predS, predT, scratch);
      predS = scratch[0];
      predT = scratch[1];
    }

    const predIsInBottomLeft = this._isInBottomLeft(predS, predT);
    const rotationCount = this._getRotationCount(predS, predT);

    if (!predIsInBottomLeft) {
      // Inline _rotatePoint to avoid a per-normal array allocation.
      const s = predS, t = predT;
      switch (rotationCount) {
        case 1: predS = t; predT = -s; break;
        case 2: predS = -s; predT = -t; break;
        case 3: predS = -t; predT = s; break;
      }
    }

    // Unsigned addition to avoid signed overflow, then modMax (inlined).
    let origS = (predS + corrS) | 0;
    if (origS > center) origS -= maxQuantizedValue;
    else if (origS < -center) origS += maxQuantizedValue;
    let origT = (predT + corrT) | 0;
    if (origT > center) origT -= maxQuantizedValue;
    else if (origT < -center) origT += maxQuantizedValue;

    if (!predIsInBottomLeft) {
      const s = origS, t = origT;
      switch ((4 - rotationCount) % 4) {
        case 1: origS = t; origT = -s; break;
        case 2: origS = -s; origT = -t; break;
        case 3: origS = -t; origT = s; break;
      }
    }

    if (!predIsInDiamond) {
      this._octahedronToolBox.invertDiamond(origS, origT, scratch);
      origS = scratch[0];
      origT = scratch[1];
    }

    outOrigVals[outOffset] = origS + center;
    outOrigVals[outOffset + 1] = origT + center;
  }

  /**
   * Checks if a point is in the bottom-left quadrant.
   * @private
   * @param {number} s
   * @param {number} t
   * @returns {boolean}
   */
  _isInBottomLeft(s, t) {
    if (s === 0 && t === 0) return true;
    return (s < 0 && t <= 0);
  }

  /**
   * Computes the rotation count for canonicalization.
   * @private
   * @param {number} signX
   * @param {number} signY
   * @returns {number}
   */
  _getRotationCount(signX, signY) {
    if (signX === 0) {
      if (signY === 0) return 0;
      if (signY > 0) return 3;
      return 1;
    }
    if (signX > 0) {
      if (signY >= 0) return 2;
      return 1;
    }
    // signX < 0
    if (signY <= 0) return 0;
    return 3;
  }

  /**
   * @private
   * @param {number} maxQuantizedValue
   * @returns {boolean}
   */
  _setMaxQuantizedValue(maxQuantizedValue) {
    if (maxQuantizedValue % 2 === 0) return false;
    let q = 0;
    let v = maxQuantizedValue;
    while (v > 0) {
      v >>>= 1;
      q++;
    }
    return this._octahedronToolBox.setQuantizationBits(q);
  }

}

export { PredictionSchemeNormalOctahedronCanonicalizedDecodingTransform };
