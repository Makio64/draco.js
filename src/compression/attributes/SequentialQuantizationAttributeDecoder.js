// compression/attributes/SequentialQuantizationAttributeDecoder.js - ported from compression/attributes/sequential_quantization_attribute_decoder.h/cc

import { SequentialIntegerAttributeDecoder } from './SequentialIntegerAttributeDecoder.js';
import { AttributeQuantizationTransform } from '../../attributes/AttributeQuantizationTransform.js';
import { DataType } from '../../core/DracoTypes.js';
import { DRACO_BITSTREAM_VERSION } from '../config/CompressionShared.js';

// Decoder for attribute values encoded with the
// SequentialQuantizationAttributeEncoder.
class SequentialQuantizationAttributeDecoder extends SequentialIntegerAttributeDecoder {

  constructor() {
    super();
    this._quantizationTransform = new AttributeQuantizationTransform();
  }

  init(decoder, attributeId) {
    if (!super.init(decoder, attributeId)) {
      return false;
    }
    const attribute = decoder.pointCloud().attribute(attributeId);
    // Currently we can quantize only floating point arguments.
    if (attribute.dataType !== DataType.FLOAT32) {
      return false;
    }
    return true;
  }

  decodeIntegerValues(pointIds, buffer) {
    if (this.decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 0) &&
        !this._decodeQuantizedDataInfo()) {
      return false;
    }
    return super.decodeIntegerValues(pointIds, buffer);
  }

  decodeDataNeededByPortableTransform(pointIds, buffer) {
    if (this.decoder.bitstreamVersion() >= DRACO_BITSTREAM_VERSION(2, 0)) {
      // Decode quantization data here only for files with bitstream version 2.0+
      if (!this._decodeQuantizedDataInfo()) {
        return false;
      }
    }

    // Store the decoded transform data in portable attribute.
    return this._quantizationTransform.transferToAttribute(this.portableAttribute);
  }

  // Override: instead of generic integer store, dequantize the values.
  _storeValues(numPoints) {
    return this._dequantizeValues(numPoints);
  }

  _decodeQuantizedDataInfo() {
    // Get attribute used as source for decoding.
    let att = this.getPortableAttribute();
    if (att === null) {
      // This should happen only in the backward compatibility mode.
      att = this.attribute;
    }
    return this._quantizationTransform.decodeParameters(att, this.decoder.buffer());
  }

  _dequantizeValues(numValues) {
    // Convert all quantized values back to floats.
    return this._quantizationTransform.inverseTransformAttribute(
      this.getPortableAttribute(), this.attribute
    );
  }

}

export { SequentialQuantizationAttributeDecoder };
