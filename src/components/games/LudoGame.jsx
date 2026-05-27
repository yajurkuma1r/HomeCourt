import React, { useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import { Play } from 'lucide-react';

const COLORS = {
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6'
};

const BASE_POSITIONS = {
  red: [{x: 2, y: 2}, {x: 4, y: 2}, {x: 2, y: 4}, {x: 4, y: 4}],
  green: [{x: 10, y: 2}, {x: 12, y: 2}, {x: 10, y: 4}, {x: 12, y: 4}],
  yellow: [{x: 10, y: 10}, {x: 12, y: 10}, {x: 10, y: 12}, {x: 12, y: 12}],
  blue: [{x: 2, y: 10}, {x: 4, y: 10}, {x: 2, y: 12}, {x: 4, y: 12}],
};

// Simplified coordinate mapping for the common 52-step perimeter track
// 0 is bottom of left arm going up.
const COMMON_TRACK = [
  {x: 6, y: 14}, {x: 6, y: 13}, {x: 6, y: 12}, {x: 6, y: 11}, {x: 6, y: 10}, {x: 6, y: 9}, // Blue path UP
  {x: 5, y: 8}, {x: 4, y: 8}, {x: 3, y: 8}, {x: 2, y: 8}, {x: 1, y: 8}, {x: 0, y: 8}, // Red path LEFT
  {x: 0, y: 7}, {x: 0, y: 6}, // Red Start
  {x: 1, y: 6}, {x: 2, y: 6}, {x: 3, y: 6}, {x: 4, y: 6}, {x: 5, y: 6}, {x: 6, y: 5}, // Red path RIGHT
  {x: 6, y: 4}, {x: 6, y: 3}, {x: 6, y: 2}, {x: 6, y: 1}, {x: 6, y: 0}, // Green path UP
  {x: 7, y: 0}, {x: 8, y: 0}, // Green Start
  {x: 8, y: 1}, {x: 8, y: 2}, {x: 8, y: 3}, {x: 8, y: 4}, {x: 8, y: 5}, {x: 9, y: 6}, // Green path DOWN
  {x: 10, y: 6}, {x: 11, y: 6}, {x: 12, y: 6}, {x: 13, y: 6}, {x: 14, y: 6}, // Yellow path RIGHT
  {x: 14, y: 7}, {x: 14, y: 8}, // Yellow Start
  {x: 13, y: 8}, {x: 12, y: 8}, {x: 11, y: 8}, {x: 10, y: 8}, {x: 9, y: 8}, {x: 8, y: 9}, // Yellow path LEFT
  {x: 8, y: 10}, {x: 8, y: 11}, {x: 8, y: 12}, {x: 8, y: 13}, {x: 8, y: 14}, // Blue path DOWN
  {x: 7, y: 14} // Blue Start
];

const TRACK_OFFSETS = {
  red: 13,   // index of {x: 1, y: 6}
  green: 26, // index of {x: 8, y: 1}
  yellow: 39, // index of {x: 13, y: 8}
  blue: 0     // index of {x: 6, y: 13} (starts at offset + 1, wait. Blue start is {x: 6, y: 13}. The first square after coming out of base is pos 0)
};

const HOME_STRETCHES = {
  red: [{x: 1, y: 7}, {x: 2, y: 7}, {x: 3, y: 7}, {x: 4, y: 7}, {x: 5, y: 7}],
  green: [{x: 7, y: 1}, {x: 7, y: 2}, {x: 7, y: 3}, {x: 7, y: 4}, {x: 7, y: 5}],
  yellow: [{x: 13, y: 7}, {x: 12, y: 7}, {x: 11, y: 7}, {x: 10, y: 7}, {x: 9, y: 7}],
  blue: [{x: 7, y: 13}, {x: 7, y: 12}, {x: 7, y: 11}, {x: 7, y: 10}, {x: 7, y: 9}]
};

const getBoardCoord = (color, pos) => {
  if (pos === -1) return null; // handled separately
  if (pos === 57) {
    // Center home triangle approximation
    if (color === 'red') return { x: 6, y: 7 };
    if (color === 'green') return { x: 7, y: 6 };
    if (color === 'yellow') return { x: 8, y: 7 };
    if (color === 'blue') return { x: 7, y: 8 };
  }
  if (pos > 50) {
    // 51 to 56 are in the home stretch
    return HOME_STRETCHES[color][pos - 51];
  }
  const offsetIndex = (TRACK_OFFSETS[color] + pos) % 52;
  return COMMON_TRACK[offsetIndex];
};

const LudoGame = ({ game, houseId, user }) => {
  const { socket } = useSocket();
  const myPlayer = game?.players.find(p => p.userId === user?.id);
  const isMyTurn = myPlayer && game?.players[game.currentPlayerIndex].userId === user?.id;

  const joinGame = () => {
    socket.emit('ludo:join', { houseId });
  };

  const rollDice = () => {
    if (!isMyTurn || game.turnState !== 'waiting-for-roll') return;
    socket.emit('ludo:roll', { houseId });
  };

  const moveToken = (tokenIndex, color) => {
    if (!isMyTurn || game.turnState !== 'waiting-for-move') return;
    if (color !== myPlayer.color) return;
    socket.emit('ludo:move', { houseId, tokenIndex });
  };

  const resetGame = () => {
    socket.emit('ludo:reset', { houseId });
  };

  if (!game) {
    return (
      <div className="ludo-game ludo-game--empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
        <h3 style={{ color: 'var(--text-secondary)' }}>No Ludo game active</h3>
        <button onClick={joinGame} className="primary-button" style={{ background: 'var(--primary)', color: 'white', padding: '12px 24px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
          Start Game
        </button>
      </div>
    );
  }

  const renderSquare = (x, y) => {
    const isBase = (x < 6 || x > 8) && (y < 6 || y > 8);
    let fill = '#1e293b';
    let isSafe = false;

    // Bases
    if (x < 6 && y < 6) fill = 'rgba(239, 68, 68, 0.2)'; // Red
    if (x > 8 && y < 6) fill = 'rgba(34, 197, 94, 0.2)'; // Green
    if (x > 8 && y > 8) fill = 'rgba(234, 179, 8, 0.2)'; // Yellow
    if (x < 6 && y > 8) fill = 'rgba(59, 130, 246, 0.2)'; // Blue

    // Start squares and Safe zones
    if ((x === 1 && y === 6) || (x === 2 && y === 8)) { fill = COLORS.red; isSafe = true; } // Red start/star
    if ((x === 8 && y === 1) || (x === 6 && y === 2)) { fill = COLORS.green; isSafe = true; } // Green start/star
    if ((x === 13 && y === 8) || (x === 12 && y === 6)) { fill = COLORS.yellow; isSafe = true; } // Yellow start/star
    if ((x === 6 && y === 13) || (x === 8 && y === 12)) { fill = COLORS.blue; isSafe = true; } // Blue start/star

    // Home Stretches
    if (y === 7 && x >= 1 && x <= 5) fill = COLORS.red;
    if (x === 7 && y >= 1 && y <= 5) fill = COLORS.green;
    if (y === 7 && x >= 9 && x <= 13) fill = COLORS.yellow;
    if (x === 7 && y >= 9 && y <= 13) fill = COLORS.blue;

    return (
      <rect 
        key={`${x}-${y}`} 
        x={x * 40} y={y * 40} 
        width="40" height="40" 
        fill={fill} 
        stroke="rgba(255,255,255,0.1)" 
        strokeWidth="1"
      />
    );
  };

  const squares = [];
  for (let x = 0; x < 15; x++) {
    for (let y = 0; y < 15; y++) {
      squares.push(renderSquare(x, y));
    }
  }

  const currentPlayer = game.players[game.currentPlayerIndex];

  return (
    <div className="ludo-game" style={{ display: 'flex', gap: '32px', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
      
      <div className="ludo-board" style={{ width: '600px', height: '600px', position: 'relative', background: '#0f172a', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
        <svg width="600" height="600" viewBox="0 0 600 600">
          {squares}
          
          {/* Base Inner Boxes */}
          <rect x="40" y="40" width="160" height="160" fill="#fff" rx="12" />
          <rect x="400" y="40" width="160" height="160" fill="#fff" rx="12" />
          <rect x="400" y="400" width="160" height="160" fill="#fff" rx="12" />
          <rect x="40" y="400" width="160" height="160" fill="#fff" rx="12" />
          
          {/* Base Circles */}
          {Object.entries(BASE_POSITIONS).map(([color, positions]) => 
            positions.map((pos, i) => (
              <circle key={`base-${color}-${i}`} cx={pos.x * 40 + 20} cy={pos.y * 40 + 20} r="14" fill={COLORS[color]} opacity="0.2" />
            ))
          )}

          {/* Tokens */}
          {Object.entries(game.tokens).map(([color, positions]) => 
            positions.map((pos, i) => {
              let coord = getBoardCoord(color, pos);
              if (!coord) {
                coord = BASE_POSITIONS[color][i];
              }

              const isMovable = isMyTurn && color === myPlayer?.color && game.turnState === 'waiting-for-move' && (
                (pos === -1 && game.diceValue === 6) || (pos !== -1 && pos + game.diceValue <= 56)
              );

              return (
                <circle 
                  key={`token-${color}-${i}`} 
                  cx={coord.x * 40 + 20} 
                  cy={coord.y * 40 + 20} 
                  r="14" 
                  fill={COLORS[color]} 
                  stroke="#fff"
                  strokeWidth="3"
                  style={{
                    cursor: isMovable ? 'pointer' : 'default',
                    transition: 'all 0.3s ease',
                    filter: isMovable ? 'drop-shadow(0 0 8px rgba(255,255,255,0.8))' : 'none',
                    transform: isMovable ? 'scale(1.1)' : 'scale(1)',
                    transformOrigin: `${coord.x * 40 + 20}px ${coord.y * 40 + 20}px`
                  }}
                  onClick={() => moveToken(i, color)}
                />
              );
            })
          )}
        </svg>
      </div>

      <div className="glass-panel ludo-controls" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', minWidth: '280px' }}>
        <div>
          <h3 style={{ margin: '0 0 16px 0' }}>Players</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {game.players.map((p, i) => (
              <div key={p.color} style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: p.userId ? 1 : 0.4 }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: COLORS[p.color], border: i === game.currentPlayerIndex ? '2px solid white' : 'none', boxShadow: i === game.currentPlayerIndex ? `0 0 10px ${COLORS[p.color]}` : 'none' }} />
                <span>{p.username || 'Waiting...'}</span>
                {!p.userId && !myPlayer && (
                  <button onClick={joinGame} style={{ marginLeft: 'auto', background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}>Join</button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center' }}>
            {isMyTurn ? "It's your turn!" : `${currentPlayer.username || currentPlayer.color}'s turn`}
          </div>

          <div style={{ 
            width: '80px', height: '80px', 
            background: 'rgba(255,255,255,0.1)', 
            borderRadius: '16px', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '40px', fontWeight: 'bold', color: 'white',
            border: `2px solid ${COLORS[currentPlayer.color]}`,
            boxShadow: `0 0 20px ${COLORS[currentPlayer.color]}40`
          }}>
            {game.diceValue || '?'}
          </div>

          {isMyTurn && game.turnState === 'waiting-for-roll' && (
            <button onClick={rollDice} style={{ background: COLORS[myPlayer.color], color: 'white', border: 'none', padding: '12px 32px', borderRadius: '24px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 8px 16px rgba(0,0,0,0.2)' }}>
              <Play size={18} /> Roll Dice
            </button>
          )}

          {isMyTurn && game.turnState === 'waiting-for-move' && (
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Select a glowing token to move.</div>
          )}
        </div>

        <button onClick={resetGame} style={{ marginTop: 'auto', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '8px', cursor: 'pointer' }}>
          Reset Game
        </button>
      </div>

    </div>
  );
};

export default LudoGame;
