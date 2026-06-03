// core/Status.js - ported from status.h/cc

export const StatusCode = {
  OK: 0,
  DRACO_ERROR: -1,
  IO_ERROR: -2,
  INVALID_PARAMETER: -3,
  UNSUPPORTED_VERSION: -4,
  UNKNOWN_VERSION: -5,
  UNSUPPORTED_FEATURE: -6
};

const CODE_STRINGS = {
  [StatusCode.OK]: 'OK',
  [StatusCode.DRACO_ERROR]: 'DRACO_ERROR',
  [StatusCode.IO_ERROR]: 'IO_ERROR',
  [StatusCode.INVALID_PARAMETER]: 'INVALID_PARAMETER',
  [StatusCode.UNSUPPORTED_VERSION]: 'UNSUPPORTED_VERSION',
  [StatusCode.UNKNOWN_VERSION]: 'UNKNOWN_VERSION',
  [StatusCode.UNSUPPORTED_FEATURE]: 'UNSUPPORTED_FEATURE'
};

export class Status {

  constructor(code = StatusCode.OK, errorMsg = '') {
    this.code = code;
    this.errorMsg = errorMsg;
  }

  ok() {
    return this.code === StatusCode.OK;
  }

  codeString() {
    return CODE_STRINGS[this.code] || 'UNKNOWN_STATUS_VALUE';
  }

  toString() {
    if (this.errorMsg) {
      return this.codeString() + ': ' + this.errorMsg;
    }
    return this.codeString();
  }

}

export function okStatus() {
  return new Status(StatusCode.OK);
}
