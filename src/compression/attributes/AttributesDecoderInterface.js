// compression/attributes/AttributesDecoderInterface.js - ported from compression/attributes/attributes_decoder_interface.h

// Abstract interface used by PointCloudDecoder; methods must be overridden.
class AttributesDecoderInterface {

  constructor() {
  }

  init(decoder, pointCloud) {
    return false;
  }

  decodeAttributesDecoderData(buffer) {
    return false;
  }

  decodeAttributes(buffer) {
    return false;
  }

  getAttributeId(i) {
    return -1;
  }

  getNumAttributes() {
    return 0;
  }

  getDecoder() {
    return null;
  }

  // Attribute data in portable (post-transform) format; identical on encoder
  // and decoder, so usable by predictors.
  getPortableAttribute(pointAttributeId) {
    return null;
  }

}

export { AttributesDecoderInterface };
