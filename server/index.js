import { createServer } from 'node:http';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import pg from 'pg';
import { Server as SocketIOServer } from 'socket.io';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const dataDir = join(__dirname, 'data');
const dbPath = join(dataDir, 'auth-db.json');
const port = process.env.PORT || 3001;
const { Pool } = pg;

const loadEnvFile = (filePath) => {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, '');

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
};

loadEnvFile(join(rootDir, '.env'));
loadEnvFile(join(rootDir, '.env.local'));

const createEmptyDb = () => ({ users: [], sessions: [], houses: [] });
const cloneDb = (db) => JSON.parse(JSON.stringify(db || createEmptyDb()));
const usePostgres = Boolean(process.env.DATABASE_URL);
let dbStore = createEmptyDb();
let pgPool = null;
let pendingPostgresWrite = Promise.resolve();

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

if (!existsSync(dbPath)) {
  writeFileSync(dbPath, JSON.stringify(createEmptyDb(), null, 2), 'utf8');
}

const readJsonDb = () => {
  try {
    const raw = readFileSync(dbPath, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      houses: Array.isArray(parsed.houses) ? parsed.houses : []
    };
  } catch (error) {
    console.error('Failed to read auth database:', error);
    return createEmptyDb();
  }
};

const writeJsonDb = (db) => {
  writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
};

const getPostgresSsl = () => {
  const sslMode = String(process.env.PGSSLMODE || process.env.DATABASE_SSL || '').toLowerCase();
  if (sslMode === 'disable' || sslMode === 'false') {
    return false;
  }

  if (sslMode === 'require' || sslMode === 'true' || process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: false };
  }

  return false;
};

const initializePostgresDb = async () => {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: getPostgresSsl()
  });

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const result = await pgPool.query('SELECT data FROM app_state WHERE id = $1', ['main']);
  if (result.rows[0]?.data) {
    dbStore = {
      users: Array.isArray(result.rows[0].data.users) ? result.rows[0].data.users : [],
      sessions: Array.isArray(result.rows[0].data.sessions) ? result.rows[0].data.sessions : [],
      houses: Array.isArray(result.rows[0].data.houses) ? result.rows[0].data.houses : []
    };
    console.log('[database] Loaded app data from Postgres.');
    return;
  }

  dbStore = readJsonDb();
  await pgPool.query(
    `
      INSERT INTO app_state (id, data, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `,
    ['main', dbStore]
  );
  console.log('[database] Initialized Postgres app data.');
};

const initializeDbStore = async () => {
  if (!usePostgres) {
    dbStore = readJsonDb();
    console.log('[database] Using local JSON database.');
    return;
  }

  try {
    await initializePostgresDb();
  } catch (error) {
    console.error('[database] Failed to connect to Postgres:', error);
    throw error;
  }
};

const persistPostgresDb = (db) => {
  pendingPostgresWrite = pendingPostgresWrite
    .catch(() => {})
    .then(() =>
      pgPool.query(
        `
          INSERT INTO app_state (id, data, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (id)
          DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        `,
        ['main', db]
      )
    )
    .catch((error) => {
      console.error('[database] Failed to persist Postgres app data:', error);
    });
};

const readDb = () => cloneDb(dbStore);

const writeDb = (db) => {
  dbStore = cloneDb(db);
  if (usePostgres) {
    persistPostgresDb(dbStore);
    return;
  }

  writeJsonDb(dbStore);
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizeUsername = (username) => String(username || '').trim().toLowerCase();

const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));

const isValidUsername = (username) =>
  /^[a-zA-Z0-9._]{3,20}$/.test(String(username || '').trim());

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) {
    return false;
  }

  const candidateHash = crypto.scryptSync(password, salt, 64);
  const storedHashBuffer = Buffer.from(hash, 'hex');

  if (candidateHash.length !== storedHashBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidateHash, storedHashBuffer);
};

const createUserPayload = (user) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  firstName: user.firstName || '',
  lastName: user.lastName || '',
  age: user.age || null,
  gender: user.gender || '',
  phoneNumber: user.phoneNumber || '',
  profilePicture: user.profilePicture || '',
  createdAt: user.createdAt
});

const createSession = (db, userId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const session = {
    token,
    userId,
    createdAt: new Date().toISOString()
  };

  db.sessions = db.sessions.filter((entry) => entry.userId !== userId);
  db.sessions.push(session);
  return token;
};

const json = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(payload));
};

const notFound = (res) => json(res, 404, { error: 'Route not found.' });

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error('Payload too large. Use a smaller image and try again.'));
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });

    req.on('error', reject);
  });

const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice('Bearer '.length).trim();
};

const getUserFromRequest = (req, db) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return null;
  }

  const session = db.sessions.find((entry) => entry.token === token);
  if (!session) {
    return null;
  }

  return db.users.find((entry) => entry.id === session.userId) || null;
};

