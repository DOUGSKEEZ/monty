/**
 * IMusicService - Interface for Music service implementations
 * 
 * Defines the required methods for any Music service implementation.
 * This provides a contract that different implementations must follow.
 */

// backend/src/interfaces/IMusicService.js
class IMusicService {
  // Define interface methods (to be implemented by MusicService)
  async initialize() {
    throw new Error('Method not implemented');
  }

  async healthCheck() {
    throw new Error('Method not implemented');
  }

  async recoveryProcedure(serviceName, attemptNumber) {
    throw new Error('Method not implemented');
  }

  async checkBluetoothSystemStatus() {
    throw new Error('Method not implemented');
  }

  async ensureConfigDir() {
    throw new Error('Method not implemented');
  }

  async checkPianobarStatus(silent) {
    throw new Error('Method not implemented');
  }

  async cleanupOrphanedProcesses(force, silent) {
    throw new Error('Method not implemented');
  }

  setupStatusFileWatcher() {
    throw new Error('Method not implemented');
  }

  async connectBluetooth(checkInitNeeded) {
    throw new Error('Method not implemented');
  }

  async fallbackBluetoothConnect() {
    throw new Error('Method not implemented');
  }

  async disconnectBluetooth() {
    throw new Error('Method not implemented');
  }

  async startPianobar(connectBluetooth, silent, checkBluetoothInit) {
    throw new Error('Method not implemented');
  }

  async stopPianobar(disconnectBluetooth, silent) {
    throw new Error('Method not implemented');
  }

  async play() {
    throw new Error('Method not implemented');
  }

  async pause() {
    throw new Error('Method not implemented');
  }

  async next() {
    throw new Error('Method not implemented');
  }

  async love() {
    throw new Error('Method not implemented');
  }

  async selectStation(stationId) {
    throw new Error('Method not implemented');
  }

  async sendCommand(command, silent) {
    throw new Error('Method not implemented');
  }

  async getStatus(silent) {
    throw new Error('Method not implemented');
  }

  async getStations(silent) {
    throw new Error('Method not implemented');
  }

  async getMockStations(silent) {
    throw new Error('Method not implemented');
  }

  async createEventCommandScript() {
    throw new Error('Method not implemented');
  }

  saveStatus(status) {
    throw new Error('Method not implemented');
  }

  // Static method to verify implementation
  static verifyImplementation(instance, serviceName) {
    const requiredMethods = [
      'initialize',
      'healthCheck',
      'recoveryProcedure',
      'checkBluetoothSystemStatus',
      'ensureConfigDir',
      'checkPianobarStatus',
      'cleanupOrphanedProcesses',
      'setupStatusFileWatcher',
      'connectBluetooth',
      'fallbackBluetoothConnect',
      'disconnectBluetooth',
      'startPianobar',
      'stopPianobar',
      'play',
      'pause',
      'next',
      'love',
      'selectStation',
      'sendCommand',
      'getStatus',
      'getStations',
      'getMockStations',
      'createEventCommandScript',
      'saveStatus'
    ];

    for (const method of requiredMethods) {
      if (typeof instance[method] !== 'function') {
        throw new Error(`${serviceName} does not implement ${method} as required by IMusicService`);
      }
    }
  }
}

module.exports = IMusicService;