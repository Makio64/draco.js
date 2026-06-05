// compression/attributes/SequentialIntegerAttributeDecoder.js - ported from compression/attributes/sequential_integer_attribute_decoder.h/cc

import { SequentialAttributeDecoder } from './SequentialAttributeDecoder.js';
import { GeometryAttribute } from '../../attributes/GeometryAttribute.js';
import { PointAttribute } from '../../attributes/PointAttribute.js';
import { DataType, dataTypeLength } from '../../core/DracoTypes.js';
import { convertSymbolsToSignedInts } from '../../core/BitUtils.js';
import { DRACO_BITSTREAM_VERSION, PredictionSchemeMethod, PredictionSchemeTransformType } from '../config/CompressionShared.js';
import { decodeSymbols } from '../entropy/SymbolDecoding.js';
import { createPredictionSchemeForDecoder } from './prediction_schemes/PredictionSchemeDecoderFactory.js';
import { PredictionSchemeWrapDecodingTransform } from './prediction_schemes/PredictionSchemeWrapDecodingTransform.js';

// Decoder for attributes encoded with the SequentialIntegerAttributeEncoder.
class SequentialIntegerAttributeDecoder extends SequentialAttributeDecoder {

  constructor() {
    super();
    this._predictionScheme = null;
  }

  transformAttributeToOriginalFormat(pointIds) {
    if (this.decoder &&
        this.decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 0)) {
      return true; // Don't revert the transform here for older files.
    }
    return this._storeValues(pointIds.length);
  }

  decodeValues(pointIds, buffer) {
    // Decode prediction scheme.
    const predictionSchemeMethod = buffer.decodeInt8();
    if (predictionSchemeMethod === undefined) return false;

    // Check that decoded prediction scheme method type is valid.
    if (predictionSchemeMethod < PredictionSchemeMethod.PREDICTION_NONE ||
        predictionSchemeMethod >= PredictionSchemeMethod.NUM_PREDICTION_SCHEMES) {
      return false;
    }

    if (predictionSchemeMethod !== PredictionSchemeMethod.PREDICTION_NONE) {
      const predictionTransformType = buffer.decodeInt8();
      if (predictionTransformType === undefined) return false;

      // Check that decoded prediction scheme transform type is valid.
      if (predictionTransformType < PredictionSchemeTransformType.PREDICTION_TRANSFORM_NONE ||
          predictionTransformType >= PredictionSchemeTransformType.NUM_PREDICTION_SCHEME_TRANSFORM_TYPES) {
        return false;
      }

      this._predictionScheme = this.createIntPredictionScheme(
        predictionSchemeMethod, predictionTransformType
      );
    }

    if (this._predictionScheme) {
      if (!this.initPredictionScheme(this._predictionScheme)) {
        return false;
      }
    }

    if (!this.decodeIntegerValues(pointIds, buffer)) {
      return false;
    }

    if (this.decoder &&
        this.decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 0)) {
      // For older files, revert the transform right after we decode the data.
      if (!this._storeValues(pointIds.length)) {
        return false;
      }
    }
    return true;
  }

  decodeIntegerValues(pointIds, buffer) {
    const numComponents = this.getNumValueComponents();
    if (numComponents <= 0) {
      return false;
    }
    const numEntries = pointIds.length;
    const numValues = numEntries * numComponents;
    this.preparePortableAttribute(numEntries, numComponents);
    const portableAttributeData = this.getPortableAttributeData();
    if (portableAttributeData === null) {
      return false;
    }

    const compressed = buffer.decodeUint8();
    if (compressed === undefined) return false;

    if (compressed > 0) {
      // Decode compressed values using symbol decoding.
      // DecodeSymbols writes uint32 values into the provided array.
      const outUint32 = new Uint32Array(portableAttributeData.buffer,
        portableAttributeData.byteOffset, numValues);
      if (!decodeSymbols(numValues, numComponents, buffer, outUint32)) {
        return false;
      }
    } else {
      // Decode the integer data directly.
      const numBytes = buffer.decodeUint8();
      if (numBytes === undefined) return false;

      if (numBytes === dataTypeLength(DataType.INT32)) {
        // 4 bytes per value - decode directly.
        if (portableAttributeData.byteLength < 4 * numValues) {
          return false;
        }
        const bytes = buffer.decodeBytes(4 * numValues);
        if (bytes === undefined) return false;
        const srcView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let i = 0; i < numValues; i++) {
          portableAttributeData[i] = srcView.getInt32(i * 4, true);
        }
      } else {
        if (buffer.remainingSize < numBytes * numValues) {
          return false;
        }
        for (let i = 0; i < numValues; i++) {
          const valueBytes = buffer.decodeBytes(numBytes);
          if (valueBytes === undefined) return false;
          // Read the value from the raw bytes (little-endian), sign-extending.
          let val = 0;
          for (let b = 0; b < numBytes; b++) {
            val |= valueBytes[b] << (b * 8);
          }
          portableAttributeData[i] = val;
        }
      }
    }

    if (numValues > 0 && (this._predictionScheme === null ||
                          !this._predictionScheme.areCorrectionsPositive())) {
      // Convert the values back to the original signed format.
      // portableAttributeData is Int32Array; we need to interpret as Uint32 for conversion.
      const asUint32 = new Uint32Array(portableAttributeData.buffer, portableAttributeData.byteOffset, numValues);
      convertSymbolsToSignedInts(asUint32, numValues, portableAttributeData);
    }

    // If the data was encoded with a prediction scheme, we must revert it.
    if (this._predictionScheme) {
      if (!this._predictionScheme.decodePredictionData(buffer)) {
        return false;
      }
      if (numValues > 0) {
        if (!this._predictionScheme.computeOriginalValues(
              portableAttributeData, portableAttributeData,
              numValues, numComponents, pointIds)) {
          return false;
        }
      }
    }
    return true;
  }

  // Returns a prediction scheme that should be used for decoding of the
  // integer values. Override in subclasses for different prediction schemes.
  createIntPredictionScheme(method, transformType) {
    if (transformType !== PredictionSchemeTransformType.PREDICTION_TRANSFORM_WRAP) {
      return null; // For now we support only wrap transform.
    }
    const transform = new PredictionSchemeWrapDecodingTransform();
    return createPredictionSchemeForDecoder(
      method, this.attributeId, this.decoder, transform
    );
  }

  // Returns the number of integer attribute components.
  getNumValueComponents() {
    return this.attribute.numComponents;
  }

  // Called after all integer values are decoded. Stores values into the attribute.
  _storeValues(numValues) {
    const dt = this.attribute.dataType;
    switch (dt) {
      case DataType.UINT8:
        this._storeTypedValues(numValues, Uint8Array);
        break;
      case DataType.INT8:
        this._storeTypedValues(numValues, Int8Array);
        break;
      case DataType.UINT16:
        this._storeTypedValues(numValues, Uint16Array);
        break;
      case DataType.INT16:
        this._storeTypedValues(numValues, Int16Array);
        break;
      case DataType.UINT32:
        this._storeTypedValues(numValues, Uint32Array);
        break;
      case DataType.INT32:
        this._storeTypedValues(numValues, Int32Array);
        break;
      default:
        return false;
    }
    return true;
  }

  _storeTypedValues(numValues, TypedArrayClass) {
    const numComponents = this.attribute.numComponents;
    const total = numValues * numComponents;
    if (total === 0) {
      return;
    }
    const src = this.getPortableAttributeData(); // Int32Array of the decoded values.
    // Copy straight into a typed view of the destination buffer (byteOffset 0,
    // so aligned). TypedArray.set performs the target type's coercion per
    // element -- identical to the old per-entry byte copy, without the
    // per-value buffer.write() dispatch.
    const dstAddr = this.attribute.getAddress(0);
    const dst = new TypedArrayClass(dstAddr.buffer, dstAddr.byteOffset, total);
    dst.set(src);
  }

  preparePortableAttribute(numEntries, numComponents) {
    const ga = new GeometryAttribute();
    ga.init(
      this.attribute.attributeType, null, numComponents, DataType.INT32,
      false, numComponents * dataTypeLength(DataType.INT32), 0
    );
    const portAtt = new PointAttribute(ga);
    portAtt.setIdentityMapping();
    portAtt.reset(numEntries);
    portAtt.uniqueId = this.attribute.uniqueId;
    this.setPortableAttribute(portAtt);
  }

  getPortableAttributeData() {
    if (this.portableAttribute.size === 0) {
      return null;
    }
    // Return Int32Array view of the portable attribute data.
    const addr = this.portableAttribute.getAddress(0);
    return new Int32Array(addr.buffer, addr.byteOffset,
      this.portableAttribute.size * this.portableAttribute.numComponents);
  }

}

export { SequentialIntegerAttributeDecoder };