const createInviteCode = () =>
  `HS-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const createHousePayload = (house, viewerId) => {
  const members = [...(house.members || [])].sort((a, b) => {
    if (a.role === 'admin' && b.role !== 'admin') return -1;
    if (a.role !== 'admin' && b.role === 'admin') return 1;
    return new Date(a.joinedAt) - new Date(b.joinedAt);
  });

  return {
    id: house.id,
    name: house.name,
    code: house.code,
    adminId: house.adminId,
    createdAt: house.createdAt,
    lastActiveAt: house.lastActiveAt,
    members,
    currentUserRole: members.find((member) => member.userId === viewerId)?.role || null,
    latestPolaroid: (house.polaroids && house.polaroids.length > 0) ? house.polaroids[0] : null,
    polaroids: house.polaroids || []
  };
};

const createMemberPayload = (member, house, roomPath = '') => {
  let userSocket = null;
  const sockets = Array.from(io?.sockets?.sockets?.values?.() || []);
  
  for (const socket of sockets) {
    if (socket.data?.userId === member.userId && socket.data?.joinedHouses?.has(house.id)) {
      userSocket = socket;
      break;
    }
  }

  const isOnline = Boolean(userSocket);
  const currentRoom = userSocket ? (userSocket.data?.currentRooms?.get(house.id) || null) : null;
  const isInRoom = Boolean(roomPath && currentRoom === roomPath);

  return {
    ...member,
    firstName: member.firstName || '',
    lastName: member.lastName || '',
    profilePicture: member.profilePicture || '',
    isOriginalAdmin: house.adminId === member.userId,
    isOnline,
    isInRoom,
    currentRoom
  };
};

const createHouseMembersPayload = (house, viewerId, roomPath = '') => {
  const members = [...(house.members || [])]
    .sort((a, b) => {
      if (house.adminId === a.userId && house.adminId !== b.userId) return -1;
      if (house.adminId !== a.userId && house.adminId === b.userId) return 1;
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (a.role !== 'admin' && b.role === 'admin') return 1;
      return new Date(a.joinedAt) - new Date(b.joinedAt);
    })
    .map((member) => createMemberPayload(member, house, roomPath));

  return {
    houseId: house.id,
    viewerRole: members.find((member) => member.userId === viewerId)?.role || null,
    viewerIsOriginalAdmin: house.adminId === viewerId,
    roomPath,
    totalCount: members.length,
    onlineCount: members.filter((member) => member.isOnline).length,
    roomOnlineCount: roomPath ? members.filter((member) => member.isInRoom).length : 0,
    members
  };
};

const createEventPayload = (event) => ({
  id: event.id,
  title: event.title,
  message: event.message,
  date: event.date,
  createdAt: event.createdAt,
  createdBy: event.createdBy
});

const createCapsulePayload = (capsule) => ({
  id: capsule.id,
  title: capsule.title,
  message: capsule.message,
  unlockAt: capsule.unlockAt,
  createdAt: capsule.createdAt,
  createdBy: capsule.createdBy,
  assets: capsule.assets || []
});

const getEmailConfig = () => ({
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  appUrl: process.env.APP_URL || 'http://localhost:5174'
});

const getEmailTransport = () => {
  const config = getEmailConfig();

  if (!config.host || !config.user || !config.pass || !config.from) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });
};

const getHouseRecipientEmails = (house) =>
  Array.from(
    new Set(
      (house.members || [])
        .map((member) => String(member.email || '').trim().toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    )
  );

const formatNotificationTime = (isoDate) =>
  new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: process.env.NOTIFICATION_TIME_ZONE || 'Asia/Kolkata'
  }).format(new Date(isoDate));

const sendHouseNotificationEmail = async ({ house, subject, text, html }) => {
  const transport = getEmailTransport();
  const config = getEmailConfig();
  const recipients = getHouseRecipientEmails(house);

  if (recipients.length === 0) {
    return { sent: false, reason: 'No house member emails found.' };
  }

  if (!transport) {
    console.warn(
      `[notifications] Email skipped for "${subject}". Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.`
    );
    return { sent: false, reason: 'SMTP is not configured.' };
  }

  await transport.sendMail({
    from: config.from,
    to: config.from,
    bcc: recipients,
    subject,
    text,
    html
  });

  return { sent: true, recipients };
};

const createAssetPayload = (asset) => ({
  id: asset.id,
  kind: asset.kind,
  name: asset.name,
  mimeType: asset.mimeType,
  dataUrl: asset.dataUrl
});

const createVaultFolderPayload = (folder) => ({
  id: folder.id,
  name: folder.name,
  parentId: folder.parentId || null,
  createdAt: folder.createdAt,
  createdBy: folder.createdBy
});

const createVaultItemPayload = (item) => ({
  id: item.id,
  folderId: item.folderId || null,
  title: item.title,
  message: item.message,
  createdAt: item.createdAt,
  createdBy: item.createdBy,
  assets: (item.assets || []).map(createAssetPayload)
});

const createMessagePayload = (message) => ({
  id: message.id,
  text: message.text,
  roomId: message.roomId || 'general',
  createdAt: message.createdAt,
  sender: message.sender,
  assets: (message.assets || []).map(createAssetPayload)
});

const createMediaStatePayload = (state) => ({
  sourceUrl: state?.sourceUrl || '',
  mediaId: state?.mediaId || '',
  title: state?.title || '',
  isPlaying: Boolean(state?.isPlaying),
  positionMs: Number(state?.positionMs || 0),
  durationMs: Number(state?.durationMs || 0),
  queue: Array.isArray(state?.queue)
    ? state.queue.map((entry) => ({
        sourceUrl: entry?.sourceUrl || '',
        mediaId: entry?.mediaId || '',
        title: entry?.title || '',
        queuedAt: entry?.queuedAt || null,
        queuedBy: entry?.queuedBy || null
      }))
    : [],
  updatedAt: state?.updatedAt || null,
  updatedBy: state?.updatedBy || null
});

const createEmptySpotifyState = () => ({
  sourceUrl: '',
  mediaId: '',
  title: '',
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  queue: [],
  updatedAt: null,
  updatedBy: null
});

const createEmptyYouTubeState = () => ({
  sourceUrl: '',
  mediaId: '',
  title: '',
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  updatedAt: null,
  updatedBy: null
});

const deleteVaultFolderTree = (vault, folderId) => {
  const folders = Array.isArray(vault?.folders) ? vault.folders : [];
  const items = Array.isArray(vault?.items) ? vault.items : [];
  const folderIdsToDelete = new Set([folderId]);
  let added = true;

  while (added) {
    added = false;
    folders.forEach((folder) => {
      if (!folderIdsToDelete.has(folder.id) && folder.parentId && folderIdsToDelete.has(folder.parentId)) {
        folderIdsToDelete.add(folder.id);
        added = true;
      }
    });
  }

  return {
    folders: folders.filter((folder) => !folderIdsToDelete.has(folder.id)),
    items: items.filter((item) => !folderIdsToDelete.has(item.folderId || ''))
  };
};

const PICTIONARY_WORD_BANK = [
  { word: 'apple', hint: 'Fruit' },
  { word: 'guitar', hint: 'Music instrument' },
  { word: 'rocket', hint: 'Space travel' },
  { word: 'rainbow', hint: 'Colorful sky' },
  { word: 'turtle', hint: 'Slow animal' },
  { word: 'castle', hint: 'Royal building' },
  { word: 'pizza', hint: 'Cheesy food' },
  { word: 'camera', hint: 'Takes photos' },
  { word: 'butterfly', hint: 'Colorful insect' },
  { word: 'volcano', hint: 'Lava mountain' },
  { word: 'football', hint: 'Popular sport' },
  { word: 'elephant', hint: 'Large animal' }
];

const createEmptyPictionaryState = () => ({
  status: 'idle',
  round: 0,
  turnIndex: 0,
  drawerUserId: null,
  word: '',
  hint: '',
  strokes: [],
  guesses: [],
  scores: {},
  winnerUserId: null,
  winnerUsername: '',
  updatedAt: null,
  updatedBy: null
});

const ensurePictionaryState = (state) => ({
  ...createEmptyPictionaryState(),
  ...(state || {}), bookmarks: state?.bookmarks || [],
  strokes: Array.isArray(state?.strokes) ? state.strokes : [],
  guesses: Array.isArray(state?.guesses) ? state.guesses : [],
  scores: state?.scores && typeof state.scores === 'object' ? state.scores : {}
});

const maskPictionaryWord = (word) =>
  String(word || '')
    .split('')
    .map((char) => (char === ' ' ? '/' : '_'))
    .join(' ');

const createPictionaryPayload = (state, house, viewerId) => {
  const safeState = ensurePictionaryState(state);
  const members = house.members || [];
  const drawer = members.find((member) => member.userId === safeState.drawerUserId) || null;

  return {
    status: safeState.status,
    round: safeState.round,
    turnIndex: safeState.turnIndex,
    drawerUserId: safeState.drawerUserId,
    drawerUsername: drawer?.username || '',
    word: safeState.drawerUserId === viewerId ? safeState.word : '',
    maskedWord: safeState.word ? maskPictionaryWord(safeState.word) : '',
    hint: safeState.hint || '',
    strokes: safeState.strokes,
    guesses: safeState.guesses,
    scores: members.map((member) => ({
      userId: member.userId,
      username: member.username,
      score: Number(safeState.scores?.[member.userId] || 0)
    })),
    winnerUserId: safeState.winnerUserId || null,
    winnerUsername: safeState.winnerUsername || '',
    updatedAt: safeState.updatedAt || null,
    updatedBy: safeState.updatedBy || null
  };
};

const choosePictionaryWord = () =>
  PICTIONARY_WORD_BANK[Math.floor(Math.random() * PICTIONARY_WORD_BANK.length)];

const getNextDrawer = (members, currentTurnIndex = 0) => {
  const orderedMembers = [...(members || [])].sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
  if (orderedMembers.length === 0) {
    return { drawer: null, nextTurnIndex: 0 };
  }

  const nextTurnIndex = currentTurnIndex % orderedMembers.length;
  return {
    drawer: orderedMembers[nextTurnIndex],
    nextTurnIndex
  };
};

const createPictionaryRoundState = (previousState, house, user) => {
  const state = ensurePictionaryState(previousState);
  const { drawer, nextTurnIndex } = getNextDrawer(house.members, state.turnIndex);
  const selection = choosePictionaryWord();
  const now = new Date().toISOString();

  return {
    ...state,
    status: 'playing',
    round: Number(state.round || 0) + 1,
    turnIndex: nextTurnIndex + 1,
    drawerUserId: drawer?.userId || null,
    word: selection.word,
    hint: selection.hint,
    strokes: [],
    guesses: [],
    winnerUserId: null,
    winnerUsername: '',
    updatedAt: now,
    updatedBy: {
      userId: user.id,
      username: user.username
    }
  };
};

const UNO_COLORS = ['red', 'yellow', 'green', 'blue'];
const UNO_NUMBER_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const UNO_ACTION_VALUES = ['skip', 'reverse', 'draw2'];

const createUnoDeck = () => {
  const cards = [];
  UNO_COLORS.forEach((color) => {
    UNO_NUMBER_VALUES.forEach((value) => {
      cards.push({ id: `uno_${crypto.randomUUID().slice(0, 10)}`, color, value, kind: 'number' });
      if (value !== '0') {
        cards.push({ id: `uno_${crypto.randomUUID().slice(0, 10)}`, color, value, kind: 'number' });
      }
    });

    UNO_ACTION_VALUES.forEach((value) => {
      cards.push({ id: `uno_${crypto.randomUUID().slice(0, 10)}`, color, value, kind: 'action' });
      cards.push({ id: `uno_${crypto.randomUUID().slice(0, 10)}`, color, value, kind: 'action' });
    });
  });

  for (let index = 0; index < 4; index += 1) {
    cards.push({ id: `uno_${crypto.randomUUID().slice(0, 10)}`, color: 'wild', value: 'wild', kind: 'wild' });
    cards.push({ id: `uno_${crypto.randomUUID().slice(0, 10)}`, color: 'wild', value: 'wild4', kind: 'wild' });
  }

  return cards;
};

const shuffle = (cards) => {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

const createEmptyTruthDareState = () => ({
  status: 'idle', // 'idle', 'selecting', 'choosing', 'questioning', 'answering', 'round-complete'
  players: [],
  history: [], // array of { selectorId, performerId }
  selectorId: null,
  performerId: null,
  choice: null, // 'truth' | 'dare' | null
  question: null,
  response: null,
  updatedAt: null,
  updatedBy: null
});

const ensureTruthDareState = (state) => ({
  ...createEmptyTruthDareState(),
  ...(state || {}),
  players: Array.isArray(state?.players) ? state.players : [],
  history: Array.isArray(state?.history) ? state.history : []
});

const createTruthDarePayload = (state) => {
  const safeState = ensureTruthDareState(state);
  return {
    status: safeState.status,
    players: safeState.players,
    history: safeState.history,
    selectorId: safeState.selectorId,
    performerId: safeState.performerId,
    choice: safeState.choice,
    question: safeState.question,
    response: safeState.response,
    updatedAt: safeState.updatedAt,
    updatedBy: safeState.updatedBy
  };
};

const getTruthDareNextPair = (members, history) => {
  const activeUserIds = members.map((m) => m.userId);
  let availablePairs = [];
  
  for (let i = 0; i < activeUserIds.length; i++) {
    for (let j = 0; j < activeUserIds.length; j++) {
      if (i !== j) {
        availablePairs.push({ selectorId: activeUserIds[i], performerId: activeUserIds[j] });
      }
    }
  }

  if (availablePairs.length === 0) {
    return { selectorId: null, performerId: null };
  }

  let unusedPairs = availablePairs.filter(pair => 
    !history.some(h => h.selectorId === pair.selectorId && h.performerId === pair.performerId)
  );

  if (unusedPairs.length === 0) {
    unusedPairs = availablePairs;
    // We don't actually clear the history array here because we want to preserve it,
    // we just allow all pairs again. The caller can handle history resets if needed.
  }

  return unusedPairs[crypto.randomInt(unusedPairs.length)];
};

const createEmptyUnoState = () => ({
  status: 'idle',
  players: [],
  hands: {},
  deck: [],
  discardPile: [],
  currentColor: '',
  currentPlayerId: null,
  direction: 1,
  drawnThisTurnBy: null,
  winnerUserId: null,
  winnerUsername: '',
  message: 'Start a match when at least two house members are ready.',
  updatedAt: null,
  updatedBy: null
});

const ensureUnoState = (state) => ({
  ...createEmptyUnoState(),
  ...(state || {}), bookmarks: state?.bookmarks || [],
  players: Array.isArray(state?.players) ? state.players : [],
  hands: state?.hands && typeof state.hands === 'object' ? state.hands : {},
  deck: Array.isArray(state?.deck) ? state.deck : [],
  discardPile: Array.isArray(state?.discardPile) ? state.discardPile : [],
  direction: state?.direction === -1 ? -1 : 1
});

const getUnoPlayerIndex = (players, userId) =>
  players.findIndex((player) => player.userId === userId);

const getUnoNextIndex = (players, currentIndex, direction, steps = 1) => {
  if (!players.length) {
    return -1;
  }

  const size = players.length;
  return (currentIndex + direction * steps + size * steps) % size;
};

const drawUnoCards = (state, count) => {
  let deck = [...state.deck];
  let discardPile = [...state.discardPile];
  const drawn = [];

  while (drawn.length < count) {
    if (deck.length === 0) {
      if (discardPile.length <= 1) {
        break;
      }

      const topCard = discardPile[discardPile.length - 1];
      deck = shuffle(discardPile.slice(0, -1));
      discardPile = [topCard];
    }

    const nextCard = deck.pop();
    if (!nextCard) {
      break;
    }
    drawn.push(nextCard);
  }

  return { deck, discardPile, drawn };
};

const getUnoTopCard = (state) => state.discardPile[state.discardPile.length - 1] || null;

const isUnoCardPlayable = (card, state) => {
  const topCard = getUnoTopCard(state);
  if (!card || !topCard || state.status !== 'playing') {
    return false;
  }

  return (
    card.color === 'wild' ||
    card.color === state.currentColor ||
    card.value === topCard.value ||
    card.kind === topCard.kind && card.kind === 'wild'
  );
};

const createUnoGameState = (house, user) => {
  const players = (house.members || [])
    .slice()
    .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))
    .map((member) => ({
      userId: member.userId,
      username: member.username
    }));

  if (players.length < 2) {
    throw new Error('UNO needs at least two house members.');
  }

  let deck = shuffle(createUnoDeck());
  const hands = {};
  players.forEach((player) => {
    hands[player.userId] = [];
  });

  for (let cardIndex = 0; cardIndex < 7; cardIndex += 1) {
    players.forEach((player) => {
      hands[player.userId].push(deck.pop());
    });
  }

  let topCard = deck.pop();
  while (topCard?.color === 'wild' || topCard?.kind === 'action') {
    deck.unshift(topCard);
    deck = shuffle(deck);
    topCard = deck.pop();
  }

  const now = new Date().toISOString();
  return {
    ...createEmptyUnoState(),
    status: 'playing',
    players,
    hands,
    deck,
    discardPile: [topCard],
    currentColor: topCard.color,
    currentPlayerId: players[0].userId,
    message: `${players[0].username} starts the match.`,
    updatedAt: now,
    updatedBy: {
      userId: user.id,
      username: user.username
    }
  };
};

const createUnoPayload = (state, house, viewerId) => {
  const safeState = ensureUnoState(state);
  const currentPlayer = safeState.players.find((player) => player.userId === safeState.currentPlayerId);

  return {
    status: safeState.status,
    players: safeState.players.map((player) => ({
      ...player,
      cardCount: Array.isArray(safeState.hands[player.userId]) ? safeState.hands[player.userId].length : 0,
      isCurrent: player.userId === safeState.currentPlayerId
    })),
    hand: Array.isArray(safeState.hands[viewerId]) ? safeState.hands[viewerId] : [],
    topCard: getUnoTopCard(safeState),
    currentColor: safeState.currentColor,
    currentPlayerId: safeState.currentPlayerId,
    currentUsername: currentPlayer?.username || '',
    direction: safeState.direction,
    deckCount: safeState.deck.length,
    discardCount: safeState.discardPile.length,
    drawnThisTurnBy: safeState.drawnThisTurnBy,
    winnerUserId: safeState.winnerUserId,
    winnerUsername: safeState.winnerUsername,
    message: safeState.message,
    updatedAt: safeState.updatedAt
  };
};


const createEmptyNotebookState = () => ({
  pages: {}, bookmarks: []
});

const ensureNotebookState = (state) => ({
  pages: {},
  ...(state || {}),
  bookmarks: state?.bookmarks || []
});
const createEmptyCallState = () => ({
  participants: [],
  signals: []
});

const ensureCallState = (state) => ({
  participants: Array.isArray(state?.participants) ? state.participants : [],
  signals: Array.isArray(state?.signals) ? state.signals : []
});

const filterActiveCallParticipants = (participants) =>
  (Array.isArray(participants) ? participants : []).filter((participant) => {
    const updatedAt = new Date(participant.updatedAt || 0).getTime();
    return Number.isFinite(updatedAt) && Date.now() - updatedAt < 30000;
  });

const createCallPayload = (state) => {
  const safeState = ensureCallState(state);
  const participants = filterActiveCallParticipants(safeState.participants);
  const activeUserIds = new Set(participants.map((participant) => participant.userId));
  const signals = safeState.signals.filter((signal) => {
    const createdAt = new Date(signal.createdAt || 0).getTime();
    return (
      Number.isFinite(createdAt) &&
      Date.now() - createdAt < 60000 &&
      activeUserIds.has(signal.senderUserId) &&
      activeUserIds.has(signal.targetUserId)
    );
  });

  return {
    participants,
    signals
  };
};

const createShowroomSnapPayload = (snap, viewerId) => {
  const recipientUserIds = Array.isArray(snap.recipientUserIds) ? snap.recipientUserIds : [];
  const viewedBy = Array.isArray(snap.viewedBy) ? snap.viewedBy : [];

  return {
    id: snap.id,
    createdAt: snap.createdAt,
    sender: snap.sender,
    viewCount: viewedBy.length,
    recipientCount: recipientUserIds.length,
    canOpen:
      snap.sender?.userId !== viewerId &&
      recipientUserIds.includes(viewerId) &&
      !viewedBy.includes(viewerId),
    viewed: viewedBy.includes(viewerId),
    isMine: snap.sender?.userId === viewerId
  };
};

const createShowroomPayload = (showroom, viewerId) => ({
  snaps: (showroom?.snaps || [])
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((snap) => createShowroomSnapPayload(snap, viewerId))
});

const touchHouseMembership = (house, user) => {
  const now = new Date().toISOString();

  return {
    ...house,
    lastActiveAt: now,
    members: (house.members || []).map((member) =>
      member.userId === user.id
        ? {
            ...member,
            username: user.username,
            email: user.email,
            lastSeenAt: now
          }
        : member
    )
  };
};

const normalizeAssets = (rawAssets) =>
  (Array.isArray(rawAssets) ? rawAssets : [])
    .filter((asset) => asset && asset.name && asset.mimeType && asset.dataUrl)
    .map((asset) => ({
      id: `asset_${crypto.randomUUID().slice(0, 8)}`,
      kind: String(asset.kind || 'file'),
      name: String(asset.name),
      mimeType: String(asset.mimeType),
      dataUrl: String(asset.dataUrl)
    }));

const parseHouseRoute = (url, suffix) => {
  const pathname = url.split('?')[0];
  const match = pathname.match(new RegExp(`^/api/houses/([^/]+)/${suffix}$`));
  return match ? match[1] : null;
};

const createMapPayload = (house) => ({
  house: {
    id: house.id,
    name: house.name,
    code: house.code
  },
  members: (house.members || []).map((member) => ({
    userId: member.userId,
    username: member.username,
    role: member.role,
    lastSeenAt: member.lastSeenAt,
    location: member.location || null
  }))
});

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/auth/signup') {
    try {
      const body = await readBody(req);
      const email = normalizeEmail(body.email);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      if (!isValidEmail(email)) {
        json(res, 400, { error: 'Enter a valid email address.' });
        return;
      }

      if (!isValidUsername(username)) {
        json(res, 400, { error: 'Username must be 3-20 characters and use only letters, numbers, periods, or underscores.' });
        return;
      }

      if (password.length < 8) {
        json(res, 400, { error: 'Password must be at least 8 characters long.' });
        return;
      }

      const db = readDb();
      const emailTaken = db.users.some((user) => user.email === email);
      const usernameTaken = db.users.some(
        (user) => user.usernameNormalized === normalizeUsername(username)
      );

      if (emailTaken) {
        json(res, 409, { error: 'An account with that email already exists.' });
        return;
      }

      if (usernameTaken) {
        json(res, 409, { error: 'That username is already taken.' });
        return;
      }

      const user = {
        id: `user_${crypto.randomUUID().slice(0, 8)}`,
        email,
        username,
        usernameNormalized: normalizeUsername(username),
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString()
      };

      db.users.push(user);
      const token = createSession(db, user.id);
      writeDb(db);

      json(res, 201, { token, user: createUserPayload(user) });
    } catch (error) {
      json(res, 400, { error: error.message || 'Could not create account.' });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/auth/login') {
    try {
      const body = await readBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const db = readDb();
      const user = db.users.find((entry) => entry.email === email);

      if (!user || !verifyPassword(password, user.passwordHash)) {
        json(res, 401, { error: 'Incorrect email or password.' });
        return;
      }

      const token = createSession(db, user.id);
      writeDb(db);

      json(res, 200, { token, user: createUserPayload(user) });
    } catch (error) {
      json(res, 400, { error: error.message || 'Could not log in.' });
    }
    return;
  }

  if (req.method === 'GET' && req.url === '/api/auth/session') {
    const token = getTokenFromRequest(req);
    if (!token) {
      json(res, 401, { error: 'Missing auth token.' });
      return;
    }

    const db = readDb();
    const session = db.sessions.find((entry) => entry.token === token);
    const user = session
      ? db.users.find((entry) => entry.id === session.userId)
      : null;

    if (!session || !user) {
      json(res, 401, { error: 'Session expired. Please log in again.' });
      return;
    }

    json(res, 200, { user: createUserPayload(user) });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/auth/profile') {
    const token = getTokenFromRequest(req);
    if (!token) {
      json(res, 401, { error: 'Missing auth token.' });
      return;
    }

    try {
      const db = readDb();
      const session = db.sessions.find((entry) => entry.token === token);
      const userIndex = session ? db.users.findIndex((entry) => entry.id === session.userId) : -1;

      if (userIndex === -1) {
        json(res, 401, { error: 'Session expired. Please log in again.' });
        return;
      }

      const body = await readBody(req);
      const user = db.users[userIndex];

      const updatedUser = {
        ...user,
        firstName: body.firstName !== undefined ? String(body.firstName).trim() : user.firstName,
        lastName: body.lastName !== undefined ? String(body.lastName).trim() : user.lastName,
        age: body.age !== undefined ? parseInt(body.age, 10) || null : user.age,
        gender: body.gender !== undefined ? String(body.gender).trim() : user.gender,
        phoneNumber: body.phoneNumber !== undefined ? String(body.phoneNumber).trim() : user.phoneNumber,
        profilePicture: body.profilePicture !== undefined ? String(body.profilePicture) : user.profilePicture
      };

      db.users[userIndex] = updatedUser;
      
      // Update member info in houses
      db.houses.forEach((house) => {
        const memberIndex = (house.members || []).findIndex(m => m.userId === user.id);
        if (memberIndex !== -1) {
          house.members[memberIndex] = {
            ...house.members[memberIndex],
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            profilePicture: updatedUser.profilePicture
          };
        }
      });

      writeDb(db);
      json(res, 200, { user: createUserPayload(updatedUser) });
    } catch (error) {
      json(res, 400, { error: error.message || 'Could not update profile.' });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/auth/logout') {
    const token = getTokenFromRequest(req);
    if (!token) {
      json(res, 200, { ok: true });
      return;
    }

    const db = readDb();
    db.sessions = db.sessions.filter((entry) => entry.token !== token);
    writeDb(db);
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/houses') {
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houses = db.houses
      .filter((house) => (house.members || []).some((member) => member.userId === user.id))
      .sort((a, b) => new Date(b.lastActiveAt || b.createdAt) - new Date(a.lastActiveAt || a.createdAt))
      .map((house) => createHousePayload(house, user.id));

    json(res, 200, { houses });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/houses') {
    try {
      const db = readDb();
      const user = getUserFromRequest(req, db);

      if (!user) {
        json(res, 401, { error: 'You need to log in first.' });
        return;
      }

      const body = await readBody(req);
      const name = String(body.name || '').trim();

      if (name.length < 3) {
        json(res, 400, { error: 'House name must be at least 3 characters long.' });
        return;
      }

      let code = createInviteCode();
      while (db.houses.some((house) => house.code === code)) {
        code = createInviteCode();
      }

      const timestamp = new Date().toISOString();
      const house = {
        id: `house_${crypto.randomUUID().slice(0, 8)}`,
        name,
        code,
        adminId: user.id,
        createdAt: timestamp,
        lastActiveAt: timestamp,
        events: [],
        capsules: [],
        vault: {
          folders: [],
          items: []
        },
        messages: [],
        media: {
          spotify: createEmptySpotifyState(),
          youtube: createEmptyYouTubeState()
        },
        games: {
          pictionary: createEmptyPictionaryState(),
          uno: createEmptyUnoState()
        },
        call: createEmptyCallState(),
        notebook: createEmptyNotebookState(),
        showroom: {
          snaps: []
        },
        bannedUserIds: [],
        members: [
          {
            userId: user.id,
            username: user.username,
            email: user.email,
            role: 'admin',
            joinedAt: timestamp,
            lastSeenAt: timestamp
          }
        ]
      };

      db.houses.push(house);
      writeDb(db);

      json(res, 201, { house: createHousePayload(house, user.id) });
    } catch (error) {
      json(res, 400, { error: error.message || 'Could not create house.' });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/houses/join') {
    try {
      const db = readDb();
      const user = getUserFromRequest(req, db);

      if (!user) {
        json(res, 401, { error: 'You need to log in first.' });
        return;
      }

      const body = await readBody(req);
      const code = String(body.code || '').trim().toUpperCase();

      if (!code) {
        json(res, 400, { error: 'Enter a valid invite code.' });
        return;
      }

      const houseIndex = db.houses.findIndex((house) => house.code === code);
      if (houseIndex === -1) {
        json(res, 404, { error: 'House not found. Check the invite code and try again.' });
        return;
      }

      const house = db.houses[houseIndex];
      if ((house.bannedUserIds || []).includes(user.id)) {
        json(res, 403, { error: 'You have been removed from this house.' });
        return;
      }

      const existingMember = (house.members || []).find((member) => member.userId === user.id);
      const timestamp = new Date().toISOString();

      const updatedHouse = existingMember
        ? touchHouseMembership(house, user)
        : {
            ...house,
            lastActiveAt: timestamp,
            members: [
              ...(house.members || []),
              {
                userId: user.id,
                username: user.username,
                email: user.email,
                role: 'member',
                joinedAt: timestamp,
                lastSeenAt: timestamp
              }
            ]
          };

      db.houses[houseIndex] = updatedHouse;
      writeDb(db);

      json(res, 200, { house: createHousePayload(updatedHouse, user.id) });
    } catch (error) {
      json(res, 400, { error: error.message || 'Could not join house.' });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/houses/select') {
    try {
      const db = readDb();
      const user = getUserFromRequest(req, db);

      if (!user) {
        json(res, 401, { error: 'You need to log in first.' });
        return;
      }

      const body = await readBody(req);
      const houseId = String(body.houseId || '').trim();
      const houseIndex = db.houses.findIndex((house) => house.id === houseId);

      if (houseIndex === -1) {
        json(res, 404, { error: 'House not found.' });
        return;
      }

      const house = db.houses[houseIndex];
      if (!(house.members || []).some((member) => member.userId === user.id)) {
        json(res, 403, { error: 'You are not a member of this house.' });
        return;
      }

      const updatedHouse = touchHouseMembership(house, user);
      db.houses[houseIndex] = updatedHouse;
      writeDb(db);

      json(res, 200, { house: createHousePayload(updatedHouse, user.id) });
    } catch (error) {
      json(res, 400, { error: error.message || 'Could not reopen house.' });
    }
    return;
  }

  const membersMatch = req.url.match(/^\/api\/houses\/([^/]+)\/members(?:\?(.*))?$/);
  if (membersMatch && req.method === 'GET') {
    const [, houseId, queryString = ''] = membersMatch;
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const house = db.houses.find((entry) => entry.id === houseId);
    if (!house) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    if (!(house.members || []).some((member) => member.userId === user.id)) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    const params = new URLSearchParams(queryString);
    json(res, 200, createHouseMembersPayload(house, user.id, params.get('room') || ''));
    return;
  }

  const memberKickMatch = req.url.match(/^\/api\/houses\/([^/]+)\/members\/([^/]+)\/kick$/);
  if (memberKickMatch && req.method === 'POST') {
    const [, houseId, targetUserId] = memberKickMatch;
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((entry) => entry.id === houseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    const requester = (house.members || []).find((member) => member.userId === user.id);
    const target = (house.members || []).find((member) => member.userId === targetUserId);

    if (!requester) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    if (requester.role !== 'admin') {
      json(res, 403, { error: 'Only admins can remove members.' });
      return;
    }

    if (!target) {
      json(res, 404, { error: 'Member not found.' });
      return;
    }

    if (target.userId === user.id) {
      json(res, 400, { error: 'You cannot remove yourself.' });
      return;
    }

    if (target.userId === house.adminId) {
      json(res, 403, { error: 'The original admin cannot be removed.' });
      return;
    }

    const updatedHouse = {
      ...house,
      lastActiveAt: new Date().toISOString(),
      bannedUserIds: Array.from(new Set([...(house.bannedUserIds || []), target.userId])),
      members: (house.members || []).filter((member) => member.userId !== target.userId)
    };

    db.houses[houseIndex] = updatedHouse;
    writeDb(db);
    io.to(`house:${houseId}`).emit('house:members-updated', { houseId });
    const targetSocketIds = userSocketIds.get(target.userId) || new Set();
    targetSocketIds.forEach((socketId) => {
      io.to(socketId).emit('house:kicked', { houseId });
    });

    json(res, 200, {
      house: createHousePayload(updatedHouse, user.id),
      members: createHouseMembersPayload(updatedHouse, user.id)
    });
    return;
  }

  const houseLeaveMatch = req.url.match(/^\/api\/houses\/([^/]+)\/leave$/);
  if (houseLeaveMatch && req.method === 'POST') {
    const [, houseId] = houseLeaveMatch;
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((entry) => entry.id === houseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    const isMember = (house.members || []).some((member) => member.userId === user.id);

    if (!isMember) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    if (house.adminId === user.id) {
      // Admin is leaving -> Delete the house permanently
      db.houses.splice(houseIndex, 1);
      writeDb(db);
      
      io.to(`house:${houseId}`).emit('house:deleted', { houseId });
      
      // Also notify the admin themselves in case they are connected
      const adminSocketIds = userSocketIds.get(user.id) || new Set();
      adminSocketIds.forEach((socketId) => {
        io.to(socketId).emit('house:deleted', { houseId });
      });

      json(res, 200, { success: true, deleted: true });
      return;
    }

    // Normal member is leaving
    const updatedHouse = {
      ...house,
      lastActiveAt: new Date().toISOString(),
      members: (house.members || []).filter((member) => member.userId !== user.id)
    };

    db.houses[houseIndex] = updatedHouse;
    writeDb(db);
    io.to(`house:${houseId}`).emit('house:members-updated', { houseId });
    
    // Notify the user who just left
    const leaverSocketIds = userSocketIds.get(user.id) || new Set();
    leaverSocketIds.forEach((socketId) => {
      io.to(socketId).emit('house:kicked', { houseId }); // reuse kicked event to clear their frontend state
    });

    json(res, 200, { success: true, deleted: false });
    return;
  }

  const houseRenameMatch = req.url.match(/^\/api\/houses\/([^/]+)\/rename$/);
  if (houseRenameMatch && req.method === 'POST') {
    const [, houseId] = houseRenameMatch;
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((entry) => entry.id === houseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];

    if (house.adminId !== user.id) {
      json(res, 403, { error: 'Only the admin can rename the house.' });
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { name } = JSON.parse(body);
        if (!name || typeof name !== 'string' || name.trim() === '') {
          json(res, 400, { error: 'Invalid house name.' });
          return;
        }

        const updatedHouse = {
          ...house,
          name: name.trim(),
          lastActiveAt: new Date().toISOString()
        };

        db.houses[houseIndex] = updatedHouse;
        writeDb(db);
        io.to(`house:${houseId}`).emit('house:members-updated', { houseId });

        json(res, 200, {
          house: createHousePayload(updatedHouse, user.id)
        });
      } catch {
        json(res, 400, { error: 'Invalid payload.' });
      }
    });
    return;
  }

  const memberAdminMatch = req.url.match(/^\/api\/houses\/([^/]+)\/members\/([^/]+)\/admin$/);
  if (memberAdminMatch && req.method === 'POST') {
    const [, houseId, targetUserId] = memberAdminMatch;
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((entry) => entry.id === houseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    if (house.adminId !== user.id) {
      json(res, 403, { error: 'Only the original admin can make another member an admin.' });
      return;
    }

    const target = (house.members || []).find((member) => member.userId === targetUserId);
    if (!target) {
      json(res, 404, { error: 'Member not found.' });
      return;
    }

    const updatedHouse = {
      ...house,
      lastActiveAt: new Date().toISOString(),
      members: (house.members || []).map((member) =>
        member.userId === targetUserId ? { ...member, role: 'admin' } : member
      )
    };

    db.houses[houseIndex] = updatedHouse;
    writeDb(db);
    io.to(`house:${houseId}`).emit('house:members-updated', { houseId });

    json(res, 200, {
      house: createHousePayload(updatedHouse, user.id),
      members: createHouseMembersPayload(updatedHouse, user.id)
    });
    return;
  }

  const locationHouseId = parseHouseRoute(req.url, 'location');
  if (req.method === 'POST' && locationHouseId) {
    try {
      const db = readDb();
      const user = getUserFromRequest(req, db);

      if (!user) {
        json(res, 401, { error: 'You need to log in first.' });
        return;
      }

      const houseIndex = db.houses.findIndex((house) => house.id === locationHouseId);
      if (houseIndex === -1) {
        json(res, 404, { error: 'House not found.' });
        return;
      }

      const house = db.houses[houseIndex];
      if (!(house.members || []).some((member) => member.userId === user.id)) {
        json(res, 403, { error: 'You are not a member of this house.' });
        return;
      }

      const body = await readBody(req);
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        json(res, 400, { error: 'Valid latitude and longitude are required.' });
        return;
      }

      const timestamp = new Date().toISOString();
      const updatedHouse = {
        ...house,
        lastActiveAt: timestamp,
        members: house.members.map((member) =>
          member.userId === user.id
            ? {
                ...member,
                lastSeenAt: timestamp,
                location: {
                  latitude,
                  longitude,
                  updatedAt: timestamp
                }
              }
            : member
        )
      };

      db.houses[houseIndex] = updatedHouse;
      writeDb(db);
      io.to(`house:${locationHouseId}`).emit('house:members-updated', { houseId: locationHouseId });
      json(res, 200, { house: createHousePayload(updatedHouse, user.id) });
    } catch (error) {
      json(res, 400, { error: error.message || 'Could not update location.' });
    }
    return;
  }

  const mapHouseId = parseHouseRoute(req.url, 'map');
  if (req.method === 'GET' && mapHouseId) {
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const house = db.houses.find((entry) => entry.id === mapHouseId);
    if (!house) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    if (!(house.members || []).some((member) => member.userId === user.id)) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    json(res, 200, createMapPayload(house));
    return;
  }

  const eventsHouseId = parseHouseRoute(req.url, 'events');
  if (eventsHouseId) {
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((house) => house.id === eventsHouseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    if (!(house.members || []).some((member) => member.userId === user.id)) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    if (req.method === 'GET') {
      const events = [...(house.events || [])]
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
        .map(createEventPayload);
      json(res, 200, { events });
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        const title = String(body.title || '').trim();
        const message = String(body.message || '').trim();
        const date = String(body.date || '').trim();

        if (!title || !message || !date) {
          json(res, 400, { error: 'Title, message, and date are required.' });
          return;
        }

        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date)) {
          json(res, 400, { error: 'Event date is invalid.' });
          return;
        }

        const event = {
          id: `event_${crypto.randomUUID().slice(0, 8)}`,
          title,
          message,
          date,
          createdAt: new Date().toISOString(),
          emailNotifiedAt: null,
          createdBy: {
            userId: user.id,
            username: user.username
          }
        };

        const updatedHouse = {
          ...house,
          lastActiveAt: new Date().toISOString(),
          events: [...(house.events || []), event]
        };

        db.houses[houseIndex] = updatedHouse;
        writeDb(db);
        io.to(`house:${eventsHouseId}`).emit('house:calendar-updated', { houseId: eventsHouseId });
        json(res, 201, { event: createEventPayload(event) });
      } catch (error) {
        json(res, 400, { error: error.message || 'Could not create event.' });
      }
      return;
    }
  }

  const eventDeleteMatch = req.url.match(/^\/api\/houses\/([^/]+)\/events\/([^/]+)$/);
  if (eventDeleteMatch && req.method === 'DELETE') {
    const [, houseId, eventId] = eventDeleteMatch;
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((house) => house.id === houseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    if (!(house.members || []).some((member) => member.userId === user.id)) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    const nextEvents = (house.events || []).filter((event) => event.id !== eventId);
    if (nextEvents.length === (house.events || []).length) {
      json(res, 404, { error: 'Event not found.' });
      return;
    }

    db.houses[houseIndex] = {
      ...house,
      lastActiveAt: new Date().toISOString(),
      events: nextEvents
    };
    writeDb(db);
    io.to(`house:${houseId}`).emit('house:calendar-updated', { houseId });
    json(res, 200, { ok: true, eventId });
    return;
  }

  const capsulesHouseId = parseHouseRoute(req.url, 'capsules');
  if (capsulesHouseId) {
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((house) => house.id === capsulesHouseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    if (!(house.members || []).some((member) => member.userId === user.id)) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    if (req.method === 'GET') {
      const capsules = [...(house.capsules || [])]
        .sort((a, b) => String(a.unlockAt || '').localeCompare(String(b.unlockAt || '')))
        .map(createCapsulePayload);
      json(res, 200, { capsules });
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        const title = String(body.title || '').trim();
        const message = String(body.message || '').trim();
        const unlockAt = String(body.unlockAt || '').trim();
        const rawAssets = Array.isArray(body.assets) ? body.assets : [];

        if (!title || !message || !unlockAt) {
          json(res, 400, { error: 'Capsule title, message, and unlock time are required.' });
          return;
        }

        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(unlockAt)) {
          json(res, 400, { error: 'Unlock time is invalid.' });
          return;
        }

        const assets = rawAssets
          .filter((asset) => asset && asset.name && asset.mimeType && asset.dataUrl)
          .map((asset) => ({
            id: `asset_${crypto.randomUUID().slice(0, 8)}`,
            kind: String(asset.kind || 'file'),
            name: String(asset.name),
            mimeType: String(asset.mimeType),
            dataUrl: String(asset.dataUrl)
          }));

        const capsule = {
          id: `capsule_${crypto.randomUUID().slice(0, 8)}`,
          title,
          message,
          unlockAt,
          createdAt: new Date().toISOString(),
          emailNotifiedAt: null,
          createdBy: {
            userId: user.id,
            username: user.username
          },
          assets
        };

        const updatedHouse = {
          ...house,
          lastActiveAt: new Date().toISOString(),
          capsules: [...(house.capsules || []), capsule]
        };

        db.houses[houseIndex] = updatedHouse;
        writeDb(db);
        io.to(`house:${capsulesHouseId}`).emit('house:capsules-updated', { houseId: capsulesHouseId });
        json(res, 201, { capsule: createCapsulePayload(capsule) });
      } catch (error) {
        json(res, 400, { error: error.message || 'Could not create capsule.' });
      }
      return;
    }
  }

  const capsuleDeleteMatch = req.url.match(/^\/api\/houses\/([^/]+)\/capsules\/([^/]+)$/);
  if (capsuleDeleteMatch && req.method === 'DELETE') {
    const [, houseId, capsuleId] = capsuleDeleteMatch;
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((house) => house.id === houseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    if (!(house.members || []).some((member) => member.userId === user.id)) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    const nextCapsules = (house.capsules || []).filter((capsule) => capsule.id !== capsuleId);
    if (nextCapsules.length === (house.capsules || []).length) {
      json(res, 404, { error: 'Capsule not found.' });
      return;
    }

    db.houses[houseIndex] = {
      ...house,
      lastActiveAt: new Date().toISOString(),
      capsules: nextCapsules
    };
    writeDb(db);
    io.to(`house:${houseId}`).emit('house:capsules-updated', { houseId });
    json(res, 200, { ok: true, capsuleId });
    return;
  }

  const vaultHouseId = parseHouseRoute(req.url, 'vault');
  if (req.method === 'GET' && vaultHouseId) {
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const house = db.houses.find((entry) => entry.id === vaultHouseId);
    if (!house) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    if (!(house.members || []).some((member) => member.userId === user.id)) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    json(res, 200, {
      folders: (house.vault?.folders || []).map(createVaultFolderPayload),
      items: (house.vault?.items || []).map(createVaultItemPayload)
    });
    return;
  }

  const vaultFoldersHouseId = parseHouseRoute(req.url, 'vault/folders');
  if (req.method === 'POST' && vaultFoldersHouseId) {
    try {
      const db = readDb();
      const user = getUserFromRequest(req, db);

      if (!user) {
        json(res, 401, { error: 'You need to log in first.' });
        return;
      }

      const houseIndex = db.houses.findIndex((entry) => entry.id === vaultFoldersHouseId);
      if (houseIndex === -1) {
        json(res, 404, { error: 'House not found.' });
        return;
      }

      const house = db.houses[houseIndex];
      if (!(house.members || []).some((member) => member.userId === user.id)) {
        json(res, 403, { error: 'You are not a member of this house.' });
        return;
      }

      const body = await readBody(req);
      const name = String(body.name || '').trim();
      const parentId = body.parentId ? String(body.parentId) : null;

      if (!name) {
        json(res, 400, { error: 'Folder name is required.' });
        return;
      }

      const folder = {
        id: `folder_${crypto.randomUUID().slice(0, 8)}`,
        name,
        parentId,
        createdAt: new Date().toISOString(),
        createdBy: {
          userId: user.id,
          username: user.username
        }
      };

      const updatedHouse = {
        ...house,
        lastActiveAt: new Date().toISOString(),
        vault: {
          folders: [...(house.vault?.folders || []), folder],
          items: [...(house.vault?.items || [])]
        }
      };

      db.houses[houseIndex] = updatedHouse;
      writeDb(db);
      json(res, 201, createVaultFolderPayload(folder));
    } catch (error) {
      json(res, 400, { error: error.message || 'Could not create folder.' });
    }
    return;
  }

  const vaultFolderDeleteMatch = req.url.match(/^\/api\/houses\/([^/]+)\/vault\/folders\/([^/]+)$/);
  if (vaultFolderDeleteMatch && req.method === 'DELETE') {
    const [, houseId, folderId] = vaultFolderDeleteMatch;

    try {
      const db = readDb();
      const user = getUserFromRequest(req, db);

      if (!user) {
        json(res, 401, { error: 'You need to log in first.' });
        return;
      }

      const houseIndex = db.houses.findIndex((entry) => entry.id === houseId);
      if (houseIndex === -1) {
        json(res, 404, { error: 'House not found.' });
        return;
      }

      const house = db.houses[houseIndex];
      if (!(house.members || []).some((member) => member.userId === user.id)) {
        json(res, 403, { error: 'You are not a member of this house.' });
        return;
      }

      const folderExists = (house.vault?.folders || []).some((folder) => folder.id === folderId);
      if (!folderExists) {
        json(res, 404, { error: 'Folder not found.' });
        return;
      }

      const nextVault = deleteVaultFolderTree(house.vault || { folders: [], items: [] }, folderId);
      db.houses[houseIndex] = {
        ...house,
        lastActiveAt: new Date().toISOString(),
        vault: nextVault
      };
      writeDb(db);
      json(res, 200, { ok: true, folderId });
    } catch (error) {
      json(res, 400, { error: error.message || 'Could not delete folder.' });
    }
    return;
  }

  const vaultItemsHouseId = parseHouseRoute(req.url, 'vault/items');
  if (req.method === 'POST' && vaultItemsHouseId) {
    try {
      const db = readDb();
      const user = getUserFromRequest(req, db);

      if (!user) {
        json(res, 401, { error: 'You need to log in first.' });
        return;
      }

      const houseIndex = db.houses.findIndex((entry) => entry.id === vaultItemsHouseId);
      if (houseIndex === -1) {
        json(res, 404, { error: 'House not found.' });
        return;
      }

      const house = db.houses[houseIndex];
      if (!(house.members || []).some((member) => member.userId === user.id)) {
        json(res, 403, { error: 'You are not a member of this house.' });
        return;
      }

      const body = await readBody(req);
      const title = String(body.title || '').trim();
      const message = String(body.message || '').trim();
      const folderId = body.folderId ? String(body.folderId) : null;
      const assets = normalizeAssets(body.assets);

      if (!title) {
        json(res, 400, { error: 'Item title is required.' });
        return;
      }

      const item = {
        id: `vault_${crypto.randomUUID().slice(0, 8)}`,
        folderId,
        title,
        message,
        createdAt: new Date().toISOString(),
        createdBy: {
          userId: user.id,
          username: user.username
        },
        assets
      };

      const updatedHouse = {
        ...house,
        lastActiveAt: new Date().toISOString(),
        vault: {
          folders: [...(house.vault?.folders || [])],
          items: [item, ...(house.vault?.items || [])]
        }
      };

      db.houses[houseIndex] = updatedHouse;
      writeDb(db);
      json(res, 201, createVaultItemPayload(item));
    } catch (error) {
      json(res, 400, { error: error.message || 'Could not save vault item.' });
    }
    return;
  }

  const vaultItemDeleteMatch = req.url.match(/^\/api\/houses\/([^/]+)\/vault\/items\/([^/]+)$/);
  if (vaultItemDeleteMatch && req.method === 'DELETE') {
    const [, houseId, itemId] = vaultItemDeleteMatch;

    try {
      const db = readDb();
      const user = getUserFromRequest(req, db);

      if (!user) {
        json(res, 401, { error: 'You need to log in first.' });
        return;
      }

      const houseIndex = db.houses.findIndex((entry) => entry.id === houseId);
      if (houseIndex === -1) {
        json(res, 404, { error: 'House not found.' });
        return;
      }

      const house = db.houses[houseIndex];
      if (!(house.members || []).some((member) => member.userId === user.id)) {
        json(res, 403, { error: 'You are not a member of this house.' });
        return;
      }

      const nextItems = (house.vault?.items || []).filter((item) => item.id !== itemId);
      if (nextItems.length === (house.vault?.items || []).length) {
        json(res, 404, { error: 'Vault item not found.' });
        return;
      }

      db.houses[houseIndex] = {
        ...house,
        lastActiveAt: new Date().toISOString(),
        vault: {
          folders: [...(house.vault?.folders || [])],
          items: nextItems
        }
      };
      writeDb(db);
      json(res, 200, { ok: true, itemId });
    } catch (error) {
      json(res, 400, { error: error.message || 'Could not delete vault item.' });
    }
    return;
  }

  const messagesHouseId = parseHouseRoute(req.url, 'messages');
  if (messagesHouseId) {
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((entry) => entry.id === messagesHouseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    if (!(house.members || []).some((member) => member.userId === user.id)) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    const urlStr = req.url.startsWith('http') ? req.url : `http://localhost${req.url}`;
    const urlParams = new URL(urlStr).searchParams;
    const roomParam = urlParams.get('room') || 'general';

    if (req.method === 'GET') {
      const roomMessages = (house.messages || []).filter(msg => (msg.roomId || 'general') === roomParam);
      json(res, 200, roomMessages.map(createMessagePayload));
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        const text = String(body.text || '').trim();
        const assets = normalizeAssets(body.assets);
        const roomId = String(body.roomId || roomParam || 'general').trim();

        if (!text && assets.length === 0) {
          json(res, 400, { error: 'Message text or an attachment is required.' });
          return;
        }

        const message = {
          id: `msg_${crypto.randomUUID().slice(0, 8)}`,
          text,
          roomId,
          createdAt: new Date().toISOString(),
          sender: {
            userId: user.id,
            username: user.username
          },
          assets
        };

        const updatedHouse = {
          ...house,
          lastActiveAt: new Date().toISOString(),
          messages: [...(house.messages || []), message]
        };

        db.houses[houseIndex] = updatedHouse;
        writeDb(db);
        json(res, 201, createMessagePayload(message));
      } catch (error) {
        json(res, 400, { error: error.message || 'Could not send message.' });
      }
      return;
    }
  }

  const spotifyMediaHouseId = parseHouseRoute(req.url, 'media/spotify');
  if (spotifyMediaHouseId) {
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((entry) => entry.id === spotifyMediaHouseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    const membership = (house.members || []).find((member) => member.userId === user.id);
    if (!membership) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    if (req.method === 'GET') {
      json(res, 200, { media: createMediaStatePayload(house.media?.spotify || createEmptySpotifyState()) });
      return;
    }

    if (req.method === 'POST') {
      if (membership.role !== 'admin') {
        json(res, 403, { error: 'Only the house admin can control Spotify playback.' });
        return;
      }

      try {
        const body = await readBody(req);
        const currentSpotifyState = {
          ...createEmptySpotifyState(),
          ...(house.media?.spotify || {})
        };
        const action = String(body.action || 'play-now');
        const queuedEntry = {
          sourceUrl: String(body.sourceUrl || ''),
          mediaId: String(body.mediaId || ''),
          title: String(body.title || ''),
          queuedAt: new Date().toISOString(),
          queuedBy: {
            userId: user.id,
            username: user.username
          }
        };

        const nextQueue = [...(Array.isArray(currentSpotifyState.queue) ? currentSpotifyState.queue : [])];
        let nextState = {
          ...currentSpotifyState,
          updatedAt: new Date().toISOString(),
          updatedBy: {
            userId: user.id,
            username: user.username
          }
        };

        if (action === 'queue') {
          if (!queuedEntry.mediaId) {
            json(res, 400, { error: 'A Spotify item is required to add to the queue.' });
            return;
          }

          nextState = {
            ...nextState,
            queue: [...nextQueue, queuedEntry]
          };
        } else {
          nextState = {
            sourceUrl: String(body.sourceUrl || ''),
            mediaId: String(body.mediaId || ''),
            title: String(body.title || ''),
            isPlaying: Boolean(body.isPlaying),
            positionMs: Number(body.positionMs || 0),
            durationMs: Number(body.durationMs || 0),
            queue: nextQueue.filter((entry) => entry.mediaId !== String(body.mediaId || '')),
            updatedAt: new Date().toISOString(),
            updatedBy: {
              userId: user.id,
              username: user.username
            }
          };
        }

        const updatedHouse = {
          ...house,
          lastActiveAt: new Date().toISOString(),
          media: {
            spotify: nextState,
            youtube: house.media?.youtube || createEmptyYouTubeState()
          }
        };

        db.houses[houseIndex] = updatedHouse;
        writeDb(db);
        json(res, 200, { media: createMediaStatePayload(nextState) });
      } catch (error) {
        json(res, 400, { error: error.message || 'Could not update Spotify state.' });
      }
      return;
    }
  }

  const youtubeMediaHouseId = parseHouseRoute(req.url, 'media/youtube');
  if (youtubeMediaHouseId) {
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((entry) => entry.id === youtubeMediaHouseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    const membership = (house.members || []).find((member) => member.userId === user.id);
    if (!membership) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    if (req.method === 'GET') {
      json(res, 200, { media: createMediaStatePayload(house.media?.youtube || createEmptyYouTubeState()) });
      return;
    }

    if (req.method === 'POST') {
      if (membership.role !== 'admin') {
        json(res, 403, { error: 'Only the house admin can control YouTube playback.' });
        return;
      }

      try {
        const body = await readBody(req);
        const nextState = {
          sourceUrl: String(body.sourceUrl || ''),
          mediaId: String(body.mediaId || ''),
          title: String(body.title || ''),
          isPlaying: Boolean(body.isPlaying),
          positionMs: Number(body.positionMs || 0),
          durationMs: Number(body.durationMs || 0),
          updatedAt: new Date().toISOString(),
          updatedBy: {
            userId: user.id,
            username: user.username
          }
        };

        const updatedHouse = {
          ...house,
          lastActiveAt: new Date().toISOString(),
          media: {
            spotify: house.media?.spotify || createEmptySpotifyState(),
            youtube: nextState
          }
        };

        db.houses[houseIndex] = updatedHouse;
        writeDb(db);
        json(res, 200, { media: createMediaStatePayload(nextState) });
      } catch (error) {
        json(res, 400, { error: error.message || 'Could not update YouTube state.' });
      }
      return;
    }
  }

  const pictionaryHouseId = parseHouseRoute(req.url, 'games/pictionary');
  if (pictionaryHouseId) {
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((entry) => entry.id === pictionaryHouseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    const membership = (house.members || []).find((member) => member.userId === user.id);
    if (!membership) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    if (req.method === 'GET') {
      json(res, 200, {
        game: createPictionaryPayload(house.games?.pictionary || createEmptyPictionaryState(), house, user.id)
      });
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        const action = String(body.action || '').trim();
        const currentState = ensurePictionaryState(house.games?.pictionary);
        const now = new Date().toISOString();
        let nextGameState = currentState;

        if (action === 'start-round') {
          if (membership.role !== 'admin' && currentState.drawerUserId !== user.id) {
            json(res, 403, { error: 'Only the admin or current drawer can start the next round.' });
            return;
          }

          nextGameState = createPictionaryRoundState(currentState, house, user);
        } else if (action === 'add-stroke') {
          if (currentState.drawerUserId !== user.id) {
            json(res, 403, { error: 'Only the current drawer can draw.' });
            return;
          }

          const rawPoints = Array.isArray(body.points) ? body.points : [];
          const points = rawPoints
            .map((point) => ({
              x: Number(point?.x),
              y: Number(point?.y)
            }))
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

          if (points.length < 2) {
            json(res, 400, { error: 'A stroke needs at least two points.' });
            return;
          }

          const stroke = {
            id: `stroke_${crypto.randomUUID().slice(0, 8)}`,
            color: String(body.color || '#111111'),
            width: Math.max(2, Math.min(24, Number(body.width || 4))),
            points
          };

          nextGameState = {
            ...currentState,
            strokes: [...currentState.strokes, stroke],
            updatedAt: now,
            updatedBy: {
              userId: user.id,
              username: user.username
            }
          };
        } else if (action === 'clear-canvas') {
          if (currentState.drawerUserId !== user.id && membership.role !== 'admin') {
            json(res, 403, { error: 'Only the current drawer can clear the canvas.' });
            return;
          }

          nextGameState = {
            ...currentState,
            strokes: [],
            updatedAt: now,
            updatedBy: {
              userId: user.id,
              username: user.username
            }
          };
        } else if (action === 'submit-guess') {
          if (currentState.status !== 'playing' || !currentState.word) {
            json(res, 400, { error: 'There is no active round right now.' });
            return;
          }

          if (currentState.drawerUserId === user.id) {
            json(res, 400, { error: 'The drawer cannot submit guesses.' });
            return;
          }

          const text = String(body.text || '').trim();
          if (!text) {
            json(res, 400, { error: 'Guess text is required.' });
            return;
          }

          const normalizedGuess = text.toLowerCase();
          const normalizedWord = String(currentState.word || '').trim().toLowerCase();
          const isCorrect = normalizedGuess === normalizedWord;

          const guess = {
            id: `guess_${crypto.randomUUID().slice(0, 8)}`,
            text,
            createdAt: now,
            sender: {
              userId: user.id,
              username: user.username
            },
            isCorrect
          };

          nextGameState = {
            ...currentState,
            status: isCorrect ? 'round-complete' : currentState.status,
            guesses: [...currentState.guesses, guess],
            scores: isCorrect
              ? {
                  ...currentState.scores,
                  [user.id]: Number(currentState.scores?.[user.id] || 0) + 1,
                  [currentState.drawerUserId]: Number(currentState.scores?.[currentState.drawerUserId] || 0) + 1
                }
              : currentState.scores,
            winnerUserId: isCorrect ? user.id : currentState.winnerUserId,
            winnerUsername: isCorrect ? user.username : currentState.winnerUsername,
            updatedAt: now,
            updatedBy: {
              userId: user.id,
              username: user.username
            }
          };
        } else {
          json(res, 400, { error: 'Unknown Pictionary action.' });
          return;
        }

        const updatedHouse = {
          ...house,
          lastActiveAt: now,
          games: {
            ...(house.games || {}),
            pictionary: nextGameState
          }
        };

        db.houses[houseIndex] = updatedHouse;
        writeDb(db);
        json(res, 200, {
          game: createPictionaryPayload(nextGameState, updatedHouse, user.id)
        });
      } catch (error) {
        json(res, 400, { error: error.message || 'Could not update the Pictionary game.' });
      }
      return;
    }
  }

  const unoHouseId = parseHouseRoute(req.url, 'games/uno');
  if (unoHouseId) {
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((entry) => entry.id === unoHouseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    const membership = (house.members || []).find((member) => member.userId === user.id);
    if (!membership) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    if (req.method === 'GET') {
      json(res, 200, {
        game: createUnoPayload(house.games?.uno || createEmptyUnoState(), house, user.id)
      });
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        const action = String(body.action || '').trim();
        const currentState = ensureUnoState(house.games?.uno);
        const now = new Date().toISOString();
        let nextGameState = currentState;

        if (action === 'start-game' || action === 'reset-game') {
          if (membership.role !== 'admin') {
            json(res, 403, { error: 'Only the house admin can start or reset UNO.' });
            return;
          }

          nextGameState = createUnoGameState(house, user);
        } else {
          if (currentState.status !== 'playing') {
            json(res, 400, { error: 'Start a UNO match first.' });
            return;
          }

          if (currentState.currentPlayerId !== user.id) {
            json(res, 403, { error: 'It is not your turn.' });
            return;
          }

          const currentIndex = getUnoPlayerIndex(currentState.players, user.id);
          if (currentIndex === -1) {
            json(res, 403, { error: 'You are not in this UNO match.' });
            return;
          }

          if (action === 'draw-card') {
            if (currentState.drawnThisTurnBy === user.id) {
              json(res, 400, { error: 'You already drew this turn. Play a valid card or pass.' });
              return;
            }

            const drawResult = drawUnoCards(currentState, 1);
            if (drawResult.drawn.length === 0) {
              json(res, 400, { error: 'There are no cards left to draw.' });
              return;
            }

            nextGameState = {
              ...currentState,
              deck: drawResult.deck,
              discardPile: drawResult.discardPile,
              hands: {
                ...currentState.hands,
                [user.id]: [...(currentState.hands[user.id] || []), ...drawResult.drawn]
              },
              drawnThisTurnBy: user.id,
              message: `${user.username} drew a card.`,
              updatedAt: now,
              updatedBy: {
                userId: user.id,
                username: user.username
              }
            };
          } else if (action === 'pass-turn') {
            if (currentState.drawnThisTurnBy !== user.id) {
              json(res, 400, { error: 'Draw a card before passing.' });
              return;
            }

            const nextIndex = getUnoNextIndex(currentState.players, currentIndex, currentState.direction);
            const nextPlayer = currentState.players[nextIndex];
            nextGameState = {
              ...currentState,
              currentPlayerId: nextPlayer?.userId || null,
              drawnThisTurnBy: null,
              message: `${user.username} passed. ${nextPlayer?.username || 'Next player'} is up.`,
              updatedAt: now,
              updatedBy: {
                userId: user.id,
                username: user.username
              }
            };
          } else if (action === 'play-card') {
            const cardId = String(body.cardId || '').trim();
            const chosenColor = String(body.chosenColor || '').trim();
            const hand = currentState.hands[user.id] || [];
            const card = hand.find((entry) => entry.id === cardId);

            if (!card) {
              json(res, 404, { error: 'That card is not in your hand.' });
              return;
            }

            if (!isUnoCardPlayable(card, currentState)) {
              json(res, 400, { error: 'That card cannot be played on the current discard.' });
              return;
            }

            if (card.color === 'wild' && !UNO_COLORS.includes(chosenColor)) {
              json(res, 400, { error: 'Choose a color for the wild card.' });
              return;
            }

            const nextHands = {
              ...currentState.hands,
              [user.id]: hand.filter((entry) => entry.id !== cardId)
            };
            const didWin = nextHands[user.id].length === 0;
            let nextDirection = currentState.direction;
            let stepCount = 1;
            let message = `${user.username} played ${card.color === 'wild' ? card.value : `${card.color} ${card.value}`}.`;
            let nextDeck = currentState.deck;
            let nextDiscardPile = [...currentState.discardPile, card];

            if (card.value === 'reverse') {
              nextDirection = currentState.players.length === 2 ? currentState.direction : currentState.direction * -1;
              stepCount = currentState.players.length === 2 ? 2 : 1;
              message = `${user.username} reversed the turn order.`;
            } else if (card.value === 'skip') {
              stepCount = 2;
              message = `${user.username} skipped the next player.`;
            } else if (card.value === 'draw2' || card.value === 'wild4') {
              const penaltyCount = card.value === 'draw2' ? 2 : 4;
              const targetIndex = getUnoNextIndex(currentState.players, currentIndex, currentState.direction);
              const targetPlayer = currentState.players[targetIndex];
              const drawResult = drawUnoCards(
                {
                  ...currentState,
                  deck: nextDeck,
                  discardPile: nextDiscardPile
                },
                penaltyCount
              );
              nextDeck = drawResult.deck;
              nextDiscardPile = drawResult.discardPile;
              nextHands[targetPlayer.userId] = [...(nextHands[targetPlayer.userId] || []), ...drawResult.drawn];
              stepCount = 2;
              message = `${targetPlayer.username} drew ${drawResult.drawn.length} and lost a turn.`;
            }

            const nextIndex = getUnoNextIndex(currentState.players, currentIndex, nextDirection, stepCount);
            const nextPlayer = currentState.players[nextIndex];

            nextGameState = {
              ...currentState,
              status: didWin ? 'complete' : 'playing',
              hands: nextHands,
              deck: nextDeck,
              discardPile: nextDiscardPile,
              currentColor: card.color === 'wild' ? chosenColor : card.color,
              currentPlayerId: didWin ? null : nextPlayer?.userId || null,
              direction: nextDirection,
              drawnThisTurnBy: null,
              winnerUserId: didWin ? user.id : null,
              winnerUsername: didWin ? user.username : '',
              message: didWin ? `${user.username} wins UNO!` : `${message} ${nextPlayer?.username || 'Next player'} is up.`,
              updatedAt: now,
              updatedBy: {
                userId: user.id,
                username: user.username
              }
            };
          } else {
            json(res, 400, { error: 'Unknown UNO action.' });
            return;
          }
        }

        const updatedHouse = {
          ...house,
          lastActiveAt: now,
          games: {
            ...(house.games || {}),
            uno: nextGameState
          }
        };

        db.houses[houseIndex] = updatedHouse;
        writeDb(db);
        json(res, 200, {
          game: createUnoPayload(nextGameState, updatedHouse, user.id)
        });
      } catch (error) {
        json(res, 400, { error: error.message || 'Could not update the UNO game.' });
      }
      return;
    }
  }

  const truthDareHouseId = parseHouseRoute(req.url, 'games/truth_dare');
  if (truthDareHouseId) {
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((entry) => entry.id === truthDareHouseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    const membership = (house.members || []).find((member) => member.userId === user.id);
    if (!membership) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    if (req.method === 'GET') {
      json(res, 200, {
        game: createTruthDarePayload(house.games?.truth_dare || createEmptyTruthDareState())
      });
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        const action = String(body.action || '').trim();
        const currentState = ensureTruthDareState(house.games?.truth_dare);
        const now = new Date().toISOString();
        let nextGameState = currentState;

        const players = (house.members || []).map((m) => ({ userId: m.userId, username: m.username }));

        if (action === 'start-selection') {
          if (players.length < 2) {
            json(res, 400, { error: 'Need at least two members in the house.' });
            return;
          }
          const pair = getTruthDareNextPair(players, currentState.history);
          nextGameState = {
            ...currentState,
            status: 'selecting',
            players,
            selectorId: pair.selectorId,
            performerId: pair.performerId,
            choice: null,
            question: null,
            response: null,
            updatedAt: now,
            updatedBy: { userId: user.id, username: user.username }
          };
        } else if (action === 'end-selection') {
          nextGameState = {
            ...currentState,
            status: 'choosing',
            updatedAt: now,
            updatedBy: { userId: user.id, username: user.username }
          };
        } else if (action === 'choose-type') {
          if (currentState.performerId !== user.id) {
            json(res, 403, { error: 'Only the performer can choose.' });
            return;
          }
          const choice = String(body.choice || '').trim();
          if (choice !== 'truth' && choice !== 'dare') {
            json(res, 400, { error: 'Invalid choice.' });
            return;
          }
          nextGameState = {
            ...currentState,
            status: 'questioning',
            choice,
            updatedAt: now,
            updatedBy: { userId: user.id, username: user.username }
          };
        } else if (action === 'submit-question') {
          if (currentState.selectorId !== user.id) {
            json(res, 403, { error: 'Only the selector can submit a question.' });
            return;
          }
          const question = String(body.question || '').trim();
          if (!question) {
            json(res, 400, { error: 'Question is required.' });
            return;
          }
          nextGameState = {
            ...currentState,
            status: 'answering',
            question,
            updatedAt: now,
            updatedBy: { userId: user.id, username: user.username }
          };
        } else if (action === 'submit-response') {
          if (currentState.performerId !== user.id) {
            json(res, 403, { error: 'Only the performer can submit a response.' });
            return;
          }
          const response = String(body.response || '').trim();
          
          let nextHistory = currentState.history;
          if (currentState.selectorId && currentState.performerId) {
            const hasPair = nextHistory.some(h => h.selectorId === currentState.selectorId && h.performerId === currentState.performerId);
            if (!hasPair) {
              nextHistory = [...nextHistory, { selectorId: currentState.selectorId, performerId: currentState.performerId }];
            }
          }

          nextGameState = {
            ...currentState,
            status: 'round-complete',
            response,
            history: nextHistory,
            updatedAt: now,
            updatedBy: { userId: user.id, username: user.username }
          };
        } else if (action === 'reset-game') {
          if (membership.role !== 'admin') {
            json(res, 403, { error: 'Only the house admin can reset the game.' });
            return;
          }
          nextGameState = createEmptyTruthDareState();
          nextGameState.updatedAt = now;
          nextGameState.updatedBy = { userId: user.id, username: user.username };
        } else {
          json(res, 400, { error: 'Unknown Truth or Dare action.' });
          return;
        }

        const updatedHouse = {
          ...house,
          lastActiveAt: now,
          games: {
            ...(house.games || {}),
            truth_dare: nextGameState
          }
        };

        db.houses[houseIndex] = updatedHouse;
        writeDb(db);
        json(res, 200, {
          game: createTruthDarePayload(nextGameState)
        });
      } catch (error) {
        json(res, 400, { error: error.message || 'Could not update the Truth or Dare game.' });
      }
      return;
    }
  }

  const ludoHouseId = parseHouseRoute(req.url, 'ludo');
  if (ludoHouseId) {
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const house = db.houses.find((entry) => entry.id === ludoHouseId);
    if (!house) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    if (!isMemberOfHouse(house, user.id)) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    if (req.method === 'GET') {
      json(res, 200, { game: house.ludoGame || null });
      return;
    }

    notFound(res);
    return;
  }

  
  const notebookHouseId = parseHouseRoute(req.url, 'notebook');
  if (notebookHouseId) {
    if (req.method === 'GET') {
      const db = readDb();
      const user = getUserFromRequest(req, db);
      if (!user) {
        json(res, 401, { error: 'You need to log in first.' });
        return;
      }

      const house = db.houses.find((entry) => entry.id === notebookHouseId);
      if (!house || !isMemberOfHouse(house, user.id)) {
        json(res, 403, { error: 'You are not a member of this house.' });
        return;
      }

      json(res, 200, { notebook: ensureNotebookState(house.notebook) });
      return;
    }
    notFound(res);
    return;
  }
const callHouseId = parseHouseRoute(req.url, 'call');
  if (callHouseId) {
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((entry) => entry.id === callHouseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    const membership = (house.members || []).find((member) => member.userId === user.id);
    if (!membership) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    const currentCall = createCallPayload(house.call || createEmptyCallState());

    if (req.method === 'GET') {
      json(res, 200, { call: currentCall });
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        const action = String(body.action || '').trim();
        const now = new Date().toISOString();
        let nextCallState = currentCall;

        if (action === 'join') {
          const participant = {
            userId: user.id,
            username: user.username,
            micOn: body.micOn !== false,
            videoOn: body.videoOn !== false,
            joinedAt:
              currentCall.participants.find((entry) => entry.userId === user.id)?.joinedAt || now,
            updatedAt: now
          };

          nextCallState = {
            ...currentCall,
            participants: [
              ...currentCall.participants.filter((entry) => entry.userId !== user.id),
              participant
            ]
          };
        } else if (action === 'leave') {
          nextCallState = {
            participants: currentCall.participants.filter((entry) => entry.userId !== user.id),
            signals: currentCall.signals.filter(
              (signal) => signal.senderUserId !== user.id && signal.targetUserId !== user.id
            )
          };
        } else if (action === 'heartbeat') {
          const existing = currentCall.participants.find((entry) => entry.userId === user.id);
          if (!existing) {
            json(res, 400, { error: 'Join the call before sending updates.' });
            return;
          }

          nextCallState = {
            ...currentCall,
            participants: currentCall.participants.map((entry) =>
              entry.userId === user.id
                ? {
                    ...entry,
                    micOn: body.micOn ?? entry.micOn,
                    videoOn: body.videoOn ?? entry.videoOn,
                    updatedAt: now
                  }
                : entry
            )
          };
        } else if (action === 'signal') {
          const targetUserId = String(body.targetUserId || '').trim();
          const payload = body.payload;
          if (!targetUserId || !payload) {
            json(res, 400, { error: 'A target user and signal payload are required.' });
            return;
          }

          if (!currentCall.participants.some((entry) => entry.userId === user.id)) {
            json(res, 400, { error: 'Join the call before sending signals.' });
            return;
          }

          nextCallState = {
            ...currentCall,
            signals: [
              ...currentCall.signals.filter((signal) => {
                const createdAt = new Date(signal.createdAt || 0).getTime();
                return Number.isFinite(createdAt) && Date.now() - createdAt < 60000;
              }),
              {
                id: `signal_${crypto.randomUUID().slice(0, 8)}`,
                senderUserId: user.id,
                targetUserId,
                payload,
                createdAt: now
              }
            ]
          };
        } else {
          json(res, 400, { error: 'Unknown call action.' });
          return;
        }

        const updatedHouse = {
          ...house,
          lastActiveAt: now,
          call: nextCallState
        };

        db.houses[houseIndex] = updatedHouse;
        writeDb(db);
        json(res, 200, { call: createCallPayload(nextCallState) });
      } catch (error) {
        json(res, 400, { error: error.message || 'Could not update house call state.' });
      }
      return;
    }
  }

  const showroomHouseId = parseHouseRoute(req.url, 'showroom');
  if (showroomHouseId) {
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((entry) => entry.id === showroomHouseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    const membership = (house.members || []).find((member) => member.userId === user.id);
    if (!membership) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    if (req.method === 'GET') {
      json(res, 200, createShowroomPayload(house.showroom || { snaps: [] }, user.id));
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        const imageDataUrl = String(body.imageDataUrl || '');

        if (!imageDataUrl.startsWith('data:image/')) {
          json(res, 400, { error: 'A valid captured image is required.' });
          return;
        }

        const snap = {
          id: `snap_${crypto.randomUUID().slice(0, 8)}`,
          imageDataUrl,
          createdAt: new Date().toISOString(),
          sender: {
            userId: user.id,
            username: user.username
          },
          recipientUserIds: (house.members || [])
            .map((member) => member.userId)
            .filter((userId) => userId !== user.id),
          viewedBy: []
        };

        const updatedHouse = {
          ...house,
          lastActiveAt: new Date().toISOString(),
          showroom: {
            snaps: [snap, ...(house.showroom?.snaps || [])].slice(0, 40)
          }
        };

        db.houses[houseIndex] = updatedHouse;
        writeDb(db);
        io.to(`house:${showroomHouseId}`).emit('showroom:snap-created', {
          snap: createShowroomSnapPayload(snap, user.id),
          senderUserId: user.id
        });
        json(res, 201, { snap: createShowroomSnapPayload(snap, user.id) });
      } catch (error) {
        json(res, 400, { error: error.message || 'Could not send the snap.' });
      }
      return;
    }
  }

  const showroomViewMatch = req.url.match(/^\/api\/houses\/([^/]+)\/showroom\/snaps\/([^/]+)\/view$/);
  if (showroomViewMatch && req.method === 'POST') {
    const [, houseId, snapId] = showroomViewMatch;
    const db = readDb();
    const user = getUserFromRequest(req, db);

    if (!user) {
      json(res, 401, { error: 'You need to log in first.' });
      return;
    }

    const houseIndex = db.houses.findIndex((entry) => entry.id === houseId);
    if (houseIndex === -1) {
      json(res, 404, { error: 'House not found.' });
      return;
    }

    const house = db.houses[houseIndex];
    const membership = (house.members || []).find((member) => member.userId === user.id);
    if (!membership) {
      json(res, 403, { error: 'You are not a member of this house.' });
      return;
    }

    const snapIndex = (house.showroom?.snaps || []).findIndex((snap) => snap.id === snapId);
    if (snapIndex === -1) {
      json(res, 404, { error: 'Snap not found.' });
      return;
    }

    const snap = house.showroom.snaps[snapIndex];
    if (snap.sender?.userId === user.id) {
      json(res, 403, { error: 'Your own snaps are not view-once items for you.' });
      return;
    }

    if (!Array.isArray(snap.recipientUserIds) || !snap.recipientUserIds.includes(user.id)) {
      json(res, 403, { error: 'This snap was not addressed to you.' });
      return;
    }

    if (Array.isArray(snap.viewedBy) && snap.viewedBy.includes(user.id)) {
      json(res, 410, { error: 'This snap has already been viewed.' });
      return;
    }

    const updatedViewedBy = [...(Array.isArray(snap.viewedBy) ? snap.viewedBy : []), user.id];
    const updatedSnap = {
      ...snap,
      viewedBy: updatedViewedBy
    };
    const recipientUserIds = Array.isArray(snap.recipientUserIds) ? snap.recipientUserIds : [];
    const everyoneViewed = recipientUserIds.every((recipientUserId) => updatedViewedBy.includes(recipientUserId));
    const updatedSnaps = [...(house.showroom?.snaps || [])];

    if (everyoneViewed) {
      updatedSnaps.splice(snapIndex, 1);
    } else {
      updatedSnaps[snapIndex] = updatedSnap;
    }

    const updatedHouse = {
      ...house,
      showroom: {
        snaps: updatedSnaps
      }
    };

    db.houses[houseIndex] = updatedHouse;
    writeDb(db);
    io.to(`house:${houseId}`).emit('showroom:snap-viewed', {
      snapId,
      viewerUserId: user.id
    });
    if (everyoneViewed) {
      io.to(`house:${houseId}`).emit('showroom:snap-removed', {
        snapId
      });
    }
    json(res, 200, {
      snap: {
        id: updatedSnap.id,
        createdAt: updatedSnap.createdAt,
        sender: updatedSnap.sender,
        imageDataUrl: updatedSnap.imageDataUrl
      },
      removed: everyoneViewed
    });
    return;
  }

  notFound(res);
});

