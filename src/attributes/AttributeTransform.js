// attributes/AttributeTransform.js - ported from attributes/attribute_transform.h/cc

import { GeometryAttribute } from './GeometryAttribute.js';
import { PointAttribute } from './PointAttribute.js';
import { AttributeTransformData } from './AttributeTransformData.js';
import { dataTypeLength } from '../core/DracoTypes.js';

class AttributeTransform {

  // Virtual: return the attribute transform type.
  type() {
    return -1; // INVALID, must be overridden
  }

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

  // Virtual: applies the transform to attribute, stores result in targetAttribute.
  transformAttribute(/* attribute, pointIds, targetAttribute */) {
    return false;
  }

  // Virtual: applies an inverse transform to attribute.
  inverseTransformAttribute(/* attribute, targetAttribute */) {
    return false;
  }

  // Virtual: decodes all data needed to transform attribute back to original format.
  decodeParameters(/* attribute, decoderBuffer */) {
    return false;
  }

  // Virtual: returns the data type of the transformed attribute.
  getTransformedDataType(/* attribute */) {
    return -1;
  }

  // Virtual: returns the number of components of the transformed attribute.
  getTransformedNumComponents(/* attribute */) {
    return -1;
  }

  // Initializes a transformed attribute that can be used as target in
  // inverseTransformAttribute().
  initTransformedAttribute(srcAttribute, numEntries) {
    const numComponents = this.getTransformedNumComponents(srcAttribute);
    const dt = this.getTransformedDataType(srcAttribute);
    const ga = new GeometryAttribute();
    ga.init(
      srcAttribute.attributeType, null, numComponents, dt, false,
      numComponents * dataTypeLength(dt), 0
    );
    const transformedAttribute = new PointAttribute(ga);
    transformedAttribute.reset(numEntries);
    transformedAttribute.setIdentityMapping();
    transformedAttribute.uniqueId = srcAttribute.uniqueId;
    return transformedAttribute;
  }

}

export { AttributeTransform };
