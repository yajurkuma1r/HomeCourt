import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, Eraser, Layers, PenTool, Play, RotateCcw, Send, Trophy, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import LudoGame from '../../components/games/LudoGame';
import TruthDareGame from '../../components/games/TruthDareGame';
import FoodDraftGame from '../../components/games/FoodDraftGame';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

const formatRoundLabel = (round) => `Round ${Number(round || 0)}`;
const UNO_COLORS = ['red', 'yellow', 'green', 'blue'];

const UNO_COLOR_HEX = {
  red: '#ef4444',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#3b82f6',
  wild: '#18181b'
};

const formatUnoCard = (card) => {
  if (!card) {
    return 'UNO';
  }

  if (card.value === 'draw2') return '+2';
  if (card.value === 'wild4') return '+4';
  if (card.value === 'wild') return 'WILD';
  return String(card.value).toUpperCase();
};

const getUnoCardStyle = (card, compact = false) => ({
  background:
    card?.color === 'wild'
      ? 'linear-gradient(135deg, #ef4444 0 25%, #facc15 25% 50%, #22c55e 50% 75%, #3b82f6 75%)'
      : UNO_COLOR_HEX[card?.color] || '#27272a',
  color: card?.color === 'yellow' ? '#18181b' : 'white',
  border: '3px solid rgba(255,255,255,0.86)',
  borderRadius: compact ? '14px' : '18px',
  boxShadow: '0 14px 30px rgba(0,0,0,0.24)'
});

const buildPath = (points) => {
  if (!Array.isArray(points) || points.length === 0) {
    return '';
  }

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
};

