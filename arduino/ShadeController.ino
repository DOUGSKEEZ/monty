/*
 * Roller Shade Controller for A-OK motors
 * Uses 433 MHz RF to control multiple roller shades
 * Works with the Smart Home Control System
 */

#include <RCSwitch.h>
#include <ArduinoJson.h>

// Define pins
#define RF_TX_PIN 10     // Pin connected to the 433 MHz transmitter
#define LED_PIN 13       // Built-in LED for status indication

// A-OK motor model remote codes (examples - you will need to capture your actual remote codes)
const unsigned long SHADE_COMMANDS[4][3] = {
  // Each row represents a shade: {UP code, STOP code, DOWN code}
  {5510148, 5510147, 5510146},  // Shade 1
  {5510244, 5510243, 5510242},  // Shade 2
  {5510340, 5510339, 5510338},  // Shade 3
  {5510436, 5510435, 5510434}   // Shade 4
};

// RF transmission parameters
const int PULSE_LENGTH = 350;    // Pulse length in microseconds (adjust to match your remote)
const int PROTOCOL = 1;          // Protocol (1-4, adjust to match your remote)
const int REPEATS = 10;          // Number of repeats (more repeats = more reliable)

RCSwitch rfTransmitter = RCSwitch();
String inputBuffer = "";
boolean stringComplete = false;

void setup() {
  // Initialize serial communication
  Serial.begin(9600);
  while (!Serial) {
    ; // Wait for serial port to connect
  }
  
  // Initialize RF transmitter
  rfTransmitter.enableTransmit(RF_TX_PIN);
  rfTransmitter.setPulseLength(PULSE_LENGTH);
  rfTransmitter.setProtocol(PROTOCOL);
  rfTransmitter.setRepeatTransmit(REPEATS);
  
  // Setup LED pin
  pinMode(LED_PIN, OUTPUT);
  
  // Print startup message
  Serial.println("A-OK Roller Shade Controller Ready!");
  Serial.println("Send commands in JSON format:");
  Serial.println("{\"shadeId\": 0, \"action\": \"open|close|stop\"}\n");
}

void loop() {
  // Read and process serial commands when available
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    if (inChar == '\n') {
      stringComplete = true;
    } else {
      inputBuffer += inChar;
    }
  }
  
  // Process the command when a complete string is received
  if (stringComplete) {
    processCommand(inputBuffer);
    inputBuffer = "";
    stringComplete = false;
  }
}

void processCommand(String command) {
  // Allocate memory for JSON document
  StaticJsonDocument<200> doc;
  DeserializationError error = deserializeJson(doc, command);
  
  // Check for parsing error
  if (error) {
    Serial.print("deserializeJson() failed: ");
    Serial.println(error.c_str());
    return;
  }
  
  // Extract command values
  int shadeId = doc["shadeId"];
  String action = doc["action"].as<String>();
  
  // Validate shade ID
  if (shadeId < 0 || shadeId >= 4) {
    Serial.println("{\"error\": \"Invalid shade ID\"}");
    return;
  }
  
  // Determine command code and send RF signal
  bool success = false;
  if (action == "open") {
    success = sendCommand(shadeId, 0); // UP code
  } else if (action == "stop") {
    success = sendCommand(shadeId, 1); // STOP code
  } else if (action == "close") {
    success = sendCommand(shadeId, 2); // DOWN code
  } else {
    Serial.println("{\"error\": \"Invalid action\"}");
    return;
  }
  
  // Report success or failure
  if (success) {
    Serial.print("{\"status\": \"success\", \"shadeId\": ");
    Serial.print(shadeId);
    Serial.print(", \"action\": \"");
    Serial.print(action);
    Serial.println("\"}");
  } else {
    Serial.println("{\"error\": \"Failed to send command\"}");
  }
}

bool sendCommand(int shadeId, int commandIndex) {
  // Get the command code for the specified shade and action
  unsigned long code = SHADE_COMMANDS[shadeId][commandIndex];
  
  // Blink LED to indicate transmission
  digitalWrite(LED_PIN, HIGH);
  
  // Send the RF code
  rfTransmitter.send(code, 24); // 24 bits for A-OK remotes
  
  // Turn off LED
  digitalWrite(LED_PIN, LOW);
  
  return true;
}
