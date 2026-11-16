// Identity changes invalidate all asynchronous UI work, including QR generation.
// This module contains no tokens, roles, or authorization decisions.
export function createSessionGate() {
  let identity = null;
  let known = false;
  let version = 0;
  return {
    get version(){return version;},
    get identity(){return identity;},
    apply(nextIdentity) {
      if (known && nextIdentity === identity) return false;
      known = true;identity = nextIdentity;version++;return true;
    },
    invalidate(){version++;},
    isCurrent(value){return version === value;},
  };
}
