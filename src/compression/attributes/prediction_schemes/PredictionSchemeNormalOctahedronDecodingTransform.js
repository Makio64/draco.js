// compression/attributes/prediction_schemes/PredictionSchemeNormalOctahedronDecodingTransform.js - ported from compression/attributes/prediction_schemes/prediction_scheme_normal_octahedron_decoding_transform.h

import { PredictionSchemeTransformType } from '../../config/CompressionShared.js';
import { PredictionSchemeNormalOctahedronTransformBase } from './PredictionSchemeNormalOctahedronTransformBase.js';

/**
 * Decodes correction values that were transformed using the octahedral normal
 * transform back to original values. Used for backwards compatibility.
 */
class PredictionSchemeNormalOctahedronDecodingTransform extends PredictionSchemeNormalOctahedronTransformBase {

  getType() {
    return PredictionSchemeTransformType.PREDICTION_TRANSFORM_NORMAL_OCTAHEDRON;
  }

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

  computeOriginalValue(predVals, predOffset, corrVals, corrOffset,
    outOrigVals, outOffset) {
    const toolBox = this._octahedronToolBox;
    const center = toolBox._centerValue;
    const maxQuantizedValue = toolBox._maxQuantizedValue;

    const predS = predVals[predOffset] - center;
    const predT = predVals[predOffset + 1] - center;
    const corrS = corrVals[corrOffset];
    const corrT = corrVals[corrOffset + 1];

    const predIsInDiamond = (Math.abs(predS) + Math.abs(predT)) <= center;

    let ps = predS;
    let pt = predT;
    if (!predIsInDiamond) {
      let signS = 0;
      let signT = 0;
      if (ps >= 0 && pt >= 0) {
        signS = 1; signT = 1;
      } else if (ps <= 0 && pt <= 0) {
        signS = -1; signT = -1;
      } else {
        signS = (ps > 0) ? 1 : -1;
        signT = (pt > 0) ? 1 : -1;
      }
      const cornerPointS = signS * center;
      const cornerPointT = signT * center;
      let us = (ps * 2 - cornerPointS) | 0;
      let ut = (pt * 2 - cornerPointT) | 0;
      if (signS * signT >= 0) {
        const temp = us;
        us = -ut;
        ut = -temp;
      } else {
        const temp = us;
        us = ut;
        ut = temp;
      }
      ps = ((us + cornerPointS) / 2) | 0;
      pt = ((ut + cornerPointT) / 2) | 0;
    }

    // Unsigned addition to avoid signed overflow.
    let origS = (ps + corrS) | 0;
    let origT = (pt + corrT) | 0;

    if (origS > center) origS -= maxQuantizedValue;
    else if (origS < -center) origS += maxQuantizedValue;
    if (origT > center) origT -= maxQuantizedValue;
    else if (origT < -center) origT += maxQuantizedValue;

    if (!predIsInDiamond) {
      let signS = 0;
      let signT = 0;
      if (origS >= 0 && origT >= 0) {
        signS = 1; signT = 1;
      } else if (origS <= 0 && origT <= 0) {
        signS = -1; signT = -1;
      } else {
        signS = (origS > 0) ? 1 : -1;
        signT = (origT > 0) ? 1 : -1;
      }
      const cornerPointS = signS * center;
      const cornerPointT = signT * center;
      let us = (origS * 2 - cornerPointS) | 0;
      let ut = (origT * 2 - cornerPointT) | 0;
      if (signS * signT >= 0) {
        const temp = us;
        us = -ut;
        ut = -temp;
      } else {
        const temp = us;
        us = ut;
        ut = temp;
      }
      origS = ((us + cornerPointS) / 2) | 0;
      origT = ((ut + cornerPointT) / 2) | 0;
    }

    outOrigVals[outOffset] = (origS + center) | 0;
    outOrigVals[outOffset + 1] = (origT + center) | 0;
  }

}

export { PredictionSchemeNormalOctahedronDecodingTransform };
