import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

const Layout: React.FC = () => {
  return (
    <div className="app-container">
      <Navbar />
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
