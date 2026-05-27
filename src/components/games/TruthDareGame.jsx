import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Play, User, RefreshCw, Send, Check } from 'lucide-react';

const TruthDareGame = ({ game, houseId, user }) => {
  const { updateTruthDareGame, activeHouse } = useAuth();
  const [flickerTargetId, setFlickerTargetId] = useState(null);
  const [questionInput, setQuestionInput] = useState('');
  const [responseInput, setResponseInput] = useState('');
  const [error, setError] = useState('');

  const isAdmin = activeHouse?.members?.some((m) => m.userId === user?.id && m.role === 'admin') || false;

  const handleAction = async (payload) => {
    try {
      await updateTruthDareGame(houseId, payload);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (game?.status === 'selecting' && game.players.length > 0) {
      let currentInterval = 50;
      let duration = 0;
      const MAX_DURATION = 3000;
      let timerId;

      const tick = () => {
        const randomIndex = Math.floor(Math.random() * game.players.length);
        setFlickerTargetId(game.players[randomIndex].userId);
        duration += currentInterval;

        if (duration < MAX_DURATION) {
          currentInterval = Math.min(currentInterval * 1.15, 600);
          timerId = setTimeout(tick, currentInterval);
        } else {
          setFlickerTargetId(null);
          // Only the house admin advances the state to avoid multiple API calls
          if (isAdmin) {
            handleAction({ action: 'end-selection' });
          }
        }
      };
      
      timerId = setTimeout(tick, currentInterval);
      return () => clearTimeout(timerId);
    } else {
      setFlickerTargetId(null);
    }
  }, [game?.status, game?.players?.length, isAdmin, houseId]);

  if (!game) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Loading game state...</div>
      </div>
    );
  }

  const isSelector = game.selectorId === user?.id;
  const isPerformer = game.performerId === user?.id;

  const getPlayerCardStyle = (player) => {
    const isFlickering = flickerTargetId === player.userId;
    const isChosenSelector = game.status !== 'selecting' && game.status !== 'idle' && game.selectorId === player.userId;
    const isChosenPerformer = game.status !== 'selecting' && game.status !== 'idle' && game.performerId === player.userId;

    let border = '1px solid var(--border-glass)';
    let boxShadow = 'none';
    let transform = 'scale(1)';

    if (isFlickering) {
      border = '2px solid #d946ef';
      boxShadow = '0 0 15px rgba(217, 70, 239, 0.5)';
      transform = 'scale(1.05)';
    } else if (isChosenPerformer) {
      border = '2px solid #d946ef';
      boxShadow = '0 0 20px rgba(217, 70, 239, 0.6)';
    } else if (isChosenSelector) {
      border = '2px solid #3b82f6';
      boxShadow = '0 0 20px rgba(59, 130, 246, 0.6)';
    }

    return {
      padding: '16px',
      borderRadius: '16px',
      background: 'rgba(15, 23, 42, 0.6)',
      border,
      boxShadow,
      transform,
      transition: 'all 0.15s ease-out',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px'
    };
  };

  return (
    <div className="truth-dare-game" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      
      {/* Top Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', color: 'white', textShadow: '0 0 10px rgba(217, 70, 239, 0.3)' }}>
            Truth or Dare <span style={{ color: '#d946ef' }}>★</span>
          </h2>
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            {game.status === 'idle' && 'Waiting to start...'}
            {game.status === 'selecting' && 'Selecting players...'}
            {game.status === 'choosing' && 'Waiting for the Performer to choose...'}
            {game.status === 'questioning' && 'Waiting for the Selector to ask...'}
            {game.status === 'answering' && 'Waiting for the Performer to respond...'}
            {game.status === 'round-complete' && 'Round Complete!'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          {(game.status === 'idle' || game.status === 'round-complete') && (
            <button
              onClick={() => handleAction({ action: 'start-selection' })}
              style={{
                background: 'linear-gradient(135deg, #d946ef, #a21caf)',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 15px rgba(217, 70, 239, 0.4)'
              }}
            >
              <Play size={18} />
              {game.status === 'idle' ? 'Begin Match' : 'Next Round'}
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => handleAction({ action: 'reset-game' })}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-glass)',
                padding: '12px',
                borderRadius: '12px',
                cursor: 'pointer'
              }}
              title="Reset Game"
            >
              <RefreshCw size={18} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px' }}>
          {error}
        </div>
      )}

      {/* Main Game Stage */}
      {(game.status !== 'idle' && game.status !== 'selecting') && (
        <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px', background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.8) 100%)', border: '1px solid rgba(217, 70, 239, 0.2)', boxShadow: '0 10px 30px rgba(0,0,0,0.4)', textAlign: 'center', flexShrink: 0 }}>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {game.selectorId && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#3b82f6', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 'bold', marginBottom: '8px' }}>Selector</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'white' }}>
                  {game.players.find(p => p.userId === game.selectorId)?.username}
                </div>
              </div>
            )}
            {game.performerId && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#d946ef', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 'bold', marginBottom: '8px' }}>Performer</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'white' }}>
                  {game.players.find(p => p.userId === game.performerId)?.username}
                </div>
              </div>
            )}
          </div>

          {/* Phase: Choosing */}
          {game.status === 'choosing' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <h3 style={{ fontSize: '20px', margin: 0 }}>Choose your fate</h3>
              {isPerformer ? (
                <div style={{ display: 'flex', gap: '16px' }}>
                  <button onClick={() => handleAction({ action: 'choose-type', choice: 'truth' })} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '12px 32px', borderRadius: '999px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)' }}>TRUTH</button>
                  <button onClick={() => handleAction({ action: 'choose-type', choice: 'dare' })} style={{ background: '#d946ef', color: 'white', border: 'none', padding: '12px 32px', borderRadius: '999px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 15px rgba(217, 70, 239, 0.4)' }}>DARE</button>
                </div>
              ) : (
                <div style={{ color: 'var(--text-secondary)' }}>Waiting for the performer to make a choice...</div>
              )}
            </div>
          )}

          {/* Phase: Questioning */}
          {game.status === 'questioning' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{ display: 'inline-block', background: game.choice === 'truth' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(217, 70, 239, 0.2)', color: game.choice === 'truth' ? '#60a5fa' : '#f0abfc', padding: '6px 16px', borderRadius: '999px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', border: `1px solid ${game.choice === 'truth' ? '#3b82f6' : '#d946ef'}` }}>
                {game.choice}
              </div>
              
              {isSelector ? (
                <form onSubmit={(e) => { e.preventDefault(); handleAction({ action: 'submit-question', question: questionInput }); setQuestionInput(''); }} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '400px' }}>
                  <input
                    type="text"
                    value={questionInput}
                    onChange={(e) => setQuestionInput(e.target.value)}
                    placeholder={`Enter your ${game.choice}...`}
                    style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', padding: '12px 16px', borderRadius: '12px', color: 'white', outline: 'none', fontSize: '16px' }}
                    autoFocus
                  />
                  <button type="submit" disabled={!questionInput.trim()} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                    <Send size={18} /> Submit
                  </button>
                </form>
              ) : (
                <div style={{ color: 'var(--text-secondary)' }}>Selector is typing...</div>
              )}
            </div>
          )}

          {/* Phase: Answering */}
          {game.status === 'answering' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontSize: '20px', fontStyle: 'italic', color: 'white', marginBottom: '8px' }}>"{game.question}"</div>
              
              {isPerformer ? (
                <form onSubmit={(e) => { e.preventDefault(); handleAction({ action: 'submit-response', response: responseInput }); setResponseInput(''); }} style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '400px' }}>
                  {game.choice === 'truth' ? (
                    <input
                      type="text"
                      value={responseInput}
                      onChange={(e) => setResponseInput(e.target.value)}
                      placeholder="Type your answer..."
                      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', padding: '12px 16px', borderRadius: '12px', color: 'white', outline: 'none', fontSize: '16px' }}
                      autoFocus
                    />
                  ) : (
                    <div style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>Complete the dare in real life, then confirm.</div>
                  )}
                  
                  <button type="submit" disabled={game.choice === 'truth' && !responseInput.trim()} style={{ background: '#d946ef', color: 'white', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(217, 70, 239, 0.4)' }}>
                    {game.choice === 'truth' ? <Send size={18} /> : <Check size={18} />}
                    {game.choice === 'truth' ? 'Submit Answer' : 'Dare Completed'}
                  </button>
                </form>
              ) : (
                <div style={{ color: 'var(--text-secondary)' }}>Waiting for the performer to {game.choice === 'truth' ? 'answer' : 'complete the dare'}...</div>
              )}
            </div>
          )}

          {/* Phase: Round Complete */}
          {game.status === 'round-complete' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontSize: '20px', fontStyle: 'italic', color: 'white' }}>"{game.question}"</div>
              
              <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', width: '100%', maxWidth: '400px' }}>
                <div style={{ color: '#d946ef', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 'bold', marginBottom: '4px' }}>Result</div>
                <div style={{ fontSize: '16px', color: 'white' }}>
                  {game.choice === 'truth' ? game.response : 'Dare Completed! 🎉'}
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Players Grid */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: '16px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>House Members</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '12px' }}>
          {(game.players || []).map((player) => (
            <div key={player.userId} style={getPlayerCardStyle(player)}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, #1e293b, #334155)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                <User size={24} />
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '14px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                {player.username}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {game.selectorId === player.userId && 'Selector'}
                {game.performerId === player.userId && 'Performer'}
                {game.selectorId !== player.userId && game.performerId !== player.userId && 'Spectator'}
              </div>
            </div>
          ))}
          {(!game.players || game.players.length === 0) && (
            <div style={{ color: 'var(--text-secondary)' }}>No active players yet.</div>
          )}
        </div>
      </div>
      
    </div>
  );
};

export default TruthDareGame;
