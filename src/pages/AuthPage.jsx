import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, ShieldCheck, Mail, AtSign, KeyRound } from 'lucide-react';
import HomeCourtLogo from '../components/shared/HomeCourtLogo';

const AuthPage = () => {
  const [mode, setMode] = useState('signup');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password || (mode === 'signup' && !username)) {
      setError('Fill in all required fields to continue.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match yet.');
      return;
    }

    setSubmitting(true);

    try {
      if (mode === 'signup') {
        await signup({ email, username, password });
      } else {
        await login({ email, password });
      }

      navigate('/setup');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page" style={{
      display: 'flex', 
      minHeight: '100vh', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '24px',
      background: 'radial-gradient(circle at 70% 18%, rgba(255, 45, 160, 0.2), transparent 30%), radial-gradient(circle at 18% 82%, rgba(123, 31, 162, 0.26), transparent 34%), #090816'
    }}>
      <div className="glass-panel brand-panel auth-card" style={{
        padding: '48px',
        maxWidth: '560px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        boxShadow: '0 24px 80px rgba(0, 0, 0, 0.35)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <HomeCourtLogo size={112} showWordmark stacked />
          </div>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '360px', margin: '0 auto' }}>
            Real account access for your private court. Email-only sign up, secure password login, and unique usernames.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '16px' }}>
          {['signup', 'login'].map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => {
                setMode(entry);
                setError('');
              }}
              style={{
                border: 'none',
                borderRadius: '12px',
                padding: '14px 16px',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 700,
                color: 'white',
                background: mode === entry ? 'var(--brand-gradient)' : 'transparent'
              }}
            >
              {entry === 'signup' ? 'Create account' : 'Log in'}
            </button>
          ))}
        </div>

        <div className="auth-feature-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <div className="glass-panel" style={{ padding: '14px', borderRadius: '18px' }}>
            <Mail size={18} style={{ marginBottom: '10px', color: 'var(--secondary)' }} />
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>Email is your only login identity.</p>
          </div>
          <div className="glass-panel" style={{ padding: '14px', borderRadius: '18px' }}>
            <AtSign size={18} style={{ marginBottom: '10px', color: 'var(--primary)' }} />
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>Every username is reserved uniquely.</p>
          </div>
          <div className="glass-panel" style={{ padding: '14px', borderRadius: '18px' }}>
            <ShieldCheck size={18} style={{ marginBottom: '10px', color: '#7dd3fc' }} />
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>Passwords are stored hashed on the backend.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Email address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-glass)',
                padding: '16px',
                borderRadius: '12px',
                color: 'white',
                outline: 'none',
                fontSize: '16px'
              }}
            />
          </div>
          {mode === 'signup' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Unique username</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Pick a name only you can claim"
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-glass)',
                  padding: '16px',
                  borderRadius: '12px',
                  color: 'white',
                  outline: 'none',
                  fontSize: '16px'
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Letters, numbers, underscores, and periods only.
              </span>
            </div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Password</label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border-glass)',
              padding: '0 16px',
              borderRadius: '12px'
            }}>
              <KeyRound size={18} color="var(--text-secondary)" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Create a strong password' : 'Enter your password'}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '16px 0',
                  color: 'white',
                  outline: 'none',
                  fontSize: '16px',
                  width: '100%'
                }}
              />
            </div>
          </div>
          {mode === 'signup' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-glass)',
                  padding: '16px',
                  borderRadius: '12px',
                  color: 'white',
                  outline: 'none',
                  fontSize: '16px'
                }}
              />
            </div>
          ) : null}

          {error ? (
            <div style={{
              borderRadius: '14px',
              padding: '14px 16px',
              background: 'rgba(190, 24, 93, 0.16)',
              border: '1px solid rgba(244, 114, 182, 0.35)',
              color: '#fecdd3',
              fontSize: '14px'
            }}>
              {error}
            </div>
          ) : null}

          <button 
            type="submit"
            disabled={submitting}
            style={{
              background: 'var(--brand-gradient)',
              color: 'white',
              border: 'none',
              padding: '16px',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '16px',
              opacity: submitting ? 0.75 : 1
            }}
          >
            {submitting ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Log in'}
            <ArrowRight size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuthPage;
