import React from 'react';
import { NavLink } from 'react-router-dom';
import './Navbar.css';

const Navbar: React.FC = () => {
  return (
    <nav className="navbar">
      <div className="navbar-container">
        <NavLink to="/" className="navbar-logo">
          Smart Home
        </NavLink>
        <ul className="navbar-menu">
          <li className="navbar-item">
            <NavLink to="/" className={({ isActive }) => isActive ? 'navbar-link active' : 'navbar-link'}>
              Home
            </NavLink>
          </li>
          <li className="navbar-item">
            <NavLink to="/shades" className={({ isActive }) => isActive ? 'navbar-link active' : 'navbar-link'}>
              Shades
            </NavLink>
          </li>
          <li className="navbar-item">
            <NavLink to="/weather" className={({ isActive }) => isActive ? 'navbar-link active' : 'navbar-link'}>
              Weather
            </NavLink>
          </li>
          <li className="navbar-item">
            <NavLink to="/settings" className={({ isActive }) => isActive ? 'navbar-link active' : 'navbar-link'}>
              Settings
            </NavLink>
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;
