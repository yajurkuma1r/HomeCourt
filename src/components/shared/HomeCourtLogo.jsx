import React from 'react';

const HomeCourtLogo = ({ size = 72, showWordmark = false, stacked = false }) => {
  const wordmarkSize = Math.max(24, Math.round(size * 0.52));

  return (
    <div className={`homecourt-brand ${stacked ? 'homecourt-brand--stacked' : ''}`}>
      <svg
        className="homecourt-mark"
        width={size}
        height={size}
        viewBox="0 0 120 120"
        role="img"
        aria-label="HomeCourt"
      >
        <defs>
          <linearGradient id="homecourtGradient" x1="18" y1="10" x2="102" y2="112" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff2da0" />
            <stop offset="1" stopColor="#7b1fa2" />
          </linearGradient>
          <filter id="homecourtGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#ff2da0" floodOpacity="0.28" />
          </filter>
        </defs>
        <rect x="9" y="9" width="102" height="102" rx="28" fill="rgba(24, 19, 43, 0.72)" stroke="rgba(255, 45, 160, 0.34)" />
        <path
          d="M28 92V42L60 20L98 45V60L60 35L40 49V92H28Z"
          fill="url(#homecourtGradient)"
          filter="url(#homecourtGlow)"
        />
        <path
          d="M45 92V55C45 51 49 48 53 48V70H70C75 55 87 48 103 51V64C94 61 85 64 81 73C77 82 84 91 103 88V101C82 105 69 95 68 82H53V92H45Z"
          fill="url(#homecourtGradient)"
        />
        <path d="M61 48H70V57H61V48ZM75 48H84V57H75V48ZM61 62H70V71H61V62ZM75 62H84V71H75V62Z" fill="#ff2da0" />
      </svg>
      {showWordmark ? (
        <div className="homecourt-wordmark" style={{ fontSize: `${wordmarkSize}px` }}>
          <div className="homecourt-wordmark__main">
            <span>HOMEC</span><span className="homecourt-wordmark__o">O</span><span>URT</span>
          </div>
          <small>YOUR SPACE. YOUR PEOPLE.</small>
        </div>
      ) : null}
    </div>
  );
};

export default HomeCourtLogo;
