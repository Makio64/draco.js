// attributes/AttributeQuantizationTransform.js - ported from attributes/attribute_quantization_transform.h/cc

import { AttributeTransform } from './AttributeTransform.js';
import { AttributeTransformType } from './AttributeTransformType.js';
import { DataType } from '../core/DracoTypes.js';
import { Dequantizer } from '../core/QuantizationUtils.js';

class AttributeQuantizationTransform extends AttributeTransform {

  constructor() {
    super();
    this._quantizationBits = -1;
    this._minValues = [];
    this._range = 0;
  }

  type() {
    return AttributeTransformType.QUANTIZATION_TRANSFORM;
  }

  // Try to init transform from attribute's existing transform data.
  initFromAttribute(attribute) {
    const transformData = attribute.getAttributeTransformData();
    if (!transformData || transformData.transformType !== AttributeTransformType.QUANTIZATION_TRANSFORM) {
      return false;
    }
    let byteOffset = 0;
    this._quantizationBits = transformData.getParameterValue(byteOffset, 'int32');
    byteOffset += 4;
    this._minValues = new Array(attribute.numComponents);
    for (let i = 0; i < attribute.numComponents; i++) {
      this._minValues[i] = transformData.getParameterValue(byteOffset, 'float32');
      byteOffset += 4;
    }
    this._range = transformData.getParameterValue(byteOffset, 'float32');
    return true;
  }

  // Copy parameter values into the provided AttributeTransformData instance.
  copyToAttributeTransformData(outData) {
    outData.transformType = AttributeTransformType.QUANTIZATION_TRANSFORM;
    outData.appendParameterValue(this._quantizationBits, 'int32');
    for (let i = 0; i < this._minValues.length; i++) {
      outData.appendParameterValue(this._minValues[i], 'float32');
    }
    outData.appendParameterValue(this._range, 'float32');
  }

  // Decodes quantization parameters from the decoder buffer.
  decodeParameters(attribute, decoderBuffer) {
    const numComponents = attribute.numComponents;
    this._minValues = new Array(numComponents);

    // Read min values (float32 per component).
    for (let i = 0; i < numComponents; i++) {
      const val = decoderBuffer.decodeFloat32();
      if (val === undefined) return false;
      this._minValues[i] = val;
    }

    // Read range (float32).
    const range = decoderBuffer.decodeFloat32();
    if (range === undefined) return false;
    this._range = range;

    // Read quantization bits (uint8).
    const qBits = decoderBuffer.decodeUint8();
    if (qBits === undefined) return false;
    if (!AttributeQuantizationTransform._isQuantizationValid(qBits)) {
      return false;
    }
    this._quantizationBits = qBits;
    return true;
  }

  // Inverse transform: dequantizes uint32 values back to float32.
  inverseTransformAttribute(attribute, targetAttribute) {
    if (targetAttribute.dataType !== DataType.FLOAT32) {
      return false;
    }

    const maxQuantizedValue = ((1 << this._quantizationBits) >>> 0) - 1;
    const numComponents = targetAttribute.numComponents;
    const dequantizer = new Dequantizer();
    if (!dequantizer.initFromRange(this._range, maxQuantizedValue)) {
      return false;
    }

    const numValues = targetAttribute.size;
    const total = numValues * numComponents;
    const delta = dequantizer.delta;
    const minValues = this._minValues;

    // The portable (source) attribute holds native-endian int32; the target
    // holds float32. Attribute buffers start at byteOffset 0, so typed-array
    // views are aligned -- read/write through them directly to avoid a
    // per-component DataView dispatch and a per-entry buffer copy.
    const srcAddr = attribute.getAddress(0);
    const srcI32 = new Int32Array(srcAddr.buffer, srcAddr.byteOffset, total);
    const dstAddr = targetAttribute.getAddress(0);
    const dstF32 = new Float32Array(dstAddr.buffer, dstAddr.byteOffset, total);

    // Mirror Draco C++ float32 arithmetic so the result is bit-identical to the
    // WASM decoder: `value` (int) is converted to float, multiplied by the
    // float `delta` (both rounded to float32), then added to the float32 min.
    // The Float32Array store performs the final round of the addition.
    const fround = Math.fround;
    let o = 0;
    for (let i = 0; i < numValues; i++) {
      for (let c = 0; c < numComponents; c++) {
        dstF32[o] = fround(fround(srcI32[o]) * delta) + minValues[c];
        o++;
      }
    }
    return true;
  }

  getTransformedDataType(/* attribute */) {
    return DataType.UINT32;
  }

  getTransformedNumComponents(attribute) {
    return attribute.numComponents;
  }

  get quantizationBits() { return this._quantizationBits; }
  get range() { return this._range; }
  get minValues() { return this._minValues; }
  get isInitialized() { return this._quantizationBits !== -1; }

  minValue(axis) { return this._minValues[axis]; }

  static _isQuantizationValid(quantizationBits) {
    return quantizationBits >= 1 && quantizationBits <= 30;
  }

}

export { AttributeQuantizationTransform };
