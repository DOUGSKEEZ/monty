/**
 * IPianobarService - Interface for Pianobar service implementations
 * 
 * Defines the required methods for any Pianobar service implementation.
 * This provides a contract that different implementations must follow.
 */

// backend/src/interfaces/IPianobarService.js
class IPianobarService {
  /**
   * Initialize the pianobar service
   * @returns {Promise<Object>} Result of initialization
   */
  async initialize() {
    throw new Error('Method not implemented');
  }

  /**
   * Health check for the service
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    throw new Error('Method not implemented');
  }

  /**
   * Recovery procedure for when service is detected as unhealthy
   * @param {string} serviceName - Name of the service being recovered
   * @param {number} attemptNumber - Number of recovery attempts so far
   * @returns {Promise<Object>} Result of recovery attempt
   */
  async recoveryProcedure(serviceName, attemptNumber) {
    throw new Error('Method not implemented');
  }

  /**
   * Ensure configuration directory exists with required files
   * @returns {Promise<boolean>} True if successful
   */
  async ensureConfigDir() {
    throw new Error('Method not implemented');
  }

  /**
   * Check if pianobar is running
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<boolean>} True if pianobar is running
   */
  async checkPianobarStatus(silent) {
    throw new Error('Method not implemented');
  }

  /**
   * Clean up orphaned pianobar processes
   * @param {boolean} force - Force cleanup even if not many processes are running
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<boolean>} True if successful
   */
  async cleanupOrphanedProcesses(force, silent) {
    throw new Error('Method not implemented');
  }

  /**
   * Set up a watcher for the status file
   * @returns {void}
   */
  setupStatusFileWatcher() {
    throw new Error('Method not implemented');
  }

  /**
   * Start pianobar
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} Result of start operation
   */
  async startPianobar(silent) {
    throw new Error('Method not implemented');
  }

  /**
   * Stop pianobar
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} Result of stop operation
   */
  async stopPianobar(silent) {
    throw new Error('Method not implemented');
  }

  /**
   * Play current station
   * @returns {Promise<Object>} Result of operation
   */
  async play() {
    throw new Error('Method not implemented');
  }

  /**
   * Pause playback
   * @returns {Promise<Object>} Result of operation
   */
  async pause() {
    throw new Error('Method not implemented');
  }

  /**
   * Skip to next song
   * @returns {Promise<Object>} Result of operation
   */
  async next() {
    throw new Error('Method not implemented');
  }

  /**
   * Love current song
   * @returns {Promise<Object>} Result of operation
   */
  async love() {
    throw new Error('Method not implemented');
  }

  /**
   * Select a station by ID
   * @param {string} stationId - ID of the station to select
   * @returns {Promise<Object>} Result of operation
   */
  async selectStation(stationId) {
    throw new Error('Method not implemented');
  }

  /**
   * Send a raw command to pianobar
   * @param {string} command - Command to send
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} Result of operation
   */
  async sendCommand(command, silent) {
    throw new Error('Method not implemented');
  }

  /**
   * Get current playback status
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} Current status
   */
  async getStatus(silent) {
    throw new Error('Method not implemented');
  }

  /**
   * Get list of available stations
   * @param {boolean} silent - Whether to suppress logging
   * @returns {Promise<Object>} Available stations
   */
  async getStations(silent) {
    throw new Error('Method not implemented');
  }

  /**
   * Create the event command script for pianobar
   * @returns {Promise<boolean>} True if successful
   */
  async createEventCommandScript() {
    throw new Error('Method not implemented');
  }

  /**
   * Save status to the status file
   * @param {Object} status - Status to save
   * @returns {void}
   */
  saveStatus(status) {
    throw new Error('Method not implemented');
  }

  // Static method to verify implementation
  static verifyImplementation(instance, serviceName) {
    const requiredMethods = [
      'initialize',
      'healthCheck',
      'recoveryProcedure',
      'ensureConfigDir',
      'checkPianobarStatus',
      'cleanupOrphanedProcesses',
      'setupStatusFileWatcher',
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
      'createEventCommandScript',
      'saveStatus'
    ];

    for (const method of requiredMethods) {
      if (typeof instance[method] !== 'function') {
        throw new Error(`${serviceName} does not implement ${method} as required by IPianobarService`);
      }
    }
  }
}

module.exports = IPianobarService;