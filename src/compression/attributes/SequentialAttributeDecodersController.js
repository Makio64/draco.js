// compression/attributes/SequentialAttributeDecodersController.js - ported from compression/attributes/sequential_attribute_decoders_controller.h/cc

import { AttributesDecoder } from './AttributesDecoder.js';
import { SequentialAttributeDecoder } from './SequentialAttributeDecoder.js';
import { SequentialIntegerAttributeDecoder } from './SequentialIntegerAttributeDecoder.js';
import { SequentialQuantizationAttributeDecoder } from './SequentialQuantizationAttributeDecoder.js';
import { SequentialNormalAttributeDecoder } from './SequentialNormalAttributeDecoder.js';
import { SequentialAttributeEncoderType } from '../config/CompressionShared.js';

// A basic implementation of an attribute decoder that decodes data encoded by
// the SequentialAttributeEncodersController class. Creates a single
// SequentialAttributeDecoder for each of the decoded attributes, where the
// type of the decoder is determined by the unique identifier encoded by the encoder.
class SequentialAttributeDecodersController extends AttributesDecoder {

  constructor(sequencer) {
    super();
    this._sequentialDecoders = [];
    this._pointIds = [];
    this._sequencer = sequencer;
  }

  decodeAttributesDecoderData(buffer) {
    if (!super.decodeAttributesDecoderData(buffer)) {
      return false;
    }
    // Decode unique ids of all sequential encoders and create them.
    const numAttributes = this.getNumAttributes();
    this._sequentialDecoders.length = numAttributes;
    for (let i = 0; i < numAttributes; i++) {
      const decoderType = buffer.decodeUint8();
      if (decoderType === undefined) return false;

      // Create the decoder from the id.
      this._sequentialDecoders[i] = this.createSequentialDecoder(decoderType);
      if (!this._sequentialDecoders[i]) {
        return false;
      }
      if (!this._sequentialDecoders[i].init(this.getDecoder(), this.getAttributeId(i))) {
        return false;
      }
    }
    return true;
  }

  decodeAttributes(buffer) {
    if (!this._sequencer) {
      return false;
    }
    if (!this._sequencer.generateSequence(this._pointIds)) {
      return false;
    }
    this._pointIds = this._sequencer.getOutputPointIds();

    const numAttributes = this.getNumAttributes();
    for (let i = 0; i < numAttributes; i++) {
      const pa = this.getDecoder().pointCloud().attribute(this.getAttributeId(i));
      if (!this._sequencer.updatePointToAttributeIndexMapping(pa)) {
        return false;
      }
    }
    return super.decodeAttributes(buffer);
  }

  getPortableAttribute(pointAttributeId) {
    const locId = this.getLocalIdForPointAttribute(pointAttributeId);
    if (locId < 0) {
      return null;
    }
    return this._sequentialDecoders[locId].getPortableAttribute();
  }

  decodePortableAttributes(buffer) {
    const numAttributes = this.getNumAttributes();
    for (let i = 0; i < numAttributes; i++) {
      if (!this._sequentialDecoders[i].decodePortableAttribute(
            this._pointIds, buffer)) {
        return false;
      }
    }
    return true;
  }

  decodeDataNeededByPortableTransforms(buffer) {
    const numAttributes = this.getNumAttributes();
    for (let i = 0; i < numAttributes; i++) {
      if (!this._sequentialDecoders[i].decodeDataNeededByPortableTransform(
            this._pointIds, buffer)) {
        return false;
      }
    }
    return true;
  }

  transformAttributesToOriginalFormat() {
    const numAttributes = this.getNumAttributes();
    for (let i = 0; i < numAttributes; i++) {
      // Check whether the attribute transform should be skipped.
      if (this.getDecoder().options()) {
        const attribute = this._sequentialDecoders[i].attribute;
        const portableAttribute = this._sequentialDecoders[i].getPortableAttribute();
        if (portableAttribute &&
            this.getDecoder().options().getAttributeBool(
              attribute.attributeType, 'skip_attribute_transform', false)) {
          // Attribute transform should not be performed. In this case, we replace
          // the output geometry attribute with the portable attribute.
          this._sequentialDecoders[i].attribute.copyFrom(portableAttribute);
          continue;
        }
      }
      if (!this._sequentialDecoders[i].transformAttributeToOriginalFormat(
            this._pointIds)) {
        return false;
      }
    }
    return true;
  }

  createSequentialDecoder(decoderType) {
    switch (decoderType) {
      case SequentialAttributeEncoderType.SEQUENTIAL_ATTRIBUTE_ENCODER_GENERIC:
        return new SequentialAttributeDecoder();

      case SequentialAttributeEncoderType.SEQUENTIAL_ATTRIBUTE_ENCODER_INTEGER:
        return new SequentialIntegerAttributeDecoder();

      case SequentialAttributeEncoderType.SEQUENTIAL_ATTRIBUTE_ENCODER_QUANTIZATION:
        return new SequentialQuantizationAttributeDecoder();

      case SequentialAttributeEncoderType.SEQUENTIAL_ATTRIBUTE_ENCODER_NORMALS:
        return new SequentialNormalAttributeDecoder();

      default:
        break;
    }
    // Unknown or unsupported decoder type.
    return null;
  }

}

export { SequentialAttributeDecodersController };
