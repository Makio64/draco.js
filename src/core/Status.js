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

export class Status {

  constructor(code = StatusCode.OK, errorMsg = '') {
    this.code = code;
    this.errorMsg = errorMsg;
  }

  ok() {
    return this.code === StatusCode.OK;
  }

}

export function okStatus() {
  return new Status(StatusCode.OK);
}
