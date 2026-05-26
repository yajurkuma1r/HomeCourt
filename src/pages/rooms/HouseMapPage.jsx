import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Compass, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import LiveHouseMap from '../../components/shared/LiveHouseMap';

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const getDistanceKm = (pointA, pointB) => {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(pointB.latitude - pointA.latitude);
  const deltaLng = toRadians(pointB.longitude - pointA.longitude);
  const lat1 = toRadians(pointA.latitude);
  const lat2 = toRadians(pointB.latitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const HouseMapPage = () => {
  const navigate = useNavigate();
  const { activeHouse, getHouseMap, updateMemberLocation, user } = useAuth();
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const mapRef = useRef(null);
  const lastLocationSentAtRef = useRef(0);

  const loadMap = async () => {
    if (!activeHouse?.id) {
      return;
    }

    setLoading(true);
    try {
      const data = await getHouseMap(activeHouse.id);
      setMapData(data);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMap();
  }, [activeHouse?.id]);

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
          await loadMap();
        } catch {
          // The manual share button surfaces location errors.
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeHouse?.id]);

  const shareLocation = () => {
    if (!activeHouse?.id || !navigator.geolocation) {
      setError('Geolocation is not available in this browser.');
      return;
    }

    setSyncing(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await updateMemberLocation(activeHouse.id, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          await loadMap();
        } catch (locationError) {
          setError(locationError.message);
        } finally {
          setSyncing(false);
        }
      },
      () => {
        setError('Location permission was denied.');
        setSyncing(false);
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
    );
  };

  const membersWithLocation = useMemo(
    () => (mapData?.members || []).filter((member) => member.location),
    [mapData?.members]
  );

  const distanceRows = useMemo(() => {
    const rows = [];

    for (let i = 0; i < membersWithLocation.length; i += 1) {
      for (let j = i + 1; j < membersWithLocation.length; j += 1) {
        const first = membersWithLocation[i];
        const second = membersWithLocation[j];
        rows.push({
          label: `${first.username} <-> ${second.username}`,
          km: getDistanceKm(first.location, second.location)
        });
      }
    }

    return rows;
  }, [membersWithLocation]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <button type="button" onClick={() => navigate('/home')} style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', padding: 0, display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '10px' }}>
            <ArrowLeft size={16} />
            Back to house
          </button>
          <h2 style={{ margin: 0, fontSize: '24px' }}>{activeHouse?.name || 'House'} Map</h2>
          <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>
            See who has shared their location and how far everyone is from each other.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button type="button" onClick={loadMap} style={{ background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid var(--border-glass)', padding: '12px 16px', borderRadius: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <RefreshCw size={16} />
            Refresh
          </button>
          <button type="button" onClick={shareLocation} style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))', color: 'white', border: 'none', padding: '12px 16px', borderRadius: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <Compass size={16} />
            {syncing ? 'Sharing...' : 'Share my location'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="glass-panel" style={{ padding: '16px', color: '#fecdd3', borderColor: 'rgba(244, 114, 182, 0.3)' }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)', gap: '24px', alignItems: 'start' }}>
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h3 style={{ margin: 0 }}>House Map</h3>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              {membersWithLocation.length} of {(mapData?.members || []).length} users shared location
            </span>
          </div>
          <LiveHouseMap
            ref={mapRef}
            members={mapData?.members || []}
            currentUserId={user?.id}
            height={480}
            loading={loading}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Members</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(mapData?.members || []).map((member) => (
                <div key={member.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{member.username}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {member.role === 'admin' ? 'Admin' : 'Member'}{member.userId === user?.id ? ' | You' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!member.location}
                    onClick={() => mapRef.current?.focusMember(member.userId)}
                    style={{
                      border: member.location ? '1px solid rgba(56,189,248,0.45)' : '1px solid rgba(255,255,255,0.08)',
                      background: member.location ? 'rgba(56,189,248,0.14)' : 'rgba(255,255,255,0.04)',
                      color: member.location ? '#bae6fd' : 'var(--text-secondary)',
                      borderRadius: '10px',
                      padding: '8px 10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: member.location ? 'pointer' : 'not-allowed',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {member.location ? 'Zoom to user' : 'No location'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Distances</h3>
            {distanceRows.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Distances appear after at least two users in the house share location.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {distanceRows.map((row) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '14px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                    <span>{row.km.toFixed(2)} km</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HouseMapPage;
