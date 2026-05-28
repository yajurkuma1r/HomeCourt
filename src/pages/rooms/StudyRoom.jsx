import React, { useEffect, useState } from 'react';
import { Play, Pause, RotateCcw, Edit2 } from 'lucide-react';
import SharedNotebook from '../../components/notebook/SharedNotebook';

const playTimerRinger = () => {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return;
  }

  const audioContext = new AudioContextCtor();
  const now = audioContext.currentTime;

  [0, 0.24, 0.48].forEach((offset, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(index % 2 === 0 ? 880 : 659.25, now + offset);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.22);
  });

  window.setTimeout(() => {
    audioContext.close().catch(() => {});
  }, 1200);
};

const StudyRoom = () => {
  const [defaultMinutes, setDefaultMinutes] = useState(25);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState('25');

  useEffect(() => {
    let interval;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsRunning(false);
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  useEffect(() => {
    if (timeLeft === 0) {
      playTimerRinger();
    }
  }, [timeLeft]);

  const handleSaveEdit = () => {
    let mins = parseInt(editVal, 10);
    if (Number.isNaN(mins) || mins <= 0) mins = 25;
    mins = Math.min(240, mins);
    setDefaultMinutes(mins);
    setTimeLeft(mins * 60);
    setEditVal(String(mins));
    setIsEditing(false);
  };

  const setTimerMinutes = (mins) => {
    const safeMins = Math.max(1, Math.min(240, Number(mins) || 25));
    setIsRunning(false);
    setIsEditing(false);
    setDefaultMinutes(safeMins);
    setTimeLeft(safeMins * 60);
    setEditVal(String(safeMins));
  };

  const toggleTimer = () => {
    if (isEditing) handleSaveEdit();
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setIsEditing(false);
    setTimeLeft(defaultMinutes * 60);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="study-room" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '32px', paddingTop: '8px' }}>
      <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-glass)' }}>
        <h2 style={{ margin: 0, letterSpacing: '0.08em', fontSize: '22px' }}>STUDYROOM</h2>
        <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Shared productivity space with a timer ringer at the end.</span>
      </div>

      <div className="study-room-layout" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '32px', minHeight: 0 }}>
        
        {/* Left Side: Shared Notebook */}
        <div className="study-notebook-panel" style={{ flex: 1, height: '100%', minWidth: '400px', maxWidth: '800px', display: 'flex' }}>
          <SharedNotebook notebookType="study" />
        </div>

        {/* Right Side: Timer */}
        <div className="study-timer-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '32px' }}>
          <div style={{ position: 'relative', width: '280px', height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.05)', boxShadow: isRunning ? '0 0 60px rgba(155, 81, 224, 0.2)' : 'none', transition: 'all 1s' }} />
          <div style={{ position: 'absolute', width: '90%', height: '90%', borderRadius: '50%', border: '4px solid', borderColor: isRunning ? 'var(--primary)' : 'var(--border-glass)', transition: 'all 0.5s' }} />

          {isEditing ? (
            <input
              autoFocus
              type="number"
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
              style={{
                fontSize: '80px',
                fontWeight: '700',
                background: 'transparent',
                border: 'none',
                color: 'var(--primary)',
                width: '180px',
                textAlign: 'center',
                outline: 'none',
                fontVariantNumeric: 'tabular-nums',
                zIndex: 10
              }}
            />
          ) : (
            <div
              onClick={() => { if (!isRunning) { setIsEditing(true); setEditVal(Math.floor(timeLeft / 60).toString()); } }}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: isRunning ? 'default' : 'pointer', zIndex: 10 }}
              title={isRunning ? '' : 'Click to edit'}
            >
              <span style={{
                fontSize: '80px',
                fontWeight: '700',
                fontVariantNumeric: 'tabular-nums',
                background: 'linear-gradient(135deg, var(--text-primary), var(--text-secondary))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </span>
              {!isRunning && <Edit2 size={24} color="var(--text-secondary)" />}
            </div>
          )}
        </div>

        <div className="study-timer-settings" style={{ width: 'min(100%, 360px)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Timer minutes
            <input
              type="number"
              min="1"
              max="240"
              value={editVal}
              disabled={isRunning}
              onChange={(event) => {
                setEditVal(event.target.value);
                const nextValue = Number(event.target.value);
                if (Number.isFinite(nextValue) && nextValue > 0) {
                  setTimerMinutes(nextValue);
                }
              }}
              style={{ width: '100%', background: 'rgba(0,0,0,0.22)', color: 'white', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '12px 14px', outline: 'none', fontSize: '16px', textTransform: 'none', letterSpacing: 0 }}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[15, 25, 45, 60].map((mins) => (
              <button
                key={mins}
                type="button"
                disabled={isRunning}
                onClick={() => setTimerMinutes(mins)}
                style={{ background: defaultMinutes === mins ? 'var(--brand-gradient)' : 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '10px 8px', fontWeight: 800, cursor: isRunning ? 'not-allowed' : 'pointer', opacity: isRunning ? 0.55 : 1 }}
              >
                {mins}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <div onClick={resetTimer} className="sidebar-icon" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <RotateCcw size={24} color="white" />
          </div>
          <button
            onClick={toggleTimer}
            className="pulse-button"
            style={{ width: '80px', height: '80px', animation: isRunning ? 'softPulse 2s infinite' : 'none' }}
          >
            {isRunning ? <Pause size={32} /> : <Play size={32} style={{ marginLeft: '4px' }} />}
          </button>
        </div>

          <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', background: '#22c55e', borderRadius: '50%' }} />
            Partner is focusing with you
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudyRoom;
