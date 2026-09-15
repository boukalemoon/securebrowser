// Topluluk API'leri (api/reviews.js, api/feedback.js): firebase-admin ve Qrtım doğrulaması
// sahte nesnelerle değiştirilip gerçek işleyiciler çalıştırılır. Ağ ve gerçek veritabanı yok.
// Sonuç JSON olarak stdout'a yazılır (test/run.js okur).
'use strict';

const Module = require('module');
const path = require('path');

function makeDb() {
  const data = new Map();
  let auto = 0;
  const coll = (name) => { if (!data.has(name)) data.set(name, new Map()); return data.get(name); };
  const docRef = (name, id) => ({
    id,
    async get() { const v = coll(name).get(id); return { exists: !!v, id, data: () => (v ? { ...v } : undefined) }; },
    async set(obj, opts) {
      const prev = coll(name).get(id);
      coll(name).set(id, opts && opts.merge && prev ? { ...prev, ...obj } : { ...obj });
    },
  });
  const query = (name, filters = [], lim = Infinity) => ({
    where(f, _op, v) { return query(name, [...filters, [f, v]], lim); },
    orderBy() { return query(name, filters, lim); },
    limit(n) { return query(name, filters, n); },
    async get() {
      const docs = [...coll(name).entries()]
        .filter(([, o]) => filters.every(([f, v]) => o[f] === v))
        .slice(0, lim)
        .map(([id, o]) => ({ id, data: () => ({ ...o }) }));
      return { docs, size: docs.length };
    },
  });
  return {
    data, coll,
    collection(name) {
      return { ...query(name), doc: (id) => docRef(name, id), async add(obj) { const id = 'k' + (++auto); coll(name).set(id, { ...obj }); return { id }; } };
    },
    async runTransaction(fn) { return fn({ get: (ref) => ref.get(), set: (ref, obj, opts) => { ref.set(obj, opts); } }); },
  };
}

const fakeDb = makeDb();
const origLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === 'firebase-admin/app') return { initializeApp() {}, getApps: () => [1], cert: () => ({}) };
  if (request === 'firebase-admin/firestore') return { getFirestore: () => fakeDb, FieldValue: { serverTimestamp: () => new Date() } };
  return origLoad.call(this, request, ...rest);
};
process.env.RATE_LIMIT_SALT = 'test-salt';

const T1 = 'tok_aaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
const T2 = 'tok_bbbbbbbbbbbbbbbbbbbbbbbbbbbb2';
const USERS = {
  [T1]: { id: '11111111-1111-4111-8111-111111111111', email: 'bir@example.com', user_metadata: { display_name: 'Bir <b>Kişi</b>' } },
  [T2]: { id: '22222222-2222-4222-8222-222222222222', email: 'iki@example.com', user_metadata: {} },
};
const verifyCalls = [];
global.fetch = async (url, opts) => {
  const auth = String((opts && opts.headers && opts.headers.Authorization) || '');
  verifyCalls.push({ url, apikey: !!(opts.headers && opts.headers.apikey), auth });
  const u = USERS[auth.replace(/^Bearer /, '')];
  return { ok: !!u, status: u ? 200 : 401, json: async () => (u || { msg: 'bad_jwt' }) };
};

const reviews = require(path.join(__dirname, '..', '..', 'api', 'reviews.js'));
const feedback = require(path.join(__dirname, '..', '..', 'api', 'feedback.js'));

