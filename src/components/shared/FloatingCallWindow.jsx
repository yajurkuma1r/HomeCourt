import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LoaderCircle,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  Video,
  VideoOff,
  Wifi
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const FloatingCallWindow = ({ onClose }) => {
  const { activeHouse, user } = useAuth();
  const { socket, connected, callParticipants } = useSocket();
  const [minimized, setMinimized] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [joining, setJoining] = useState(true);
  const [error, setError] = useState('');
  const isSmallScreen = () => window.innerWidth <= 700;
  const getWindowSize = () => ({
    width: isSmallScreen() ? Math.min(300, window.innerWidth - 18) : 396,
    height: isSmallScreen() ? Math.min(430, window.innerHeight - 96) : 430
  });
  const getInitialPosition = () =>
    isSmallScreen()
      ? { x: 10, y: Math.max(10, window.innerHeight - getWindowSize().height - 86) }
      : {
          x: Math.max(20, window.innerWidth - 420),
          y: Math.max(20, window.innerHeight - 470)
        };
  const [position, setPosition] = useState(getInitialPosition);
  const [dragging, setDragging] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState([]);
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragActiveRef = useRef(false);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const remoteStreamsRef = useRef({});
  const callJoinedRef = useRef(false);

  const otherParticipants = useMemo(
    () => (callParticipants || []).filter((participant) => participant.userId !== user?.id),
    [callParticipants, user?.id]
  );

  const syncRemoteUsers = () => {
    setRemoteUsers(
      Object.values(remoteStreamsRef.current).map((entry) => ({
        userId: entry.userId,
        username: entry.username,
        stream: entry.stream,
        micOn: entry.micOn,
        videoOn: entry.videoOn
      }))
    );
  };

  const getPeer = (participant) => {
    if (peersRef.current[participant.userId]) {
      return peersRef.current[participant.userId];
    }

    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, localStreamRef.current);
      });
    }

    peer.onicecandidate = (event) => {
      if (!event.candidate || !socket || !activeHouse?.id) {
        return;
      }

      socket.emit('call:signal', {
        houseId: activeHouse.id,
        targetUserId: participant.userId,
        payload: {
          type: 'ice-candidate',
          candidate: event.candidate
        }
      });
    };

    peer.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (!stream) {
        return;
      }

      remoteStreamsRef.current[participant.userId] = {
        userId: participant.userId,
        username: participant.username,
        micOn: participant.micOn !== false,
        videoOn: participant.videoOn !== false,
        stream
      };
      syncRemoteUsers();
    };

    peersRef.current[participant.userId] = peer;
    return peer;
  };

  const closePeer = (userId) => {
    const peer = peersRef.current[userId];
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.close();
      delete peersRef.current[userId];
    }

    if (remoteStreamsRef.current[userId]) {
      delete remoteStreamsRef.current[userId];
      syncRemoteUsers();
    }
  };

  const sendOfferIfLeader = async (participant) => {
    if (!socket || !activeHouse?.id || !user?.id || user.id >= participant.userId) {
      return;
    }

    const peer = getPeer(participant);
    if (peer.signalingState !== 'stable') {
      return;
    }

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('call:signal', {
      houseId: activeHouse.id,
      targetUserId: participant.userId,
      payload: {
        type: 'offer',
        sdp: offer
      }
    });
  };

  useEffect(() => {
    let mounted = true;

    const joinCall = async () => {
      if (!socket || !connected || !activeHouse?.id) {
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true
        });

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        socket.emit('call:join', {
          houseId: activeHouse.id,
          micOn: true,
          videoOn: true
        });
        callJoinedRef.current = true;
        setJoining(false);
        setError('');
      } catch (joinError) {
        setJoining(false);
        setError(joinError.message || 'Camera or microphone access was blocked.');
      }
    };

    joinCall();

    return () => {
      mounted = false;
    };
  }, [socket, connected, activeHouse?.id]);

  useEffect(() => {
    if (!minimized && localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play?.().catch(() => {});
    }
  }, [joining, minimized, videoOn]);

  useEffect(() => {
    const handleResize = () => {
      const size = getWindowSize();
      setPosition((current) => ({
        x: Math.max(8, Math.min(window.innerWidth - size.width - 8, current.x)),
        y: Math.max(8, Math.min(window.innerHeight - size.height - 8, current.y))
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!socket || !activeHouse?.id) {
      return undefined;
    }

    const handleSignal = async ({ houseId, senderUserId, senderUsername, payload }) => {
      if (houseId !== activeHouse.id) {
        return;
      }

      const participant =
        otherParticipants.find((entry) => entry.userId === senderUserId) || {
          userId: senderUserId,
          username: senderUsername,
          micOn: true,
          videoOn: true
        };

      const peer = getPeer(participant);

      if (payload.type === 'offer' && payload.sdp) {
        await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('call:signal', {
          houseId: activeHouse.id,
          targetUserId: senderUserId,
          payload: {
            type: 'answer',
            sdp: answer
          }
        });
      } else if (payload.type === 'answer' && payload.sdp) {
        await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      } else if (payload.type === 'ice-candidate' && payload.candidate) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch {}
      }
    };

    socket.on('call:signal', handleSignal);
    return () => socket.off('call:signal', handleSignal);
  }, [socket, activeHouse?.id, otherParticipants]);

  useEffect(() => {
    if (!socket || !activeHouse?.id || !callJoinedRef.current) {
      return;
    }

    otherParticipants.forEach((participant) => {
      if (remoteStreamsRef.current[participant.userId]) {
        remoteStreamsRef.current[participant.userId] = {
          ...remoteStreamsRef.current[participant.userId],
          username: participant.username,
          micOn: participant.micOn !== false,
          videoOn: participant.videoOn !== false
        };
        syncRemoteUsers();
      }

      sendOfferIfLeader(participant).catch((offerError) => {
        setError(offerError.message || 'Could not start one of the peer connections.');
      });
    });

    Object.keys(peersRef.current).forEach((participantUserId) => {
      if (!otherParticipants.some((entry) => entry.userId === participantUserId)) {
        closePeer(participantUserId);
      }
    });
  }, [otherParticipants, socket, activeHouse?.id]);

  useEffect(() => {
    if (!socket || !activeHouse?.id || !callJoinedRef.current) {
      return;
    }

    socket.emit('call:media-state', {
      houseId: activeHouse.id,
      micOn,
      videoOn
    });
  }, [micOn, videoOn, socket, activeHouse?.id]);

  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }

    stream.getAudioTracks().forEach((track) => {
      track.enabled = micOn;
    });
    stream.getVideoTracks().forEach((track) => {
      track.enabled = videoOn;
    });
  }, [micOn, videoOn]);

  useEffect(() => {
    return () => {
      if (socket && activeHouse?.id && callJoinedRef.current) {
        socket.emit('call:leave', { houseId: activeHouse.id });
      }

      Object.keys(peersRef.current).forEach((userId) => closePeer(userId));
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [socket, activeHouse?.id]);

  const handlePointerDown = (event) => {
    dragActiveRef.current = true;
    setDragging(true);
    offsetRef.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragActiveRef.current) {
      return;
    }

    const size = minimized ? { width: 180, height: 64 } : getWindowSize();
    const maxX = window.innerWidth - size.width - 8;
    const maxY = window.innerHeight - size.height - 8;
    setPosition({
      x: Math.max(8, Math.min(maxX, event.clientX - offsetRef.current.x)),
      y: Math.max(8, Math.min(maxY, event.clientY - offsetRef.current.y))
    });
  };

  const handlePointerUp = (event) => {
    dragActiveRef.current = false;
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleClose = () => {
    if (socket && activeHouse?.id && callJoinedRef.current) {
      socket.emit('call:leave', { houseId: activeHouse.id });
    }

    callJoinedRef.current = false;
    Object.keys(peersRef.current).forEach((userId) => closePeer(userId));
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    onClose();
  };

  const statusLabel = error
    ? error
    : joining
      ? 'Joining the house call...'
      : connected
        ? `${otherParticipants.length + 1} participant${otherParticipants.length === 0 ? '' : 's'} connected`
        : 'Reconnecting...';

  if (minimized) {
    return (
      <div
        className="glass-panel floating-call-window floating-call-window--minimized"
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          zIndex: 1000,
          background: 'rgba(15, 15, 19, 0.92)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <Wifi size={14} color={connected ? '#22c55e' : '#f97316'} />
        <span style={{ fontWeight: 600, pointerEvents: 'none' }}>House Call</span>
        <button
          type="button"
          style={{ cursor: 'pointer', zIndex: 2, background: 'transparent', border: 'none', color: 'var(--text-secondary)', display: 'grid', placeItems: 'center' }}
          onClick={(event) => {
            event.stopPropagation();
            setMinimized(false);
          }}
        >
          <Maximize2 size={18} color="var(--text-secondary)" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="glass-panel floating-call-window"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${getWindowSize().width}px`,
        maxHeight: 'calc(100vh - 24px)',
        zIndex: 1000,
        background:
          'linear-gradient(180deg, rgba(18,18,30,0.98) 0%, rgba(10,10,18,0.98) 100%)',
        boxShadow: '0 18px 54px rgba(0,0,0,0.58)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '24px'
      }}
    >
      <div
        style={{
          padding: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-glass)',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: error ? '#fb7185' : connected ? '#22c55e' : '#f59e0b'
            }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px' }}>House Call</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{statusLabel}</div>
          </div>
        </div>
        <div
          style={{ cursor: 'pointer' }}
          onPointerDown={(event) => {
            event.stopPropagation();
            setMinimized(true);
          }}
        >
          <Minimize2 size={18} color="var(--text-secondary)" />
        </div>
      </div>

      <div className="floating-call-body" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: 0, overflowY: 'auto' }}>
        <div
          className="floating-call-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: remoteUsers.length > 0 ? '1fr 1fr' : '1fr',
            gap: '12px',
            minHeight: '180px',
            maxHeight: remoteUsers.length > 2 ? '300px' : 'none',
            overflowY: remoteUsers.length > 2 ? 'auto' : 'visible',
            paddingRight: remoteUsers.length > 2 ? '4px' : 0
          }}
        >
          {remoteUsers.map((participant) => (
            <ParticipantTile
              key={participant.userId}
              label={participant.username}
              stream={participant.stream}
              videoOn={participant.videoOn}
              micOn={participant.micOn}
            />
          ))}
          <div
            style={{
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '18px',
              position: 'relative',
              overflow: 'hidden',
              minHeight: '180px'
            }}
          >
            {videoOn ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#161627' }}>
                <VideoOff size={26} color="var(--text-secondary)" />
              </div>
            )}
            {joining ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(7,7,12,0.42)' }}>
                <LoaderCircle size={26} />
              </div>
            ) : null}
            <div style={{ position: 'absolute', bottom: '10px', left: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.55)', padding: '5px 9px', borderRadius: '999px', fontSize: '12px' }}>
              <span>You</span>
              {micOn ? <Mic size={12} /> : <MicOff size={12} />}
            </div>
          </div>
        </div>

        <div className="floating-call-controls" style={{ display: 'flex', justifyContent: 'center', gap: '14px', position: 'sticky', bottom: 0, padding: '8px 0 2px', background: 'linear-gradient(180deg, rgba(10,10,18,0), rgba(10,10,18,0.96) 35%)' }}>
          <button
            type="button"
            onClick={() => setMicOn((current) => !current)}
            className="sidebar-icon"
            style={{ background: micOn ? 'rgba(255,255,255,0.1)' : 'rgba(255,117,140,0.2)', color: micOn ? 'white' : 'var(--secondary)', padding: '12px', border: 'none' }}
          >
            {micOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          <button
            type="button"
            onClick={() => setVideoOn((current) => !current)}
            className="sidebar-icon"
            style={{ background: videoOn ? 'rgba(255,255,255,0.1)' : 'rgba(255,117,140,0.2)', color: videoOn ? 'white' : 'var(--secondary)', padding: '12px', border: 'none' }}
          >
            {videoOn ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="sidebar-icon"
            style={{ background: '#ef4444', color: 'white', padding: '12px', border: 'none' }}
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

const ParticipantTile = ({ label, stream, videoOn, micOn }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.06)',
        borderRadius: '18px',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '180px'
      }}
    >
      {videoOn ? (
        <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#161627' }}>
          <VideoOff size={26} color="var(--text-secondary)" />
        </div>
      )}
      <div style={{ position: 'absolute', bottom: '10px', left: '10px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.55)', padding: '5px 9px', borderRadius: '999px', fontSize: '12px' }}>
        <span>{label}</span>
        {micOn ? <Mic size={12} /> : <MicOff size={12} />}
      </div>
    </div>
  );
};

export default FloatingCallWindow;
