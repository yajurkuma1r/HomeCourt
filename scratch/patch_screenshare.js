import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const file = path.join(__dirname, '..', 'server', 'index.js');
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('const screenSharesByHouse = new Map();')) {
  code = code.replace(
    'const callParticipantsByHouse = new Map();',
    'const callParticipantsByHouse = new Map();\nconst screenSharesByHouse = new Map();'
  );
}

if (!code.includes("socket.on('screen:start'")) {
  const insertIndex = code.indexOf("socket.on('disconnect'");
  const events = `
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
    io.to(\`house:\${houseId}\`).emit('screen:active-sharer', { adminId: user.id, username: user.username });
  });

  socket.on('screen:stop', ({ houseId }) => {
    const share = screenSharesByHouse.get(houseId);
    if (share && share.adminId === user.id) {
      screenSharesByHouse.delete(houseId);
      io.to(\`house:\${houseId}\`).emit('screen:active-sharer', null);
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

`;
  code = code.substring(0, insertIndex) + events + code.substring(insertIndex);
}

if (!code.includes('screenSharesByHouse.delete(houseId)')) {
  const disconnectStr = "socket.on('disconnect', () => {";
  const cleanupStr = `
    // Clean up screen shares
    for (const [houseId, share] of screenSharesByHouse.entries()) {
      if (share.socketId === socket.id) {
        screenSharesByHouse.delete(houseId);
        io.to(\`house:\${houseId}\`).emit('screen:active-sharer', null);
      }
    }
  `;
  code = code.replace(disconnectStr, disconnectStr + cleanupStr);
}

fs.writeFileSync(file, code, 'utf8');
console.log('Backend patched for screen sharing');
