import React, { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Home, MessageSquare, Music, Video, Gamepad2, BookOpen, Phone, LogOut, PlusSquare, Camera, Search, ShieldCheck, UserMinus, Users, X, HelpCircle, Menu } from 'lucide-react';

import FloatingCallWindow from '../shared/FloatingCallWindow';
import HomeCourtLogo from '../shared/HomeCourtLogo';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

import HomeRoom from '../../pages/rooms/HomeRoom';
import ChatRoom from '../../pages/rooms/ChatRoom';
import MusicRoom from '../../pages/rooms/MusicRoom';
import MoviesRoom from '../../pages/rooms/MoviesRoom';
import GamesRoom from '../../pages/rooms/GamesRoom';
import ShowRoom from '../../pages/rooms/ShowRoom';
import PolaroidRoom from '../../pages/rooms/PolaroidRoom';
import StudyRoom from '../../pages/rooms/StudyRoom';

import VaultFeature from '../../pages/features/VaultFeature';
import CapsuleFeature from '../../pages/features/CapsuleFeature';
import CalendarFeature from '../../pages/features/CalendarFeature';
import NotebookFeature from '../../pages/features/NotebookFeature';
import ScreenShareFeature from '../../pages/features/ScreenShareFeature';
import HouseMapPage from '../../pages/rooms/HouseMapPage';

