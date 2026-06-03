// compression/attributes/SequentialNormalAttributeDecoder.js - ported from compression/attributes/sequential_normal_attribute_decoder.h/cc

import { SequentialIntegerAttributeDecoder } from './SequentialIntegerAttributeDecoder.js';
import { AttributeOctahedronTransform } from '../../attributes/AttributeOctahedronTransform.js';
import { DataType } from '../../core/DracoTypes.js';
import {
  DRACO_BITSTREAM_VERSION,
  PredictionSchemeTransformType
} from '../config/CompressionShared.js';
import { createPredictionSchemeForDecoder } from './prediction_schemes/PredictionSchemeDecoderFactory.js';
import { PredictionSchemeNormalOctahedronCanonicalizedDecodingTransform } from './prediction_schemes/PredictionSchemeNormalOctahedronCanonicalizedDecodingTransform.js';
import { PredictionSchemeNormalOctahedronDecodingTransform } from './prediction_schemes/PredictionSchemeNormalOctahedronDecodingTransform.js';

// Decoder for attributes encoded with SequentialNormalAttributeEncoder.
class SequentialNormalAttributeDecoder extends SequentialIntegerAttributeDecoder {

  constructor() {
    super();
    this._octahedralTransform = new AttributeOctahedronTransform();
  }

  init(decoder, attributeId) {
    if (!super.init(decoder, attributeId)) {
      return false;
    }
    // Currently, this decoder works only for 3-component normal vectors.
    if (this.attribute.numComponents !== 3) {
      return false;
    }
    // Also the data type must be DT_FLOAT32.
    if (this.attribute.dataType !== DataType.FLOAT32) {
      return false;
    }
    return true;
  }

  // We quantize everything into two components.
  getNumValueComponents() {
    return 2;
  }

  decodeIntegerValues(pointIds, buffer) {
    if (this.decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 0)) {
      // Note: in older bitstreams, we do not have a portableAttribute decoded
      // at this stage so we cannot pass it down to the decodeParameters() call.
      if (!this._octahedralTransform.decodeParameters(this.attribute, buffer)) {
        return false;
      }
    }
    return super.decodeIntegerValues(pointIds, buffer);
  }

  decodeDataNeededByPortableTransform(pointIds, buffer) {
    if (this.decoder.bitstreamVersion() >= DRACO_BITSTREAM_VERSION(2, 0)) {
      // For newer file version, decode attribute transform data here.
      if (!this._octahedralTransform.decodeParameters(
            this.getPortableAttribute(), buffer)) {
        return false;
      }
    }

    // Store the decoded transform data in portable attribute.
    return this._octahedralTransform.transferToAttribute(this.portableAttribute);
  }

  // Override: convert quantized values back to float normals.
  _storeValues(numPoints) {
    return this._octahedralTransform.inverseTransformAttribute(
      this.getPortableAttribute(), this.attribute
    );
  }

  // Override: create prediction scheme for normal octahedral transforms.
  createIntPredictionScheme(method, transformType) {
    switch (transformType) {
      case PredictionSchemeTransformType.PREDICTION_TRANSFORM_NORMAL_OCTAHEDRON: {
        const transform = new PredictionSchemeNormalOctahedronDecodingTransform();
        return createPredictionSchemeForDecoder(
          method, this.attributeId, this.decoder, transform
        );
      }
      case PredictionSchemeTransformType.PREDICTION_TRANSFORM_NORMAL_OCTAHEDRON_CANONICALIZED: {
        const transform = new PredictionSchemeNormalOctahedronCanonicalizedDecodingTransform();
        return createPredictionSchemeForDecoder(
          method, this.attributeId, this.decoder, transform
        );
      }
      default:
        return null;
    }
  }

}

export { SequentialNormalAttributeDecoder };
