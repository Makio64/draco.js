// compression/point_cloud/PointCloudSequentialDecoder.js - ported from point_cloud/point_cloud_sequential_decoder.h/cc

import { PointCloudDecoder } from './PointCloudDecoder.js';

// Point cloud decoder for data encoded by the PointCloudSequentialEncoder.
// All attribute values are decoded using an identity mapping between point ids
// and attribute value ids.
class PointCloudSequentialDecoder extends PointCloudDecoder {

  decodeGeometryData() {
    const numPoints = this.buffer().decodeInt32();
    if (numPoints === undefined) {
      return false;
    }
    this.pointCloud().setNumPoints(numPoints);
    return true;
  }

  createAttributesDecoder(attDecoderId) {
    // Always create the basic attribute decoder.
    // The SequentialAttributeDecodersController with a LinearSequencer
    // would be instantiated here. This is a placeholder that matches
    // the C++ structure - actual implementation depends on the
    // SequentialAttributeDecodersController and LinearSequencer modules.
    //
    // return this.setAttributesDecoder(
    //   attDecoderId,
    //   new SequentialAttributeDecodersController(
    //     new LinearSequencer(this.pointCloud().numPoints())
    //   )
    // );
    //
    // For now, return false to indicate the dependent modules are needed.
    return false;
  }

}

export { PointCloudSequentialDecoder };
