import fs from 'fs';
const file = 'server/index.js';
let code = fs.readFileSync(file, 'utf8');

const socketInsertion = `
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
    const existingPlayer = house.ludoGame.players.find(p => p.userId === socket.data.user.id);
    if (!existingPlayer) {
      const emptySlot = house.ludoGame.players.find(p => !p.userId);
      if (emptySlot) {
        emptySlot.userId = socket.data.user.id;
        emptySlot.username = socket.data.user.username;
        writeDb(db);
        io.to(\`house:\${houseId}\`).emit('ludo:state', house.ludoGame);
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
    if (player.userId !== socket.data.user.id || game.turnState !== 'waiting-for-roll') return;

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
    io.to(\`house:\${houseId}\`).emit('ludo:state', game);
  });

  socket.on('ludo:move', ({ houseId, tokenIndex }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;
    const db = readDb();
    const house = db.houses.find(h => h.id === houseId);
    if (!house || !house.ludoGame) return;

    const game = house.ludoGame;
    const player = game.players[game.currentPlayerIndex];
    if (player.userId !== socket.data.user.id || game.turnState !== 'waiting-for-move') return;

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
      io.to(\`house:\${houseId}\`).emit('ludo:state', game);
    }
  });

  socket.on('ludo:reset', ({ houseId }) => {
    if (!socket.data.joinedHouses.has(houseId)) return;
    const db = readDb();
    const house = db.houses.find(h => h.id === houseId);
    if (!house || !house.ludoGame) return;
    
    house.ludoGame = null;
    writeDb(db);
    io.to(\`house:\${houseId}\`).emit('ludo:state', null);
  });
`;

if (!code.includes("socket.on('ludo:join'")) {
  const socketFindText = "socket.on('disconnect', () => {";
  code = code.replace(socketFindText, socketInsertion + '\n  ' + socketFindText);
}

fs.writeFileSync(file, code, 'utf8');
console.log('Patched server/index.js for Ludo events');
