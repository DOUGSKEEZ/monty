import React from 'react';

function HomePage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Welcome to Monty</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Weather Widget */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-xl font-semibold mb-2">Weather</h2>
          <p>Silverthorne, CO</p>
          <p className="text-3xl">-- °F</p>
          <p>Loading weather data...</p>
        </div>
        
        {/* Shade Status Widget */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-xl font-semibold mb-2">Shade Status</h2>
          <p>Current Scene: Loading...</p>
          <button className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
            Control Shades
          </button>
        </div>
        
        {/* Wake Up Widget */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-xl font-semibold mb-2">Wake Up Time</h2>
          <p>Tomorrow: Not Set</p>
          <button className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
            Set Alarm
          </button>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
