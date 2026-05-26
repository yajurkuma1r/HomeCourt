import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Folder, Plus, FileImage, FileVideo, Mic, FileText, Trash2, Download } from 'lucide-react';
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

const VaultFeature = () => {
  const navigate = useNavigate();
  const { activeHouse, getVault, createVaultFolder, createVaultItem, deleteVaultFolder, deleteVaultItem } = useAuth();
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folders, setFolders] = useState([]);
  const [items, setItems] = useState([]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [itemTitle, setItemTitle] = useState('');
  const [itemMessage, setItemMessage] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadVault = async () => {
    if (!activeHouse?.id) return;

    setLoading(true);
    try {
      const data = await getVault(activeHouse.id);
      setFolders(data.folders || []);
      setItems(data.items || []);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVault();
  }, [activeHouse?.id]);

  const currentFolders = useMemo(
    () => folders.filter((folder) => (folder.parentId || null) === currentFolder),
    [folders, currentFolder]
  );

  const currentItems = useMemo(
    () => items.filter((item) => (item.folderId || null) === currentFolder),
    [items, currentFolder]
  );

  const folderTrail = useMemo(() => {
    const trail = [];
    let cursor = currentFolder;

    while (cursor) {
      const folder = folders.find((entry) => entry.id === cursor);
      if (!folder) break;
      trail.unshift(folder);
      cursor = folder.parentId || null;
    }

    return trail;
  }, [currentFolder, folders]);

  const onThisDayItems = useMemo(() => {
    const today = new Date();
    return items.filter((item) => {
      const createdAt = new Date(item.createdAt);
      return createdAt.getDate() === today.getDate() && createdAt.getMonth() === today.getMonth() && createdAt.getFullYear() < today.getFullYear();
    });
  }, [items]);

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

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!folderName.trim()) return;

    try {
      await createVaultFolder(activeHouse.id, { name: folderName, parentId: currentFolder });
      setFolderName('');
      setShowCreateFolder(false);
      await loadVault();
    } catch (createError) {
      setError(createError.message);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!itemTitle.trim()) return;

    try {
      await createVaultItem(activeHouse.id, {
        folderId: currentFolder,
        title: itemTitle,
        message: itemMessage,
        assets: attachments
      });
      setItemTitle('');
      setItemMessage('');
      setAttachments([]);
      setShowUpload(false);
      await loadVault();
    } catch (uploadError) {
      setError(uploadError.message);
    }
  };

  const handleDeleteFolder = async (folderId) => {
    try {
      await deleteVaultFolder(activeHouse.id, folderId);
      if (currentFolder === folderId) {
        setCurrentFolder(null);
      }
      await loadVault();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await deleteVaultItem(activeHouse.id, itemId);
      await loadVault();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const renderAsset = (asset) => {
    let preview;
    if (asset.kind === 'image') {
      preview = <img src={asset.dataUrl} alt={asset.name} style={{ width: '100%', borderRadius: '10px', objectFit: 'cover', maxHeight: '180px' }} />;
    } else if (asset.kind === 'video') {
      preview = <video controls src={asset.dataUrl} style={{ width: '100%', borderRadius: '10px', maxHeight: '180px' }} />;
    } else if (asset.kind === 'audio') {
      preview = <audio controls src={asset.dataUrl} style={{ width: '100%' }} />;
    } else {
      preview = <div style={{ padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', textAlign: 'center' }}><FileText size={32} color="var(--text-secondary)" /></div>;
    }
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {preview}
        <a href={asset.dataUrl} download={asset.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#93c5fd', textDecoration: 'none', background: 'rgba(147, 197, 253, 0.1)', padding: '6px 12px', borderRadius: '12px', alignSelf: 'flex-start' }}>
          <Download size={14} /> Download {asset.name}
        </a>
      </div>
    );
  };

  return (
    <div style={{ padding: '32px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <ArrowLeft size={28} style={{ cursor: 'pointer' }} onClick={() => currentFolder ? setCurrentFolder(folderTrail.at(-1)?.parentId || null) : navigate(-1)} />
        <div>
          <h2 style={{ margin: 0 }}>{currentFolder ? folderTrail.at(-1)?.name : 'The Vault'}</h2>
          <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>
            Anyone in the house can create folders and store notes, photos, videos, audio, documents, and more.
          </p>
        </div>
      </div>

      {folderTrail.length > 0 ? (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
          <span style={{ cursor: 'pointer' }} onClick={() => setCurrentFolder(null)}>Vault</span>
          {folderTrail.map((folder) => (
            <React.Fragment key={folder.id}>
              <span>/</span>
              <span style={{ cursor: 'pointer' }} onClick={() => setCurrentFolder(folder.id)}>{folder.name}</span>
            </React.Fragment>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="glass-panel" style={{ padding: '16px', marginBottom: '20px', color: '#fecdd3', borderColor: 'rgba(244,114,182,0.3)' }}>
          {error}
        </div>
      ) : null}

      {onThisDayItems.length > 0 && !currentFolder ? (
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ color: 'var(--secondary)', marginBottom: '16px' }}>On This Day</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
            {onThisDayItems.map((item) => (
              <div key={item.id} className="glass-panel" style={{ padding: '16px' }}>
                {item.assets?.[0] ? renderAsset(item.assets[0]) : <div style={{ minHeight: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>{item.message || item.title}</div>}
                <p style={{ marginTop: '12px', fontWeight: 600 }}>{item.title}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>{currentFolder ? 'Folder Contents' : 'All Memories'}</h3>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setShowCreateFolder((value) => !value)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid var(--border-glass)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>
            <Folder size={16} /> New Folder
          </button>
          <button onClick={() => setShowUpload((value) => !value)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--primary)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>
            <Plus size={16} /> Add Item
          </button>
        </div>
      </div>

      {showCreateFolder ? (
        <form onSubmit={handleCreateFolder} className="glass-panel" style={{ padding: '20px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', maxWidth: '720px' }}>
          <input type="text" value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="Folder name" style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '12px', color: 'white', borderRadius: '8px', outline: 'none' }} />
          <button type="submit" style={{ background: 'white', color: 'var(--bg-dark)', border: 'none', padding: '12px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Create</button>
        </form>
      ) : null}

      {showUpload ? (
        <form onSubmit={handleUpload} className="glass-panel" style={{ padding: '20px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '820px' }}>
          <input type="text" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} placeholder="Item title" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '12px', color: 'white', borderRadius: '8px', outline: 'none' }} />
          <textarea value={itemMessage} onChange={(e) => setItemMessage(e.target.value)} placeholder="Add a note or description" style={{ minHeight: '100px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', padding: '12px', color: 'white', borderRadius: '8px', outline: 'none', fontFamily: 'inherit' }} />
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
          <button type="submit" style={{ alignSelf: 'flex-start', background: 'var(--primary)', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Save to Vault</button>
        </form>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
        {loading ? (
          <div className="glass-panel" style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading vault...</div>
        ) : null}
        {currentFolders.map((folder) => (
          <div key={folder.id} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: '220px', position: 'relative' }}>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleDeleteFolder(folder.id);
              }}
              style={{ position: 'absolute', top: '14px', right: '14px', background: 'rgba(244,63,94,0.16)', color: '#fecdd3', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '10px', padding: '8px', cursor: 'pointer' }}
              title="Delete folder"
            >
              <Trash2 size={14} />
            </button>
            <div onClick={() => setCurrentFolder(folder.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%' }}>
            <Folder size={48} color="var(--primary)" style={{ marginBottom: '16px' }} />
            <p style={{ margin: 0, fontWeight: 500 }}>{folder.name}</p>
            </div>
          </div>
        ))}
        {currentItems.map((item) => (
          <div key={item.id} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {item.assets?.[0] ? renderAsset(item.assets[0]) : (
              <div style={{ minHeight: '140px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', padding: '16px', textAlign: 'center' }}>
                {item.message || 'Stored note'}
              </div>
            )}
            <div>
              <p style={{ margin: '0 0 6px 0', fontWeight: 600 }}>{item.title}</p>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                {new Date(item.createdAt).toLocaleString()}
              </div>
              {item.message ? <div style={{ fontSize: '14px', lineHeight: 1.6 }}>{item.message}</div> : null}
              {item.assets?.length > 1 ? (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {item.assets.slice(1).map((asset) => (
                    <div key={asset.id}>{renderAsset(asset)}</div>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => handleDeleteItem(item.id)}
                style={{ marginTop: '12px', background: 'rgba(244,63,94,0.16)', color: '#fecdd3', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '10px', padding: '10px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
              >
                <Trash2 size={14} />
                Delete Item
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VaultFeature;
