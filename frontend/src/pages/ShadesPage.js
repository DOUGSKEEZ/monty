import React from 'react';

function ShadesPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Shade Control</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Main Level Controls */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-xl font-semibold mb-4">Main Level</h2>
          <div className="flex justify-between mb-4">
            <div className="text-center">
              <p className="text-sm mb-2">Solar</p>
              <div className="flex flex-col items-center space-y-2">
                <button className="bg-gray-200 hover:bg-gray-300 p-2 rounded-full">⬆️</button>
                <button className="bg-gray-200 hover:bg-gray-300 p-2 rounded-full">⏹️</button>
                <button className="bg-gray-200 hover:bg-gray-300 p-2 rounded-full">⬇️</button>
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm mb-2">Dimming</p>
              <div className="flex flex-col items-center space-y-2">
                <button className="bg-gray-200 hover:bg-gray-300 p-2 rounded-full">⬆️</button>
                <button className="bg-gray-200 hover:bg-gray-300 p-2 rounded-full">⏹️</button>
                <button className="bg-gray-200 hover:bg-gray-300 p-2 rounded-full">⬇️</button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Bedroom Controls */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-xl font-semibold mb-4">Bedroom</h2>
          <div className="flex justify-between mb-4">
            <div className="text-center">
              <p className="text-sm mb-2">Blackout</p>
              <div className="flex flex-col items-center space-y-2">
                <button className="bg-gray-200 hover:bg-gray-300 p-2 rounded-full">⬆️</button>
                <button className="bg-gray-200 hover:bg-gray-300 p-2 rounded-full">⏹️</button>
                <button className="bg-gray-200 hover:bg-gray-300 p-2 rounded-full">⬇️</button>
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm mb-2">Dimming</p>
              <div className="flex flex-col items-center space-y-2">
                <button className="bg-gray-200 hover:bg-gray-300 p-2 rounded-full">⬆️</button>
                <button className="bg-gray-200 hover:bg-gray-300 p-2 rounded-full">⏹️</button>
                <button className="bg-gray-200 hover:bg-gray-300 p-2 rounded-full">⬇️</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShadesPage;
