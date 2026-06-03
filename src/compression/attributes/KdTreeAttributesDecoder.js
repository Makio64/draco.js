// compression/attributes/KdTreeAttributesDecoder.js - ported from compression/attributes/kd_tree_attributes_decoder.h/cc

import { AttributesDecoder } from './AttributesDecoder.js';
import { GeometryAttribute } from '../../attributes/GeometryAttribute.js';
import { PointAttribute } from '../../attributes/PointAttribute.js';
import { AttributeQuantizationTransform } from '../../attributes/AttributeQuantizationTransform.js';
import { DataType, dataTypeLength } from '../../core/DracoTypes.js';
import { Dequantizer } from '../../core/QuantizationUtils.js';
import { decodeVarint } from '../../core/VarintDecoding.js';
import { DRACO_BITSTREAM_VERSION } from '../config/CompressionShared.js';

// Defines types of kD-tree compression (from kd_tree_attributes_shared.h).
const KdTreeAttributesEncodingMethod = {
  kKdTreeQuantizationEncoding: 0,
  kKdTreeIntegerEncoding: 1
};

// Output iterator that decodes values directly into the data buffers of
// the modified PointAttribute objects.
class PointAttributeVectorOutputIterator {

  constructor(atts) {
    // atts is an array of { attribute, offsetDimensionality, dataType, dataSize, numComponents }
    this._attributes = atts;
    this._pointId = 0;

    // Compute maximum decode buffer size needed.
    let requiredDecodeBytes = 0;
    for (let i = 0; i < atts.length; i++) {
      const att = atts[i];
      requiredDecodeBytes = Math.max(requiredDecodeBytes, att.dataSize * att.numComponents);
    }
    this._memory = new Uint8Array(requiredDecodeBytes);
  }

  next() {
    this._pointId++;
  }

  // Assign a vector of uint32 values to the current point.
  set(val) {
    for (let index = 0; index < this._attributes.length; index++) {
      const att = this._attributes[index];
      const attribute = att.attribute;
      const avi = attribute.mappedIndex(this._pointId);
      if (avi >= attribute.size) {
        continue;
      }
      const offset = att.offsetDimensionality;
      const dataSize = att.dataSize;
      const numComponents = att.numComponents;

      if (dataSize < 4) {
        // Handle uint16_t, uint8_t: selectively copy data bytes.
        let dataCounter = 0;
        for (let c = 0; c < numComponents; c++) {
          // Copy dataSize bytes from val[offset + c] (as uint32)
          const srcVal = val[offset + c];
          for (let b = 0; b < dataSize; b++) {
            this._memory[dataCounter + b] = (srcVal >> (b * 8)) & 0xFF;
          }
          dataCounter += dataSize;
        }
        // Set from copied bytes.
        const entryBytes = new Uint8Array(this._memory.buffer, 0, dataSize * numComponents);
        attribute.setAttributeValue(avi, entryBytes);
      } else {
        // 4-byte types: create a view into val starting at offset.
        const entryData = new Uint32Array(numComponents);
        for (let c = 0; c < numComponents; c++) {
          entryData[c] = val[offset + c];
        }
        const entryBytes = new Uint8Array(entryData.buffer);
        attribute.setAttributeValue(avi, entryBytes);
      }
    }
  }

}

// Decodes attributes encoded with the KdTreeAttributesEncoder.
class KdTreeAttributesDecoder extends AttributesDecoder {

  constructor() {
    super();
    this._attributeQuantizationTransforms = [];
    this._minSignedValues = [];
    this._quantizedPortableAttributes = [];
  }

