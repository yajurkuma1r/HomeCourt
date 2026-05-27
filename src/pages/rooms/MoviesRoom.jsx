import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ChatRoom from './ChatRoom';

const loadYouTubeApi = () =>
  new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }

    window.onYouTubeIframeAPIReady = () => resolve(window.YT);

    if (!document.querySelector('script[data-youtube-iframe-api="true"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.youtubeIframeApi = 'true';
      document.body.appendChild(script);
    }
  });

const parseYouTubeVideo = (value) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return {
      mediaId: trimmed,
      sourceUrl: `https://www.youtube.com/watch?v=${trimmed}`,
      title: `YouTube video ${trimmed}`
    };
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.replace('/', '').slice(0, 11);
      if (id) {
        return {
          mediaId: id,
          sourceUrl: trimmed,
          title: `YouTube video ${id}`
        };
      }
    }

    const id = url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop();
    if (id) {
      return {
        mediaId: id.slice(0, 11),
        sourceUrl: trimmed,
        title: `YouTube video ${id.slice(0, 11)}`
      };
    }
  } catch {}

  return null;
};

const getEffectivePositionSeconds = (mediaState) => {
  if (!mediaState?.updatedAt) {
    return Math.max(0, (mediaState?.positionMs || 0) / 1000);
  }

  const elapsedMs = mediaState.isPlaying
    ? Date.now() - new Date(mediaState.updatedAt).getTime()
    : 0;

  return Math.max(0, ((mediaState.positionMs || 0) + Math.max(0, elapsedMs)) / 1000);
};

