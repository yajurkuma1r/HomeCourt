import React, { useEffect, useState, useRef } from 'react';
import { ChevronLeft, ChevronRight, Edit3, Type, X, BookmarkPlus, Search, Bookmark, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import NotebookPage from './NotebookPage';
import './SharedNotebook.css';

const SharedNotebook = ({ onClose, notebookType = 'main' }) => {
  const { activeHouse, getNotebookState, getStudyNotebookState } = useAuth();
  const { socket } = useSocket();
  const [pagesData, setPagesData] = useState({});
  const [bookmarks, setBookmarks] = useState([]);
  const [currentPageLeft, setCurrentPageLeft] = useState(0);
  const [mode, setMode] = useState('type'); // 'type' | 'draw' | 'erase'
  const [penColor, setPenColor] = useState('#d946ef');
  const PEN_COLORS = ['#d946ef', '#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#ffffff', '#000000'];
  const [isFlipping, setIsFlipping] = useState(''); // 'next' | 'prev' | ''
  const [searchPage, setSearchPage] = useState('');
  const [bookmarkName, setBookmarkName] = useState('');
  const [showBookmarkAdd, setShowBookmarkAdd] = useState(false);
  
  useEffect(() => {
    if (!activeHouse?.id) return;
    
    const fetchState = notebookType === 'study' ? getStudyNotebookState : getNotebookState;
    fetchState(activeHouse.id)
      .then(data => {
        if (data?.notebook?.pages) {
          setPagesData(data.notebook.pages);
        }
        if (data?.notebook?.bookmarks) {
          setBookmarks(data.notebook.bookmarks);
        }
      })
      .catch(console.error);
  }, [activeHouse?.id]);

  useEffect(() => {
    if (!socket || !activeHouse?.id) return;

    const handlePageUpdated = ({ houseId, pageIndex, page }) => {
      if (houseId !== activeHouse.id) return;
      setPagesData(prev => ({
        ...prev,
        [pageIndex]: page
      }));
    };

    const handleBookmarksUpdated = ({ houseId, bookmarks: newBookmarks }) => {
      if (houseId !== activeHouse.id) return;
      setBookmarks(newBookmarks);
    };

    const pageEvent = notebookType === 'study' ? 'study-notebook:page-updated' : 'notebook:page-updated';
    const bookmarkEvent = notebookType === 'study' ? 'study-notebook:bookmarks-updated' : 'notebook:bookmarks-updated';

    socket.on(pageEvent, handlePageUpdated);
    socket.on(bookmarkEvent, handleBookmarksUpdated);
    return () => {
      socket.off(pageEvent, handlePageUpdated);
      socket.off(bookmarkEvent, handleBookmarksUpdated);
    };
  }, [socket, activeHouse?.id, notebookType]);

  const handleNextPage = () => {
    if (isFlipping) return;
    setIsFlipping('next');
    setTimeout(() => {
      setCurrentPageLeft(prev => prev + 2);
      setIsFlipping('');
    }, 400); // Matches CSS transition duration
  };

  const handlePrevPage = () => {
    if (isFlipping || currentPageLeft === 0) return;
    setIsFlipping('prev');
    setTimeout(() => {
      setCurrentPageLeft(prev => Math.max(0, prev - 2));
      setIsFlipping('');
    }, 400);
  };

  const jumpToPage = (pageNum) => {
    if (!pageNum || isNaN(pageNum)) return;
    let targetIndex = parseInt(pageNum, 10) - 1;
    if (targetIndex < 0) targetIndex = 0;
    // ensure even left page
    if (targetIndex % 2 !== 0) targetIndex -= 1;
    setCurrentPageLeft(targetIndex);
    setSearchPage('');
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    jumpToPage(searchPage);
  };

  const handleAddBookmark = (e) => {
    e.preventDefault();
    if (!bookmarkName.trim() || !socket || !activeHouse?.id) return;
    const newBookmark = { name: bookmarkName, pageIndex: currentPageLeft };
    const newBookmarks = [...bookmarks, newBookmark];
    setBookmarks(newBookmarks);
    const updateEvent = notebookType === 'study' ? 'study-notebook:update-bookmarks' : 'notebook:update-bookmarks';
    socket.emit(updateEvent, { houseId: activeHouse.id, bookmarks: newBookmarks });
    setBookmarkName('');
    setShowBookmarkAdd(false);
  };

  const handleDeleteBookmark = (index, e) => {
    e.stopPropagation();
    if (!socket || !activeHouse?.id) return;
    const newBookmarks = [...bookmarks];
    newBookmarks.splice(index, 1);
    setBookmarks(newBookmarks);
    const updateEvent = notebookType === 'study' ? 'study-notebook:update-bookmarks' : 'notebook:update-bookmarks';
    socket.emit(updateEvent, { houseId: activeHouse.id, bookmarks: newBookmarks });
  };

  return (
    <div className="shared-notebook-container">
      <div className="notebook-header glass-panel">
        <h2 style={{ margin: 0, fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Edit3 color="var(--primary)" /> Shared Notebook
        </h2>
        <div className="notebook-controls">
          <div className="mode-switch" style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '24px', padding: '4px' }}>
            <button
              onClick={() => setMode('type')}
              className={mode === 'type' ? 'active-mode' : ''}
              style={{
                background: mode === 'type' ? 'var(--primary)' : 'transparent',
                color: mode === 'type' ? 'white' : 'var(--text-secondary)',
                border: 'none', borderRadius: '20px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s'
              }}
            >
              <Type size={14} /> Type
            </button>
            <button
              onClick={() => setMode('draw')}
              className={mode === 'draw' ? 'active-mode' : ''}
              style={{
                background: mode === 'draw' ? 'var(--primary)' : 'transparent',
                color: mode === 'draw' ? 'white' : 'var(--text-secondary)',
                border: 'none', borderRadius: '20px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s'
              }}
            >
              <Edit3 size={14} /> Draw
            </button>
            <button
              onClick={() => setMode('erase')}
              className={mode === 'erase' ? 'active-mode' : ''}
              style={{
                background: mode === 'erase' ? 'var(--primary)' : 'transparent',
                color: mode === 'erase' ? 'white' : 'var(--text-secondary)',
                border: 'none', borderRadius: '20px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s'
              }}
            >
              Eraser
            </button>
          </div>
          {(mode === 'draw') && (
            <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.3)', borderRadius: '20px', padding: '6px', alignItems: 'center' }}>
              {PEN_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setPenColor(color)}
                  style={{
                    width: '20px', height: '20px', borderRadius: '50%', background: color, border: penColor === color ? '2px solid white' : '2px solid transparent', cursor: 'pointer', padding: 0
                  }}
                />
              ))}
            </div>
          )}
          {onClose && (
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '8px' }}>
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      <div className="notebook-wrapper">
        <button className="nav-btn prev-btn" onClick={handlePrevPage} disabled={currentPageLeft === 0} style={{ opacity: currentPageLeft === 0 ? 0.2 : 1 }}>
          <ChevronLeft size={32} />
        </button>

        <div className="notebook-book">
          {/* Left Page Base */}
          <div className="notebook-page left-page">
            <NotebookPage 
              pageIndex={currentPageLeft} 
              data={pagesData[currentPageLeft]} 
              mode={mode} 
              penColor={penColor}
              isLeft={true}
              socket={socket} 
              activeHouse={activeHouse} 
              notebookType={notebookType}
            />
          </div>

          {/* Right Page Base */}
          <div className="notebook-page right-page">
            <NotebookPage 
              pageIndex={currentPageLeft + 1} 
              data={pagesData[currentPageLeft + 1]} 
              mode={mode} 
              penColor={penColor}
              isLeft={false}
              socket={socket} 
              activeHouse={activeHouse} 
              notebookType={notebookType}
            />
          </div>

          {/* Flipping Page Animation overlay */}
          {isFlipping === 'next' && (
            <div className="notebook-page right-page flip-next-anim">
              <div className="flip-front">
                 <NotebookPage pageIndex={currentPageLeft + 1} data={pagesData[currentPageLeft + 1]} mode="view" isLeft={false} />
              </div>
              <div className="flip-back">
                 <NotebookPage pageIndex={currentPageLeft + 2} data={pagesData[currentPageLeft + 2]} mode="view" isLeft={true} />
              </div>
            </div>
          )}

          {isFlipping === 'prev' && (
            <div className="notebook-page left-page flip-prev-anim">
              <div className="flip-front">
                 <NotebookPage pageIndex={currentPageLeft} data={pagesData[currentPageLeft]} mode="view" isLeft={true} />
              </div>
              <div className="flip-back">
                 <NotebookPage pageIndex={currentPageLeft - 1} data={pagesData[currentPageLeft - 1]} mode="view" isLeft={false} />
              </div>
            </div>
          )}

          <div className="notebook-spine"></div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <button className="nav-btn next-btn" onClick={handleNextPage}>
            <ChevronRight size={32} />
          </button>
          
          <div className="bookmarks-panel">
            <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Bookmark size={18} color="var(--primary)" /> Bookmarks
            </h3>
            
            <form onSubmit={handleSearchSubmit} style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '6px' }}>
              <Search size={16} color="var(--text-secondary)" style={{ margin: '4px' }} />
              <input 
                type="number" 
                min="1" 
                placeholder="Go to page..." 
                value={searchPage}
                onChange={(e) => setSearchPage(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', outline: 'none', fontSize: '13px' }}
              />
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
              {bookmarks.map((bm, i) => (
                <div key={i} className="bookmark-item" onClick={() => jumpToPage(bm.pageIndex + 1)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <span style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bm.name}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Pg {bm.pageIndex + 1}</span>
                  </div>
                  <button 
                    onClick={(e) => handleDeleteBookmark(i, e)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {bookmarks.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'center', padding: '10px 0' }}>No bookmarks yet</div>}
            </div>

            {showBookmarkAdd ? (
              <form onSubmit={handleAddBookmark} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Bookmark name" 
                  value={bookmarkName}
                  onChange={(e) => setBookmarkName(e.target.value)}
                  style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '8px', color: 'white', outline: 'none', fontSize: '13px' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" style={{ flex: 1, background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', padding: '6px', fontSize: '12px', cursor: 'pointer' }}>Save</button>
                  <button type="button" onClick={() => setShowBookmarkAdd(false)} style={{ flex: 1, background: 'transparent', color: 'white', border: '1px solid var(--border-glass)', borderRadius: '6px', padding: '6px', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                </div>
              </form>
            ) : (
              <button 
                onClick={() => setShowBookmarkAdd(true)}
                style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <BookmarkPlus size={14} /> Add current page
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedNotebook;