const GamesRoom = () => {
  const { activeHouse, user, getPictionaryGame, updatePictionaryGame, getUnoGame, updateUnoGame, getLudoGame, getTruthDareGame } = useAuth();
  const [activeGame, setActiveGame] = useState('uno');
  const [game, setGame] = useState(null);
  const [unoGame, setUnoGame] = useState(null);
  const [truthDareGame, setTruthDareGame] = useState(null);
  const [guessInput, setGuessInput] = useState('');
  const [error, setError] = useState('');
  const [unoError, setUnoError] = useState('');
  const [ludoGame, setLudoGame] = useState(null);
  const [selectedWildColor, setSelectedWildColor] = useState('red');
  const [brushColor, setBrushColor] = useState('#111111');
  const [brushWidth, setBrushWidth] = useState(5);
  const [draftStroke, setDraftStroke] = useState([]);
  const boardRef = useRef(null);
  const drawingRef = useRef(false);

  const isAdmin = activeHouse?.members?.some((member) => member.userId === user?.id && member.role === 'admin') || false;
  const isDrawer = game?.drawerUserId === user?.id;
  const canStartRound = isAdmin || (isDrawer && game?.status === 'round-complete');
  const isUnoTurn = unoGame?.currentPlayerId === user?.id;
  const canPassUno = isUnoTurn && unoGame?.drawnThisTurnBy === user?.id;

  const loadGame = async () => {
    if (!activeHouse?.id) {
      return;
    }

    try {
      const data = await getPictionaryGame(activeHouse.id);
      setGame(data.game);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    }
  };

  const loadUnoGame = async () => {
    if (!activeHouse?.id) {
      return;
    }

    try {
      const data = await getUnoGame(activeHouse.id);
      setUnoGame(data.game);
      setUnoError('');
    } catch (loadError) {
      setUnoError(loadError.message);
    }
  };

  const loadLudoGame = async () => {
    if (!activeHouse?.id) return;
    try {
      const data = await getLudoGame(activeHouse.id);
      setLudoGame(data.game);
    } catch(e) {}
  };

  const loadTruthDareGame = async () => {
    if (!activeHouse?.id) return;
    try {
      const data = await getTruthDareGame(activeHouse.id);
      setTruthDareGame(data.game);
    } catch(e) {}
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadGame();
      loadUnoGame();
      loadLudoGame();
      loadTruthDareGame();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [activeHouse?.id]);

  useEffect(() => {
    if (!activeHouse?.id) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      if (activeGame === 'pictionary') {
        loadGame();
      } else if (activeGame === 'uno') {
        loadUnoGame();
      } else if (activeGame === 'ludo') {
        loadLudoGame();
      } else if (activeGame === 'truth_dare') {
        loadTruthDareGame();
      }
    }, 1500);

    return () => clearInterval(intervalId);
  }, [activeHouse?.id, activeGame]);

  const pushGameAction = async (payload) => {
    const response = await updatePictionaryGame(activeHouse.id, payload);
    setGame(response.game);
    return response.game;
  };

  const pushUnoAction = async (payload) => {
    const response = await updateUnoGame(activeHouse.id, payload);
    setUnoGame(response.game);
    return response.game;
  };

  const handleUnoAction = async (payload) => {
    try {
      await pushUnoAction(payload);
      setUnoError('');
    } catch (actionError) {
      setUnoError(actionError.message);
    }
  };

  const handlePlayUnoCard = async (card) => {
    await handleUnoAction({
      action: 'play-card',
      cardId: card.id,
      chosenColor: card.color === 'wild' ? selectedWildColor : undefined
    });
  };

  const getPointFromEvent = (event) => {
    const board = boardRef.current;
    if (!board) {
      return null;
    }

    const rect = board.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    return {
      x: Math.max(0, Math.min(CANVAS_WIDTH, x)),
      y: Math.max(0, Math.min(CANVAS_HEIGHT, y))
    };
  };

  const handlePointerDown = (event) => {
    if (!isDrawer || game?.status !== 'playing') {
      return;
    }

    const point = getPointFromEvent(event);
    if (!point) {
      return;
    }

    drawingRef.current = true;
    setDraftStroke([point]);
  };

  const handlePointerMove = (event) => {
    if (!drawingRef.current || !isDrawer || game?.status !== 'playing') {
      return;
    }

    const point = getPointFromEvent(event);
    if (!point) {
      return;
    }

    setDraftStroke((current) => [...current, point]);
  };

  const finishStroke = async () => {
    if (!drawingRef.current) {
      return;
    }

    drawingRef.current = false;
    const strokePoints = draftStroke;
    setDraftStroke([]);

    if (strokePoints.length < 2) {
      return;
    }

    try {
      await pushGameAction({
        action: 'add-stroke',
        color: brushColor,
        width: brushWidth,
        points: strokePoints
      });
      setError('');
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  const handleGuessSubmit = async (event) => {
    event.preventDefault();
    if (!guessInput.trim() || isDrawer || game?.status !== 'playing') {
      return;
    }

    try {
      await pushGameAction({
        action: 'submit-guess',
        text: guessInput
      });
      setGuessInput('');
      setError('');
    } catch (guessError) {
      setError(guessError.message);
    }
  };

  const handleStartNextRound = async () => {
    try {
      await pushGameAction({ action: 'start-round' });
      setError('');
    } catch (roundError) {
      setError(roundError.message);
    }
  };

  const handleClearCanvas = async () => {
    try {
      await pushGameAction({ action: 'clear-canvas' });
      setError('');
    } catch (clearError) {
      setError(clearError.message);
    }
  };

  const strokes = [
    ...(game?.strokes || []),
    ...(draftStroke.length > 1
      ? [
          {
            id: 'draft',
            color: brushColor,
            width: brushWidth,
            points: draftStroke
          }
        ]
      : [])
  ];

  return (
    <div className="games-room" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, letterSpacing: '0.08em', fontSize: '22px' }}>GAMEROOM</h2>
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Play real-time house games together.
          </span>
        </div>
        <div className="glass-panel games-tabs" style={{ padding: '6px', borderRadius: '16px', display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setActiveGame('uno')}
            style={{ background: activeGame === 'uno' ? 'linear-gradient(135deg, var(--primary), var(--secondary))' : 'transparent', color: 'white', border: 'none', borderRadius: '12px', padding: '10px 14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Layers size={16} />
            UNO
          </button>
          <button
            onClick={() => setActiveGame('pictionary')}
            style={{ background: activeGame === 'pictionary' ? 'linear-gradient(135deg, var(--primary), var(--secondary))' : 'transparent', color: 'white', border: 'none', borderRadius: '12px', padding: '10px 14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <PenTool size={16} />
            Pictionary
          </button>
          <button
            onClick={() => setActiveGame('ludo')}
            style={{ background: activeGame === 'ludo' ? 'linear-gradient(135deg, var(--primary), var(--secondary))' : 'transparent', color: 'white', border: 'none', borderRadius: '12px', padding: '10px 14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Users size={16} />
            Ludo
          </button>
          <button
            onClick={() => setActiveGame('truth_dare')}
            style={{ background: activeGame === 'truth_dare' ? 'linear-gradient(135deg, #d946ef, #c026d3)' : 'transparent', color: 'white', border: 'none', borderRadius: '12px', padding: '10px 14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Play size={16} />
            Truth or Dare
          </button>
          <button
            onClick={() => setActiveGame('food_draft')}
            style={{ background: activeGame === 'food_draft' ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'transparent', color: 'white', border: 'none', borderRadius: '12px', padding: '10px 14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Layers size={16} />
            Food Draft
          </button>
        </div>
      </div>

      {activeGame === 'uno' && (
        <>
          {unoError ? (
            <div className="glass-panel" style={{ padding: '12px 16px', color: '#fecdd3', borderColor: 'rgba(244,114,182,0.3)' }}>
              {unoError}
            </div>
          ) : null}

          <div className="games-uno-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: '24px', flex: 1, minHeight: 0 }}>
            <div className="glass-panel uno-table-panel" style={{ minHeight: '650px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '22px' }}>UNO Table</h3>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '4px', fontSize: '14px' }}>
                    {unoGame?.status === 'playing'
                      ? `${unoGame.currentUsername}'s turn`
                      : unoGame?.status === 'complete'
                        ? `${unoGame.winnerUsername} won the match`
                        : 'Start a match with your house members'}
                  </div>
                </div>
                <div className="uno-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleUnoAction({ action: 'start-game' })}
                    disabled={!isAdmin}
                    style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))', border: 'none', borderRadius: '12px', padding: '12px 16px', color: 'white', fontWeight: 700, cursor: isAdmin ? 'pointer' : 'not-allowed', opacity: isAdmin ? 1 : 0.55, display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Play size={18} />
                    {unoGame?.status === 'idle' ? 'Start Match' : 'New Match'}
                  </button>
                  {unoGame?.status === 'complete' ? (
                    <button
                      onClick={() => handleUnoAction({ action: 'reset-game' })}
                      disabled={!isAdmin}
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '12px 16px', color: 'white', fontWeight: 700, cursor: isAdmin ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <RotateCcw size={18} />
                      Reset
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="uno-board-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '18px', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Draw pile</div>
                  <button
                    onClick={() => handleUnoAction({ action: 'draw-card' })}
                    disabled={!isUnoTurn || unoGame?.status !== 'playing' || unoGame?.drawnThisTurnBy === user?.id}
                    style={{ width: '116px', height: '168px', borderRadius: '18px', border: '3px solid rgba(255,255,255,0.75)', background: 'linear-gradient(145deg, #111827, #7c3aed)', color: 'white', fontWeight: 900, fontSize: '28px', cursor: isUnoTurn ? 'pointer' : 'not-allowed', opacity: isUnoTurn ? 1 : 0.65, boxShadow: '0 16px 34px rgba(0,0,0,0.3)' }}
                  >
                    UNO
                  </button>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{unoGame?.deckCount || 0} cards</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Discard</div>
                  <div style={{ width: '128px', height: '184px', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 900, textAlign: 'center', ...getUnoCardStyle(unoGame?.topCard) }}>
                    {formatUnoCard(unoGame?.topCard)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Color
                    <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: UNO_COLOR_HEX[unoGame?.currentColor] || '#71717a', border: '2px solid rgba(255,255,255,0.7)' }} />
                    {unoGame?.currentColor || 'none'}
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '16px', borderRadius: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Turn log</div>
                  <strong style={{ lineHeight: 1.4 }}>{unoGame?.message || 'No match running yet.'}</strong>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Direction: {unoGame?.direction === -1 ? 'counter-clockwise' : 'clockwise'}
                  </div>
                  {canPassUno ? (
                    <button
                      onClick={() => handleUnoAction({ action: 'pass-turn' })}
                      style={{ marginTop: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border-glass)', borderRadius: '12px', color: 'white', padding: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Pass Turn
                    </button>
                  ) : null}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <strong>Your hand</strong>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px', marginLeft: '8px' }}>
                      {isUnoTurn ? 'Your turn' : 'Waiting'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Wild color</span>
                    {UNO_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setSelectedWildColor(color)}
                        aria-label={`Choose ${color}`}
                        style={{ width: '28px', height: '28px', borderRadius: '50%', border: selectedWildColor === color ? '3px solid white' : '1px solid rgba(255,255,255,0.35)', background: UNO_COLOR_HEX[color], cursor: 'pointer' }}
                      />
                    ))}
                  </div>
                </div>
                <div className="uno-hand" style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '4px 4px 18px' }}>
                  {(unoGame?.hand || []).map((card) => (
                    <button
                      key={card.id}
                      onClick={() => handlePlayUnoCard(card)}
                      disabled={!isUnoTurn || unoGame?.status !== 'playing'}
                      style={{ minWidth: '82px', height: '122px', padding: '10px', fontWeight: 900, fontSize: card.value === 'wild' || card.value === 'wild4' ? '17px' : '28px', cursor: isUnoTurn ? 'pointer' : 'not-allowed', opacity: isUnoTurn ? 1 : 0.58, ...getUnoCardStyle(card, true) }}
                    >
                      {formatUnoCard(card)}
                    </button>
                  ))}
                  {(!unoGame?.hand || unoGame.hand.length === 0) ? (
                    <div style={{ color: 'var(--text-secondary)', padding: '24px 0' }}>
                      Your cards will appear here when the admin starts UNO.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="glass-panel uno-players-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} />
                <h3 style={{ margin: 0 }}>Players</h3>
              </div>
              {(unoGame?.players || []).map((player, index) => (
                <div key={player.userId} className="glass-panel uno-player-card" style={{ padding: '12px 14px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderColor: player.isCurrent ? 'rgba(255,117,140,0.55)' : 'var(--border-glass)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{index + 1}. {player.username}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{player.isCurrent ? 'Taking turn' : 'Waiting'}</div>
                  </div>
                  <strong>{player.cardCount}</strong>
                </div>
              ))}
              {(!unoGame?.players || unoGame.players.length === 0) ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  UNO uses the current house members as players.
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}

      {activeGame === 'pictionary' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div className="glass-panel" style={{ padding: '10px 14px', borderRadius: '14px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              {formatRoundLabel(game?.round)} | {game?.drawerUsername ? `Drawer: ${game.drawerUsername}` : 'No drawer yet'}
            </div>
            <button
              onClick={handleStartNextRound}
              disabled={!canStartRound}
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                border: 'none',
                borderRadius: '12px',
                padding: '12px 18px',
                color: 'white',
                fontWeight: 700,
                cursor: canStartRound ? 'pointer' : 'not-allowed',
                opacity: canStartRound ? 1 : 0.55,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Play size={18} />
              {game?.round ? 'Next Round' : 'Start Game'}
            </button>
          </div>

          {error ? (
        <div className="glass-panel" style={{ padding: '12px 16px', color: '#fecdd3', borderColor: 'rgba(244,114,182,0.3)' }}>
          {error}
        </div>
          ) : null}

      <div className="pictionary-layout" style={{ display: 'flex', gap: '24px', flex: 1, minHeight: 0, alignItems: 'stretch' }}>
        <div className="glass-panel pictionary-board-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '18px', minHeight: '640px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '18px' }}>
                {game?.status === 'round-complete'
                  ? `${game?.winnerUsername || 'Someone'} guessed it!`
                  : isDrawer
                    ? 'Your turn to draw'
                    : game?.drawerUsername
                      ? `${game.drawerUsername} is drawing`
                      : 'Start a round to begin'}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                {isDrawer
                  ? game?.word
                    ? `Word: ${game.word} | Hint: ${game.hint}`
                    : 'Wait for the round to start.'
                  : game?.maskedWord
                    ? `${game.maskedWord} | Hint: ${game.hint}`
                    : 'No active word yet.'}
              </div>
            </div>
            {isDrawer ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  Color
                  <input type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  Brush
                  <input type="range" min="2" max="18" value={brushWidth} onChange={(event) => setBrushWidth(Number(event.target.value))} />
                </label>
                <button
                  onClick={handleClearCanvas}
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid var(--border-glass)', borderRadius: '999px', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <Eraser size={16} />
                </button>
              </div>
            ) : null}
          </div>

          <div
            ref={boardRef}
            style={{
              flex: 1,
              background: '#f7f5ef',
              borderRadius: '18px',
              position: 'relative',
              overflow: 'hidden',
              touchAction: 'none',
              cursor: isDrawer ? 'crosshair' : 'default'
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerLeave={finishStroke}
          >
            {strokes.length === 0 ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(17,17,17,0.22)', gap: '10px' }}>
                <PenTool size={48} />
                <div style={{ fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {isDrawer ? 'Start drawing here' : 'Waiting for the drawing'}
                </div>
              </div>
            ) : null}
            <svg viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} style={{ width: '100%', height: '100%', display: 'block' }}>
              {strokes.map((stroke) => (
                <path
                  key={stroke.id}
                  d={buildPath(stroke.points)}
                  fill="none"
                  stroke={stroke.color}
                  strokeWidth={stroke.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </svg>
          </div>
        </div>

        <div className="glass-panel pictionary-side-panel" style={{ width: '340px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Trophy size={18} />
              <h3 style={{ margin: 0 }}>Scoreboard</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(game?.scores || []).map((entry) => (
                <div key={entry.userId} className="glass-panel" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '14px' }}>
                  <span>{entry.username}</span>
                  <strong>{entry.score}</strong>
                </div>
              ))}
            </div>
          </div>

          <div style={{ minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <CheckCircle size={18} />
              <h3 style={{ margin: 0 }}>Guesses</h3>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {(game?.guesses || []).map((guess) => (
                <div
                  key={guess.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background: guess.isCorrect ? 'rgba(34, 197, 94, 0.18)' : 'rgba(255,255,255,0.08)',
                    color: guess.isCorrect ? '#86efac' : 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}
                >
                  <span>{guess.sender?.username}: {guess.text}</span>
                  {guess.isCorrect ? <strong>Correct</strong> : null}
                </div>
              ))}
              {(!game?.guesses || game.guesses.length === 0) ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  No guesses yet. Once the round starts, everyone except the drawer can guess here.
                </div>
              ) : null}
            </div>
          </div>

          <form onSubmit={handleGuessSubmit} style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={guessInput}
              onChange={(event) => setGuessInput(event.target.value)}
              disabled={isDrawer || game?.status !== 'playing'}
              placeholder={isDrawer ? 'You are drawing this round' : 'Type your guess...'}
              style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '12px 14px', color: 'white', outline: 'none' }}
            />
            <button
              type="submit"
              disabled={isDrawer || game?.status !== 'playing'}
              style={{
                background: 'var(--primary)',
                border: 'none',
                borderRadius: '12px',
                width: '48px',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isDrawer || game?.status !== 'playing' ? 'not-allowed' : 'pointer',
                opacity: isDrawer || game?.status !== 'playing' ? 0.55 : 1
              }}
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
        </>
      )}

      {activeGame === 'ludo' && (
        <div className="game-view-shell" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <LudoGame game={ludoGame} houseId={activeHouse?.id} user={user} />
        </div>
      )}

      {activeGame === 'truth_dare' && (
        <div className="game-view-shell" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <TruthDareGame game={truthDareGame} houseId={activeHouse?.id} user={user} />
        </div>
      )}

      {activeGame === 'food_draft' && (
        <div className="game-view-shell" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <FoodDraftGame houseId={activeHouse?.id} user={user} />
        </div>
      )}
    </div>
  );
};

export default GamesRoom;