const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 4_000_000
});

const userSocketIds = new Map();
const callParticipantsByHouse = new Map();
const screenSharesByHouse = new Map();
const footprintsByHouse = new Map();

const trackSocketForUser = (userId, socketId) => {
  const current = userSocketIds.get(userId) || new Set();
  current.add(socketId);
  userSocketIds.set(userId, current);
};

const untrackSocketForUser = (userId, socketId) => {
  const current = userSocketIds.get(userId);
  if (!current) return;
  current.delete(socketId);
  if (current.size === 0) {
    userSocketIds.delete(userId);
  }
};

const getVerifiedSocketUser = (socket) => {
  const token = socket.handshake.auth?.token || '';
  if (!token) {
    return null;
  }

  const db = readDb();
  const session = db.sessions.find((entry) => entry.token === token);
  if (!session) {
    return null;
  }

  const user = db.users.find((entry) => entry.id === session.userId);
  if (!user) {
    return null;
  }

  return { user, db };
};

const isMemberOfHouse = (house, userId) =>
  (house?.members || []).some((member) => member.userId === userId);

const emitCallParticipants = (houseId) => {
  const participants = Array.from(callParticipantsByHouse.get(houseId)?.values() || []).sort(
    (a, b) => new Date(a.joinedAt) - new Date(b.joinedAt)
  );
  io.to(`house:${houseId}`).emit('call:participants', { houseId, participants });
};

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const createEmailShell = ({ title, body, ctaText }) => {
  const { appUrl } = getEmailConfig();
  return `
    <div style="font-family: Inter, Arial, sans-serif; color: #111827; line-height: 1.6;">
      <h1 style="font-size: 22px; margin: 0 0 12px;">${escapeHtml(title)}</h1>
      <div style="font-size: 15px;">${body}</div>
      <p style="margin-top: 24px;">
        <a href="${escapeHtml(appUrl)}" style="background: #ff2da0; color: white; padding: 10px 14px; border-radius: 10px; text-decoration: none; font-weight: 700;">
          ${escapeHtml(ctaText)}
        </a>
      </p>
    </div>
  `;
};

