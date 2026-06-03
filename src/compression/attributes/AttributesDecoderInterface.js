// compression/attributes/AttributesDecoderInterface.js - ported from compression/attributes/attributes_decoder_interface.h

// Interface class for decoding one or more attributes that were encoded with a
// matching AttributesEncoder. It provides only the basic interface
// that is used by the PointCloudDecoder. The actual decoding must be
// implemented in derived classes using the decodeAttributes() method.
class AttributesDecoderInterface {

  constructor() {
    // Abstract interface - no state.
  }

  // Called after all attribute decoders are created. It can be used to perform
  // any custom initialization.
  init(decoder, pointCloud) {
    return false; // Must be overridden.
  }

  // Decodes any attribute decoder specific data from the buffer.
  decodeAttributesDecoderData(buffer) {
    return false; // Must be overridden.
  }

  // Decode attribute data from the source buffer. Needs to be implemented by
  // the derived classes.
  decodeAttributes(buffer) {
    return false; // Must be overridden.
  }

  getAttributeId(i) {
    return -1; // Must be overridden.
  }

  getNumAttributes() {
    return 0; // Must be overridden.
  }

  getDecoder() {
    return null; // Must be overridden.
  }

  // Returns an attribute containing data processed by the attribute transform.
  // (see transformToPortableFormat() method). This data is guaranteed to be
  // same for encoder and decoder and it can be used by predictors.
  getPortableAttribute(pointAttributeId) {
    return null;
  }

}

export { AttributesDecoderInterface };
