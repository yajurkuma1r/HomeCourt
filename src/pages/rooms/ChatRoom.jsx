import React, { useEffect, useState } from 'react';
import { Send, Image as ImageIcon, Mic, FileText, FileVideo } from 'lucide-react';
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

const ChatRoom = ({ hideHeader = false, room = 'general' }) => {
  const { user, activeHouse, getMessages, sendMessage } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState('');

  const loadMessages = async () => {
    if (!activeHouse?.id) return;

    try {
      const data = await getMessages(activeHouse.id, room);
      setMessages(data);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [activeHouse?.id]);

  useEffect(() => {
    if (!activeHouse?.id) return undefined;

    const intervalId = setInterval(() => {
      loadMessages();
    }, 3000);

    return () => clearInterval(intervalId);
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

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim() && attachments.length === 0) return;

    try {
      const created = await sendMessage(activeHouse.id, {
        text: inputText,
        assets: attachments
      }, room);
      setMessages((prev) => [...prev, created]);
      setInputText('');
      setAttachments([]);
      setError('');
    } catch (sendError) {
      setError(sendError.message);
    }
  };

  const renderAsset = (asset) => {
    if (asset.kind === 'image') {
      return <img src={asset.dataUrl} alt={asset.name} style={{ maxWidth: '100%', borderRadius: '10px', maxHeight: '220px' }} />;
    }
    if (asset.kind === 'video') {
      return <video controls src={asset.dataUrl} style={{ maxWidth: '100%', borderRadius: '10px', maxHeight: '220px' }} />;
    }
    if (asset.kind === 'audio') {
      return <audio controls src={asset.dataUrl} style={{ width: '100%' }} />;
    }
    return <a href={asset.dataUrl} download={asset.name} style={{ color: '#bfdbfe' }}>Download {asset.name}</a>;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {!hideHeader && (
        <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-glass)', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, letterSpacing: '0.08em', fontSize: '22px' }}>CHATROOM</h2>
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Shared messaging space for everyone in the house.
          </span>
        </div>
      )}

      {error ? (
        <div className="glass-panel" style={{ padding: '12px 16px', marginBottom: '16px', color: '#fecdd3', borderColor: 'rgba(244,114,182,0.3)' }}>
          {error}
        </div>
      ) : null}

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.map((msg) => {
          const isMe = msg.sender?.userId === user?.id;
          let timeStr = msg.createdAt;

          try {
            timeStr = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } catch {}

          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                {msg.sender?.username || 'Unknown'} | {timeStr}
              </span>
              <div className="glass-panel" style={{
                padding: '12px 16px',
                background: isMe ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                border: isMe ? 'none' : '1px solid var(--border-glass)',
                borderRadius: '16px',
                borderBottomRightRadius: isMe ? '4px' : '16px',
                borderBottomLeftRadius: !isMe ? '4px' : '16px',
                maxWidth: '70%',
                wordBreak: 'break-word',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                {msg.text ? <div>{msg.text}</div> : null}
                {(msg.assets || []).map((asset) => (
                  <div key={asset.id}>{renderAsset(asset)}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {attachments.length > 0 ? (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
          {attachments.map((asset, index) => (
            <div key={`${asset.name}-${index}`} className="glass-panel" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '14px' }}>
              {asset.kind === 'image' ? <ImageIcon size={16} /> : asset.kind === 'video' ? <FileVideo size={16} /> : asset.kind === 'audio' ? <Mic size={16} /> : <FileText size={16} />}
              <span style={{ fontSize: '13px' }}>{asset.name}</span>
            </div>
          ))}
        </div>
      ) : null}

      <form onSubmit={handleSend} style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: '24px', padding: '8px 16px', flex: 1 }}>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx" onChange={handleFilesSelected} style={{ display: 'none' }} />
            <ImageIcon size={20} color="var(--text-secondary)" />
          </label>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message or attach something..."
            style={{ background: 'transparent', border: 'none', color: 'white', flex: 1, outline: 'none', fontSize: '16px' }}
          />
        </div>
        <button type="submit" className="pulse-button" style={{ width: '48px', height: '48px', animation: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Send size={20} />
        </button>
      </form>
    </div>
  );
};

export default ChatRoom;