const NOTIFICATION_INTERVAL_MS = 30 * 1000;
const NOTIFICATION_LOOKBACK_MS = Number(process.env.NOTIFICATION_LOOKBACK_MS || 7 * 24 * 60 * 60 * 1000);
let notificationWorkerRunning = false;

const checkDueNotifications = async () => {
  if (notificationWorkerRunning) {
    return;
  }

  notificationWorkerRunning = true;
  let db = readDb();
  let changed = false;
  const now = Date.now();
  const earliestDueTime = now - NOTIFICATION_LOOKBACK_MS;

  try {
    for (const house of db.houses || []) {
      for (const event of house.events || []) {
        const eventTime = new Date(event.date).getTime();
        if (
          !event.emailNotifiedAt &&
          Number.isFinite(eventTime) &&
          eventTime <= now &&
          eventTime >= earliestDueTime
        ) {
          const when = formatNotificationTime(event.date);
          const subject = `HomeCourt event now: ${event.title}`;
          const text = `${event.title} is happening now for ${house.name}.\n\nWhen: ${when}\n\n${event.message || ''}`;
          const html = createEmailShell({
            title: `${event.title} is happening now`,
            body: `
              <p><strong>House:</strong> ${escapeHtml(house.name)}</p>
              <p><strong>When:</strong> ${escapeHtml(when)}</p>
              ${event.message ? `<p>${escapeHtml(event.message)}</p>` : ''}
            `,
            ctaText: 'Open HomeCourt'
          });

          const result = await sendHouseNotificationEmail({ house, subject, text, html });
          if (result.sent) {
            event.emailNotifiedAt = new Date().toISOString();
            changed = true;
          }
        }
      }

      for (const capsule of house.capsules || []) {
        const unlockTime = new Date(capsule.unlockAt).getTime();
        if (
          !capsule.emailNotifiedAt &&
          Number.isFinite(unlockTime) &&
          unlockTime <= now &&
          unlockTime >= earliestDueTime
        ) {
          const when = formatNotificationTime(capsule.unlockAt);
          const subject = `HomeCourt capsule unlocked: ${capsule.title}`;
          const text = `${capsule.title} just unlocked in ${house.name}.\n\nUnlocked: ${when}\n\nOpen HomeCourt to view it.`;
          const html = createEmailShell({
            title: `${capsule.title} just unlocked`,
            body: `
              <p><strong>House:</strong> ${escapeHtml(house.name)}</p>
              <p><strong>Unlocked:</strong> ${escapeHtml(when)}</p>
              <p>Your surprise capsule is ready to open.</p>
            `,
            ctaText: 'Open Capsule'
          });

          const result = await sendHouseNotificationEmail({ house, subject, text, html });
          if (result.sent) {
            capsule.emailNotifiedAt = new Date().toISOString();
            changed = true;
          }
        }
      }
    }

    if (changed) {
      writeDb(db);
    }
  } catch (error) {
    console.error('[notifications] Failed to process due notifications:', error);
  } finally {
    notificationWorkerRunning = false;
  }
};

