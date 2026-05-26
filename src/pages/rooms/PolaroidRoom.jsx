import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, RefreshCw, Send, X, ArrowLeft, RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

const PolaroidRoom = () => {
  const navigate = useNavigate();
  const { activeHouse, user, refreshHouses } = useAuth();
  const { socket } = useSocket();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  
  const [capturedImage, setCapturedImage] = useState(null);
  const [facingMode, setFacingMode] = useState('user');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false
      });

      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = newStream;

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setError('');
    } catch (err) {
      console.error("Camera access error:", err);
      setError('Camera access denied or unavailable. Please grant permissions.');
    }
  }, [facingMode]);

  useEffect(() => {
    let isActive = true;
    const videoElement = videoRef.current;

    const openCamera = async () => {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false
        });
        
        if (!isActive) {
          // If component unmounted while waiting for permissions
          newStream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = newStream;
        if (videoElement) {
          videoElement.srcObject = newStream;
        }
        setError('');
      } catch (err) {
        console.error("Camera access error:", err);
        if (isActive) {
          setError('Camera access denied or unavailable. Please grant permissions.');
        }
      }
    };

    openCamera();

    return () => {
      isActive = false;
      if (videoElement && videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        videoElement.srcObject = null;
      }
      streamRef.current = null;
    };
  }, [facingMode]);

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const maxPhotoEdge = 960;
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      const scale = Math.min(1, maxPhotoEdge / Math.max(sourceWidth, sourceHeight));

      canvas.width = Math.round(sourceWidth * scale);
      canvas.height = Math.round(sourceHeight * scale);
      const ctx = canvas.getContext('2d');
      
      // If front camera, flip image horizontally before drawing to make it act like a mirror
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      setCapturedImage(dataUrl);
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
  };

  const sendPolaroid = () => {
    if (!capturedImage || !socket || !activeHouse) return;
    
    setIsSending(true);
    setError('');

    socket.timeout(6000).emit('polaroid:send', { houseId: activeHouse.id, imageDataUrl: capturedImage }, async (err, response) => {
      if (err || !response?.ok) {
        setIsSending(false);
        setError(response?.error || 'Could not send this polaroid. Please try again.');
        return;
      }

      await refreshHouses().catch(() => {});
      setIsSending(false);
      navigate('/home');
    });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-dark)' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => navigate('/home')}
            style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <ArrowLeft size={24} />
          </button>
          <h2 style={{ margin: 0, letterSpacing: '0.08em', fontSize: '22px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={24} color="#d946ef" />
            POLAROID
          </h2>
        </div>
        <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Send to {activeHouse?.name}
        </span>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        
        {error ? (
          <div style={{ color: '#fca5a5', textAlign: 'center', padding: '20px' }}>
            <p>{error}</p>
            <button onClick={startCamera} style={{ padding: '10px 20px', borderRadius: '8px', background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer' }}>
              Try Again
            </button>
          </div>
        ) : (
          <>
            {/* Viewfinder / Preview Container */}
            <div style={{ 
              position: 'relative', 
              width: '100%', 
              height: '100%', 
              maxWidth: '600px', 
              maxHeight: '800px',
              display: 'flex',
              flexDirection: 'column',
              background: capturedImage ? 'white' : 'transparent', // Polaroid white border effect when captured
              padding: capturedImage ? '16px 16px 80px 16px' : '0',
              transition: 'all 0.3s ease',
              boxShadow: capturedImage ? '0 20px 40px rgba(0,0,0,0.5)' : 'none',
              transform: capturedImage ? 'scale(0.95) rotate(-2deg)' : 'scale(1)'
            }}>
              
              {!capturedImage ? (
                <>
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    style={{ width: '100%', height: '100%', objectFit: 'cover', transform: facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)' }}
                  />
                  {/* Camera Controls Overlay */}
                  <div style={{ position: 'absolute', bottom: '40px', left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '40px' }}>
                    <button 
                      onClick={toggleCamera}
                      style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', width: '50px', height: '50px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(10px)' }}
                    >
                      <RefreshCcw size={24} />
                    </button>
                    
                    <button 
                      onClick={capturePhoto}
                      style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'transparent', border: '4px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                      <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#d946ef', transition: 'transform 0.1s', cursor: 'pointer' }}
                           onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.9)'}
                           onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                           onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                      />
                    </button>
                    
                    <div style={{ width: '50px' }} /> {/* Spacer to balance flex layout */}
                  </div>
                </>
              ) : (
                <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <img 
                    src={capturedImage} 
                    alt="Captured" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#e5e5e5' }} 
                  />
                  
                  {/* Polaroid Text Area */}
                  <div style={{ position: 'absolute', bottom: '-60px', left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', color: '#111' }}>
                    <div>
                      <h3 style={{ margin: 0, fontFamily: '"Caveat", "Indie Flower", cursive, sans-serif', fontSize: '24px' }}>{activeHouse?.name}</h3>
                      <span style={{ fontSize: '14px', color: '#666' }}>{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <span style={{ fontFamily: '"Caveat", "Indie Flower", cursive, sans-serif', fontSize: '20px', color: '#d946ef' }}>By {user?.username}</span>
                  </div>

                  {/* Action Buttons Overlay */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '24px', background: isSending ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.4)', opacity: isSending ? 1 : 0, transition: 'all 0.3s ease' }}
                       onMouseEnter={(e) => !isSending && (e.currentTarget.style.opacity = 1)}
                       onMouseLeave={(e) => !isSending && (e.currentTarget.style.opacity = 0)}>
                    
                    {!isSending ? (
                      <>
                        <button onClick={retakePhoto} style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', border: '2px solid white', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <X size={32} />
                        </button>
                        <button onClick={sendPolaroid} style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#d946ef', border: '4px solid white', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 20px rgba(217, 70, 239, 0.5)' }}>
                          <Send size={36} style={{ marginLeft: '4px' }} />
                        </button>
                      </>
                    ) : (
                      <div style={{ color: '#d946ef', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                        <RefreshCw size={48} className="spin-animation" />
                        <h2 style={{ margin: 0 }}>Sending...</h2>
                        <style>{`.spin-animation { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
            </div>
            {/* Hidden Canvas for capturing */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </>
        )}
      </div>
    </div>
  );
};

export default PolaroidRoom;
