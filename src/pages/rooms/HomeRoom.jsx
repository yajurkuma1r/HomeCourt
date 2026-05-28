import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Image as ImageIcon, Gift, MapPin, Users, Compass, Video, Music, BookOpen, Monitor, Pin, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { localDateTimeToMs } from '../../dateTime';

const ResumeSessionCard = ({ session, navigate }) => {
  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="glass-panel" style={{ padding: '12px 16px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '220px', border: '1px solid rgba(155, 81, 224, 0.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#9b51e0' }} />
          <span style={{ fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.08em', color: '#9b51e0', textTransform: 'uppercase' }}>Recent Session</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ background: 'rgba(255,255,255,0.06)', padding: '8px', borderRadius: '10px' }}>
          {session.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: '600' }}>{session.type}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {session.title} ({formatTime(session.positionMs)})
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2px' }}>
        <button onClick={() => navigate(session.path)} style={{
          background: '#9b51e0', border: 'none', borderRadius: '8px', color: 'white',
          padding: '6px 14px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer'
        }}>
          Resume
        </button>
      </div>
    </div>
  );
};

const LiveSessionCard = ({ session, navigate, currentTime }) => {
  let durationText = '';
  if (session.updatedAt && session.isPlaying) {
    const diffMins = Math.floor((currentTime - new Date(session.updatedAt).getTime()) / 60000);
    durationText = diffMins > 0 ? `${diffMins}m` : 'Just now';
  }

  return (
    <div className="glass-panel" style={{ padding: '12px 16px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '220px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', animation: 'softPulse 2s infinite' }} />
          <span style={{ fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.08em', color: '#22c55e', textTransform: 'uppercase' }}>Live Session</span>
        </div>
        {durationText && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{durationText}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ background: 'rgba(255,255,255,0.06)', padding: '8px', borderRadius: '10px' }}>
          {session.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: '600' }}>{session.type}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {session.title}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {session.members.slice(0, 3).map((m, i) => (
            <div key={m.userId} style={{
              width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px',
              fontWeight: 'bold', color: 'white', border: '2px solid #0f172a',
              marginLeft: i > 0 ? '-6px' : '0', zIndex: 10 - i,
              overflow: 'hidden'
            }} title={m.username}>
              {m.profilePicture ? (
                <img src={m.profilePicture} alt={m.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                m.username.slice(0, 2).toUpperCase()
              )}
            </div>
          ))}
          {session.members.length > 3 && (
            <div style={{
              width: '24px', height: '24px', borderRadius: '50%', background: 'var(--secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px',
              fontWeight: 'bold', color: 'white', border: '2px solid #0f172a',
              marginLeft: '-6px', zIndex: 1
            }}>
              +{session.members.length - 3}
            </div>
          )}
        </div>
        <button onClick={() => navigate(session.path)} style={{
          background: '#22c55e', border: 'none', borderRadius: '8px', color: 'white',
          padding: '6px 14px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer'
        }}>
          Join
        </button>
      </div>
    </div>
  );
};

const HomeRoom = () => {
  const {
    user,
    activeHouse,
    updateMemberLocation,
    getHouseMembers,
    getSpotifyMediaState,
    getYouTubeMediaState,
    getHouseEvents,
    getHouseCapsules,
    getVault
  } = useAuth();
  const { socket, footprints } = useSocket();
  const navigate = useNavigate();
  const lastLocationSentAtRef = useRef(0);

  const handleTogglePin = (polaroidId) => {
    if (!socket || !activeHouse?.id) return;
    socket.emit('polaroid:pin', { houseId: activeHouse.id, polaroidId });
  };

  const handleDeletePolaroid = (polaroidId) => {
    if (!socket || !activeHouse?.id) return;
    socket.emit('polaroid:delete', { houseId: activeHouse.id, polaroidId });
  };

  const activePolaroids = activeHouse?.polaroids;
  const displayedPolaroids = useMemo(() => {
    if (!activePolaroids) return [];
    return [...activePolaroids]
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.timestamp) - new Date(a.timestamp);
      })
      .slice(0, 3);
  }, [activePolaroids]);
  const [locationError, setLocationError] = useState('');
  const [sessions, setSessions] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [stats, setStats] = useState({ scheduledEvents: 0, liveEvents: 0, scheduledCapsules: 0, liveCapsules: 0, onThisDay: 0 });
  const [dashboardError, setDashboardError] = useState('');
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  const members = useMemo(() => activeHouse?.members || [], [activeHouse?.members]);

  useEffect(() => {
    if (!activeHouse?.id || !navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now();
        if (now - lastLocationSentAtRef.current < 10000) {
          return;
        }

        lastLocationSentAtRef.current = now;
        try {
          await updateMemberLocation(activeHouse.id, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          setLocationError('');
        } catch (error) {
          setLocationError(error.message);
        }
      },
      () => {
        setLocationError('Location access is off, so the map can only show saved house members.');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeHouse?.id]);


  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchSessions = useCallback(async () => {
    if (!activeHouse?.id) return;
    try {
      const [movies, music, study, calendarData, capsulesData, vaultData] = await Promise.all([
        getHouseMembers(activeHouse.id, '/movies'),
        getHouseMembers(activeHouse.id, '/music'),
        getHouseMembers(activeHouse.id, '/study'),
        getHouseEvents(activeHouse.id).catch(() => ({ events: [] })),
        getHouseCapsules(activeHouse.id).catch(() => ({ capsules: [] })),
        getVault(activeHouse.id).catch(() => ({ items: [] }))
      ]);

      if (!isMountedRef.current) return;
      
      const today = new Date();
      const onThisDayCount = (vaultData?.items || []).filter((item) => {
        const createdAt = new Date(item.createdAt);
        return createdAt.getDate() === today.getDate() && createdAt.getMonth() === today.getMonth() && createdAt.getFullYear() < today.getFullYear();
      }).length;
      
      const eventsList = calendarData?.events || [];
      const scheduledEventsCount = eventsList.filter(e => localDateTimeToMs(e.date) > today.getTime()).length;
      const liveEventsCount = eventsList.filter(e => localDateTimeToMs(e.date) <= today.getTime()).length;

      const capsulesList = capsulesData?.capsules || [];
      const scheduledCapsulesCount = capsulesList.filter(c => localDateTimeToMs(c.unlockAt) > today.getTime()).length;
      const liveCapsulesCount = capsulesList.filter(c => localDateTimeToMs(c.unlockAt) <= today.getTime()).length;

      setStats({
        scheduledEvents: scheduledEventsCount,
        liveEvents: liveEventsCount,
        scheduledCapsules: scheduledCapsulesCount,
        liveCapsules: liveCapsulesCount,
        onThisDay: onThisDayCount
      });
      setDashboardError('');
      const active = [];
      const recent = [];

      const movieMembers = movies.members.filter(m => m.isInRoom);
      const yt = await getYouTubeMediaState(activeHouse.id).catch(() => ({}));
      if (movieMembers.length > 0) {
        active.push({
          id: 'movies',
          type: 'Movie Room',
          icon: <Video size={16} />,
          path: '/movies',
          members: movieMembers,
          isPlaying: yt.isPlaying,
          updatedAt: yt.updatedAt,
          title: yt.isPlaying ? (yt.title || 'Watching a video') : 'Hanging out'
        });
      } else if (yt.title && yt.positionMs > 0) {
        recent.push({
          id: 'resume-movies',
          type: 'Continue where you left off 🎬',
          icon: <Video size={16} />,
          path: '/movies',
          positionMs: yt.positionMs,
          title: yt.title
        });
      }

      const musicMembers = music.members.filter(m => m.isInRoom);
      const sp = await getSpotifyMediaState(activeHouse.id).catch(() => ({}));
      if (musicMembers.length > 0) {
        active.push({
          id: 'music',
          type: 'Music Room',
          icon: <Music size={16} />,
          path: '/music',
          members: musicMembers,
          isPlaying: sp.isPlaying,
          updatedAt: sp.updatedAt,
          title: sp.isPlaying ? (sp.title || 'Listening to music') : 'Hanging out'
        });
      } else if (sp.title && sp.positionMs > 0) {
        recent.push({
          id: 'resume-music',
          type: 'Continue where you left off 🎵',
          icon: <Music size={16} />,
          path: '/music',
          positionMs: sp.positionMs,
          title: sp.title
        });
      }

      const studyMembers = study.members.filter(m => m.isInRoom);
      if (studyMembers.length > 0) {
        active.push({
          id: 'study',
          type: 'Study Room',
          icon: <BookOpen size={16} />,
          path: '/study',
          members: studyMembers,
          isPlaying: true,
          updatedAt: null,
          title: 'Deep focus'
        });
      }

      setSessions(active);
      setRecentSessions(recent);
    } catch (error) {
      console.error('Failed to fetch live sessions:', error);
      setDashboardError(error.message || 'Could not refresh Presence Room data.');
    }
  }, [activeHouse?.id, getHouseEvents, getHouseCapsules, getVault, getHouseMembers, getSpotifyMediaState, getYouTubeMediaState]);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => {
      clearInterval(interval);
    };
  }, [fetchSessions]);

  useEffect(() => {
    if (!socket) return;
    
    const handleUpdate = () => {
      fetchSessions();
    };

    socket.on('house:presence-updated', handleUpdate);
    socket.on('house:members-updated', handleUpdate);
    socket.on('house:calendar-updated', handleUpdate);
    socket.on('house:capsules-updated', handleUpdate);
    socket.on('polaroid:new', handleUpdate);

    return () => {
      socket.off('house:presence-updated', handleUpdate);
      socket.off('house:members-updated', handleUpdate);
      socket.off('house:calendar-updated', handleUpdate);
      socket.off('house:capsules-updated', handleUpdate);
      socket.off('polaroid:new', handleUpdate);
    };
  }, [socket, fetchSessions]);

  const renderFootprint = (path) => {
    if (!footprints || !user) return null;
    const validFootprints = footprints.filter(f => f.path.startsWith(path) && f.userId !== user.id && (currentTime - f.timestamp < 3 * 60 * 1000));
    if (validFootprints.length === 0) return null;
    
    return validFootprints.slice(0, 1).map(f => {
      const age = currentTime - f.timestamp;
      const opacity = Math.max(0.1, 1 - (age / (3 * 60 * 1000)));
      return (
        <div key={f.userId} style={{
          position: 'absolute',
          top: '-12px',
          right: '12px',
          background: 'rgba(217, 70, 239, 0.15)',
          border: '1px solid rgba(217, 70, 239, 0.4)',
          color: '#fdf4ff',
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 600,
          opacity,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          textShadow: '0 0 8px rgba(217, 70, 239, 0.6)',
          zIndex: 10,
          transition: 'opacity 1s ease'
        }}>
          ✨ {f.username} was here
        </div>
      );
    });
  };

  const mappedMembers = members.filter((member) => member.location);

  return (
    <div className="home-room" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '24px', padding: '0 16px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            <Users size={16} />
            <span>{members.length} user{members.length === 1 ? '' : 's'} in this house</span>
          </div>
          <h2 style={{ margin: '0 0 10px 0', letterSpacing: '0.08em', fontSize: '22px' }}>PRESENCEROOM</h2>
          {locationError ? (
            <div style={{ color: '#fda4af', fontSize: '13px', marginTop: '4px' }}>{locationError}</div>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
          {sessions.length > 0 || recentSessions.length > 0 ? (
            <>
              {sessions.map(s => (
                <LiveSessionCard key={s.id} session={s} navigate={navigate} currentTime={currentTime} />
              ))}
              {recentSessions.map(s => (
                <ResumeSessionCard key={s.id} session={s} navigate={navigate} />
              ))}
            </>
          ) : (
            <div className="glass-panel" style={{ padding: '12px 16px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '220px', border: '1px dashed rgba(255, 255, 255, 0.1)', opacity: 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-secondary)' }} />
                <span style={{ fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.08em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>No Active Sessions</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                When someone starts a movie, music, or study session, it will appear here.
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        {members.map((member) => {
          const initials = member.username.slice(0, 2).toUpperCase();
          const isYou = member.userId === user?.id;
          const locationReady = Boolean(member.location);

          return (
            <div key={member.userId} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative' }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  border: `4px solid ${isYou ? 'var(--primary)' : 'var(--secondary)'}`,
                  background: isYou ? 'linear-gradient(135deg, #16a34a, #22c55e)' : 'linear-gradient(135deg, #1f2937, #4b5563)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  color: 'white',
                  overflow: 'hidden'
                }}>
                  {member.profilePicture ? (
                    <img src={member.profilePicture} alt={member.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    initials
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/map')}
                  title="Open house map"
                  style={{
                    position: 'absolute',
                    right: '-2px',
                    bottom: '-2px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '999px',
                    border: '1px solid rgba(255,255,255,0.14)',
                    background: 'rgba(15, 23, 42, 0.92)',
                    color: locationReady ? '#7dd3fc' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <Compass size={14} />
                </button>
              </div>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>{member.username}</h3>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {isYou ? 'You' : member.role === 'admin' ? 'Admin' : 'Member'}
                </div>
                <div style={{ fontSize: '11px', color: locationReady ? '#93c5fd' : 'var(--text-secondary)', marginTop: '4px' }}>
                  {locationReady ? 'Location shared' : 'Location unavailable'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {displayedPolaroids && displayedPolaroids.length > 0 && (
        <div style={{ width: '100%', maxWidth: '1000px', margin: '0 auto 16px auto' }}>
          <h2 style={{ paddingLeft: '8px', margin: '0 0 12px 0', fontSize: '18px', color: '#fca5a5' }}>Latest Polaroids</h2>
          <div style={{ width: '100%', overflowX: 'auto', display: 'flex', gap: '20px', paddingBottom: '16px', scrollSnapType: 'x mandatory' }}>
            {displayedPolaroids.map(polaroid => {
              return (
                <div key={polaroid.id} style={{ 
                  flex: '0 0 auto', width: '240px', height: '300px', padding: '10px 10px 60px 10px', 
                  background: '#f8fafc', borderRadius: '4px', position: 'relative', scrollSnapAlign: 'start', 
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  transform: 'rotate(-1deg)',
                  transition: 'transform 0.2s ease',
                  cursor: 'default'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'rotate(0deg) scale(1.02)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'rotate(-1deg) scale(1)'}
                >
                  <div style={{ width: '100%', height: '100%', background: '#e5e5e5', overflow: 'hidden', position: 'relative' }}>
                    <img src={polaroid.imageDataUrl} alt="Polaroid" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    
                    {/* Action buttons (Pin, Delete) */}
                    <div style={{ 
                      position: 'absolute', 
                      top: '8px', 
                      right: '8px', 
                      display: 'flex', 
                      gap: '8px', 
                      zIndex: 10
                    }}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePin(polaroid.id);
                        }}
                        title={polaroid.isPinned ? "Unpin polaroid" : "Pin polaroid to top"}
                        style={{
                          background: polaroid.isPinned ? 'rgba(234, 179, 8, 0.95)' : 'rgba(15, 23, 42, 0.75)',
                          border: 'none',
                          borderRadius: '50%',
                          width: '32px',
                          height: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: polaroid.isPinned ? 'white' : 'rgba(255,255,255,0.8)',
                          backdropFilter: 'blur(4px)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'scale(1.1)';
                          if (!polaroid.isPinned) e.currentTarget.style.background = 'rgba(234, 179, 8, 0.85)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.background = polaroid.isPinned ? 'rgba(234, 179, 8, 0.95)' : 'rgba(15, 23, 42, 0.75)';
                        }}
                      >
                        <Pin size={14} fill={polaroid.isPinned ? "white" : "none"} style={{ transform: polaroid.isPinned ? 'none' : 'rotate(45deg)' }} />
                      </button>

                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePolaroid(polaroid.id);
                        }}
                        title="Delete polaroid"
                        style={{
                          background: 'rgba(15, 23, 42, 0.75)',
                          border: 'none',
                          borderRadius: '50%',
                          width: '32px',
                          height: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: '#f87171',
                          backdropFilter: 'blur(4px)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'scale(1.1)';
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.9)';
                          e.currentTarget.style.color = 'white';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.background = 'rgba(15, 23, 42, 0.75)';
                          e.currentTarget.style.color = '#f87171';
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div style={{ position: 'absolute', bottom: '12px', left: '16px', right: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', color: '#1e293b' }}>
                    <div>
                      <h3 style={{ margin: 0, fontFamily: '"Caveat", "Indie Flower", cursive, sans-serif', fontSize: '20px', fontWeight: 'bold' }}>{polaroid.houseName || activeHouse?.name}</h3>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>{new Date(polaroid.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <span style={{ fontFamily: '"Caveat", "Indie Flower", cursive, sans-serif', fontSize: '16px', color: '#d946ef', fontWeight: 'bold' }}>{polaroid.senderUsername}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <h2 style={{ paddingLeft: '8px', margin: 0, alignSelf: 'center', fontSize: '20px' }}>House Dashboard (Code: {activeHouse?.code || 'MOCK'})</h2>
      {dashboardError ? (
        <div className="glass-panel" style={{ maxWidth: '1000px', width: '100%', margin: '0 auto', padding: '12px 16px', color: '#fecdd3', borderColor: 'rgba(244,114,182,0.3)' }}>
          {dashboardError}
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', maxWidth: '1000px', width: '100%', margin: '0 auto', flex: 1 }}>
        <div onClick={() => navigate('/calendar')} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', cursor: 'pointer', position: 'relative' }}>
          {renderFootprint('/calendar')}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(155, 81, 224, 0.2)', padding: '10px', borderRadius: '12px' }}><Calendar color="var(--primary)" size={20} /></div>
            <h3 style={{ margin: 0 }}>Events & Calendar</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>{stats.scheduledEvents} scheduled, {stats.liveEvents} live.</p>
        </div>
        <div onClick={() => navigate('/vault')} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', cursor: 'pointer', position: 'relative' }}>
          {renderFootprint('/vault')}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(255, 117, 140, 0.2)', padding: '10px', borderRadius: '12px' }}><ImageIcon color="var(--secondary)" size={20} /></div>
            <h3 style={{ margin: 0 }}>The Vault</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            {stats.onThisDay > 0 ? `"On this day" - View ${stats.onThisDay} memor${stats.onThisDay === 1 ? 'y' : 'ies'} from the past.` : 'Store and view permanent house memories.'}
          </p>
        </div>
        <div onClick={() => navigate('/capsule')} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', cursor: 'pointer', position: 'relative' }}>
          {renderFootprint('/capsule')}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(34, 197, 94, 0.2)', padding: '10px', borderRadius: '12px' }}><Gift color="#22c55e" size={20} /></div>
            <h3 style={{ margin: 0 }}>Surprise Capsule</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>{stats.scheduledCapsules} scheduled, {stats.liveCapsules} live.</p>
        </div>
        <div onClick={() => navigate('/map')} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', cursor: 'pointer', position: 'relative' }}>
          {renderFootprint('/map')}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '10px', borderRadius: '12px' }}><MapPin color="#3b82f6" size={20} /></div>
            <h3 style={{ margin: 0 }}>House Map</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            {mappedMembers.length > 0 ? `${mappedMembers.length} live location${mappedMembers.length === 1 ? '' : 's'} available. Open the map to see everyone in real time.` : 'Open the map and allow location access to start plotting members.'}
          </p>
        </div>
        <div onClick={() => navigate('/notebook')} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', cursor: 'pointer', position: 'relative' }}>
          {renderFootprint('/notebook')}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(217, 70, 239, 0.2)', padding: '10px', borderRadius: '12px' }}><BookOpen color="#d946ef" size={20} /></div>
            <h3 style={{ margin: 0 }}>Shared Notebook</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>Real-time notes and sketches for the house.</p>
        </div>
        <div onClick={() => navigate('/screen')} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', cursor: 'pointer', position: 'relative' }}>
          {renderFootprint('/screen')}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(14, 165, 233, 0.2)', padding: '10px', borderRadius: '12px' }}><Monitor color="#0ea5e9" size={20} /></div>
            <h3 style={{ margin: 0 }}>Shared Screen Box</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>View the admin's broadcasted screen live. Starting a screen share works on desktop only.</p>
        </div>
      </div>

    </div>
  );
};

export default HomeRoom;
