// src/compression/attributes/prediction_schemes/PredictionSchemeNormalOctahedronDecodingTransform.js
// Ported from draco/compression/attributes/prediction_schemes/prediction_scheme_normal_octahedron_decoding_transform.h

import { PredictionSchemeTransformType } from '../../config/CompressionShared.js';
import { OctahedronToolBox } from '../NormalCompressionUtils.js';

/**
 * Decodes correction values that were transformed using the octahedral normal
 * transform back to original values. Used for backwards compatibility.
 */
class PredictionSchemeNormalOctahedronDecodingTransform {

  constructor() {
    this._octahedronToolBox = new OctahedronToolBox();
    // Reusable scratch for invertDiamond (per-normal hot path).
    this._scratch = [0, 0];
  }

  /**
   * @returns {number}
   */
  getType() {
    return PredictionSchemeTransformType.PREDICTION_TRANSFORM_NORMAL_OCTAHEDRON;
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
   * Decodes the max quantized value from the buffer.
   * @param {DecoderBuffer} buffer
   * @returns {boolean}
   */
  decodeTransformData(buffer) {
    const maxQuantizedValue = buffer.decodeInt32();
    if (maxQuantizedValue === undefined) return false;

    if (buffer.bitstreamVersion < 0x0202) { // DRACO_BITSTREAM_VERSION(2, 2)
      // center_value is read but ignored.
      const centerValue = buffer.decodeInt32();
      if (centerValue === undefined) return false;
    }

    return this._setMaxQuantizedValue(maxQuantizedValue);
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
    const center = this._octahedronToolBox.centerValue();

    const predS = predVals[predOffset] - center;
    const predT = predVals[predOffset + 1] - center;
    const corrS = corrVals[corrOffset];
    const corrT = corrVals[corrOffset + 1];

    const predIsInDiamond = this._octahedronToolBox.isInDiamond(predS, predT);

    let ps = predS;
    let pt = predT;
    const scratch = this._scratch;
    if (!predIsInDiamond) {
      this._octahedronToolBox.invertDiamond(ps, pt, scratch);
      ps = scratch[0];
      pt = scratch[1];
    }

    // Unsigned addition to avoid signed overflow.
    let origS = (ps + corrS) | 0;
    let origT = (pt + corrT) | 0;

    origS = this._octahedronToolBox.modMax(origS);
    origT = this._octahedronToolBox.modMax(origT);

    if (!predIsInDiamond) {
      this._octahedronToolBox.invertDiamond(origS, origT, scratch);
      origS = scratch[0];
      origT = scratch[1];
    }

    origS = (origS + center) | 0;
    origT = (origT + center) | 0;

    outOrigVals[outOffset] = origS;
    outOrigVals[outOffset + 1] = origT;
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

export { PredictionSchemeNormalOctahedronDecodingTransform };
