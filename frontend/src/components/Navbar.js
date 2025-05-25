import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  
  // Helper to determine if a link is active
  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <nav className="bg-blue-600 text-white p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className="flex items-center space-x-3">
          <span className="text-2xl font-semibold">Monty</span>
        </Link>
        
        {/* Hamburger menu button */}
        <button 
          className="md:hidden"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
          </svg>
        </button>
        
        {/* Desktop menu */}
        <div className="hidden md:flex space-x-6">
          <Link 
            to="/" 
            className={`px-3 py-2 rounded transition ${
              isActive('/') 
                ? 'bg-blue-700 text-white' 
                : 'hover:bg-blue-700 hover:text-white'
            }`}
          >
            Dashboard
          </Link>
          <Link 
            to="/shades" 
            className={`px-3 py-2 rounded transition ${
              isActive('/shades') 
                ? 'bg-blue-700 text-white' 
                : 'hover:bg-blue-700 hover:text-white'
            }`}
          >
            Shades
          </Link>
          <Link 
            to="/pianobar" 
            className={`px-3 py-2 rounded transition ${
              isActive('/pianobar') 
                ? 'bg-blue-700 text-white' 
                : 'hover:bg-blue-700 hover:text-white'
            }`}
          >
            Pianobar
          </Link>
          <Link 
            to="/weather" 
            className={`px-3 py-2 rounded transition ${
              isActive('/weather') 
                ? 'bg-blue-700 text-white' 
                : 'hover:bg-blue-700 hover:text-white'
            }`}
          >
            Weather
          </Link>
        </div>
      </div>
      
      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-blue-700 p-4 mt-2 rounded shadow-lg">
          <div className="flex flex-col space-y-2">
            <Link 
              to="/" 
              className={`px-4 py-2 rounded ${isActive('/') ? 'bg-blue-800' : 'hover:bg-blue-800'}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Dashboard
            </Link>
            <Link 
              to="/shades" 
              className={`px-4 py-2 rounded ${isActive('/shades') ? 'bg-blue-800' : 'hover:bg-blue-800'}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Shades
            </Link>
            <Link 
              to="/pianobar" 
              className={`px-4 py-2 rounded ${isActive('/pianobar') ? 'bg-blue-800' : 'hover:bg-blue-800'}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Pianobar
            </Link>
            <Link 
              to="/weather" 
              className={`px-4 py-2 rounded ${isActive('/weather') ? 'bg-blue-800' : 'hover:bg-blue-800'}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Weather
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar;
