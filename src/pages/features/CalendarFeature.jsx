import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar as CalIcon, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const CalendarFeature = () => {
  const navigate = useNavigate();
  const { activeHouse, getHouseEvents, createHouseEvent, deleteHouseEvent } = useAuth();
  const [events, setEvents] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadEvents = async () => {
    if (!activeHouse?.id) {
      return;
    }

    setLoading(true);
    try {
      const data = await getHouseEvents(activeHouse.id);
      setEvents(data.events);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [activeHouse?.id]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim() || !date) {
      setError('Event name, date and time, and message are required.');
      return;
    }

    try {
      await createHouseEvent(activeHouse.id, { title: title.trim(), message: message.trim(), date });
      setShowCreate(false);
      setTitle('');
      setMessage('');
      setDate('');
      await loadEvents();
    } catch (createError) {
      setError(createError.message);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    try {
      await deleteHouseEvent(activeHouse.id, eventId);
      await loadEvents();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  return (
    <div style={{ padding: '32px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
        <ArrowLeft size={28} style={{ cursor: 'pointer' }} onClick={() => navigate(-1)} />
        <div>
          <h2 style={{ margin: 0 }}>House Events</h2>
          <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>
            Anyone in {activeHouse?.name || 'this house'} can add shared events.
          </p>
        </div>
      </div>

      <button onClick={() => setShowCreate((value) => !value)} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
        <Plus size={20} /> Add Event
      </button>

      {error ? (
        <div className="glass-panel" style={{ padding: '16px', marginBottom: '24px', color: '#fecdd3', borderColor: 'rgba(244, 114, 182, 0.3)' }}>
          {error}
        </div>
      ) : null}

      {showCreate && (
        <form onSubmit={handleCreate} className="glass-panel" style={{ padding: '24px', marginBottom: '32px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '860px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '16px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 700 }}>
              Event name <span style={{ color: '#fda4af' }}>*</span>
              <input required type="text" placeholder="Event name" value={title} onChange={(e) => setTitle(e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '12px', color: 'white', borderRadius: '8px', outline: 'none' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 700 }}>
              Event date and time <span style={{ color: '#fda4af' }}>*</span>
              <input required type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '12px', color: 'white', borderRadius: '8px', outline: 'none' }} />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 700 }}>
            Message <span style={{ color: '#fda4af' }}>*</span>
            <textarea required placeholder="Add a message for the house" value={message} onChange={(e) => setMessage(e.target.value)} style={{ minHeight: '110px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '12px', color: 'white', borderRadius: '8px', outline: 'none', fontFamily: 'inherit' }} />
          </label>
          <button type="submit" style={{ alignSelf: 'flex-start', background: 'white', color: 'var(--bg-dark)', border: 'none', padding: '12px 22px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            Save Event
          </button>
        </form>
      )}

      <div style={{ display: 'grid', gap: '16px', maxWidth: '860px' }}>
        {loading ? (
          <div className="glass-panel" style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading events...</div>
        ) : events.length === 0 ? (
          <div className="glass-panel" style={{ padding: '24px', color: 'var(--text-secondary)' }}>
            No house events yet. Add the first one for everyone in the house.
          </div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
              <div style={{ background: 'rgba(155, 81, 224, 0.2)', padding: '16px', borderRadius: '12px' }}>
                <CalIcon color="var(--primary)" size={28} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0 }}>{event.title}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {new Date(event.date).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteEvent(event.id)}
                      style={{ background: 'rgba(244,63,94,0.16)', color: '#fecdd3', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '10px', padding: '8px', cursor: 'pointer' }}
                      title="Delete event"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p style={{ margin: '0 0 10px 0', color: 'var(--text-primary)', lineHeight: 1.6 }}>{event.message}</p>
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  Created by {event.createdBy?.username || 'Unknown'}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CalendarFeature;