const HowToUseModal = ({ onClose }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
    <div className="glass-panel brand-panel" style={{ width: 'min(500px, 100%)', padding: '24px', borderRadius: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><HelpCircle size={24} color="var(--primary)" /> How to Use HomeCourt</h2>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: 'var(--text-secondary)', lineHeight: 1.5, fontSize: '14px' }}>
        <p>Welcome to HomeCourt! This is your digital house to stay close with your favorite people. Here is a breakdown of every room and feature:</p>
        
        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '12px' }}>
          <strong style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><Home size={16} /> Presence Room (Dashboard)</strong>
          The main hub of your house. See who is currently online, view glowing "footprints" of where they've recently been, jump into their active sessions, and swipe through the latest Polaroids.
        </div>
        
        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '12px' }}>
          <strong style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><MessageSquare size={16} /> Chat Room</strong>
          The global house chat. Leave messages, share updates, and talk with everyone. (Note: Movies and Study rooms have their own isolated chat boxes).
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '12px' }}>
          <strong style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><Music size={16} /> Music Room</strong>
          Search for songs via Spotify and listen together in perfectly synced real-time. If someone pauses or skips, it happens for everyone.
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '12px' }}>
          <strong style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><Video size={16} /> Movie Room</strong>
          Paste a YouTube link to watch a video together in sync. Includes an isolated chat just for people currently watching.
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '12px' }}>
          <strong style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><Gamepad2 size={16} /> Game Room</strong>
          Play multiplayer games together! Currently features:
          <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px' }}>
            <li><strong>Ludo:</strong> Classic board game up to 4 players.</li>
            <li><strong>Pictionary:</strong> Take turns drawing and guessing words.</li>
            <li><strong>Truth or Dare:</strong> Randomly pairs members for chaotic fun.</li>
            <li><strong>Food Draft:</strong> Everyone submits dishes and a spinning wheel randomly picks your meal.</li>
          </ul>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '12px' }}>
          <strong style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><Camera size={16} color="#d946ef" /> Polaroid & Showroom</strong>
          <strong>Polaroid:</strong> Instantly capture and broadcast a live photo. It appears as a lock-screen widget on the Presence Room dashboard.<br/>
          <strong>Showroom:</strong> Upload ephemeral photos that disappear after 24 hours.
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '12px' }}>
          <strong style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><BookOpen size={16} /> Study Room</strong>
          A focused environment featuring a Pomodoro timer (25/5 breaks), isolated chat, and a synced lo-fi study radio.
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '12px' }}>
          <strong style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><Search size={16} /> House Map</strong>
          See exactly where your housemates are located in the real world on an interactive 3D globe (requires location permission).
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '12px' }}>
          <strong style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><ShieldCheck size={16} /> Dashboard Features</strong>
          Accessed from the Home Room dashboard:
          <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px' }}>
            <li><strong>The Vault:</strong> Store permanent house memories, photos, and files. View "On This Day" throwbacks.</li>
            <li><strong>Time Capsules:</strong> Lock away messages and photos that can only be opened on a specific future date.</li>
            <li><strong>Calendar:</strong> Track birthdays, trips, and upcoming house events.</li>
            <li><strong>Shared Notebook:</strong> A collaborative, real-time rich text editor.</li>
            <li><strong>Screen Share:</strong> Broadcast your screen to the house in real-time.</li>
          </ul>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '12px' }}>
          <strong style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}><Phone size={16} /> House Call</strong>
          Tap the phone icon in the sidebar anytime to start a global voice call. You can talk to each other while navigating any room in the app!
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
        <button onClick={onClose} className="brand-button" style={{ borderRadius: '12px', padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>
          Got it
        </button>
      </div>
    </div>
  </div>
);

const Sidebar = ({ onStartCall, isCallActive, onRequestLogout, onOpenHelp, onNewHouse, footprints, user }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [currentTime, setCurrentTime] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  const getFootprintsForPath = (path) => {
    if (!footprints || !user) return [];
    return footprints.filter(f => f.path.startsWith(path) && f.userId !== user.id);
  };

  const navItems = [
    { path: '/home', icon: <Home size={28} />, label: 'PRESENCEROOM' },
    { path: '/chat', icon: <MessageSquare size={28} />, label: 'CHATROOM' },
    { path: '/music', icon: <Music size={28} />, label: 'MUSICROOM' },
    { path: '/movies', icon: <Video size={28} />, label: 'MOVIEROOM' },
    { path: '/games', icon: <Gamepad2 size={28} />, label: 'GAMEROOM' },
    { path: '/showroom', icon: <Camera size={28} />, label: 'SHOWROOM' },
    { path: '/polaroid', icon: <Camera size={28} color="#d946ef" />, label: 'POLAROID' },
    { path: '/study', icon: <BookOpen size={28} />, label: 'STUDYROOM' }
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-brand" style={{ marginBottom: '10px' }} title="HomeCourt">
        <HomeCourtLogo size={50} />
      </div>
      {navItems.map((item) => {
        const itemFootprints = getFootprintsForPath(item.path);
        const validFootprints = itemFootprints.filter(f => currentTime - f.timestamp < 3 * 60 * 1000);
        
        return (
          <div 
            key={item.path}
            className={`sidebar-icon ${location.pathname.startsWith(item.path) ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
            title={item.label}
            style={{ position: 'relative' }}
          >
            {item.icon}
            {validFootprints.slice(0, 1).map((f) => {
              const age = currentTime - f.timestamp;
              const maxAge = 3 * 60 * 1000;
              const opacity = Math.max(0.1, 1 - (age / maxAge));
              return (
                <div
                  className="sidebar-footprint"
                  key={f.userId} 
                  style={{ 
                    position: 'absolute', 
                    left: '60px', 
                    top: '50%', 
                    transform: 'translateY(-50%)', 
                    background: 'rgba(217, 70, 239, 0.15)', 
                    border: '1px solid rgba(217, 70, 239, 0.4)', 
                    color: '#fdf4ff', 
                    padding: '4px 8px', 
                    borderRadius: '12px', 
                    fontSize: '11px',
                    fontWeight: 600,
                    opacity,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    textShadow: '0 0 8px rgba(217, 70, 239, 0.6)',
                    zIndex: 50,
                    transition: 'opacity 1s ease'
                  }}
                >
                  ✨ {f.username} was here
                </div>
              );
            })}
          </div>
        );
      })}
      <div style={{ flex: 1 }} />
      {!isCallActive && (
        <div 
          className="sidebar-icon" 
          title="Start Call" 
          style={{ color: 'var(--primary)', marginBottom: '16px' }}
          onClick={onStartCall}
        >
          <Phone size={28} />
        </div>
      )}
      <div 
        className="sidebar-icon" 
        title="New House / Join House" 
        style={{ color: '#ff2da0', marginBottom: '16px' }}
        onClick={onNewHouse}
      >
        <PlusSquare size={28} />
      </div>
    </div>
  );
};

const roomLabels = {
  '/home': 'Presence Room',
  '/chat': 'Chat Room',
  '/music': 'Music Room',
  '/movies': 'Movie Room',
  '/games': 'Game Room',
  '/showroom': 'Showroom',
  '/polaroid': 'Polaroids',
  '/study': 'Study Room',
  '/map': 'House Map',
  '/vault': 'Vault',
  '/capsule': 'Capsules',
  '/calendar': 'Calendar',
  '/notebook': 'Shared Notebook',
  '/screen': 'Shared Screen Box'
};

const getRoomLabel = (pathname) => roomLabels[pathname] || 'Current Room';

const getActivityLabel = (roomPath) => {
  if (roomPath === '/movies') return '🎬 Movie';
  if (roomPath === '/music') return '🎧 Music';
  if (roomPath === '/study') return '📚 Study';
  if (roomPath === '/games') return '🎮 Games';
  if (roomPath === '/chat') return '💬 Chat';
  if (roomPath === '/home') return '🏠 Home';
  if (roomPath === '/map') return '📍 Map';
  if (roomPath === '/calendar') return '📅 Calendar';
  if (roomPath === '/vault') return '🖼️ Vault';
  if (roomPath === '/capsule') return '🎁 Capsule';
  if (roomPath === '/notebook') return '📓 Notebook';
  return '';
};

const MembersPanel = ({ membersData, query, onQueryChange, onKick, onPromote, currentUserId, navigate }) => {
  const members = membersData?.members || [];
  const filteredMembers = members.filter((member) => {
    const text = `${member.username || ''} ${member.email || ''} ${member.role || ''}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });
  const canKick = membersData?.viewerRole === 'admin';
  const canPromote = membersData?.viewerIsOriginalAdmin;

  return (
    <div className="glass-panel brand-panel members-panel" style={{ width: '360px', padding: '16px', borderRadius: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={18} color="var(--primary)" />
          <strong>House Members</strong>
        </div>
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          {membersData?.onlineCount || 0}/{membersData?.totalCount || 0} online
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.16em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total</div>
          <strong>{membersData?.totalCount || 0}</strong>
        </div>
        <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.16em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>This room</div>
          <strong>{membersData?.roomOnlineCount || 0}</strong>
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.22)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '10px 12px', marginBottom: '12px' }}>
        <Search size={16} color="var(--text-secondary)" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search users..."
          style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'white' }}
        />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto', paddingRight: '2px' }}>
        {filteredMembers.map((member) => (
          <div key={member.userId} style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.055)', border: member.isInRoom ? '1px solid rgba(255,45,160,0.45)' : '1px solid transparent' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{member.username}</strong>
                  {member.role === 'admin' ? <ShieldCheck size={14} color="var(--primary)" /> : null}
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: member.isOnline ? '#22c55e' : '#71717a' }} />
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '3px' }}>
                  {member.isOriginalAdmin ? 'Original admin' : member.role}
                  {member.isInRoom ? ' | in this room' : ''}
                  {member.currentRoom && (
                    <span 
                      onClick={(e) => {
                        if (!member.isInRoom) {
                          e.stopPropagation();
                          navigate(member.currentRoom);
                        }
                      }}
                      style={{ 
                        marginLeft: '8px', 
                        background: 'rgba(255,255,255,0.08)', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        cursor: member.isInRoom ? 'default' : 'pointer', 
                        color: member.isInRoom ? 'var(--text-secondary)' : '#60a5fa',
                        display: 'inline-block'
                      }}
                      title={member.isInRoom ? '' : "Tap to join"}
                    >
                      {getActivityLabel(member.currentRoom)}
                    </span>
                  )}
                </div>
              </div>
              {member.userId !== currentUserId ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  {canPromote && member.role !== 'admin' ? (
                    <button title="Make admin" onClick={() => onPromote(member.userId)} style={{ width: '32px', height: '32px', borderRadius: '10px', border: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.08)', color: 'white', cursor: 'pointer' }}>
                      <ShieldCheck size={15} />
                    </button>
                  ) : null}
                  {canKick && !member.isOriginalAdmin ? (
                    <button title="Kick member" onClick={() => onKick(member.userId)} style={{ width: '32px', height: '32px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.12)', color: '#fecaca', cursor: 'pointer' }}>
                      <UserMinus size={15} />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {filteredMembers.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px', padding: '10px' }}>No members match that search.</div>
        ) : null}
      </div>
    </div>
  );
};

const HouseInfoMenu = (props) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)} 
        className="glass-panel house-menu-trigger"
        style={{ 
          padding: '12px 18px', 
          borderRadius: '18px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px', 
          cursor: 'pointer', 
          border: isOpen ? '1px solid var(--primary)' : '1px solid var(--border-glass)', 
          background: 'rgba(15, 23, 42, 0.45)',
          color: 'white',
          height: '100%'
        }}
      >
        <Menu size={20} color={isOpen ? "var(--primary)" : "var(--text-secondary)"} />
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: '12px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '2px' }}>
            Menu
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>
            House Info
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="house-menu-popover" style={{ position: 'absolute', top: '100%', right: 0, marginTop: '12px', zIndex: 100, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <div className="glass-panel brand-panel" style={{ width: '360px', padding: '16px', borderRadius: '18px', textAlign: 'center' }}>
            <button
              type="button"
              className="house-menu-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close house info"
            >
              <X size={18} />
            </button>
            <div style={{ fontSize: '12px', letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Current House
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '0.12em' }}>
              {props.activeHouse?.name?.toUpperCase() || 'HOMECOURT'}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>
              {props.roomLabel}
            </div>
          </div>

          <MembersPanel {...props} />

          <button
            onClick={() => {
              setIsOpen(false);
              if (props.onOpenHelp) props.onOpenHelp();
            }}
            className="glass-panel"
            style={{
              padding: '16px',
              borderRadius: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              cursor: 'pointer',
              border: '1px solid var(--border-glass)',
              background: 'rgba(96, 165, 250, 0.15)',
              color: '#93c5fd',
              fontWeight: 700,
              fontSize: '15px'
            }}
          >
            <HelpCircle size={20} />
            How to Use
          </button>

          <button
            onClick={() => props.setShowLogoutConfirm(true)}
            className="glass-panel"
            style={{
              padding: '16px',
              borderRadius: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              cursor: 'pointer',
              border: '1px solid var(--border-glass)',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#fca5a5',
              fontWeight: 700,
              width: '100%'
            }}
          >
            <LogOut size={20} />
            Logout
          </button>

        </div>
      )}
    </div>
  );
};

