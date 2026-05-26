import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverPath = path.join(__dirname, '..', 'server', 'index.js');
let code = fs.readFileSync(serverPath, 'utf8');

// Fix socket.to -> io.to
code = code.replace(/socket\.to\(\`house:\$\{houseId\}\`\)\.emit\('notebook:page-updated'/g, "io.to(`house:${houseId}`).emit('notebook:page-updated'");

// Add bookmarks array to createEmptyNotebookState and ensureNotebookState
code = code.replace(/pages: \{\}/g, 'pages: {}, bookmarks: []');

// Ensure ensureNotebookState properly maps bookmarks if we just did a global replace
code = code.replace(/\.\.\.\(state \|\| \{\}\)/g, '...(state || {}), bookmarks: state?.bookmarks || []');

// Add notebook:update-bookmarks socket event
if (!code.includes("socket.on('notebook:update-bookmarks'")) {
  const insertIndex = code.indexOf("socket.on('disconnect', () => {");
  const bookmarkStr = `
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
    
    io.to(\`house:\${houseId}\`).emit('notebook:bookmarks-updated', { houseId, bookmarks });
  });

  `;
  code = code.substring(0, insertIndex) + bookmarkStr + code.substring(insertIndex);
}

fs.writeFileSync(serverPath, code, 'utf8');
console.log('Successfully patched server/index.js for bookmarks');