  decodePortableAttributes(buffer) {
    if (buffer.bitstreamVersion < DRACO_BITSTREAM_VERSION(2, 3)) {
      // Old bitstream does everything in decodeDataNeededByPortableTransforms().
      return true;
    }

    const compressionLevel = buffer.decodeUint8();
    if (compressionLevel === undefined) return false;

    const numPoints = this.getDecoder().pointCloud().numPoints();
    const numAttributes = this.getNumAttributes();
    let totalDimensionality = 0;
    const atts = [];

    for (let i = 0; i < numAttributes; i++) {
      const attId = this.getAttributeId(i);
      const att = this.getDecoder().pointCloud().attribute(attId);
      // All attributes have the same number of values and identity mapping.
      att.reset(numPoints);
      att.setIdentityMapping();

      let targetAtt = null;
      if (att.dataType === DataType.UINT32 || att.dataType === DataType.UINT16 ||
          att.dataType === DataType.UINT8) {
        // We can decode to these attributes directly.
        targetAtt = att;
      } else if (att.dataType === DataType.INT32 || att.dataType === DataType.INT16 ||
                 att.dataType === DataType.INT8) {
        // Prepare storage for signed value conversion.
        for (let c = 0; c < att.numComponents; c++) {
          this._minSignedValues.push(0);
        }
        targetAtt = att;
      } else if (att.dataType === DataType.FLOAT32) {
        // Create a portable attribute for quantized data.
        const numComponents = att.numComponents;
        const va = new GeometryAttribute();
        va.init(att.attributeType, null, numComponents, DataType.UINT32, false,
                numComponents * dataTypeLength(DataType.UINT32), 0);
        const portAtt = new PointAttribute(va);
        portAtt.setIdentityMapping();
        portAtt.reset(numPoints);
        this._quantizedPortableAttributes.push(portAtt);
        targetAtt = this._quantizedPortableAttributes[this._quantizedPortableAttributes.length - 1];
      } else {
        // Unsupported type.
        return false;
      }

      const dataType = targetAtt.dataType;
      const dataSize = Math.max(0, dataTypeLength(dataType));
      const numComponents = targetAtt.numComponents;
      atts.push({
        attribute: targetAtt,
        offsetDimensionality: totalDimensionality,
        dataType: dataType,
        dataSize: dataSize,
        numComponents: numComponents
      });
      totalDimensionality += numComponents;
    }

    const outIt = new PointAttributeVectorOutputIterator(atts);

    if (compressionLevel > 6) {
      return false;
    }

    if (!this._decodePoints(compressionLevel, totalDimensionality, numPoints, buffer, outIt)) {
      return false;
    }
    return true;
  }

