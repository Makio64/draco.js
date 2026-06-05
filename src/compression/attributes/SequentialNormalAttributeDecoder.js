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
    // Only 3-component FLOAT32 normals are supported.
    if (this.attribute.numComponents !== 3) {
      return false;
    }
    if (this.attribute.dataType !== DataType.FLOAT32) {
      return false;
    }
    return true;
  }

  // Normals quantize into two octahedral components.
  getNumValueComponents() {
    return 2;
  }

  decodeIntegerValues(pointIds, buffer) {
    if (this.decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 0)) {
      // Older bitstreams have no portableAttribute decoded yet, so we pass the
      // raw attribute to decodeParameters() instead.
      if (!this._octahedralTransform.decodeParameters(this.attribute, buffer)) {
        return false;
      }
    }
    return super.decodeIntegerValues(pointIds, buffer);
  }

  decodeDataNeededByPortableTransform(pointIds, buffer) {
    if (this.decoder.bitstreamVersion() >= DRACO_BITSTREAM_VERSION(2, 0)) {
      if (!this._octahedralTransform.decodeParameters(
            this.getPortableAttribute(), buffer)) {
        return false;
      }
    }

    return this._octahedralTransform.transferToAttribute(this.portableAttribute);
  }

  _storeValues(numPoints) {
    return this._octahedralTransform.inverseTransformAttribute(
      this.getPortableAttribute(), this.attribute
    );
  }

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
