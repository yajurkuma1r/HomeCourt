import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Unlock, Plus, FileImage, FileVideo, Mic, FileText, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const detectAssetKind = (file) => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
};

const CapsuleFeature = () => {
  const navigate = useNavigate();
  const { activeHouse, getHouseCapsules, createHouseCapsule, deleteHouseCapsule } = useAuth();
  const [capsules, setCapsules] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [unlockDate, setUnlockDate] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCapsules = async () => {
    if (!activeHouse?.id) {
      return;
    }

    setLoading(true);
    try {
      const data = await getHouseCapsules(activeHouse.id);
      setCapsules(data.capsules);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCapsules();
  }, [activeHouse?.id]);

  const handleFilesSelected = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) {
      return;
    }

    try {
      const nextAssets = await Promise.all(
        selectedFiles.map(async (file) => ({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          kind: detectAssetKind(file),
          dataUrl: await readFileAsDataUrl(file)
        }))
      );

      setAttachments((current) => [...current, ...nextAssets]);
    } catch {
      setError('Could not read one of the selected files.');
    }
  };

  const resetForm = () => {
    setNewTitle('');
    setNewMessage('');
    setUnlockDate('');
    setAttachments([]);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle || !unlockDate) return;

    try {
      await createHouseCapsule(activeHouse.id, {
        title: newTitle,
        message: newMessage,
        unlockAt: unlockDate,
        assets: attachments
      });
      setShowCreate(false);
      resetForm();
      await loadCapsules();
    } catch (createError) {
      setError(createError.message);
    }
  };

  const handleDeleteCapsule = async (capsuleId) => {
    try {
      await deleteHouseCapsule(activeHouse.id, capsuleId);
      await loadCapsules();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const renderAssetPreview = (asset) => {
    if (asset.kind === 'image') {
      return <img src={asset.dataUrl} alt={asset.name} style={{ maxWidth: '100%', borderRadius: '10px', maxHeight: '260px', objectFit: 'cover' }} />;
    }

    if (asset.kind === 'video') {
      return <video controls src={asset.dataUrl} style={{ maxWidth: '100%', borderRadius: '10px', maxHeight: '260px' }} />;
    }

    if (asset.kind === 'audio') {
      return <audio controls src={asset.dataUrl} style={{ width: '100%' }} />;
    }

    return (
      <a href={asset.dataUrl} download={asset.name} style={{ color: '#93c5fd' }}>
        Download {asset.name}
      </a>
    );
  };

  return (
    <div style={{ padding: '32px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
        <ArrowLeft size={28} style={{ cursor: 'pointer' }} onClick={() => navigate(-1)} />
        <div>
          <h2 style={{ margin: 0 }}>Time Capsules</h2>
          <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>
            Anyone in the house can create locked capsules with notes, photos, videos, audio, and files.
          </p>
        </div>
      </div>

      <button onClick={() => setShowCreate((value) => !value)} style={{ background: '#22c55e', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
        <Plus size={20} /> Create Capsule
      </button>

      {error ? (
        <div className="glass-panel" style={{ padding: '16px', marginBottom: '24px', color: '#fecdd3', borderColor: 'rgba(244, 114, 182, 0.3)' }}>
          {error}
        </div>
      ) : null}

      {showCreate && (
        <form onSubmit={handleCreate} className="glass-panel" style={{ padding: '24px', marginBottom: '32px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '860px' }}>
          <input type="text" placeholder="Capsule title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '12px', color: 'white', borderRadius: '8px', outline: 'none' }} />
          <textarea placeholder="Write a note or message for the future" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} style={{ minHeight: '110px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '12px', color: 'white', borderRadius: '8px', outline: 'none', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Unlock date & time</label>
            <input type="datetime-local" value={unlockDate} onChange={(e) => setUnlockDate(e.target.value)} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '10px', color: 'white', borderRadius: '8px', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Add files from your device</label>
            <input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx" onChange={handleFilesSelected} style={{ color: 'var(--text-secondary)' }} />
            {attachments.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                {attachments.map((asset, index) => (
                  <div key={`${asset.name}-${index}`} className="glass-panel" style={{ padding: '12px', borderRadius: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '13px' }}>
                      {asset.kind === 'image' ? <FileImage size={16} /> : asset.kind === 'video' ? <FileVideo size={16} /> : asset.kind === 'audio' ? <Mic size={16} /> : <FileText size={16} />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{asset.kind}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <button type="submit" style={{ alignSelf: 'flex-start', background: 'var(--primary)', color: 'white', border: 'none', padding: '12px 22px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            Lock Capsule
          </button>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '860px' }}>
        {loading ? (
          <div className="glass-panel" style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading capsules...</div>
        ) : capsules.length === 0 ? (
          <div className="glass-panel" style={{ padding: '24px', color: 'var(--text-secondary)' }}>
            No capsules yet. Create the first one and lock it for the future.
          </div>
        ) : (
          capsules.map((capsule) => {
            const isUnlocked = Date.now() >= new Date(capsule.unlockAt).getTime();
            return (
              <div key={capsule.id} className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'flex-start', gap: '20px', background: isUnlocked ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-glass)' }}>
                {isUnlocked ? <Unlock size={32} color="#22c55e" /> : <Lock size={32} color="var(--text-secondary)" />}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0 }}>{capsule.title}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                        Unlocks {new Date(capsule.unlockAt).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCapsule(capsule.id)}
                        style={{ background: 'rgba(244,63,94,0.16)', color: '#fecdd3', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '10px', padding: '8px', cursor: 'pointer' }}
                        title="Delete capsule"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '14px' }}>
                    Created by {capsule.createdBy?.username || 'Unknown'}
                  </div>
                  {isUnlocked ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {capsule.message ? (
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px', lineHeight: 1.7 }}>
                          {capsule.message}
                        </div>
                      ) : null}
                      {(capsule.assets || []).map((asset) => (
                        <div key={asset.id} className="glass-panel" style={{ padding: '14px', borderRadius: '16px' }}>
                          <div style={{ marginBottom: '10px', color: 'var(--text-secondary)', fontSize: '13px' }}>{asset.name}</div>
                          {renderAssetPreview(asset)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
                      Locked for the house until the chosen date and time.
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CapsuleFeature;
