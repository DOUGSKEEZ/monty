/**
 * BaseInterface - Base class for all interface definitions
 * 
 * This provides a simple way to define and verify interface implementations
 * in a language that doesn't natively support interfaces.
 */

class BaseInterface {
  /**
   * Check if an object implements this interface
   * @param {Object} obj - Object to check
   * @returns {boolean} - True if the object implements the interface
   */
  static isImplementedBy(obj) {
    if (!obj) return false;
    
    // Get method names that should be implemented (excluding static methods)
    const interfaceMethods = Object.getOwnPropertyNames(this.prototype)
      .filter(name => name !== 'constructor');
    
    // Check if all interface methods are implemented
    return interfaceMethods.every(method => {
      return typeof obj[method] === 'function';
    });
  }
  
  /**
   * Verify that an object implements this interface,
   * throws an error if it doesn't
   * @param {Object} obj - Object to verify
   * @param {string} objName - Name of the object for error messages
   */
  static verifyImplementation(obj, objName = 'Object') {
    if (!obj) {
      throw new Error(`${objName} is null or undefined`);
    }
    
    // Get method names that should be implemented (excluding static methods)
    const interfaceMethods = Object.getOwnPropertyNames(this.prototype)
      .filter(name => name !== 'constructor');
    
    // Check each method
    for (const method of interfaceMethods) {
      if (typeof obj[method] !== 'function') {
        throw new Error(
          `${objName} does not implement interface method: ${method}`
        );
      }
    }
  }
  
  /**
   * Create a proxy that enforces this interface on an object
   * @param {Object} obj - Object to wrap
   * @returns {Proxy} - Proxy that ensures interface methods are called
   */
  static createProxy(obj) {
    // First verify the implementation
    this.verifyImplementation(obj);
    
    // Create a proxy that only allows access to interface methods
    return new Proxy(obj, {
      get(target, prop) {
        // Get interface methods
        const interfaceMethods = Object.getOwnPropertyNames(
          Object.getPrototypeOf(this).prototype
        ).filter(name => name !== 'constructor');
        
        // Allow access to interface methods only
        if (interfaceMethods.includes(prop)) {
          return target[prop];
        }
        
        throw new Error(`Method ${prop} is not part of the interface`);
      }
    });
  }
}

module.exports = BaseInterface;