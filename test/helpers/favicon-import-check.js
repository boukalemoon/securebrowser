// test/run.js'in eşzamanlı olarak çalıştırdığı yardımcı: bookmark-import.js'in
// tarayıcı simge önbelleği okumasını gerçek bir SQLite (sql.js) veritabanıyla sınar.
// Çıktı stdout'a tek satır JSON.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const initSqlJs = require('sql.js');
const { _internals } = require('../../src/main/bookmark-import.js');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ilgezdi-fav-test-'));
  try {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run('CREATE TABLE icon_mapping (page_url TEXT, icon_id INTEGER); CREATE TABLE favicon_bitmaps (icon_id INTEGER, image_data BLOB, width INTEGER);');
    const png = Uint8Array.from(Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
    const html = Uint8Array.from(Buffer.from('<!doctype html><title>x</title>'));
    db.run('INSERT INTO icon_mapping VALUES (?, 1), (?, 2), (?, 1)', ['https://a.example/', 'https://b.example/', 'https://c.example/sayfa']);
    db.run('INSERT INTO favicon_bitmaps VALUES (1, ?, 32), (1, ?, 16), (2, ?, 16)', [png, png, html]);
    fs.writeFileSync(path.join(dir, 'Favicons'), Buffer.from(db.export()));
    fs.writeFileSync(path.join(dir, 'Bookmarks'), '{}');
    db.close();
    const before = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('ilgezdi-favicons-')).length;
    const out = await _internals.faviconsFromSource(
      { file: path.join(dir, 'Bookmarks') },
      ['https://a.example/', 'https://b.example/', 'https://c.example/sayfa', 'https://yok.example/'],
    );
    const after = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('ilgezdi-favicons-')).length;
    process.stdout.write(JSON.stringify({
      keys: Object.keys(out).sort(),
      pngOk: String(out['https://a.example/'] || '').startsWith('data:image/png;base64,'),
      leftovers: after - before,
    }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  process.stdout.write(JSON.stringify({ error: e.message }));
});
