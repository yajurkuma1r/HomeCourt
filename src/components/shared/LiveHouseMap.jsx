import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { LocateFixed, MapPin, Minus, Plus } from 'lucide-react';

const TOMTOM_API_KEY = import.meta.env.VITE_TOMTOM_API_KEY;
const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 18;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getMemberLocation = (member) => {
  const latitude = Number(member?.location?.latitude);
  const longitude = Number(member?.location?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude: clamp(latitude, -85.05112878, 85.05112878), longitude };
};

const lngLatToWorld = ({ latitude, longitude }, zoom) => {
  const sinLat = Math.sin((clamp(latitude, -85.05112878, 85.05112878) * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;

  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  };
};

const worldToLngLat = ({ x, y }, zoom) => {
  const scale = TILE_SIZE * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const latitude = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

  return { latitude: clamp(latitude, -85.05112878, 85.05112878), longitude };
};

const getBounds = (members) => {
  const locations = members.map((member) => member.mappedLocation).filter(Boolean);

  if (locations.length === 0) {
    return null;
  }

  return {
    minLat: Math.min(...locations.map((location) => location.latitude)),
    maxLat: Math.max(...locations.map((location) => location.latitude)),
    minLng: Math.min(...locations.map((location) => location.longitude)),
    maxLng: Math.max(...locations.map((location) => location.longitude)),
    locations
  };
};

const chooseZoom = (bounds, width, height) => {
  if (!bounds || bounds.locations.length <= 1) {
    return 14;
  }

  for (let zoom = 16; zoom >= MIN_ZOOM; zoom -= 1) {
    const northwest = lngLatToWorld({ latitude: bounds.maxLat, longitude: bounds.minLng }, zoom);
    const southeast = lngLatToWorld({ latitude: bounds.minLat, longitude: bounds.maxLng }, zoom);

    if (Math.abs(southeast.x - northwest.x) <= width * 0.72 && Math.abs(southeast.y - northwest.y) <= height * 0.68) {
      return zoom;
    }
  }

  return MIN_ZOOM;
};

const getInitialView = (mappedMembers, width, height) => {
  const bounds = getBounds(mappedMembers);

  if (!bounds) {
    return { center: { latitude: 20, longitude: 0 }, zoom: 2 };
  }

  return {
    center: {
      latitude: (bounds.minLat + bounds.maxLat) / 2,
      longitude: (bounds.minLng + bounds.maxLng) / 2
    },
    zoom: chooseZoom(bounds, width, height)
  };
};

const LiveHouseMap = forwardRef(({ members = [], currentUserId, height = 220, compact = false, loading = false, onClick }, ref) => {
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const userInteractedRef = useRef(false);
  const [viewportSize, setViewportSize] = useState({ width: compact ? 620 : 900, height });
  const [view, setView] = useState(() => ({ center: { latitude: 20, longitude: 0 }, zoom: 2 }));
  const [isDragging, setIsDragging] = useState(false);

  const mappedMembers = useMemo(
    () =>
      members
        .map((member) => ({ ...member, mappedLocation: getMemberLocation(member) }))
        .filter((member) => member.mappedLocation),
    [members]
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return undefined;
    }

    const updateSize = () => {
      setViewportSize({
        width: Math.max(element.clientWidth, 320),
        height: Math.max(element.clientHeight, height)
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, [height]);

  useEffect(() => {
    if (userInteractedRef.current) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setView(getInitialView(mappedMembers, viewportSize.width, viewportSize.height));
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [mappedMembers, viewportSize.height, viewportSize.width]);

  const setCenteredView = (center, zoom = 16) => {
    userInteractedRef.current = true;
    setView({
      center,
      zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM)
    });
  };

  useImperativeHandle(ref, () => ({
    focusMember(userId) {
      const member = mappedMembers.find((entry) => entry.userId === userId);
      if (member?.mappedLocation) {
        setCenteredView(member.mappedLocation, 16);
      }
    },
    fitMembers() {
      userInteractedRef.current = false;
      setView(getInitialView(mappedMembers, viewportSize.width, viewportSize.height));
    }
  }), [mappedMembers, viewportSize.height, viewportSize.width]);

  const panBy = (deltaX, deltaY) => {
    setView((currentView) => {
      const centerWorld = lngLatToWorld(currentView.center, currentView.zoom);
      return {
        ...currentView,
        center: worldToLngLat({ x: centerWorld.x - deltaX, y: centerWorld.y - deltaY }, currentView.zoom)
      };
    });
  };

  const zoomBy = (delta) => {
    userInteractedRef.current = true;
    setView((currentView) => ({
      ...currentView,
      zoom: clamp(currentView.zoom + delta, MIN_ZOOM, MAX_ZOOM)
    }));
  };

  const mapState = useMemo(() => {
    const centerWorld = lngLatToWorld(view.center, view.zoom);
    const leftWorld = centerWorld.x - viewportSize.width / 2;
    const topWorld = centerWorld.y - viewportSize.height / 2;
    const tileMinX = Math.floor(leftWorld / TILE_SIZE);
    const tileMaxX = Math.floor((leftWorld + viewportSize.width) / TILE_SIZE);
    const tileMinY = Math.floor(topWorld / TILE_SIZE);
    const tileMaxY = Math.floor((topWorld + viewportSize.height) / TILE_SIZE);
    const tileCount = 2 ** view.zoom;
    const tiles = [];

    for (let x = tileMinX; x <= tileMaxX; x += 1) {
      for (let y = tileMinY; y <= tileMaxY; y += 1) {
        if (y < 0 || y >= tileCount) {
          continue;
        }

        const wrappedX = ((x % tileCount) + tileCount) % tileCount;
        tiles.push({
          id: `${view.zoom}-${x}-${y}`,
          x: x * TILE_SIZE - leftWorld,
          y: y * TILE_SIZE - topWorld,
          src: `https://api.tomtom.com/map/1/tile/basic/main/${view.zoom}/${wrappedX}/${y}.png?key=${TOMTOM_API_KEY}`
        });
      }
    }

    return {
      mappedMembers: mappedMembers.map((member, index) => {
        const world = lngLatToWorld(member.mappedLocation, view.zoom);

        return {
          ...member,
          x: world.x - leftWorld,
          y: world.y - topWorld,
          color: member.userId === currentUserId ? '#22c55e' : index % 2 === 0 ? '#d946ef' : '#38bdf8'
        };
      }),
      tiles
    };
  }, [currentUserId, mappedMembers, view, viewportSize]);

  const handlePointerDown = (event) => {
    userInteractedRef.current = true;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    panBy(deltaX, deltaY);
  };

  const handlePointerUp = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setIsDragging(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event) => {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1 : -1);
  };

  const stopMapGesture = (event) => {
    event.stopPropagation();
  };

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      style={{
        position: 'relative',
        height,
        width: '100%',
        borderRadius: compact ? '8px' : '18px',
        overflow: 'hidden',
        background: '#101827',
        cursor: onClick ? 'pointer' : isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        border: '1px solid rgba(255,255,255,0.1)'
      }}
    >
      {TOMTOM_API_KEY ? (
        mapState.tiles.map((tile) => (
          <img
            key={tile.id}
            src={tile.src}
            alt=""
            draggable="false"
            style={{
              position: 'absolute',
              left: tile.x,
              top: tile.y,
              width: TILE_SIZE,
              height: TILE_SIZE,
              userSelect: 'none'
            }}
          />
        ))
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1e293b, #0f172a)' }} />
      )}

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(2,6,23,0.02), rgba(2,6,23,0.3))', pointerEvents: 'none' }} />

      {!compact && mapState.mappedMembers.length > 0 ? (
        <div
          onPointerDown={stopMapGesture}
          onPointerMove={stopMapGesture}
          onPointerUp={stopMapGesture}
          onWheel={stopMapGesture}
          style={{ position: 'absolute', top: '14px', right: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <button type="button" onClick={(event) => { event.stopPropagation(); zoomBy(1); }} title="Zoom in" style={{ width: '38px', height: '38px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(15,23,42,0.88)', color: 'white', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Plus size={18} />
          </button>
          <button type="button" onClick={(event) => { event.stopPropagation(); zoomBy(-1); }} title="Zoom out" style={{ width: '38px', height: '38px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(15,23,42,0.88)', color: 'white', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Minus size={18} />
          </button>
          <button type="button" onClick={(event) => { event.stopPropagation(); userInteractedRef.current = false; setView(getInitialView(mappedMembers, viewportSize.width, viewportSize.height)); }} title="Fit all members" style={{ width: '38px', height: '38px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(15,23,42,0.88)', color: 'white', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <LocateFixed size={18} />
          </button>
        </div>
      ) : null}

      {loading ? (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'white', background: 'rgba(2,6,23,0.35)', fontSize: compact ? '13px' : '15px', pointerEvents: 'none' }}>
          Updating locations...
        </div>
      ) : null}

      {mapState.mappedMembers.length === 0 ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-secondary)', textAlign: 'center', padding: '16px', background: 'rgba(2,6,23,0.44)', pointerEvents: 'none' }}>
          <MapPin size={compact ? 20 : 28} />
          <span>{TOMTOM_API_KEY ? 'Waiting for shared live locations.' : 'Add VITE_TOMTOM_API_KEY to show live map tiles.'}</span>
        </div>
      ) : (
        mapState.mappedMembers.map((member) => (
          <div
            key={member.userId}
            title={`${member.username}${member.userId === currentUserId ? ' (you)' : ''}`}
            style={{
              position: 'absolute',
              left: member.x,
              top: member.y,
              transform: 'translate(-50%, -100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: compact ? '4px' : '7px',
              pointerEvents: 'none'
            }}
          >
            <div
              style={{
                width: compact ? '24px' : '34px',
                height: compact ? '24px' : '34px',
                borderRadius: '999px',
                background: member.color,
                display: 'grid',
                placeItems: 'center',
                color: 'white',
                fontWeight: 800,
                fontSize: compact ? '10px' : '13px',
                border: '2px solid white',
                boxShadow: `0 0 0 6px ${member.color}33, 0 12px 24px rgba(0,0,0,0.35)`
              }}
            >
              {String(member.username || '?').slice(0, 1).toUpperCase()}
            </div>
            <div
              style={{
                maxWidth: compact ? '92px' : '140px',
                padding: compact ? '4px 7px' : '6px 9px',
                borderRadius: '999px',
                background: 'rgba(15,23,42,0.9)',
                color: 'white',
                fontSize: compact ? '10px' : '12px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                border: '1px solid rgba(255,255,255,0.16)'
              }}
            >
              {member.username}
            </div>
          </div>
        ))
      )}

      {mapState.mappedMembers.length > 0 ? (
        <div style={{ position: 'absolute', left: '10px', bottom: '10px', padding: '5px 8px', borderRadius: '999px', background: 'rgba(15,23,42,0.86)', color: 'white', fontSize: compact ? '10px' : '12px', border: '1px solid rgba(255,255,255,0.14)', pointerEvents: 'none' }}>
          Live: {mapState.mappedMembers.length} member{mapState.mappedMembers.length === 1 ? '' : 's'}
        </div>
      ) : null}
    </div>
  );
});

LiveHouseMap.displayName = 'LiveHouseMap';

export default LiveHouseMap;