  decodeDataNeededByPortableTransforms(buffer) {
    if (buffer.bitstreamVersion >= DRACO_BITSTREAM_VERSION(2, 3)) {
      // Decode quantization data for each attribute that needs it.
      const minValue = [];
      for (let i = 0; i < this.getNumAttributes(); i++) {
        const attId = this.getAttributeId(i);
        const att = this.getDecoder().pointCloud().attribute(attId);
        if (att.dataType === DataType.FLOAT32) {
          const numComponents = att.numComponents;
          minValue.length = numComponents;
          for (let c = 0; c < numComponents; c++) {
            const v = buffer.decodeFloat32();
            if (v === undefined) return false;
            minValue[c] = v;
          }
          const maxValueDif = buffer.decodeFloat32();
          if (maxValueDif === undefined) return false;

          const quantizationBits = buffer.decodeUint8();
          if (quantizationBits === undefined || quantizationBits > 31) {
            return false;
          }

          const transform = new AttributeQuantizationTransform();
          // Set parameters directly since the JS transform may not have setParameters.
          transform._quantizationBits = quantizationBits;
          transform._minValues = minValue.slice();
          transform._range = maxValueDif;

          const numTransforms = this._attributeQuantizationTransforms.length;
          if (!transform.transferToAttribute(
                this._quantizedPortableAttributes[numTransforms])) {
            return false;
          }
          this._attributeQuantizationTransforms.push(transform);
        }
      }

      // Decode transform data for signed integer attributes.
      for (let i = 0; i < this._minSignedValues.length; i++) {
        const val = decodeVarint(buffer, true);
        if (val === undefined) return false;
        this._minSignedValues[i] = val;
      }
      return true;
    }

    // Handle old bitstream (backwards compatibility).
    const attributeCount = this.getNumAttributes();
    let totalDimensionality = 0;
    const atts = [];

    for (let attributeIndex = 0; attributeIndex < attributeCount; attributeIndex++) {
      const attId = this.getAttributeId(attributeIndex);
      const att = this.getDecoder().pointCloud().attribute(attId);
      const dataType = att.dataType;
      const dataSize = Math.max(0, dataTypeLength(dataType));
      const numComponents = att.numComponents;
      if (dataSize > 4) {
        return false;
      }

      atts.push({
        attribute: att,
        offsetDimensionality: totalDimensionality,
        dataType: dataType,
        dataSize: dataSize,
        numComponents: numComponents
      });
      totalDimensionality += numComponents;
    }

    const att0Id = this.getAttributeId(0);
    const att0 = this.getDecoder().pointCloud().attribute(att0Id);
    att0.setIdentityMapping();

    // Decode method.
    const method = buffer.decodeUint8();
    if (method === undefined) return false;

    if (method === KdTreeAttributesEncodingMethod.kKdTreeQuantizationEncoding) {
      // This method only supports one attribute with exactly three components.
      if (atts.length !== 1 || atts[0].numComponents !== 3) {
        return false;
      }
      const compressionLevel = buffer.decodeUint8();
      if (compressionLevel === undefined) return false;

      const numPoints = buffer.decodeUint32();
      if (numPoints === undefined) return false;

      att0.reset(numPoints);

      // FloatPointsTreeDecoder - delegate to external decoder.
      if (typeof KdTreeAttributesDecoder._floatPointsTreeDecoderFn === 'function') {
        if (!KdTreeAttributesDecoder._floatPointsTreeDecoderFn(
              buffer, atts, numPoints)) {
          return false;
        }
      } else {
        // FloatPointsTreeDecoder not available.
        return false;
      }
    } else if (method === KdTreeAttributesEncodingMethod.kKdTreeIntegerEncoding) {
      const compressionLevel = buffer.decodeUint8();
      if (compressionLevel === undefined) return false;
      if (compressionLevel > 6) {
        return false;
      }

      const numPoints = buffer.decodeUint32();
      if (numPoints === undefined) return false;

      for (let attributeIndex = 0; attributeIndex < attributeCount; attributeIndex++) {
        const attId = this.getAttributeId(attributeIndex);
        const attr = this.getDecoder().pointCloud().attribute(attId);
        attr.reset(numPoints);
        attr.setIdentityMapping();
      }

      const outIt = new PointAttributeVectorOutputIterator(atts);
      if (!this._decodePoints(compressionLevel, totalDimensionality, numPoints, buffer, outIt)) {
        return false;
      }
    } else {
      // Invalid method.
      return false;
    }
    return true;
  }

  transformAttributesToOriginalFormat() {
    if (this._quantizedPortableAttributes.length === 0 &&
        this._minSignedValues.length === 0) {
      return true;
    }

    let numProcessedQuantizedAttributes = 0;
    let numProcessedSignedComponents = 0;

    // Dequantize attributes that needed it.
    for (let i = 0; i < this.getNumAttributes(); i++) {
      const attId = this.getAttributeId(i);
      const att = this.getDecoder().pointCloud().attribute(attId);

      if (att.dataType === DataType.INT32 || att.dataType === DataType.INT16 ||
          att.dataType === DataType.INT8) {
        // Values are stored as unsigned; make them signed again.
        if (!this._transformAttributeBackToSignedType(
              att, numProcessedSignedComponents)) {
          return false;
        }
        numProcessedSignedComponents += att.numComponents;
      } else if (att.dataType === DataType.FLOAT32) {
        const srcAtt = this._quantizedPortableAttributes[numProcessedQuantizedAttributes];
        const transform = this._attributeQuantizationTransforms[numProcessedQuantizedAttributes];
        numProcessedQuantizedAttributes++;

        if (this.getDecoder().options() &&
            this.getDecoder().options().getAttributeBool(
              att.attributeType, 'skip_attribute_transform', false)) {
          // Attribute transform should not be performed.
          att.copyFrom(srcAtt);
          continue;
        }

        // Convert all quantized values back to floats.
        const maxQuantizedValue = ((1 << transform.quantizationBits) >>> 0) - 1;
        const numComponents = att.numComponents;
        const entrySize = 4 * numComponents; // sizeof(float32) * numComponents
        const attVal = new Float32Array(numComponents);
        const attValBytes = new Uint8Array(attVal.buffer);
        let quantValId = 0;
        let outBytePos = 0;
        const dequantizer = new Dequantizer();
        if (!dequantizer.initFromRange(transform.range, maxQuantizedValue)) {
          return false;
        }

        const portableData = srcAtt.getAddress(0);
        const portableView = new DataView(
          portableData.buffer, portableData.byteOffset, portableData.byteLength
        );

        for (let j = 0; j < srcAtt.size; j++) {
          for (let c = 0; c < numComponents; c++) {
            let value = dequantizer.dequantizeFloat(
              portableView.getUint32(quantValId * 4, true)
            );
            quantValId++;
            value = value + transform.minValue(c);
            attVal[c] = value;
          }
          // Store the floating point value into the attribute buffer.
          att.buffer.write(outBytePos, attValBytes, entrySize);
          outBytePos += entrySize;
        }
      }
    }
    return true;
  }