async function call(handler, { method = 'GET', token, body, ip = '203.0.113.7' } = {}) {
  const headers = { 'x-forwarded-for': ip };
  if (token) headers.authorization = 'Bearer ' + token;
  const res = {
    statusCode: 0, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
  await handler({ method, headers, body }, res);
  return { status: res.statusCode, body: res.body, cache: res.headers['cache-control'] || '' };
}

const docs = (name) => [...fakeDb.coll(name).entries()].map(([id, o]) => ({ id, ...o }));

(async () => {
  const out = {};

  // ── Yorumlar ──
  out.appNoToken = await call(reviews, { method: 'POST', body: { source: 'app', rating: 5, name: 'Adsız', comment: 'Hesapsız uygulama yorumu' } });
  out.appBadToken = await call(reviews, { method: 'POST', token: 'tok_gecersiz_xxxxxxxxxxxxxxxxxxx', body: { rating: 5, comment: 'Geçersiz anahtarla yorum' } });
  out.appNoRating = await call(reviews, { method: 'POST', token: T1, body: { name: 'Bir', comment: 'Puansız ama uzun yorum' } });
  out.appFirst = await call(reviews, { method: 'POST', token: T1, body: { rating: 4, name: '', comment: 'Çok hızlı <script>x</script> bir tarayıcı', source: 'app', appVersion: '0.8.1' } });
  const afterFirst = docs('ilgezdi_reviews').filter((d) => d.source === 'app');
  out.appDocCount1 = afterFirst.length;
  out.appDoc = afterFirst[0] ? { id: afterFirst[0].id, name: afterFirst[0].name, comment: afterFirst[0].comment, status: afterFirst[0].status, userId: afterFirst[0].userId, email: afterFirst[0].email, rating: afterFirst[0].rating } : null;
  // Nexus onayladı → kullanıcı düzenledi → yeniden onaya düşmeli, createdAt korunmalı
  if (afterFirst[0]) fakeDb.coll('ilgezdi_reviews').set(afterFirst[0].id, { ...afterFirst[0], status: 'approved' });
  const created1 = afterFirst[0] && afterFirst[0].createdAt;
  await new Promise((r) => setTimeout(r, 5));
  out.appEdit = await call(reviews, { method: 'POST', token: T1, body: { rating: 5, name: 'Bir K.', comment: 'Düzenlenmiş yorum metni burada' } });
  const afterEdit = docs('ilgezdi_reviews').filter((d) => d.source === 'app');
  out.appDocCount2 = afterEdit.length;
  out.appEdited = afterEdit[0] ? { status: afterEdit[0].status, edited: afterEdit[0].edited, createdKept: afterEdit[0].createdAt === created1, rating: afterEdit[0].rating } : null;

  out.sitePost = await call(reviews, { method: 'POST', body: { name: 'Site', comment: 'Siteden yorum', rating: 3 }, ip: '198.51.100.1' });
  out.siteDoc = docs('ilgezdi_reviews').filter((d) => !d.source).map((d) => ({ status: d.status, hasUser: 'userId' in d }))[0] || null;
  for (let i = 0; i < 3; i++) await call(reviews, { method: 'POST', body: { name: 'Sel', comment: 'Seri yorum ' + i }, ip: '198.51.100.9' });
  out.siteRate = await call(reviews, { method: 'POST', body: { name: 'Sel', comment: 'Dördüncü yorum' }, ip: '198.51.100.9' });

  // Onaylı listede uygulama yorumu "verified"; oturumla kendi yorumu, önbelleksiz
  const approvedId = docs('ilgezdi_reviews').find((d) => d.source === 'app').id;
  fakeDb.coll('ilgezdi_reviews').set(approvedId, { ...fakeDb.coll('ilgezdi_reviews').get(approvedId), status: 'approved' });
  out.publicList = await call(reviews, { method: 'GET' });
  out.mineList = await call(reviews, { method: 'GET', token: T1 });
  out.otherMine = await call(reviews, { method: 'GET', token: T2 });

  // ── Öneriler ──
  out.fbAnon = await call(feedback, { method: 'POST', body: { type: 'eksik', area: 'sekmeler', title: 'Sekme grupları', message: 'Sekmeleri <b>gruplayabilmek</b> istiyorum.', contactOk: true, diag: { appVersion: '0.8.1', electron: '44.3.0', os: 'win32 10.0', arch: 'x64', locale: 'tr', url: 'https://gizli.example/yol' } }, ip: '192.0.2.10' });
  out.fbUserNoContact = await call(feedback, { method: 'POST', token: T1, body: { type: 'hata', area: 'yer-imleri', title: 'Panel boş geliyor', message: 'Klasör düğmesine basınca panel boş.', contactOk: false } });
  out.fbUserContact = await call(feedback, { method: 'POST', token: T1, body: { type: 'ozellestirme', area: 'olmayan-alan', title: 'Tema rengi', message: 'Kendi renk paletimi seçebilmek isterim.', contactOk: true } });
  out.fbBadType = await call(feedback, { method: 'POST', body: { type: 'spam', title: 'Başlık burada', message: 'Uzun bir açıklama metni' }, ip: '192.0.2.11' });
  out.fbShort = await call(feedback, { method: 'POST', body: { type: 'hata', title: 'Kısa', message: 'Uzun bir açıklama metni' }, ip: '192.0.2.11' });
  out.fbBadToken = await call(feedback, { method: 'POST', token: 'tok_gecersiz_xxxxxxxxxxxxxxxxxxx', body: { type: 'hata', title: 'Başlık burada', message: 'Uzun bir açıklama metni' } });
  const fb = docs('ilgezdi_feedback');
  out.fbDocs = fb.map((d) => ({
    type: d.type, area: d.area, title: d.title, message: d.message, status: d.status, userId: d.userId,
    email: d.email, contactOk: d.contactOk, diagKeys: d.diag ? Object.keys(d.diag).sort() : null, displayName: d.displayName,
  }));
  for (let i = 0; i < 3; i++) await call(feedback, { method: 'POST', body: { type: 'diger', title: 'Seri öneri ' + i, message: 'Seri öneri açıklaması' }, ip: '192.0.2.99' });
  out.fbRate = await call(feedback, { method: 'POST', body: { type: 'diger', title: 'Dördüncü öneri', message: 'Dördüncü öneri açıklaması' }, ip: '192.0.2.99' });
  // Nexus durumu ve yanıtı değiştirdi → kullanıcı kendi listesinde görür; başkası göremez
  const own = docs('ilgezdi_feedback').find((d) => d.title === 'Panel boş geliyor');
  fakeDb.coll('ilgezdi_feedback').set(own.id, { ...own, status: 'planlandi', reply: 'Bir sonraki sürümde düzeltiliyor.' });
  out.fbMineNoToken = await call(feedback, { method: 'GET' });
  out.fbMine = await call(feedback, { method: 'GET', token: T1 });
  out.fbMineOther = await call(feedback, { method: 'GET', token: T2 });

  out.verifyCalls = { count: verifyCalls.length, allApikey: verifyCalls.every((c) => c.apikey), url: verifyCalls[0] && verifyCalls[0].url };
  process.stdout.write(JSON.stringify(out));
})().catch((e) => { process.stdout.write(JSON.stringify({ error: String((e && e.stack) || e) })); });
