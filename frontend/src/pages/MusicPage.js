import React from 'react';

function MusicPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Monty's Pianobar</h1>
      
      {/* Music Player Controls */}
      <div className="bg-white p-6 rounded shadow">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Player Status: Off</h2>
          <button className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded">
            Turn On
          </button>
        </div>
        
        {/* Song Info (Hidden when player is off) */}
        <div className="hidden">
          <div className="mb-4">
            <p className="text-lg font-semibold">Now Playing</p>
            <p className="text-xl">Song Title</p>
            <p>Artist Name</p>
            <p>Station: Pandora Station</p>
          </div>
          
          {/* Playback Controls */}
          <div className="flex space-x-4 my-4">
            <button className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full">❤️</button>
            <button className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-full">▶️</button>
            <button className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-full">⏸️</button>
            <button className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-full">⏭️</button>
          </div>
          
          {/* Station Selector */}
          <div className="mt-6">
            <label className="block text-sm font-medium mb-2">Change Station</label>
            <select className="block w-full p-2 border rounded">
              <option>Loading stations...</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MusicPage;
