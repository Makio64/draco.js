// attributes/AttributeOctahedronTransform.js - ported from attributes/attribute_octahedron_transform.h/cc

import { AttributeTransform } from './AttributeTransform.js';
import { AttributeTransformType } from './AttributeTransformType.js';
import { DataType } from '../core/DracoTypes.js';

// Inline OctahedronToolBox math (ported from normal_compression_utils.h).
// Only the decode-side method QuantizedOctahedralCoordsToUnitVector is needed.
class OctahedronToolBox {

  constructor() {
    this._quantizationBits = -1;
    this._maxQuantizedValue = -1;
    this._maxValue = -1;
    this._dequantizationScale = 1.0;
    this._centerValue = -1;
  }

  setQuantizationBits(q) {
    if (q < 2 || q > 30) {
      return false;
    }
    this._quantizationBits = q;
    this._maxQuantizedValue = ((1 << q) >>> 0) - 1;
    this._maxValue = this._maxQuantizedValue - 1;
    // C++ (normal_compression_utils.h): dequantization_scale_ = 2.f / max_value_
    // evaluated in float32. Keep it float32 so the unit-vector conversion below
    // is bit-identical to the WASM decoder.
    this._dequantizationScale = Math.fround(2.0 / Math.fround(this._maxValue));
    this._centerValue = (this._maxValue / 2) | 0;
    return true;
  }

  // Converts quantized octahedral coordinates to a unit vector. All arithmetic
  // is rounded to float32 (Math.fround) to match Draco's WASM decoder exactly:
  // `in_s * dequantization_scale_ - 1.f` is evaluated in float32 in C++.
  quantizedOctahedralCoordsToUnitVector(inS, inT, outVector) {
    const fround = Math.fround;
    this._octahedralCoordsToUnitVector(
      fround(fround(fround(inS) * this._dequantizationScale) - 1.0),
      fround(fround(fround(inT) * this._dequantizationScale) - 1.0),
      outVector
    );
  }

  _octahedralCoordsToUnitVector(inSScaled, inTScaled, outVector) {
    // float32 throughout (see comment above) so normals are bit-identical to WASM.
    const fround = Math.fround;
    let y = inSScaled;
    let z = inTScaled;

    // Remaining coordinate can be computed by projecting (y, z) onto the
    // surface of the octahedron.
    const x = fround(fround(1.0 - Math.abs(y)) - Math.abs(z));

    // x is a signed distance from the diagonal edges of the diamond.
    // Positive => right hemisphere, negative => left hemisphere.
    let xOffset = -x;
    if (xOffset < 0) xOffset = 0;

    // Mirror (y, z) along nearest diagonal edge for points on left hemisphere.
    y = fround(y + (y < 0 ? xOffset : -xOffset));
    z = fround(z + (z < 0 ? xOffset : -xOffset));

    // Normalize the computed vector.
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

class AttributeOctahedronTransform extends AttributeTransform {

  constructor() {
    super();
    this._quantizationBits = -1;
  }

  // Try to init transform from attribute's existing transform data.
  initFromAttribute(attribute) {
    const transformData = attribute.getAttributeTransformData();
    if (!transformData || transformData.transformType !== AttributeTransformType.OCTAHEDRON_TRANSFORM) {
      return false;
    }
    this._quantizationBits = transformData.getParameterValue(0, 'int32');
    return true;
  }

  // Copy parameter values into the provided AttributeTransformData instance.
  copyToAttributeTransformData(outData) {
    outData.transformType = AttributeTransformType.OCTAHEDRON_TRANSFORM;
    outData.appendParameterValue(this._quantizationBits, 'int32');
  }

  // Decodes quantization bits from the decoder buffer.
  decodeParameters(attribute, decoderBuffer) {
    const qBits = decoderBuffer.decodeUint8();
    if (qBits === undefined) return false;
    this._quantizationBits = qBits;
    return true;
  }

  // Inverse transform: converts octahedral coordinates to unit vectors (float32).
  inverseTransformAttribute(attribute, targetAttribute) {
    if (targetAttribute.dataType !== DataType.FLOAT32) {
      return false;
    }

    const numPoints = targetAttribute.size;
    const numComponents = targetAttribute.numComponents;
    if (numComponents !== 3) {
      return false;
    }

    const toolBox = new OctahedronToolBox();
    if (!toolBox.setQuantizationBits(this._quantizationBits)) {
      return false;
    }

    // Source holds native-endian int32 octahedral coords (2 per point); target
    // holds float32 unit vectors (3 per point). Attribute buffers start at
    // byteOffset 0, so typed-array views are aligned -- read/write directly,
    // avoiding a per-point DataView dispatch and per-entry buffer copy.
    const srcAddr = attribute.getAddress(0);
    const srcI32 = new Int32Array(srcAddr.buffer, srcAddr.byteOffset, numPoints * 2);
    const dstAddr = targetAttribute.getAddress(0);
    const dstF32 = new Float32Array(dstAddr.buffer, dstAddr.byteOffset, numPoints * 3);

    const outVec = this._tmpVec || (this._tmpVec = new Float32Array(3));
    let si = 0;
    let di = 0;
    for (let i = 0; i < numPoints; i++) {
      toolBox.quantizedOctahedralCoordsToUnitVector(srcI32[si], srcI32[si + 1], outVec);
      si += 2;
      dstF32[di] = outVec[0];
      dstF32[di + 1] = outVec[1];
      dstF32[di + 2] = outVec[2];
      di += 3;
    }
    return true;
  }

}

export { AttributeOctahedronTransform };
