# Smart Home Control System

A web application for controlling and monitoring smart home devices, including A-OK roller shades via Arduino with a 433 MHz RF transmitter, and displaying weather data from OpenWeatherMap.

## Features

- Control roller shades in different rooms
- View current weather and forecast information
- Configure automatic opening/closing of shades based on time
- Mobile-responsive design
- Real-time updates via Socket.io

## Architecture

The application consists of:

1. **Frontend**: React web application with TypeScript
2. **Backend**: Node.js with Express
3. **Arduino Integration**: Arduino with 433 MHz RF transmitter for controlling roller shades

## Prerequisites

- Node.js (v16+)
- npm (v8+)
- Arduino with 433 MHz RF transmitter (for hardware integration)
- OpenWeatherMap API key

## Installation

1. Clone the repository
   ```
   git clone https://github.com/yourusername/smart-home-control.git
   cd smart-home-control
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with your settings:
   ```
   PORT=5000
   OPENWEATHERMAP_API_KEY=your_api_key_here
   LOCATION_LAT=your_latitude
   LOCATION_LON=your_longitude
   ```

## Development

To start the development server (both frontend and backend concurrently):

```
npm run dev
```

This will start:
- Frontend on [http://localhost:3000](http://localhost:3000)
- Backend on [http://localhost:5000](http://localhost:5000)

## Building for Production

```
npm run build
```

This will create a production build in the `dist` directory.

## Arduino Setup

1. Connect your Arduino to a 433 MHz RF transmitter
2. Upload the Arduino code from the `arduino` directory to your Arduino

### Arduino Pin Configuration

- Connect the 433 MHz transmitter data pin to Arduino Digital Pin 10
- Connect VCC to 5V
- Connect GND to GND

## Future Developments

This web app is designed to be a prototype that can be adapted to:

1. Native Android application
2. Native iOS application
3. Remote access via VPN or cloud hosting

## License

MIT