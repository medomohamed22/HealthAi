const express = require('express');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs/promises');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.join(__dirname, '..');
const DATA_FILE = path.join(__dirname, 'store.json');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '3mb' }));
app.use(express.static(ROOT_DIR));

async function readStore() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  } catch {
    const initial = { users: [], messages: [] };
    await writeStore(initial);
    return initial;
  }
}

async function writeStore(store) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/users', async (_req, res) => {
  const store = await readStore();
  res.json(store.users);
});

app.post('/api/users', async (req, res) => {
  const user = req.body;
  if (!user || !user.uid || !user.username) {
    return res.status(400).json({ error: 'uid and username are required' });
  }
  const store = await readStore();
  const index = store.users.findIndex((item) => item.uid === user.uid);
  if (index >= 0) store.users[index] = { ...store.users[index], ...user, updatedAt: Date.now() };
  else store.users.push({ ...user, createdAt: Date.now(), updatedAt: Date.now() });
  await writeStore(store);
  res.json(index >= 0 ? store.users[index] : store.users.at(-1));
});

app.get('/api/messages/:userId', async (req, res) => {
  const store = await readStore();
  const messages = store.messages.filter((message) =>
    message.from === req.params.userId || message.to === req.params.userId
  );
  res.json(messages);
});

app.post('/api/messages', async (req, res) => {
  const { from, to, text } = req.body || {};
  if (!from || !to || !String(text || '').trim()) {
    return res.status(400).json({ error: 'from, to and text are required' });
  }
  const store = await readStore();
  const message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    from,
    to,
    text: String(text).trim().slice(0, 1000),
    createdAt: Date.now()
  };
  store.messages.push(message);
  await writeStore(store);
  res.status(201).json(message);
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Nearby running at http://localhost:${PORT}`);
});
