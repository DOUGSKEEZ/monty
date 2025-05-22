import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import ShadesPage from './pages/ShadesPage';
import MusicPage from './pages/MusicPage';
import WeatherPage from './pages/WeatherPage';
import PianobarPage from './pages/PianobarPage';
import { AppProvider } from './utils/AppContext';

function App() {
  return (
    <AppProvider>
      <Router>
        <div className="flex flex-col min-h-screen bg-gray-100">
          <Navbar />
          <main className="flex-grow">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/shades" element={<ShadesPage />} />
              <Route path="/music" element={<MusicPage />} />
              <Route path="/pianobar" element={<PianobarPage />} />
              <Route path="/weather" element={<WeatherPage />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </Router>
    </AppProvider>
  );
}

export default App;
