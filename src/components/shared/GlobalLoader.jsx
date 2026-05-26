import React from 'react';
import HomeCourtLogo from './HomeCourtLogo';
import './GlobalLoader.css';

const GlobalLoader = () => {
  return (
    <div className="global-loader-overlay">
      <div className="global-loader-content">
        <HomeCourtLogo size={96} showWordmark={true} stacked={true} />
        
        <div className="global-loader-spinner-container">
          <div className="global-loader-spinner"></div>
        </div>
        
        <div className="global-loader-text">LOADING...</div>
      </div>
    </div>
  );
};

export default GlobalLoader;