const startNotificationWorker = () => {
  checkDueNotifications().catch((error) => {
    console.error('[notifications] Initial check failed:', error);
  });
  setInterval(() => {
    checkDueNotifications().catch((error) => {
      console.error('[notifications] Scheduled check failed:', error);
    });
  }, NOTIFICATION_INTERVAL_MS);
};

io.on('connection', (socket) => {
  const verified = getVerifiedSocketUser(socket);
  if (!verified) {
    socket.disconnect(true);
    return;
  }

  const { user } = verified;
  socket.data.userId = user.id;
  socket.data.username = user.username;
  socket.data.joinedHouses = new Set();
  socket.data.joinedCallHouses = new Set();
  socket.data.currentRooms = new Map();
  trackSocketForUser(user.id, socket.id);

  socket.on('house:join', ({ houseId }) => {
    const currentDb = readDb();
    const house = currentDb.houses.find((entry) => entry.id === houseId);
    if (!house || !isMemberOfHouse(house, user.id)) {
      socket.emit('socket:error', { message: 'You are not a member of this house.' });
      return;
    }

    socket.join(`house:${houseId}`);
    socket.data.joinedHouses.add(houseId);
    emitCallParticipants(houseId);
    socket.emit('house:footprints-updated', { houseId, footprints: footprintsByHouse.get(houseId) || [] });
  });

  socket.on('house:leave', ({ houseId }) => {
    socket.leave(`house:${houseId}`);
    socket.data.joinedHouses.delete(houseId);
    socket.data.currentRooms.delete(houseId);
    io.to(`house:${houseId}`).emit('house:presence-updated', { houseId });
  });

  socket.on('room:enter', ({ houseId, roomPath }) => {
    const currentDb = readDb();
    const house = currentDb.houses.find((entry) => entry.id === houseId);
    if (!house || !isMemberOfHouse(house, user.id)) {
      socket.emit('socket:error', { message: 'You are not a member of this house.' });
      return;
    }

    const currentRoom = socket.data.currentRooms.get(houseId);
    if (currentRoom && currentRoom !== roomPath) {
      const houseFootprints = footprintsByHouse.get(houseId) || [];
      const now = Date.now();
      const validFootprints = houseFootprints.filter(f => now - f.timestamp < 3 * 60 * 1000);
      const filtered = validFootprints.filter(f => f.userId !== user.id || f.path !== currentRoom);
      filtered.push({ userId: user.id, username: user.username, path: currentRoom, timestamp: now });
      footprintsByHouse.set(houseId, filtered);
      io.to(`house:${houseId}`).emit('house:footprints-updated', { houseId, footprints: filtered });
    }

    socket.data.currentRooms.set(houseId, String(roomPath || ''));
    io.to(`house:${houseId}`).emit('house:presence-updated', { houseId });
  });

  socket.on('pulse', ({ houseId, userId }) => {
    if (!socket.data.joinedHouses.has(houseId) || userId !== user.id) {
      return;
    }

    socket.to(`house:${houseId}`).emit('pulse', {
      houseId,
      userId,
      username: user.username,
      sentAt: new Date().toISOString()
    });
  });

  socket.on('call:join', ({ houseId, micOn = true, videoOn = true }) => {
    if (!socket.data.joinedHouses.has(houseId)) {
      socket.emit('socket:error', { message: 'Join the house room first.' });
      return;
    }

    const participants = callParticipantsByHouse.get(houseId) || new Map();
    const existing = participants.get(user.id);
    participants.set(user.id, {
      userId: user.id,
      username: user.username,
      micOn,
      videoOn,
      joinedAt: existing?.joinedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    callParticipantsByHouse.set(houseId, participants);
    socket.join(`call:${houseId}`);
    socket.data.joinedCallHouses.add(houseId);
    emitCallParticipants(houseId);
  });

  socket.on('call:leave', ({ houseId }) => {
    const participants = callParticipantsByHouse.get(houseId);
    if (participants) {
      participants.delete(user.id);
      if (participants.size === 0) {
        callParticipantsByHouse.delete(houseId);
      }
    }

    socket.leave(`call:${houseId}`);
    socket.data.joinedCallHouses.delete(houseId);
    emitCallParticipants(houseId);
  });

  socket.on('call:media-state', ({ houseId, micOn, videoOn }) => {
    const participants = callParticipantsByHouse.get(houseId);
    const participant = participants?.get(user.id);
    if (!participant) {
      return;
    }

    participants.set(user.id, {
      ...participant,
      micOn: micOn ?? participant.micOn,
      videoOn: videoOn ?? participant.videoOn,
      updatedAt: new Date().toISOString()
    });
    emitCallParticipants(houseId);
  });

  socket.on('call:signal', ({ houseId, targetUserId, payload }) => {
    if (!socket.data.joinedCallHouses.has(houseId) || !targetUserId || !payload) {
      return;
    }

    const targetSocketIds = userSocketIds.get(targetUserId) || new Set();
    targetSocketIds.forEach((socketId) => {
      io.to(socketId).emit('call:signal', {
        houseId,
        senderUserId: user.id,
        senderUsername: user.username,
        payload
      });
    });
  });

  
  socket.on('notebook:update-page', ({ houseId, pageIndex, strokes, text }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;

    const currentDb = readDb();
    const house = currentDb.houses.find((entry) => entry.id === houseId);
    if (!house || !isMemberOfHouse(house, socket.data.userId)) return;

    if (!house.notebook) house.notebook = createEmptyNotebookState();
    if (!house.notebook.pages[pageIndex]) house.notebook.pages[pageIndex] = { strokes: [], text: '' };
    
    if (strokes !== undefined) house.notebook.pages[pageIndex].strokes = strokes;
    if (text !== undefined) house.notebook.pages[pageIndex].text = text;
    
    house.notebook.updatedAt = new Date().toISOString();
    house.notebook.updatedBy = socket.data.userId;
    
    writeDb(currentDb);
    
    io.to(`house:${houseId}`).emit('notebook:page-updated', {
      houseId,
      pageIndex,
      page: house.notebook.pages[pageIndex]
    });
  });

  
  socket.on('notebook:update-bookmarks', ({ houseId, bookmarks }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;

    const currentDb = readDb();
    const house = currentDb.houses.find((entry) => entry.id === houseId);
    if (!house || !isMemberOfHouse(house, socket.data.userId)) return;

    if (!house.notebook) house.notebook = createEmptyNotebookState();
    house.notebook.bookmarks = bookmarks;
    house.notebook.updatedAt = new Date().toISOString();
    house.notebook.updatedBy = socket.data.userId;
    
    writeDb(currentDb);
    
    io.to(`house:${houseId}`).emit('notebook:bookmarks-updated', { houseId, bookmarks });
  });

  
  socket.on('screen:start', ({ houseId }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;
    const currentDb = readDb();
    const house = currentDb.houses.find(h => h.id === houseId);
    if (!house) return;
    const member = house.members?.find(m => m.userId === user.id);
    if (member?.role !== 'admin') {
      socket.emit('socket:error', { message: 'Only admins can share the screen.' });
      return;
    }
    
    // Override existing share or start new one
    screenSharesByHouse.set(houseId, { adminId: user.id, username: user.username, socketId: socket.id });
    io.to(`house:${houseId}`).emit('screen:active-sharer', { adminId: user.id, username: user.username });
  });

  socket.on('screen:stop', ({ houseId }) => {
    const share = screenSharesByHouse.get(houseId);
    if (share && share.adminId === user.id) {
      screenSharesByHouse.delete(houseId);
      io.to(`house:${houseId}`).emit('screen:active-sharer', null);
    }
  });

  socket.on('screen:join-viewer', ({ houseId }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;
    const share = screenSharesByHouse.get(houseId);
    if (share) {
      io.to(share.socketId).emit('screen:viewer-joined', {
        viewerId: user.id,
        viewerUsername: user.username
      });
      socket.emit('screen:active-sharer', { adminId: share.adminId, username: share.username });
    } else {
      socket.emit('screen:active-sharer', null);
    }
  });

  socket.on('screen:signal', ({ houseId, targetUserId, payload }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;
    const targetSocketIds = userSocketIds.get(targetUserId) || new Set();
    targetSocketIds.forEach((socketId) => {
      io.to(socketId).emit('screen:signal', {
        houseId,
        senderUserId: user.id,
        payload
      });
    });
  });


  socket.on('ludo:join', ({ houseId }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;
    const db = readDb();
    const house = db.houses.find(h => h.id === houseId);
    if (!house) return;

    if (!house.ludoGame) {
      house.ludoGame = {
        players: [
          { color: 'red', userId: null, username: null },
          { color: 'green', userId: null, username: null },
          { color: 'yellow', userId: null, username: null },
          { color: 'blue', userId: null, username: null }
        ],
        tokens: {
          red: [-1, -1, -1, -1],
          green: [-1, -1, -1, -1],
          yellow: [-1, -1, -1, -1],
          blue: [-1, -1, -1, -1]
        },
        currentPlayerIndex: 0,
        diceValue: null,
        turnState: 'waiting-for-roll',
        sixesRolled: 0,
        winners: []
      };
    }

    // Try to find an empty slot
    const existingPlayer = house.ludoGame.players.find(p => p.userId === user.id);
    if (!existingPlayer) {
      const emptySlot = house.ludoGame.players.find(p => !p.userId);
      if (emptySlot) {
        emptySlot.userId = user.id;
        emptySlot.username = user.username;
        writeDb(db);
        io.to(`house:${houseId}`).emit('ludo:state', house.ludoGame);
      }
    }
  });

  socket.on('ludo:roll', ({ houseId }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;
    const db = readDb();
    const house = db.houses.find(h => h.id === houseId);
    if (!house || !house.ludoGame) return;

    const game = house.ludoGame;
    const player = game.players[game.currentPlayerIndex];
    if (player.userId !== user.id || game.turnState !== 'waiting-for-roll') return;

    const roll = Math.floor(Math.random() * 6) + 1;
    game.diceValue = roll;

    if (roll === 6) {
      game.sixesRolled += 1;
      if (game.sixesRolled === 3) {
        // 3 sixes = turn ends
        game.diceValue = null;
        game.sixesRolled = 0;
        game.turnState = 'waiting-for-roll';
        do {
          game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 4;
        } while (game.players[game.currentPlayerIndex].userId === null && game.players.some(p => p.userId));
      } else {
        game.turnState = 'waiting-for-move';
      }
    } else {
      game.sixesRolled = 0;
      game.turnState = 'waiting-for-move';
    }

    // Check if player has valid moves
    const tokens = game.tokens[player.color];
    const hasValidMove = tokens.some(pos => {
      if (pos === -1 && roll === 6) return true;
      if (pos !== -1 && pos + roll <= 56) return true;
      return false;
    });

    if (!hasValidMove) {
      // Auto pass turn
      game.diceValue = null;
      game.sixesRolled = 0;
      game.turnState = 'waiting-for-roll';
      if (roll !== 6) {
        do {
          game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 4;
        } while (game.players[game.currentPlayerIndex].userId === null && game.players.some(p => p.userId));
      }
    }

    writeDb(db);
    io.to(`house:${houseId}`).emit('ludo:state', game);
  });

  socket.on('ludo:move', ({ houseId, tokenIndex }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;
    const db = readDb();
    const house = db.houses.find(h => h.id === houseId);
    if (!house || !house.ludoGame) return;

    const game = house.ludoGame;
    const player = game.players[game.currentPlayerIndex];
    if (player.userId !== user.id || game.turnState !== 'waiting-for-move') return;

    const roll = game.diceValue;
    const tokens = game.tokens[player.color];
    const pos = tokens[tokenIndex];

    let isValid = false;
    if (pos === -1 && roll === 6) {
      tokens[tokenIndex] = 0;
      isValid = true;
    } else if (pos !== -1 && pos + roll <= 56) {
      tokens[tokenIndex] = pos + roll;
      isValid = true;
    }

    if (isValid) {
      game.diceValue = null;
      if (roll === 6) {
        game.turnState = 'waiting-for-roll';
      } else {
        game.sixesRolled = 0;
        game.turnState = 'waiting-for-roll';
        do {
          game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 4;
        } while (game.players[game.currentPlayerIndex].userId === null && game.players.some(p => p.userId));
      }

      writeDb(db);
      io.to(`house:${houseId}`).emit('ludo:state', game);
    }
  });

  socket.on('ludo:reset', ({ houseId }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;
    const db = readDb();
    const house = db.houses.find(h => h.id === houseId);
    if (!house || !house.ludoGame) return;
    
    house.ludoGame = null;
    writeDb(db);
    io.to(`house:${houseId}`).emit('ludo:state', null);
  });

  socket.on('food-draft:state', ({ houseId }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;
    const db = readDb();
    const house = db.houses.find(h => h.id === houseId);
    if (!house) return;
    
    if (!house.foodDraftGame) {
      house.foodDraftGame = {
        status: 'lobby',
        dishes: [],
        winner: null,
        updatedAt: new Date().toISOString()
      };
      writeDb(db);
    }
    
    socket.emit('food-draft:state', house.foodDraftGame);
  });

  socket.on('food-draft:submit', ({ houseId, dishes }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;
    const db = readDb();
    const house = db.houses.find(h => h.id === houseId);
    if (!house || !house.foodDraftGame) return;
    
    if (house.foodDraftGame.status !== 'lobby') return;
    
    // Remove existing dishes by this user
    house.foodDraftGame.dishes = house.foodDraftGame.dishes.filter(d => d.userId !== user.id);
    
    // Add new dishes
    const newDishes = dishes.map(d => ({
      id: crypto.randomUUID(),
      text: d,
      userId: user.id,
      username: user.username
    }));
    
    house.foodDraftGame.dishes.push(...newDishes);
    house.foodDraftGame.updatedAt = new Date().toISOString();
    
    writeDb(db);
    io.to(`house:${houseId}`).emit('food-draft:state', house.foodDraftGame);
  });

  socket.on('food-draft:spin', ({ houseId }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;
    const db = readDb();
    const house = db.houses.find(h => h.id === houseId);
    if (!house || !house.foodDraftGame) return;
    
    if (house.foodDraftGame.dishes.length === 0) return;
    
    const randomIndex = Math.floor(Math.random() * house.foodDraftGame.dishes.length);
    const winner = house.foodDraftGame.dishes[randomIndex];
    
    house.foodDraftGame.status = 'spinning';
    house.foodDraftGame.winner = winner;
    house.foodDraftGame.updatedAt = new Date().toISOString();
    
    writeDb(db);
    io.to(`house:${houseId}`).emit('food-draft:state', house.foodDraftGame);
    
    // Auto complete spin after a few seconds
    setTimeout(() => {
      const currentDb = readDb();
      const h = currentDb.houses.find(entry => entry.id === houseId);
      if (h && h.foodDraftGame && h.foodDraftGame.status === 'spinning') {
        h.foodDraftGame.status = 'result';
        h.foodDraftGame.updatedAt = new Date().toISOString();
        writeDb(currentDb);
        io.to(`house:${houseId}`).emit('food-draft:state', h.foodDraftGame);
      }
    }, 4000);
  });

  socket.on('food-draft:reset', ({ houseId }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;
    const db = readDb();
    const house = db.houses.find(h => h.id === houseId);
    if (!house || !house.foodDraftGame) return;
    
    house.foodDraftGame = {
      status: 'lobby',
      dishes: [],
      winner: null,
      updatedAt: new Date().toISOString()
    };
    
    writeDb(db);
    io.to(`house:${houseId}`).emit('food-draft:state', house.foodDraftGame);
  });

  socket.on('polaroid:send', ({ houseId, imageDataUrl }, ack) => {
    if (!socket.data.joinedHouses.has(houseId)) {
      ack?.({ ok: false, error: 'Join the house room first.' });
      return;
    }
    if (!imageDataUrl) {
      ack?.({ ok: false, error: 'No polaroid image was received.' });
      return;
    }
    
    const db = readDb();
    const house = db.houses.find(h => h.id === houseId);
    if (!house) {
      ack?.({ ok: false, error: 'House not found.' });
      return;
    }
    
    if (!house.polaroids) {
      house.polaroids = [];
    }
    
    const newPolaroid = {
      id: crypto.randomUUID(),
      senderId: user.id,
      senderUsername: user.username,
      houseName: house.name,
      imageDataUrl,
      timestamp: new Date().toISOString()
    };
    
    // Keep only the 5 most recent polaroids
    house.polaroids.unshift(newPolaroid);
    if (house.polaroids.length > 5) {
      const pinnedIndex = house.polaroids.findIndex(p => p.isPinned);
      if (pinnedIndex !== -1 && pinnedIndex >= 5) {
        let lastUnpinnedIndex = -1;
        for (let i = house.polaroids.length - 1; i >= 0; i--) {
          if (!house.polaroids[i].isPinned) {
            lastUnpinnedIndex = i;
            break;
          }
        }
        if (lastUnpinnedIndex !== -1) {
          house.polaroids.splice(lastUnpinnedIndex, 1);
        }
      }
      house.polaroids = house.polaroids.slice(0, 5);
    }
    
    writeDb(db);
    io.to(`house:${houseId}`).emit('polaroid:new', { houseId, polaroid: newPolaroid });
    ack?.({ ok: true, polaroid: newPolaroid });
  });

  socket.on('polaroid:pin', ({ houseId, polaroidId }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;
    if (!polaroidId) return;

    const db = readDb();
    const house = db.houses.find(h => h.id === houseId);
    if (!house || !house.polaroids) return;

    const polaroidToPin = house.polaroids.find(p => p.id === polaroidId);
    if (!polaroidToPin) return;

    const currentlyPinned = Boolean(polaroidToPin.isPinned);

    // Unpin all other polaroids in this house
    house.polaroids.forEach(p => {
      p.isPinned = false;
    });

    // Toggle this polaroid's pin state
    polaroidToPin.isPinned = !currentlyPinned;

    writeDb(db);
    io.to(`house:${houseId}`).emit('polaroid:new', { houseId });
  });

  socket.on('polaroid:delete', ({ houseId, polaroidId }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;
    if (!polaroidId) return;

    const db = readDb();
    const house = db.houses.find(h => h.id === houseId);
    if (!house || !house.polaroids) return;

    house.polaroids = house.polaroids.filter(p => p.id !== polaroidId);

    writeDb(db);
    io.to(`house:${houseId}`).emit('polaroid:new', { houseId });
  });

  socket.on('disconnect', () => {
    untrackSocketForUser(user.id, socket.id);
    Array.from(socket.data.joinedHouses || []).forEach((houseId) => {
      io.to(`house:${houseId}`).emit('house:presence-updated', { houseId });
    });
    Array.from(socket.data.joinedCallHouses || []).forEach((houseId) => {
      const participants = callParticipantsByHouse.get(houseId);
      if (participants) {
        participants.delete(user.id);
        if (participants.size === 0) {
          callParticipantsByHouse.delete(houseId);
        }
      }
      emitCallParticipants(houseId);
    });
  });
});

await initializeDbStore();

server.listen(port, () => {
  console.log(`HomeCourt auth server running on http://localhost:${port}`);
  startNotificationWorker();
});
