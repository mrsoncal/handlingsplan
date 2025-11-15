// Disabled LAN/P2P feature: no-op implementation to keep imports intact.
export class LiveSync {
  constructor(opts = {}) {
    this.onMessage = opts.onMessage || (() => {});
    this.closed = false;
  }
  async createOffer() { return ''; }
  async acceptAnswer(_answer) { return; }
  send(_msg) { return; }
  close() { this.closed = true; }
}
