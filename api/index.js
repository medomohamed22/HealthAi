const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.warn('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in the environment.');
}

const supabase = createClient(SUPABASE_URL || 'https://example.supabase.co', SUPABASE_SECRET_KEY || 'missing', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype))
});

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '1mb' }));

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function verifyPi(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Pi access token is required.' });

  const response = await fetch('https://api.minepi.com/v2/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return res.status(401).json({ error: 'Invalid or expired Pi access token.' });
  const payload = await response.json();
  const user = payload.user || payload;
  if (!user?.uid || !user?.username) return res.status(401).json({ error: 'Pi identity verification failed.' });
  req.piUser = { uid: user.uid, username: user.username };
  next();
}

async function ensureProfile(piUser) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ pi_uid: piUser.uid, username: piUser.username }, { onConflict: 'pi_uid' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

function extensionFor(file) {
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  return map[file.mimetype] || 'jpg';
}

async function uploadImage(bucket, ownerId, file) {
  if (!file) throw new Error('Image file is required.');
  const objectPath = `${ownerId}/${Date.now()}-${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await supabase.storage.from(bucket).upload(objectPath, file.buffer, {
    contentType: file.mimetype,
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return { path: objectPath, url: data.publicUrl };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, database: Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY) }));

app.post('/api/auth/pi', verifyPi, asyncRoute(async (req, res) => {
  const profile = await ensureProfile(req.piUser);
  res.json({ profile });
}));

app.get('/api/me', verifyPi, asyncRoute(async (req, res) => {
  const profile = await ensureProfile(req.piUser);
  const { data: products, error } = await supabase.from('products').select('*').eq('owner_pi_uid', req.piUser.uid).order('created_at', { ascending: false });
  if (error) throw error;
  res.json({ profile, products });
}));

app.put('/api/me', verifyPi, asyncRoute(async (req, res) => {
  const allowedTypes = new Set(['person', 'service', 'seller']);
  const updates = {
    display_name: String(req.body.display_name || '').trim().slice(0, 60),
    description: String(req.body.description || '').trim().slice(0, 500),
    account_type: allowedTypes.has(req.body.account_type) ? req.body.account_type : 'person',
    updated_at: new Date().toISOString()
  };
  if (Number.isFinite(Number(req.body.latitude))) updates.latitude = Number(req.body.latitude);
  if (Number.isFinite(Number(req.body.longitude))) updates.longitude = Number(req.body.longitude);

  const { data, error } = await supabase.from('profiles').update(updates).eq('pi_uid', req.piUser.uid).select('*').single();
  if (error) throw error;
  res.json(data);
}));

app.post('/api/me/avatar', verifyPi, upload.single('image'), asyncRoute(async (req, res) => {
  await ensureProfile(req.piUser);
  const image = await uploadImage('avatars', req.piUser.uid, req.file);
  const { data, error } = await supabase.from('profiles').update({ avatar_url: image.url, avatar_path: image.path }).eq('pi_uid', req.piUser.uid).select('*').single();
  if (error) throw error;
  res.json(data);
}));

app.get('/api/nearby', verifyPi, asyncRoute(async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Math.min(5, Math.max(0.1, Number(req.query.radius) || 5));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Valid lat and lng are required.' });

  await ensureProfile(req.piUser);
  const { data, error } = await supabase.rpc('nearby_profiles', {
    user_lat: lat,
    user_lng: lng,
    radius_km: radius,
    excluded_pi_uid: req.piUser.uid
  });
  if (error) throw error;
  res.json(data || []);
}));

app.get('/api/profiles/:piUid', verifyPi, asyncRoute(async (req, res) => {
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('pi_uid', req.params.piUid).single();
  if (error) throw error;
  const { data: products, error: productError } = await supabase.from('products').select('*').eq('owner_pi_uid', req.params.piUid).order('created_at', { ascending: false });
  if (productError) throw productError;
  res.json({ profile, products });
}));

app.post('/api/products', verifyPi, upload.single('image'), asyncRoute(async (req, res) => {
  await ensureProfile(req.piUser);
  const price = Number(req.body.price);
  if (!String(req.body.name || '').trim() || !Number.isFinite(price) || price < 0 || !req.file) return res.status(400).json({ error: 'Valid product name, price and image are required.' });
  const image = await uploadImage('products', req.piUser.uid, req.file);
  const { data, error } = await supabase.from('products').insert({
    owner_pi_uid: req.piUser.uid,
    name: String(req.body.name).trim().slice(0, 100),
    description: String(req.body.description || '').trim().slice(0, 500),
    price,
    currency: String(req.body.currency || 'PI').trim().slice(0, 10),
    image_url: image.url,
    image_path: image.path
  }).select('*').single();
  if (error) throw error;
  res.status(201).json(data);
}));

app.delete('/api/products/:id', verifyPi, asyncRoute(async (req, res) => {
  const { data: product, error: readError } = await supabase.from('products').select('*').eq('id', req.params.id).eq('owner_pi_uid', req.piUser.uid).single();
  if (readError) throw readError;
  const { error } = await supabase.from('products').delete().eq('id', req.params.id).eq('owner_pi_uid', req.piUser.uid);
  if (error) throw error;
  if (product.image_path) await supabase.storage.from('products').remove([product.image_path]);
  res.status(204).end();
}));

app.get('/api/conversations', verifyPi, asyncRoute(async (req, res) => {
  const { data, error } = await supabase.rpc('conversation_summaries', { current_pi_uid: req.piUser.uid });
  if (error) throw error;
  res.json(data || []);
}));

app.get('/api/messages/:otherPiUid', verifyPi, asyncRoute(async (req, res) => {
  const other = req.params.otherPiUid;
  const { data, error } = await supabase.from('messages').select('*')
    .or(`and(sender_pi_uid.eq.${req.piUser.uid},receiver_pi_uid.eq.${other}),and(sender_pi_uid.eq.${other},receiver_pi_uid.eq.${req.piUser.uid})`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  res.json(data || []);
}));

app.post('/api/messages', verifyPi, asyncRoute(async (req, res) => {
  const receiver = String(req.body.receiver_pi_uid || '').trim();
  const body = String(req.body.body || '').trim().slice(0, 1500);
  if (!receiver || !body || receiver === req.piUser.uid) return res.status(400).json({ error: 'Valid receiver and message are required.' });
  const { data, error } = await supabase.from('messages').insert({ sender_pi_uid: req.piUser.uid, receiver_pi_uid: receiver, body }).select('*').single();
  if (error) throw error;
  res.status(201).json(data);
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = error instanceof multer.MulterError ? 400 : 500;
  res.status(status).json({ error: error.message || 'Unexpected server error.' });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Nearby API running at http://localhost:${port}`));
}

module.exports = app;
