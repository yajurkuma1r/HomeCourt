import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Home, Users, ArrowRight, ShieldCheck, LogOut, Edit2, X, UserCircle, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import HomeCourtLogo from '../components/shared/HomeCourtLogo';

const ProfileSetupModal = ({ user, onClose, onSave, error, setError }) => {
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [age, setAge] = useState(user?.age || '');
  const [gender, setGender] = useState(user?.gender || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [profilePicture, setProfilePicture] = useState(user?.profilePicture || '');

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError('Image must be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicture(reader.result);
        setError('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError('Name and surname are required.');
      return;
    }
    await onSave({
      firstName,
      lastName,
      age: parseInt(age, 10) || null,
      gender,
      phoneNumber,
      profilePicture
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="glass-panel brand-panel" style={{ width: 'min(500px, 100%)', padding: '32px', borderRadius: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserCircle color="var(--primary)" /> Profile Setup
          </h2>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
            <label style={{ cursor: 'pointer', position: 'relative', display: 'inline-block' }}>
              <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '2px dashed var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {profilePicture ? (
                  <img src={profilePicture} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <UserCircle size={48} color="var(--text-secondary)" />
                )}
              </div>
              <div style={{ position: 'absolute', bottom: 0, right: 0, background: 'var(--primary)', borderRadius: '50%', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', border: '2px solid #1a1a1a' }}>
                <Upload size={14} />
              </div>
              <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>First Name *</label>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '12px 16px', borderRadius: '12px', color: 'white', fontSize: '15px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Surname *</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '12px 16px', borderRadius: '12px', color: 'white', fontSize: '15px' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Age</label>
              <input type="number" value={age} onChange={(e) => setAge(e.target.value)} min="13" max="120" style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '12px 16px', borderRadius: '12px', color: 'white', fontSize: '15px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Gender</label>
              <select value={gender} onChange={(e) => setGender(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '12px 16px', borderRadius: '12px', color: 'white', fontSize: '15px', appearance: 'none' }}>
                <option value="" style={{ color: 'black' }}>Select...</option>
                <option value="Male" style={{ color: 'black' }}>Male</option>
                <option value="Female" style={{ color: 'black' }}>Female</option>
                <option value="Other" style={{ color: 'black' }}>Other</option>
                <option value="Prefer not to say" style={{ color: 'black' }}>Prefer not to say</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Phone Number (Optional)</label>
            <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+1 (555) 000-0000" style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '12px 16px', borderRadius: '12px', color: 'white', fontSize: '15px' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', gap: '12px' }}>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)', color: 'white', borderRadius: '12px', padding: '12px 20px', cursor: 'pointer', fontWeight: 600 }}>
              Cancel
            </button>
            <button type="submit" className="brand-button" style={{ padding: '12px 24px', borderRadius: '12px', fontSize: '15px', cursor: 'pointer', fontWeight: 700 }}>
              Save Profile
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const HouseSetup = () => {
  const [houseName, setHouseName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [houseToLeave, setHouseToLeave] = useState(null);
  const [houseToRename, setHouseToRename] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showProfileModal, setShowProfileModal] = useState(false);
  const { createHouse, joinHouse, reopenHouse, leaveHouse, renameHouse, updateProfile, houses, user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const intervalId = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(intervalId);
  }, []);

  const formatRelativeTime = (dateString) => {
    if (!dateString) return 'just now';

    const diffSeconds = Math.max(1, Math.floor((nowMs - new Date(dateString).getTime()) / 1000));
    if (diffSeconds < 60) return 'just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} min ago`;
    if (diffSeconds < 86400) {
      const hours = Math.floor(diffSeconds / 3600);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
    if (diffSeconds < 2592000) {
      const days = Math.floor(diffSeconds / 86400);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    const months = Math.floor(diffSeconds / 2592000);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!houseName.trim()) return;

    setError('');
    const house = await createHouse(houseName);
    setMode(null);
    setHouseName('');
    setNotice(`House created. Share invite code ${house.code} with others.`);
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setError('');
    setNotice('');

    try {
      await joinHouse(joinCode);
      navigate('/home');
    } catch (joinError) {
      setError(joinError.message);
    }
  };

  const handleCopy = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setNotice(`Invite code ${code} copied.`);
      setError('');
      setTimeout(() => setNotice(''), 2500);
    } catch {
      setError('Could not copy the invite code.');
    }
  };

  return (
    <div className="setup-page" style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'radial-gradient(circle at 72% 18%, rgba(255, 45, 160, 0.18), transparent 28%), radial-gradient(circle at 12% 86%, rgba(123, 31, 162, 0.24), transparent 36%)', position: 'relative' }}>
      <div className="setup-top-actions" style={{ position: 'absolute', top: '32px', right: '32px', zIndex: 50, display: 'flex', gap: '16px', alignItems: 'center' }}>
        <button
          type="button"
          onClick={logout}
          className="glass-panel"
          title="Logout"
          style={{ padding: '12px 16px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', border: '1px solid var(--border-glass)', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontWeight: 700 }}
        >
          <LogOut size={18} />
          Logout
        </button>
        <button
          type="button"
          onClick={() => { setError(''); setShowProfileModal(true); }}
          title={user?.firstName ? 'Edit Profile' : 'Complete Your Profile'}
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'var(--primary)',
            border: '3px solid rgba(255,255,255,0.2)',
            padding: 0,
            cursor: 'pointer',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: !user?.firstName ? '0 0 20px rgba(255, 45, 160, 0.6)' : '0 4px 16px rgba(0,0,0,0.4)',
            transition: 'transform 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          {user?.profilePicture ? (
            <img src={user.profilePicture} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: 'white' }}>
              {user?.username ? user.username.slice(0,2).toUpperCase() : <UserCircle size={32} color="white" />}
            </span>
          )}
        </button>
      </div>
      <div className="setup-shell" style={{ maxWidth: '900px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '22px' }}>
          <HomeCourtLogo size={88} showWordmark stacked />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ textAlign: 'center', marginBottom: '8px', letterSpacing: '0.04em' }}>
            Welcome, {user?.firstName ? `${user.firstName}!` : `${user?.username}`}
          </h1>
        </div>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '24px' }}>
          Create a new house to invite others, or join an existing one with a shared code.
        </p>
        {notice ? (
          <p style={{ textAlign: 'center', color: '#bfdbfe', marginBottom: '16px' }}>{notice}</p>
        ) : null}
        {error ? (
          <p style={{ textAlign: 'center', color: '#fda4af', marginBottom: '24px' }}>{error}</p>
        ) : null}

        {!mode ? (
          <div>
            <div className="setup-choice-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div className="glass-panel brand-panel setup-choice-card" onClick={() => { setError(''); setNotice(''); setMode('create'); }} style={{ padding: '40px', textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                  <Home size={64} color="var(--primary)" />
                </div>
                <h2>Create a House</h2>
                <p style={{ color: 'var(--text-secondary)', marginTop: '12px' }}>
                  Start a fresh space. You become admin automatically and get the invite code.
                </p>
              </div>
              <div className="glass-panel brand-panel setup-choice-card" onClick={() => { setError(''); setNotice(''); setMode('join'); }} style={{ padding: '40px', textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                  <Users size={64} color="var(--primary)" />
                </div>
                <h2>Join a House</h2>
                <p style={{ color: 'var(--text-secondary)', marginTop: '12px' }}>
                  Have a code from someone else? Enter it here to join their house.
                </p>
              </div>
            </div>

            <div style={{ marginTop: '48px' }}>
              <h3 style={{ marginBottom: '16px', color: 'var(--text-secondary)', textAlign: 'left' }}>Your Past Houses</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {houses.length === 0 ? (
                  <div className="glass-panel" style={{ padding: '20px', color: 'var(--text-secondary)' }}>
                    Houses you create or join will show up here. Since you are testing locally, create a house first and reuse that invite code later.
                  </div>
                ) : (
                  houses.map((house) => {
                    const otherMembers = (house.members || []).filter((member) => member.userId !== user?.id);
                    const subtitle = otherMembers.length > 0
                      ? `with ${otherMembers.map((member) => member.username).join(', ')}`
                      : house.currentUserRole === 'admin'
                        ? 'You created this house'
                        : 'You are a member of this house';

                    return (
                      <div key={house.id} className="glass-panel setup-house-row" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <h4 style={{ margin: 0, fontSize: '18px' }}>{house.name}</h4>
                            {house.currentUserRole === 'admin' ? (
                              <>
                                <button type="button" onClick={() => { setHouseToRename(house); setRenameValue(house.name); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }} title="Rename House">
                                  <Edit2 size={14} />
                                </button>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '999px', fontSize: '12px', color: '#d8b4fe', background: 'rgba(168, 85, 247, 0.16)' }}>
                                  <ShieldCheck size={12} />
                                  Admin
                                </span>
                              </>
                            ) : null}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                            <span>{subtitle}</span>
                            <span>Code: {house.code}</span>
                            <span>Last active: {formatRelativeTime(house.lastActiveAt)}</span>
                          </div>
                        </div>
                        <div className="setup-house-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <button type="button" onClick={() => handleCopy(house.code)} style={{ background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid var(--border-glass)', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Copy size={16} />
                            Copy code
                          </button>
                          <button type="button" onClick={async () => { setError(''); await reopenHouse(house.id); navigate('/home'); }} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid var(--border-glass)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Rejoin <ArrowRight size={16} />
                          </button>
                          <button type="button" onClick={() => setHouseToLeave(house)} style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#fecaca', border: '1px solid rgba(239, 68, 68, 0.35)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <LogOut size={16} />
                            Leave
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : mode === 'create' ? (
          <div className="glass-panel brand-panel setup-form-card" style={{ padding: '40px', maxWidth: '480px', margin: '0 auto' }}>
            <h2 style={{ marginBottom: '24px' }}>Name your House</h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input type="text" value={houseName} onChange={(e) => setHouseName(e.target.value)} placeholder="e.g. Our Cozy Corner" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '16px', borderRadius: '12px', color: 'white', fontSize: '16px' }} />
              <button type="submit" className="brand-button" style={{ padding: '16px', borderRadius: '12px', fontSize: '16px', cursor: 'pointer' }}>
                Create <ArrowRight size={18} style={{ verticalAlign: 'middle', marginLeft: '8px' }} />
              </button>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
                Creating a house makes you the admin, stores it in your history, and generates a shareable invite code.
              </p>
              <button type="button" onClick={() => setMode(null)} style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', marginTop: '8px' }}>
                Back
              </button>
            </form>
          </div>
        ) : (
          <div className="glass-panel brand-panel setup-form-card" style={{ padding: '40px', maxWidth: '480px', margin: '0 auto' }}>
            <h2 style={{ marginBottom: '24px' }}>Enter Invite Code</h2>
            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="e.g. HS-12AB3F" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '16px', borderRadius: '12px', color: 'white', fontSize: '16px' }} />
              <button type="submit" className="brand-button" style={{ padding: '16px', borderRadius: '12px', fontSize: '16px', cursor: 'pointer' }}>
                Join <ArrowRight size={18} style={{ verticalAlign: 'middle', marginLeft: '8px' }} />
              </button>
              <button type="button" onClick={() => setMode(null)} style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', marginTop: '8px' }}>
                Back
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Modals */}
      {houseToLeave && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-panel brand-panel" style={{ width: 'min(420px, 100%)', padding: '24px', borderRadius: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, color: '#fecaca' }}>{houseToLeave.currentUserRole === 'admin' ? 'Delete House?' : 'Leave House?'}</h3>
              <button onClick={() => setHouseToLeave(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
              {houseToLeave.currentUserRole === 'admin' 
                ? 'Are you sure? As the admin, leaving will permanently delete this house and remove all members.' 
                : 'Are you sure you want to leave this house? You will need a new invite code to rejoin.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setHouseToLeave(null)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)', color: 'white', borderRadius: '12px', padding: '10px 14px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={async () => {
                try {
                  await leaveHouse(houseToLeave.id);
                  setHouseToLeave(null);
                } catch (err) {
                  setError(err.message);
                  setHouseToLeave(null);
                }
              }} style={{ background: '#ef4444', border: 'none', color: 'white', borderRadius: '12px', padding: '10px 14px', fontWeight: 700, cursor: 'pointer' }}>
                {houseToLeave.currentUserRole === 'admin' ? 'Delete' : 'Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {houseToRename && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-panel brand-panel" style={{ width: 'min(420px, 100%)', padding: '24px', borderRadius: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Rename House</h3>
              <button onClick={() => setHouseToRename(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <input 
              type="text" 
              value={renameValue} 
              onChange={(e) => setRenameValue(e.target.value)} 
              placeholder="New House Name" 
              style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '12px 16px', borderRadius: '12px', color: 'white', fontSize: '15px', marginBottom: '20px' }} 
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setHouseToRename(null)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)', color: 'white', borderRadius: '12px', padding: '10px 14px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={async () => {
                if (!renameValue.trim()) return;
                try {
                  await renameHouse(houseToRename.id, renameValue);
                  setHouseToRename(null);
                } catch (err) {
                  setError(err.message);
                  setHouseToRename(null);
                }
              }} style={{ background: 'var(--primary)', border: 'none', color: 'white', borderRadius: '12px', padding: '10px 14px', fontWeight: 700, cursor: 'pointer' }}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfileModal && (
        <ProfileSetupModal 
          user={user} 
          onClose={() => setShowProfileModal(false)} 
          error={error}
          setError={setError}
          onSave={async (profileData) => {
            try {
              setError('');
              await updateProfile(profileData);
              setShowProfileModal(false);
              setNotice('Profile updated successfully!');
              setTimeout(() => setNotice(''), 3000);
            } catch (err) {
              setError(err.message || 'Failed to update profile.');
            }
          }}
        />
      )}
    </div>
  );
};

export default HouseSetup;
