// attributes/AttributeTransform.js - ported from attributes/attribute_transform.h/cc

import { AttributeTransformData } from './AttributeTransformData.js';

class AttributeTransform {

  // Virtual: override in subclass.
  copyToAttributeTransformData(/* outData */) {
  }

  transferToAttribute(attribute) {
    const transformData = new AttributeTransformData();
    this.copyToAttributeTransformData(transformData);
    attribute.setAttributeTransformData(transformData);
    return true;
  }

  // Virtual: override in subclass.
  inverseTransformAttribute(/* attribute, targetAttribute */) {
    return false;
  }

  // Virtual: override in subclass.
  decodeParameters(/* attribute, decoderBuffer */) {
    return false;
  }

}

export { AttributeTransform };
