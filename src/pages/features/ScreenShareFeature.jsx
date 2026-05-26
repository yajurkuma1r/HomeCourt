import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Monitor, MonitorPlay, MonitorX, Users, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const ScreenShareFeature = () => {
  const navigate = useNavigate();
  const { activeHouse, user, getHouseMembers } = useAuth();
  const { socket, connected } = useSocket();
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeSharer, setActiveSharer] = useState(null);
  const [isSharing, setIsSharing] = useState(false);
  const [viewers, setViewers] = useState([]);
  const [error, setError] = useState('');
  
  const localStreamRef = useRef(null);
  const videoRef = useRef(null);
  const peersRef = useRef({});

  useEffect(() => {
    if (!activeHouse?.id || !user?.id) return;
    
    // Determine if current user is admin
    getHouseMembers(activeHouse.id)
      .then(data => {
        const member = data?.members?.find(m => m.userId === user.id);
        setIsAdmin(member?.role === 'admin');
      })
      .catch(console.error);
  }, [activeHouse?.id, user?.id]);

  useEffect(() => {
    if (!socket || !connected || !activeHouse?.id) return;

    // Viewers join automatically to notify admin
    if (!isSharing) {
      socket.emit('screen:join-viewer', { houseId: activeHouse.id });
    }

    const handleActiveSharer = (sharer) => {
      setActiveSharer(sharer);
      if (sharer && sharer.adminId === user.id) {
        // I am the sharer (handled by startShare)
      } else if (!sharer) {
        // Share stopped
        if (videoRef.current) videoRef.current.srcObject = null;
        Object.values(peersRef.current).forEach(p => p.close());
        peersRef.current = {};
      }
    };

    const handleViewerJoined = async ({ viewerId, viewerUsername }) => {
      if (!isSharing || !localStreamRef.current) return;
      
      setViewers(prev => {
        if (!prev.find(v => v.id === viewerId)) {
          return [...prev, { id: viewerId, username: viewerUsername }];
        }
        return prev;
      });

      // Create peer for viewer
      const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current[viewerId] = peer;

      localStreamRef.current.getTracks().forEach(track => {
        peer.addTrack(track, localStreamRef.current);
      });

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('screen:signal', {
            houseId: activeHouse.id,
            targetUserId: viewerId,
            payload: { type: 'ice-candidate', candidate: event.candidate }
          });
        }
      };

      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('screen:signal', {
          houseId: activeHouse.id,
          targetUserId: viewerId,
          payload: { type: 'offer', sdp: offer }
        });
      } catch (err) {
        console.error('Error creating offer:', err);
      }
    };

    const handleSignal = async ({ houseId, senderUserId, payload }) => {
      if (houseId !== activeHouse.id) return;

      if (payload.type === 'offer' && !isSharing) {
        // Viewer receives offer
        const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peersRef.current[senderUserId] = peer;

        peer.ontrack = (event) => {
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
          }
        };

        peer.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('screen:signal', {
              houseId: activeHouse.id,
              targetUserId: senderUserId,
              payload: { type: 'ice-candidate', candidate: event.candidate }
            });
          }
        };

        await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('screen:signal', {
          houseId: activeHouse.id,
          targetUserId: senderUserId,
          payload: { type: 'answer', sdp: answer }
        });
      } else if (payload.type === 'answer' && isSharing) {
        // Admin receives answer
        const peer = peersRef.current[senderUserId];
        if (peer) {
          await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        }
      } else if (payload.type === 'ice-candidate') {
        const peer = peersRef.current[senderUserId];
        if (peer && peer.remoteDescription) {
          try {
            await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (e) {
            console.error('Error adding ICE candidate', e);
          }
        }
      }
    };

    socket.on('screen:active-sharer', handleActiveSharer);
    socket.on('screen:viewer-joined', handleViewerJoined);
    socket.on('screen:signal', handleSignal);

    return () => {
      socket.off('screen:active-sharer', handleActiveSharer);
      socket.off('screen:viewer-joined', handleViewerJoined);
      socket.off('screen:signal', handleSignal);
    };
  }, [socket, connected, activeHouse?.id, isSharing]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isSharing && socket && activeHouse?.id) {
        socket.emit('screen:stop', { houseId: activeHouse.id });
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      Object.values(peersRef.current).forEach(p => p.close());
    };
  }, [socket, activeHouse?.id, isSharing]);

  const startShare = async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: true
      });
      
      localStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Handle user clicking "Stop sharing" on the browser's built-in bar
      stream.getVideoTracks()[0].onended = () => {
        stopShare();
      };

      setIsSharing(true);
      socket.emit('screen:start', { houseId: activeHouse.id });
      
    } catch (err) {
      setError('Screen sharing was denied or failed to start.');
      console.error(err);
    }
  };

  const stopShare = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    
    Object.values(peersRef.current).forEach(p => p.close());
    peersRef.current = {};
    setViewers([]);
    setIsSharing(false);
    
    if (socket && activeHouse?.id) {
      socket.emit('screen:stop', { houseId: activeHouse.id });
    }
  };

  return (
    <div style={{ padding: '32px', height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <ArrowLeft size={28} style={{ cursor: 'pointer' }} onClick={() => navigate(-1)} />
          <div>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Monitor color="var(--primary)" /> Shared Screen Box
            </h2>
            <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>
              {activeSharer 
                ? `${activeSharer.username} is sharing their screen.` 
                : 'Waiting for an admin to start a screen share...'}
            </p>
          </div>
        </div>

        {isAdmin && !isSharing && (
          <button onClick={startShare} disabled={activeSharer && activeSharer.adminId !== user?.id} className="brand-button" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '12px', fontWeight: 600, opacity: (activeSharer && activeSharer.adminId !== user?.id) ? 0.5 : 1 }}>
            <MonitorPlay size={20} /> Start Share
          </button>
        )}
        
        {isSharing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ background: 'rgba(255,255,255,0.06)', padding: '8px 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              <Users size={16} /> {viewers.length} watching
            </div>
            <button onClick={stopShare} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '12px', fontWeight: 600, background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer' }}>
              <MonitorX size={20} /> Stop Share
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="glass-panel" style={{ padding: '16px', marginBottom: '24px', color: '#fecdd3', borderColor: 'rgba(244, 114, 182, 0.3)' }}>
          {error}
        </div>
      )}

      <div className="glass-panel" style={{ padding: '14px 16px', marginBottom: '18px', color: '#bfdbfe', borderColor: 'rgba(96,165,250,0.28)', lineHeight: 1.5 }}>
        Screen sharing can only be started from a desktop browser. Phones can usually view a shared screen, but mobile browsers do not allow starting a full screen share.
      </div>

      <div className="glass-panel" style={{ flex: 1, borderRadius: '24px', overflow: 'hidden', position: 'relative', background: '#0f0f13', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted={isSharing} // Mute local playback to prevent feedback
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: (isSharing || activeSharer) ? 'block' : 'none' }} 
        />
        
        {!isSharing && !activeSharer && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-secondary)' }}>
            <Monitor size={64} style={{ opacity: 0.2, marginBottom: '20px' }} />
            <h3 style={{ margin: 0, fontWeight: 500 }}>No active screen share</h3>
            {isAdmin && <p style={{ fontSize: '14px', marginTop: '8px' }}>Click 'Start Share' above to broadcast to the house.</p>}
          </div>
        )}
        
        {activeSharer && !isSharing && (
          <div style={{ position: 'absolute', bottom: '20px', left: '20px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', padding: '10px 20px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e' }} />
            <span style={{ fontWeight: 500 }}>Viewing {activeSharer.username}'s screen</span>
          </div>
        )}
        
        {isSharing && (
          <div style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', backdropFilter: 'blur(10px)', padding: '10px 20px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '10px', color: '#fca5a5' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 2s infinite' }} />
            <span style={{ fontWeight: 600 }}>You are sharing your screen</span>
          </div>
        )}
      </div>
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default ScreenShareFeature;
