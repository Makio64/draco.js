// compression/point_cloud/PointCloudKdTreeDecoder.js - ported from point_cloud/point_cloud_kd_tree_decoder.h/cc

import { PointCloudDecoder } from './PointCloudDecoder.js';

// Decodes PointCloud encoded with the PointCloudKdTreeEncoder.
class PointCloudKdTreeDecoder extends PointCloudDecoder {

  decodeGeometryData() {
    const numPoints = this.buffer().decodeInt32();
    if (numPoints === undefined) {
      return false;
    }
    if (numPoints < 0) {
      return false;
    }
    this.pointCloud().setNumPoints(numPoints);
    return true;
  }

  createAttributesDecoder(attDecoderId) {
    // Always create the basic attribute decoder using a KdTreeAttributesDecoder.
    // The actual KdTreeAttributesDecoder module would be needed here.
    //
    // return this.setAttributesDecoder(
    //   attDecoderId,
    //   new KdTreeAttributesDecoder()
    // );
    //
    // For now, return false to indicate the dependent module is needed.
    return false;
  }

}

export { PointCloudKdTreeDecoder };
