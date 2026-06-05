// attributes/AttributeTransform.js - ported from attributes/attribute_transform.h/cc

import { AttributeTransformData } from './AttributeTransformData.js';

class AttributeTransform {

  // Virtual: try to init transform from attribute.
  initFromAttribute(/* attribute */) {
    return false;
  }

  // Virtual: copy parameter values into the provided AttributeTransformData.
  copyToAttributeTransformData(/* outData */) {
    // Must be overridden.
  }

  // Transfers transform data to the attribute.
  transferToAttribute(attribute) {
    const transformData = new AttributeTransformData();
    this.copyToAttributeTransformData(transformData);
    attribute.setAttributeTransformData(transformData);
    return true;
  }

  // Virtual: applies an inverse transform to attribute.
  inverseTransformAttribute(/* attribute, targetAttribute */) {
    return false;
  }

  // Virtual: decodes all data needed to transform attribute back to original format.
  decodeParameters(/* attribute, decoderBuffer */) {
    return false;
  }

}

export { AttributeTransform };
