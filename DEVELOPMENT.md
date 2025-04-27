# Development Guide

## Project Setup

### Prerequisites

- Node.js (v16+)
- npm (v8+)
- Arduino IDE (for Arduino code)
- Arduino board with a 433 MHz RF transmitter

### Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Create a `.env` file with required environment variables

## Development Workflow

### Running the App

```bash
# Run both frontend and backend in development mode
npm run dev

# Run just the frontend
npm run start

# Run just the backend
npm run server
```

### Building for Production

```bash
npm run build
```

## Project Structure

```
├── src/
│   ├── api/           # API service functions
│   ├── components/    # Reusable React components
│   ├── models/        # TypeScript interfaces
│   ├── pages/         # Page components
│   ├── server/        # Backend server code
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── models/
│   │   └── index.ts
│   ├── utils/         # Utility functions
│   ├── App.tsx        # Main React component
│   └── index.tsx      # React entry point
├── public/            # Static assets
├── arduino/           # Arduino code
└── dist/              # Build output
```

## Code Style and Conventions

- Use TypeScript for type safety
- Follow ESLint and Prettier configurations
- Use functional components with hooks for React components
- Use async/await for asynchronous operations

## Adding New Features

### Adding a New Page

1. Create a new page component in `src/pages/`
2. Add the route to the page in `src/App.tsx`
3. Add a link to the page in the navigation component

### Adding a New API Endpoint

1. Create a controller function in `src/server/controllers/`
2. Add the route in the appropriate router file in `src/server/routes/`
3. Create a client-side API function in `src/api/`

### Adding a New Device Type

1. Create a new model interface in `src/models/`
2. Create controller and routes on the server side
3. Create client-side API functions
4. Create UI components for the device

## Testing

- Add unit tests for API services and utility functions
- Add component tests for UI components
- Test the application on different devices and browsers

## Deployment

### Web Application

1. Build the application: `npm run build`
2. Deploy the `dist` folder to a web server

### Backend Server

1. Set up a Node.js environment
2. Configure environment variables
3. Start the server with PM2 or similar process manager

### Arduino Controller

1. Upload the Arduino code to the Arduino board
2. Connect the 433 MHz transmitter to the appropriate pins
3. Connect the Arduino to the server via USB
