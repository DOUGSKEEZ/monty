/**
 * Interface for BluetoothService implementations
 * Defines the contract that BluetoothService implementations must follow
 */
class IBluetoothService {
  /**
   * Initialize the Bluetooth service
   * This may include ensuring required subsystems are running
   * @returns {Promise<Object>} Status object with result of initialization
   */
  async initialize() {
    throw new Error('Method not implemented: initialize');
  }

  /**
   * Connect to the configured Bluetooth device
   * @param {boolean} forceWakeup - Whether to force a wake-up sequence
   * @returns {Promise<Object>} Status object with result of connection attempt
   */
  async connect(forceWakeup = false) {
    throw new Error('Method not implemented: connect');
  }

  /**
   * Disconnect from the current Bluetooth device
   * @returns {Promise<Object>} Status object with result of disconnection
   */
  async disconnect() {
    throw new Error('Method not implemented: disconnect');
  }

  /**
   * Get the current connection status
   * @returns {Promise<Object>} Status object with detailed information about the connection
   */
  async getStatus() {
    throw new Error('Method not implemented: getStatus');
  }

  /**
   * Wake up the Bluetooth device without fully connecting
   * Useful for devices that enter deep sleep mode
   * @returns {Promise<Object>} Status object with result of wake-up attempt
   */
  async wakeup() {
    throw new Error('Method not implemented: wakeup');
  }

  /**
   * Get diagnostic information about the Bluetooth system
   * @returns {Promise<Object>} Detailed diagnostic information
   */
  async getDiagnostics() {
    throw new Error('Method not implemented: getDiagnostics');
  }
}

module.exports = IBluetoothService;