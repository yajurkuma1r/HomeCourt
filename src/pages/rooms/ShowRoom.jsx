import React, { useEffect, useRef, useState } from 'react';
import { Camera, Eye, EyeOff, Send, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

const ShowRoom = () => {
  const { activeHouse, getShowroomSnaps, createShowroomSnap, viewShowroomSnap } = useAuth();
  const { socket } = useSocket();
  const [snaps, setSnaps] = useState([]);
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState('');
  const [viewingSnap, setViewingSnap] = useState(null);
  const [openingSnapId, setOpeningSnapId] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const loadSnaps = async () => {
    if (!activeHouse?.id) {
      return;
    }

    try {
      const data = await getShowroomSnaps(activeHouse.id);
      setSnaps(data.snaps || []);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    loadSnaps();
  }, [activeHouse?.id]);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    const handleSnapCreated = () => {
      loadSnaps();
    };

    const handleSnapViewed = ({ snapId }) => {
      setSnaps((current) =>
        current.map((snap) =>
          snap.id === snapId ? { ...snap, canOpen: false, viewed: true } : snap
        )
      );
    };

    const handleSnapRemoved = ({ snapId }) => {
      setSnaps((current) => current.filter((snap) => snap.id !== snapId));
    };

    socket.on('showroom:snap-created', handleSnapCreated);
    socket.on('showroom:snap-viewed', handleSnapViewed);
    socket.on('showroom:snap-removed', handleSnapRemoved);

    return () => {
      socket.off('showroom:snap-created', handleSnapCreated);
      socket.off('showroom:snap-viewed', handleSnapViewed);
      socket.off('showroom:snap-removed', handleSnapRemoved);
    };
  }, [socket, activeHouse?.id]);

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user'
        },
        audio: false
      });

      streamRef.current = stream;
      setCameraOpen(true);
      setCapturedImage('');

      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch (cameraError) {
      setError(cameraError.message || 'Could not open the camera.');
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setCapturedImage('');
  };

  const captureImage = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 960;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // Mirror the image horizontally
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Reset transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    setCapturedImage(canvas.toDataURL('image/jpeg', 0.9));
  };

  const sendSnap = async () => {
    if (!capturedImage || !activeHouse?.id) {
      return;
    }

    try {
      const response = await createShowroomSnap(activeHouse.id, {
        imageDataUrl: capturedImage
      });
      setSnaps((current) => [response.snap, ...current]);
      closeCamera();
      setError('');
    } catch (sendError) {
      setError(sendError.message);
    }
  };

  const openSnap = async (snapId) => {
    if (!activeHouse?.id) {
      return;
    }

    try {
      setOpeningSnapId(snapId);
      const response = await viewShowroomSnap(activeHouse.id, snapId);
      setViewingSnap(response.snap);
      setSnaps((current) => (
        response.removed
          ? current.filter((snap) => snap.id !== snapId)
          : current.map((snap) =>
              snap.id === snapId ? { ...snap, canOpen: false, viewed: true } : snap
            )
      ));
      setError('');
    } catch (viewError) {
      setError(viewError.message);
    } finally {
      setOpeningSnapId('');
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, letterSpacing: '0.08em', fontSize: '22px' }}>SHOWROOM</h2>
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Real-time house snaps. Everyone else gets one view only, then the snap disappears once all recipients have opened it.
          </span>
        </div>
        <button
          type="button"
          onClick={openCamera}
          style={{
            background: 'linear-gradient(135deg, #f43f5e, #fb7185)',
            color: 'white',
            border: 'none',
            borderRadius: '14px',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            fontWeight: 700
          }}
        >
          <Camera size={18} />
          Click
        </button>
      </div>

      {error ? (
        <div className="glass-panel" style={{ padding: '12px 16px', color: '#fecdd3', borderColor: 'rgba(244,114,182,0.3)' }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '18px' }}>
        {snaps.map((snap) => (
          <div key={snap.id} className="glass-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px', borderRadius: '20px' }}>
            <div style={{ background: 'linear-gradient(135deg, rgba(244,63,94,0.2), rgba(251,113,133,0.08))', borderRadius: '16px', minHeight: '210px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
              {snap.isMine
                ? 'Your snap has been sent.'
                : snap.canOpen
                  ? 'Snap ready. Open it once.'
                  : snap.viewed
                    ? 'Already viewed.'
                    : 'Waiting for your turn.'}
            </div>
            <div>
              <div style={{ fontWeight: 700 }}>{snap.sender?.username || 'Unknown'}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>
                {new Date(snap.createdAt).toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              disabled={!snap.canOpen || openingSnapId === snap.id}
              onClick={() => openSnap(snap.id)}
              style={{
                background: snap.canOpen ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                color: 'white',
                border: '1px solid var(--border-glass)',
                borderRadius: '12px',
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: snap.canOpen ? 'pointer' : 'not-allowed',
                opacity: snap.canOpen ? 1 : 0.6
              }}
            >
              {snap.canOpen ? <Eye size={16} /> : <EyeOff size={16} />}
              {openingSnapId === snap.id ? 'Opening...' : snap.canOpen ? 'Open Once' : snap.viewed ? 'Viewed' : 'Locked'}
            </button>
          </div>
        ))}
      </div>

      {cameraOpen ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '24px' }}>
          <div className="glass-panel" style={{ width: 'min(560px, 100%)', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Capture Snap</h3>
              <button type="button" onClick={closeCamera} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {capturedImage ? (
              <img src={capturedImage} alt="Captured snap" style={{ width: '100%', borderRadius: '18px', maxHeight: '70vh', objectFit: 'cover' }} />
            ) : (
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: '18px', maxHeight: '70vh', objectFit: 'cover', background: '#0f172a', transform: 'scaleX(-1)' }} />
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {capturedImage ? (
                <>
                  <button type="button" onClick={() => setCapturedImage('')} style={{ background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '12px 16px', cursor: 'pointer' }}>
                    Retake
                  </button>
                  <button type="button" onClick={sendSnap} style={{ background: 'linear-gradient(135deg, #f43f5e, #fb7185)', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                    <Send size={16} />
                    Send Snap
                  </button>
                </>
              ) : (
                <button type="button" onClick={captureImage} style={{ background: 'linear-gradient(135deg, #f43f5e, #fb7185)', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                  <Camera size={16} />
                  Capture
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {viewingSnap ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1250, padding: '24px' }} onClick={() => setViewingSnap(null)}>
          <div style={{ maxWidth: 'min(520px, 100%)', width: '100%' }}>
            <img src={viewingSnap.imageDataUrl} alt="Show room snap" style={{ width: '100%', borderRadius: '24px', display: 'block' }} />
            <div style={{ color: 'white', textAlign: 'center', marginTop: '12px', fontSize: '13px' }}>
              This snap is now consumed and cannot be opened again.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ShowRoom;
