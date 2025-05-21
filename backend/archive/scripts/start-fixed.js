/**
 * Fixed server starter script for Monty backend
 * 
 * This script launches the modular server with fixed scheduler service
 * and proper timeout/error handling
 */

console.log('Starting Monty backend server with fixes for hanging issues...');

// Require the modular server that has proper initialization
require('./src/modular-server');

// Output a helpful message
console.log('Server launch initiated. Check logs for detailed status.');
console.log('You can access the API at http://localhost:3001/api/health');
console.log('To debug initialization, visit http://localhost:3001/api/debug');