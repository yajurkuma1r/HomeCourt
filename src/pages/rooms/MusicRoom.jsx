import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ListMusic, Music2, Play, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

const loadSpotifyApi = () =>
  new Promise((resolve) => {
    if (window.__spotifyIframeApiLoaded) {
      resolve(window.__spotifyIframeApiLoaded);
      return;
    }

    window.onSpotifyIframeApiReady = (IFrameAPI) => {
      window.__spotifyIframeApiLoaded = IFrameAPI;
      resolve(IFrameAPI);
    };

    if (!document.querySelector('script[data-spotify-iframe-api="true"]')) {
      const script = document.createElement('script');
      script.src = 'https://open.spotify.com/embed/iframe-api/v1';
      script.async = true;
      script.dataset.spotifyIframeApi = 'true';
      document.body.appendChild(script);
    }
  });

const parseSpotifySource = (value) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('spotify:')) {
    return { mediaId: trimmed, sourceUrl: trimmed, title: trimmed };
  }

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'embed') {
      parts.shift();
    }
    if (parts.length >= 2 && ['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(parts[0])) {
      const mediaId = `spotify:${parts[0]}:${parts[1]}`;
      return { mediaId, sourceUrl: trimmed, title: `${parts[0]} ${parts[1]}` };
    }
  } catch {}

  return null;
};

