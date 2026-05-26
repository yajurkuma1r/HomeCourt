import React, { useEffect, useState } from 'react';
import { useSocket } from '../../context/SocketContext';
import { RefreshCw, Play, Plus, Trash2, Utensils } from 'lucide-react';

const FoodDraftGame = ({ houseId, user }) => {
  const { socket } = useSocket();
  const [gameState, setGameState] = useState(null);
  const [dishInput, setDishInput] = useState('');
  const [myDishes, setMyDishes] = useState([]);

  useEffect(() => {
    if (!socket || !houseId) return;
    
    socket.emit('food-draft:state', { houseId });
    
    const handleState = (state) => {
      setGameState(state);
      if (state?.dishes && user) {
        setMyDishes(state.dishes.filter(d => d.userId === user.id).map(d => d.text));
      }
    };
    
    socket.on('food-draft:state', handleState);
    
    return () => {
      socket.off('food-draft:state', handleState);
    };
  }, [socket, houseId, user]);

  const handleAddDish = (e) => {
    e.preventDefault();
    if (!dishInput.trim() || myDishes.length >= 3) return;
    
    const newDishes = [...myDishes, dishInput.trim()];
    setMyDishes(newDishes);
    setDishInput('');
    
    socket.emit('food-draft:submit', { houseId, dishes: newDishes });
  };

  const handleRemoveDish = (index) => {
    const newDishes = myDishes.filter((_, i) => i !== index);
    setMyDishes(newDishes);
    socket.emit('food-draft:submit', { houseId, dishes: newDishes });
  };

  const handleSpin = () => {
    if (!gameState || gameState.dishes.length === 0) return;
    socket.emit('food-draft:spin', { houseId });
  };

  const handleReset = () => {
    socket.emit('food-draft:reset', { houseId });
    setMyDishes([]);
  };

  if (!gameState) {
    return <div style={{ color: 'var(--text-secondary)' }}>Loading Food Draft...</div>;
  }

  const { status, dishes, winner } = gameState;
  const isSpinning = status === 'spinning';
  const isResult = status === 'result';

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '28px', color: '#fca5a5', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <Utensils size={32} /> Food Draft
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Can't decide what to eat? Everyone adds 3 dishes, and the wheel decides.</p>
      </div>

      {status === 'lobby' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0, color: '#93c5fd' }}>Your Draft Picks ({myDishes.length}/3)</h3>
            <form onSubmit={handleAddDish} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={dishInput}
                onChange={(e) => setDishInput(e.target.value)}
                placeholder="Enter a dish or restaurant..."
                disabled={myDishes.length >= 3}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.3)', color: 'white', outline: 'none' }}
              />
              <button 
                type="submit"
                disabled={!dishInput.trim() || myDishes.length >= 3}
                style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '12px', width: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: (!dishInput.trim() || myDishes.length >= 3) ? 0.5 : 1 }}
              >
                <Plus size={20} />
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '160px' }}>
              {myDishes.map((dish, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <span>{dish}</span>
                  <button onClick={() => handleRemoveDish(i)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {myDishes.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '20px' }}>
                  No dishes added yet.
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#fde047' }}>All Submitted Dishes</h3>
              <span style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '12px', fontSize: '13px' }}>
                Total: {dishes.length}
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
              {dishes.map((d, i) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '12px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                    {d.username.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>{d.text}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Added by {d.username}</span>
                  </div>
                </div>
              ))}
              {dishes.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 0' }}>
                  Waiting for everyone to submit...
                </div>
              )}
            </div>

            <button 
              onClick={handleSpin}
              disabled={dishes.length === 0}
              style={{ 
                width: '100%', 
                padding: '16px', 
                borderRadius: '14px', 
                background: dishes.length > 0 ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'rgba(255,255,255,0.1)', 
                color: 'white', 
                border: 'none', 
                fontWeight: 'bold', 
                fontSize: '16px', 
                cursor: dishes.length > 0 ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: 'auto'
              }}
            >
              <Play size={20} /> Spin The Wheel!
            </button>
          </div>
        </div>
      )}

      {(isSpinning || isResult) && (
        <div className="glass-panel" style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px', minHeight: '400px', justifyContent: 'center' }}>
          
          <div style={{ 
            width: '240px', 
            height: '240px', 
            borderRadius: '50%', 
            border: '8px solid var(--border-glass)',
            background: 'linear-gradient(135deg, #1e293b, #0f172a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            boxShadow: isSpinning ? '0 0 30px rgba(239, 68, 68, 0.4)' : '0 0 50px rgba(34, 197, 94, 0.6)',
            transition: 'box-shadow 0.5s ease',
            animation: isSpinning ? 'spin 1s infinite linear' : 'none'
          }}>
            <style>
              {`
                @keyframes spin {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
                @keyframes pop {
                  0% { transform: scale(0.8); opacity: 0; }
                  100% { transform: scale(1); opacity: 1; }
                }
              `}
            </style>
            
            {!isSpinning && isResult && winner && (
              <div style={{ 
                position: 'absolute', 
                inset: 0, 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center',
                background: 'rgba(34, 197, 94, 0.2)',
                borderRadius: '50%',
                animation: 'pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
              }}>
                <Utensils size={48} color="#4ade80" style={{ marginBottom: '12px' }} />
                <span style={{ fontSize: '24px', fontWeight: 'bold', color: 'white', textAlign: 'center', padding: '0 20px', lineHeight: 1.2 }}>
                  {winner.text}
                </span>
              </div>
            )}
            
            {isSpinning && (
              <Utensils size={64} color="#fca5a5" />
            )}
          </div>

          <div style={{ textAlign: 'center', minHeight: '60px' }}>
            {isSpinning ? (
              <h2 style={{ margin: 0, color: '#fde047', animation: 'pulse 1.5s infinite' }}>Selecting a dish...</h2>
            ) : (
              <div>
                <h2 style={{ margin: '0 0 8px 0', color: '#4ade80' }}>We are having {winner?.text}!</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Suggested by {winner?.username}</p>
              </div>
            )}
          </div>

          {isResult && (
            <button 
              onClick={handleReset}
              style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid var(--border-glass)', padding: '12px 24px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}
            >
              <RefreshCw size={18} /> Draft Again
            </button>
          )}

        </div>
      )}
    </div>
  );
};

export default FoodDraftGame;