  // Transforms unsigned attribute values back to their original signed type.
  _transformAttributeBackToSignedType(att, numProcessedSignedComponents) {
    const numComponents = att.numComponents;
    const dtLength = dataTypeLength(att.dataType);

    for (let avi = 0; avi < att.size; avi++) {
      // Read unsigned values.
      const bytePos = avi * att.byteStride;
      const rawData = att.getAddress(0).subarray(bytePos, bytePos + att.byteStride);
      const readView = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);

      // Compute signed values.
      let signedVals;
      if (att.dataType === DataType.INT32) {
        signedVals = new Int32Array(numComponents);
        for (let c = 0; c < numComponents; c++) {
          const unsignedVal = readView.getUint32(c * 4, true);
          if (unsignedVal > 0x7FFFFFFF) return false;
          signedVals[c] = unsignedVal + this._minSignedValues[numProcessedSignedComponents + c];
        }
      } else if (att.dataType === DataType.INT16) {
        signedVals = new Int16Array(numComponents);
        for (let c = 0; c < numComponents; c++) {
          const unsignedVal = readView.getUint16(c * 2, true);
          if (unsignedVal > 0x7FFFFFFF) return false;
          signedVals[c] = unsignedVal + this._minSignedValues[numProcessedSignedComponents + c];
        }
      } else if (att.dataType === DataType.INT8) {
        signedVals = new Int8Array(numComponents);
        for (let c = 0; c < numComponents; c++) {
          const unsignedVal = rawData[c];
          if (unsignedVal > 0x7FFFFFFF) return false;
          signedVals[c] = unsignedVal + this._minSignedValues[numProcessedSignedComponents + c];
        }
      } else {
        return false;
      }

      const signedBytes = new Uint8Array(signedVals.buffer);
      att.setAttributeValue(avi, signedBytes);
    }
    return true;
  }

  // Decodes points using the DynamicIntegerPointsKdTreeDecoder.
  // Delegates to an external decoder function since the KD-tree decoder
  // implementation is in the point_cloud/algorithms layer.
  _decodePoints(compressionLevel, totalDimensionality, numExpectedPoints, buffer, outIterator) {
    if (typeof KdTreeAttributesDecoder._kdTreeDecoderFn === 'function') {
      return KdTreeAttributesDecoder._kdTreeDecoderFn(
        compressionLevel, totalDimensionality, numExpectedPoints, buffer, outIterator
      );
    }
    // KD-tree decoder not available.
    return false;
  }

  // Static setter for the KD-tree point decoder function.
  // Expected signature: fn(compressionLevel, totalDimensionality, numExpectedPoints, buffer, outIterator)
  // The outIterator has .set(valArray) and .next() methods.
  static setKdTreeDecoderFn(fn) {
    KdTreeAttributesDecoder._kdTreeDecoderFn = fn;
  }

  // Static setter for the float points tree decoder function (backward compat).
  // Expected signature: fn(buffer, atts, numPoints)
  static setFloatPointsTreeDecoderFn(fn) {
    KdTreeAttributesDecoder._floatPointsTreeDecoderFn = fn;
  }

}

// Initialize static fields.
KdTreeAttributesDecoder._kdTreeDecoderFn = null;
KdTreeAttributesDecoder._floatPointsTreeDecoderFn = null;

export { KdTreeAttributesDecoder, KdTreeAttributesEncodingMethod, PointAttributeVectorOutputIterator };