const MusicRoom = () => {
  const { activeHouse, user, getSpotifyMediaState, updateSpotifyMediaState } = useAuth();
  const { socket } = useSocket();
  const isAdmin = useMemo(
    () => activeHouse?.members?.find((member) => member.userId === user?.id)?.role === 'admin',
    [activeHouse?.members, user?.id]
  );
  const [inputValue, setInputValue] = useState('');
  const [spotifyState, setSpotifyState] = useState(null);
  const [error, setError] = useState('');
  const [pendingTrack, setPendingTrack] = useState(null);
  const embedRef = useRef(null);
  const controllerRef = useRef(null);

  const loadState = async () => {
    if (!activeHouse?.id) return;

    try {
      const data = await getSpotifyMediaState(activeHouse.id);
      setSpotifyState(data.media);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    loadState();
  }, [activeHouse?.id]);

  useEffect(() => {
    if (!activeHouse?.id) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      loadState();
    }, 4000);

    return () => clearInterval(intervalId);
  }, [activeHouse?.id]);

  useEffect(() => {
    if (!socket || !activeHouse?.id) {
      return undefined;
    }

    const handleSpotifyUpdate = ({ houseId, media }) => {
      if (houseId === activeHouse.id) {
        setSpotifyState(media);
      }
    };

    socket.on('spotify:media-updated', handleSpotifyUpdate);
    return () => socket.off('spotify:media-updated', handleSpotifyUpdate);
  }, [socket, activeHouse?.id]);

  useEffect(() => {
    let disposed = false;

    loadSpotifyApi().then((IFrameAPI) => {
      if (disposed || !embedRef.current || controllerRef.current) {
        return;
      }

      IFrameAPI.createController(
        embedRef.current,
        {
          width: '100%',
          height: 420,
          uri: spotifyState?.mediaId || 'spotify:track:3ZFTkvIE7kyPt6Nu3PEa7V'
        },
        (EmbedController) => {
          controllerRef.current = EmbedController;
          if (spotifyState?.mediaId) {
            EmbedController.loadUri(spotifyState.mediaId);
          }
        }
      );
    });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (controllerRef.current && spotifyState?.mediaId) {
      controllerRef.current.loadUri(spotifyState.mediaId);
    }
  }, [spotifyState?.mediaId]);

  const submitSpotifyAction = async (action, parsed) => {
    try {
      const response = await updateSpotifyMediaState(activeHouse.id, {
        action,
        sourceUrl: parsed.sourceUrl,
        mediaId: parsed.mediaId,
        title: parsed.title,
        isPlaying: action === 'play-now',
        positionMs: 0,
        durationMs: 0
      });
      setSpotifyState(response.media);
      setInputValue('');
      setPendingTrack(null);
      setError('');
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const handlePreviewLink = () => {
    const parsed = parseSpotifySource(inputValue);
    if (!parsed) {
      setError('Paste a valid Spotify track, album, playlist, show, episode, or artist link.');
      setPendingTrack(null);
      return;
    }

    setPendingTrack(parsed);
    setError('');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, letterSpacing: '0.08em', fontSize: '22px' }}>MUSICROOM</h2>
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Shared Spotify selection for the house.
          </span>
          <div style={{ marginTop: '10px', color: '#bfdbfe', fontSize: '13px', maxWidth: '720px' }}>
            Spotify can be shared here by the admin, but true synchronized multi-user playback is restricted by Spotify policy, so playback remains local per listener.
          </div>
          <div style={{ marginTop: '8px', color: '#fef3c7', fontSize: '13px', maxWidth: '720px' }}>
            On phones, Spotify embeds often play only previews unless the listener opens Spotify or is signed in through a supported Spotify experience. That is controlled by Spotify, not HomeCourt.
          </div>
        </div>
        {isAdmin ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', maxWidth: '520px', justifyContent: 'flex-end' }}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setPendingTrack(null);
              }}
              placeholder="Paste a Spotify link or URI"
              style={{ width: '320px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '10px 14px', color: 'white', outline: 'none' }}
            />
            <button onClick={handlePreviewLink} style={{ background: '#1DB954', border: 'none', borderRadius: '8px', padding: '0 16px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', height: '42px', fontWeight: '500' }}>
              <Music2 size={18} /> Choose Action
            </button>
            {pendingTrack ? (
              <div className="glass-panel" style={{ width: '100%', padding: '14px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', borderRadius: '16px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingTrack.title}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pendingTrack.mediaId}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button onClick={() => submitSpotifyAction('queue', pendingTrack)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '10px 14px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                    <ListMusic size={16} /> Add to Queue
                  </button>
                  <button onClick={() => submitSpotifyAction('play-now', pendingTrack)} style={{ background: 'linear-gradient(135deg, #1DB954, #34d399)', border: 'none', borderRadius: '10px', padding: '10px 14px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                    <Play size={16} /> Play Right Now
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <ShieldCheck size={16} />
            Only the admin can change the shared Spotify selection.
          </div>
        )}
      </div>

      {error ? (
        <div className="glass-panel" style={{ padding: '14px 16px', color: '#fecdd3', borderColor: 'rgba(244,114,182,0.3)' }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 420px) 1fr', gap: '24px', alignItems: 'start' }}>
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div ref={embedRef} />
        </div>
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(29,185,84,0.16)', padding: '12px', borderRadius: '12px' }}>
              <Music2 color="#1DB954" size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0 }}>{spotifyState?.title || 'No shared Spotify item yet'}</h3>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>
                {spotifyState?.mediaId || 'Ask the admin to paste a Spotify link.'}
              </div>
            </div>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.7 }}>
            Everyone in the house sees the same Spotify content here. The admin can either play something immediately or line it up in the house queue, and each listener can still play it locally in the embedded Spotify player.
          </div>
          {spotifyState?.sourceUrl ? (
            <a href={spotifyState.sourceUrl} target="_blank" rel="noreferrer" style={{ color: '#86efac', fontWeight: 700 }}>
              Open in Spotify for full playback
            </a>
          ) : null}
          <div className="glass-panel" style={{ padding: '16px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
              <ListMusic size={16} />
              Queue
            </div>
            {(spotifyState?.queue || []).length > 0 ? (
              spotifyState.queue.map((entry, index) => (
                <div key={`${entry.mediaId}-${entry.queuedAt || index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  <span style={{ color: 'white' }}>{index + 1}. {entry.title}</span>
                  <span>{entry.queuedBy?.username || 'Admin'}</span>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                The queue is empty right now.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MusicRoom;
