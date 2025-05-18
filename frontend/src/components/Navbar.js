import React, { useState } from 'react';
import { Link } from 'react-router-dom';

function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="bg-blue-500 text-white p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className="flex items-center space-x-3">
          <span className="text-2xl font-semibold">Monty's Prospect</span>
        </Link>
        
        {/* Hamburger menu button */}
        <button 
          className="md:hidden"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
          </svg>
        </button>
        
        {/* Desktop menu */}
        <div className="hidden md:flex space-x-6">
          <Link to="/" className="hover:text-blue-200">Home</Link>
          <Link to="/shades" className="hover:text-blue-200">Shades</Link>
          <Link to="/music" className="hover:text-blue-200">Music</Link>
          <Link to="/weather" className="hover:text-blue-200">Weather</Link>
          <Link to="/config" className="hover:text-blue-200">Config</Link>
        </div>
      </div>
      
      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-blue-600 p-4">
          <div className="flex flex-col space-y-3">
            <Link to="/" className="hover:text-blue-200" onClick={() => setIsMenuOpen(false)}>Home</Link>
            <Link to="/shades" className="hover:text-blue-200" onClick={() => setIsMenuOpen(false)}>Shades</Link>
            <Link to="/music" className="hover:text-blue-200" onClick={() => setIsMenuOpen(false)}>Music</Link>
            <Link to="/weather" className="hover:text-blue-200" onClick={() => setIsMenuOpen(false)}>Weather</Link>
            <Link to="/config" className="hover:text-blue-200" onClick={() => setIsMenuOpen(false)}>Config</Link>
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar;