const MoviesRoom = () => {
  const { activeHouse, user, getYouTubeMediaState, updateYouTubeMediaState } = useAuth();
  const isAdmin = useMemo(
    () => activeHouse?.members?.find((member) => member.userId === user?.id)?.role === 'admin',
    [activeHouse?.members, user?.id]
  );
  const [mediaState, setMediaState] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const [playerReady, setPlayerReady] = useState(false);
  const playerRef = useRef(null);
  const playerHostRef = useRef(null);
  const lastAppliedAtRef = useRef(null);

  const loadState = async () => {
    if (!activeHouse?.id) return;

    try {
      const data = await getYouTubeMediaState(activeHouse.id);
      setMediaState(data.media);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    loadState();
  }, [activeHouse?.id]);

  useEffect(() => {
    if (!activeHouse?.id) return undefined;

    const intervalId = setInterval(() => {
      loadState();
    }, 2000);

    return () => clearInterval(intervalId);
  }, [activeHouse?.id]);

  useEffect(() => {
    let disposed = false;

    loadYouTubeApi().then((YT) => {
      if (disposed || !playerHostRef.current || playerRef.current) {
        return;
      }

      playerRef.current = new YT.Player(playerHostRef.current, {
        width: '100%',
        height: '100%',
        videoId: mediaState?.mediaId || '',
        playerVars: {
          playsinline: 1
        },
        events: {
          onReady: () => {
            if (!disposed) {
              setPlayerReady(true);
            }
          },
          onError: () => {
            if (!disposed) {
              setError('This YouTube video could not be loaded. Try a different public video URL or ID.');
            }
          }
        }
      });
    });

    return () => {
      disposed = true;
      setPlayerReady(false);
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady || !mediaState?.updatedAt) {
      return;
    }

    if (lastAppliedAtRef.current === mediaState.updatedAt) {
      return;
    }

    lastAppliedAtRef.current = mediaState.updatedAt;

    const applyState = () => {
      const effectivePositionSeconds = getEffectivePositionSeconds(mediaState);

      if (mediaState.mediaId) {
        const currentVideoId = player.getVideoData?.().video_id;
        if (currentVideoId !== mediaState.mediaId) {
          const nextVideoConfig = {
            videoId: mediaState.mediaId,
            startSeconds: effectivePositionSeconds
          };

          if (mediaState.isPlaying) {
            player.loadVideoById(nextVideoConfig);
          } else {
            player.cueVideoById(nextVideoConfig);
          }
        } else {
          player.seekTo(effectivePositionSeconds, true);
          if (mediaState.isPlaying) {
            player.playVideo();
          } else {
            player.pauseVideo();
          }
        }

        if (!mediaState.isPlaying) {
          player.pauseVideo();
        }
      }
    };

    if (typeof player.getPlayerState === 'function') {
      applyState();
    } else {
      setTimeout(applyState, 500);
    }
  }, [mediaState?.updatedAt, mediaState?.mediaId, mediaState?.isPlaying, mediaState?.positionMs, playerReady]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady || !mediaState?.mediaId) {
      return undefined;
    }

    const syncInterval = setInterval(() => {
      const currentVideoId = player.getVideoData?.().video_id;
      if (currentVideoId !== mediaState.mediaId) {
        return;
      }

      const expectedSeconds = getEffectivePositionSeconds(mediaState);
      const currentSeconds = player.getCurrentTime?.() || 0;
      const playerState = player.getPlayerState?.();
      const driftSeconds = Math.abs(currentSeconds - expectedSeconds);

      if (driftSeconds > 1.25) {
        player.seekTo(expectedSeconds, true);
      }

      if (mediaState.isPlaying && playerState !== 1) {
        player.playVideo();
      }

      if (!mediaState.isPlaying && playerState === 1) {
        player.pauseVideo();
      }
    }, 1500);

    return () => clearInterval(syncInterval);
  }, [mediaState?.mediaId, mediaState?.isPlaying, mediaState?.positionMs, mediaState?.updatedAt, playerReady]);

  const pushState = async (partial) => {
    const player = playerRef.current;
    const payload = {
      sourceUrl: partial.sourceUrl ?? mediaState?.sourceUrl ?? '',
      mediaId: partial.mediaId ?? mediaState?.mediaId ?? '',
      title: partial.title ?? mediaState?.title ?? '',
      isPlaying: partial.isPlaying ?? mediaState?.isPlaying ?? false,
      positionMs: partial.positionMs ?? ((player?.getCurrentTime?.() || 0) * 1000),
      durationMs: partial.durationMs ?? ((player?.getDuration?.() || 0) * 1000)
    };

    const response = await updateYouTubeMediaState(activeHouse.id, payload);
    setMediaState(response.media);
  };

  const handleLoadVideo = async () => {
    const parsed = parseYouTubeVideo(inputValue);
    if (!parsed) {
      setError('Paste a valid YouTube URL or video ID.');
      return;
    }

    try {
      await pushState({
        sourceUrl: parsed.sourceUrl,
        mediaId: parsed.mediaId,
        title: parsed.title,
        isPlaying: false,
        positionMs: 0,
        durationMs: 0
      });
      setInputValue('');
      setError('');
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, letterSpacing: '0.08em', fontSize: '22px' }}>MOVIEROOM</h2>
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Admin-controlled synced YouTube playback for the house.</span>
        </div>
        {isAdmin ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Paste a YouTube URL or ID"
              style={{ width: '320px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '10px 14px', color: 'white', outline: 'none' }}
            />
            <button onClick={handleLoadVideo} style={{ background: '#FF0000', border: 'none', borderRadius: '8px', padding: '0 16px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', height: '42px', fontWeight: '500' }}>
              <Save size={18} /> Load Video
            </button>
          </div>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <ShieldCheck size={16} />
            Only the admin can control YouTube playback.
          </div>
        )}
      </div>

      {error ? (
        <div className="glass-panel" style={{ padding: '14px 16px', color: '#fecdd3', borderColor: 'rgba(244,114,182,0.3)' }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: 'flex', flex: 1, gap: '24px', flexWrap: 'wrap', minHeight: 0 }}>
        <div className="glass-panel" style={{ flex: '2 1 500px', minHeight: '520px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, minHeight: '420px', background: 'black' }}>
            <div ref={playerHostRef} style={{ width: '100%', height: '100%' }} />
          </div>
          <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0 }}>{mediaState?.title || 'No shared YouTube video yet'}</h3>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>
                {mediaState?.mediaId || 'Ask the admin to paste a YouTube link.'}
              </div>
            </div>
            {isAdmin ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => pushState({ isPlaying: true })} style={{ background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid var(--border-glass)', borderRadius: '999px', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Play size={18} />
                </button>
                <button onClick={() => pushState({ isPlaying: false })} style={{ background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid var(--border-glass)', borderRadius: '999px', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Pause size={18} />
                </button>
                <button onClick={() => pushState({ positionMs: 0, isPlaying: false })} style={{ background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid var(--border-glass)', borderRadius: '999px', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <RotateCcw size={18} />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="glass-panel" style={{ flex: '1 1 300px', minHeight: '520px', display: 'flex', flexDirection: 'column', padding: '16px', overflow: 'hidden' }}>
          <div style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-glass)', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', letterSpacing: '0.05em' }}>ROOM CHAT</h3>
          </div>
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ChatRoom hideHeader={true} room="movies" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MoviesRoom;
