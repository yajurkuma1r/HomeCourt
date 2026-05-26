import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverPath = path.join(__dirname, '..', 'server', 'index.js');
let code = fs.readFileSync(serverPath, 'utf8');

// 1. Insert createEmptyNotebookState
if (!code.includes('createEmptyNotebookState')) {
  const callStateIndex = code.indexOf('const createEmptyCallState');
  const insertStateStr = `
const createEmptyNotebookState = () => ({
  pages: {}
});

const ensureNotebookState = (state) => ({
  pages: {},
  ...(state || {})
});
`;
  code = code.substring(0, callStateIndex) + insertStateStr + code.substring(callStateIndex);
}

// 2. Insert notebook into createHouse (line 1035 approx)
if (!code.includes('notebook: createEmptyNotebookState()')) {
  code = code.replace(
    /call: createEmptyCallState\(\),/g,
    'call: createEmptyCallState(),\n        notebook: createEmptyNotebookState(),'
  );
}

// 3. Insert HTTP API handler
if (!code.includes("parseHouseRoute(req.url, 'notebook')")) {
  const callHouseIdIndex = code.indexOf("const callHouseId = parseHouseRoute(req.url, 'call');");
  const notebookApiStr = `
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
`;
  code = code.substring(0, callHouseIdIndex) + notebookApiStr + code.substring(callHouseIdIndex);
}

// 4. Insert socket events
if (!code.includes("socket.on('notebook:update-page'")) {
  const disconnectIndex = code.indexOf("socket.on('disconnect', () => {");
  const socketStr = `
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
    
    socket.to(\`house:\${houseId}\`).emit('notebook:page-updated', {
      houseId,
      pageIndex,
      page: house.notebook.pages[pageIndex]
    });
  });

  `;
  code = code.substring(0, disconnectIndex) + socketStr + code.substring(disconnectIndex);
}

fs.writeFileSync(serverPath, code, 'utf8');
console.log('Successfully patched server/index.js');
