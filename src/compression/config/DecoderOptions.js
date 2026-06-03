// compression/config/DecoderOptions.js - ported from compression/config/decoder_options.h

// In C++, DecoderOptions is a typedef of DracoOptions<GeometryAttribute::Type>.
// In JavaScript, we simply re-export DracoOptions since attribute keys are just
// integers (GeometryAttribute.Type values) and Map handles them natively.

import { DracoOptions } from './DracoOptions.js';

export class DecoderOptions extends DracoOptions {

  constructor() {
    super();
  }

}