const ConfirmLogoutModal = ({ onCancel, onConfirm }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
    <div className="glass-panel brand-panel" style={{ width: 'min(420px, 100%)', padding: '24px', borderRadius: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0 }}>Log out?</h3>
        <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </div>
      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
        You will leave this session and need to log in again to enter HomeCourt.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button onClick={onCancel} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)', color: 'white', borderRadius: '12px', padding: '10px 14px', cursor: 'pointer' }}>
          Stay
        </button>
        <button onClick={onConfirm} style={{ background: '#ef4444', border: 'none', color: 'white', borderRadius: '12px', padding: '10px 14px', fontWeight: 700, cursor: 'pointer' }}>
          Log out
        </button>
      </div>
    </div>
  </div>
);

const AppLayout = () => {
  const [isCallActive, setIsCallActive] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLeaveHouseConfirm, setShowLeaveHouseConfirm] = useState(false);
  const [membersData, setMembersData] = useState(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberError, setMemberError] = useState('');
  const { activeHouse, user, logout, getHouseMembers, kickHouseMember, promoteHouseMember, refreshHouses } = useAuth();
  const { socket, connected, presenceVersion, footprints } = useSocket();
  const location = useLocation();
  const navigate = useNavigate();
  const roomLabel = getRoomLabel(location.pathname);

  const currentRoomPath = useMemo(() => location.pathname, [location.pathname]);

  const loadMembers = async () => {
    if (!activeHouse?.id) {
      setMembersData(null);
      return;
    }

    try {
      const data = await getHouseMembers(activeHouse.id, currentRoomPath);
      setMembersData(data);
      setMemberError('');
    } catch (error) {
      setMemberError(error.message);
    }
  };

  useEffect(() => {
    if (!socket || !connected || !activeHouse?.id) {
      return;
    }

    socket.emit('room:enter', { houseId: activeHouse.id, roomPath: currentRoomPath });
  }, [socket, connected, activeHouse?.id, currentRoomPath]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadMembers();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [activeHouse?.id, currentRoomPath, presenceVersion]);

  useEffect(() => {
    const intervalId = setInterval(loadMembers, 5000);
    return () => clearInterval(intervalId);
  }, [activeHouse?.id, currentRoomPath]);

  const handleKick = async (memberUserId) => {
    try {
      await kickHouseMember(activeHouse.id, memberUserId);
      await refreshHouses();
      await loadMembers();
    } catch (error) {
      setMemberError(error.message);
    }
  };

  const handlePromote = async (memberUserId) => {
    try {
      await promoteHouseMember(activeHouse.id, memberUserId);
      await refreshHouses();
      await loadMembers();
    } catch (error) {
      setMemberError(error.message);
    }
  };

  return (
    <div className="app-container">
      <Sidebar 
        onStartCall={() => setIsCallActive(true)} 
        isCallActive={isCallActive} 
        onRequestLogout={() => setShowLogoutConfirm(true)} 
        onOpenHelp={() => setShowHelp(true)}
        onNewHouse={() => setShowLeaveHouseConfirm(true)}
        footprints={footprints}
        user={user}
      />
      
      <div className="main-content" style={{ position: 'relative' }}>
        <div className="app-header" style={{ marginBottom: '10px', paddingLeft: '2px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ marginTop: '8px' }}>
            <HomeCourtLogo size={46} showWordmark />
          </div>
          <div className="app-header-actions" style={{ display: 'flex', alignItems: 'stretch', gap: '14px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <HouseInfoMenu
              activeHouse={activeHouse}
              roomLabel={roomLabel}
              membersData={membersData}
              query={memberQuery}
              onQueryChange={setMemberQuery}
              onKick={handleKick}
              onPromote={handlePromote}
              currentUserId={user?.id}
              navigate={navigate}
              setShowLogoutConfirm={setShowLogoutConfirm}
              onOpenHelp={() => setShowHelp(true)}
            />
          </div>
        </div>
        {memberError ? (
          <div className="glass-panel" style={{ padding: '12px 16px', color: '#fecdd3', borderColor: 'rgba(244,114,182,0.3)', marginBottom: '16px' }}>
            {memberError}
          </div>
        ) : null}

        {showLeaveHouseConfirm && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div className="glass-panel brand-panel" style={{ width: 'min(420px, 100%)', padding: '24px', borderRadius: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, color: '#fca5a5' }}>Exit House Session?</h3>
                <button onClick={() => setShowLeaveHouseConfirm(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
                Are you sure you want to go to the setup page? You will exit your current house session and stop sharing your presence here.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button onClick={() => setShowLeaveHouseConfirm(false)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)', color: 'white', borderRadius: '12px', padding: '10px 14px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={() => { setShowLeaveHouseConfirm(false); navigate('/setup'); }} style={{ background: '#ef4444', border: 'none', color: 'white', borderRadius: '12px', padding: '10px 14px', fontWeight: 700, cursor: 'pointer' }}>
                  Exit Session
                </button>
              </div>
            </div>
          </div>
        )}

        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomeRoom />} />
          <Route path="/map" element={<HouseMapPage />} />
          <Route path="/chat" element={<ChatRoom />} />
          <Route path="/music" element={<MusicRoom />} />
          <Route path="/movies" element={<MoviesRoom />} />
          <Route path="/games" element={<GamesRoom />} />
          <Route path="/showroom" element={<ShowRoom />} />
          <Route path="/polaroid" element={<PolaroidRoom />} />
          <Route path="/study" element={<StudyRoom />} />
          
          {/* Dashboard Features Navigation */}
          <Route path="/vault" element={<VaultFeature />} />
          <Route path="/capsule" element={<CapsuleFeature />} />
          <Route path="/calendar" element={<CalendarFeature />} />
          <Route path="/notebook" element={<NotebookFeature />} />
          <Route path="/screen" element={<ScreenShareFeature />} />

          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>

        {isCallActive && <FloatingCallWindow onClose={() => setIsCallActive(false)} />}
        {showLogoutConfirm ? (
          <ConfirmLogoutModal
            onCancel={() => setShowLogoutConfirm(false)}
            onConfirm={() => {
              setShowLogoutConfirm(false);
              logout();
            }}
          />
        ) : null}
        
        {showHelp && (
          <HowToUseModal onClose={() => setShowHelp(false)} />
        )}
      </div>
    </div>
  );
};

export default AppLayout;
