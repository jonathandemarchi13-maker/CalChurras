// CalChurras — servidor Express para Render
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const webpush = require('web-push');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR, {
  maxAge: '1h',
  setHeaders: (res, p) => {
    if (p.endsWith('service-worker.js')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const SUB_STORE = path.join(__dirname, 'subscriptions.json');
if (!fs.existsSync(SUB_STORE)) fs.writeFileSync(SUB_STORE, '[]');
function readSubs(){ try{ return JSON.parse(fs.readFileSync(SUB_STORE,'utf-8')||'[]'); }catch(e){ return []; } }
function writeSubs(list){ fs.writeFileSync(SUB_STORE, JSON.stringify(list, null, 2)); }

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:example@example.com';
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
else console.log('ℹ️ VAPID não configurado ainda — endpoints de push continuam disponíveis para o futuro.');

app.post('/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ ok:false, error:'Subscription inválida' });
  const list = readSubs();
  if (!list.find(s => s.endpoint === sub.endpoint)) { list.push(sub); writeSubs(list); }
  res.json({ ok:true });
});

app.post('/send', async (req, res) => {
  const { title='CalChurras', body='Notificação' } = req.body || {};
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return res.status(400).json({ ok:false, error:'VAPID não configurado' });
  const payload = JSON.stringify({ title, body });
  const list = readSubs();
  const results = await Promise.all(list.map(async (sub) => {
    try { await webpush.sendNotification(sub, payload); return { ok:true }; }
    catch (err) { return { ok:false }; }
  }));
  const keep = list.filter((_, i) => results[i].ok);
  if (keep.length !== list.length) writeSubs(keep);
  res.json({ ok:true, sent: keep.length, failed: list.length-keep.length });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 CalChurras rodando em http://localhost:${PORT}`));
