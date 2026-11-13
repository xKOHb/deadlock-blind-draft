// Удаляет старые комнаты из Firebase Realtime Database.
// Комната считается старой, если её данные не менялись больше MAX_AGE_DAYS суток (по умолчанию 3).
// Запоминает «отпечаток» каждой комнаты в служебном узле _cleanup (клиенты сайта его не видят: правила базы его закрывают).
const admin = require('firebase-admin');
const crypto = require('crypto');

const DAYS = Number(process.env.MAX_AGE_DAYS || 3);
const DRY = !!process.env.DRY_RUN;
const NODES = ['games', 'auctions', 'guess', 'budget', 'cards'];

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: process.env.FIREBASE_DB_URL
});
const db = admin.database();

(async () => {
  const now = Date.now(), limit = DAYS * 86400000;
  const seen = (await db.ref('_cleanup').once('value')).val() || {};
  const next = {}, updates = {};
  let del = 0, keep = 0;
  for (const n of NODES) {
    const rooms = (await db.ref(n).once('value')).val() || {};
    for (const code of Object.keys(rooms)) {
      const h = crypto.createHash('sha1').update(JSON.stringify(rooms[code])).digest('hex');
      const prev = seen[n] && seen[n][code];
      const t = prev && prev.h === h ? prev.t : now;      // данные изменились: отсчёт начинается заново
      if (now - t > limit) { updates[n + '/' + code] = null; del++; console.log('удалить', n + '/' + code); }
      else { (next[n] = next[n] || {})[code] = {h, t}; keep++; }
    }
  }
  console.log((DRY ? '[ПРОБНЫЙ ЗАПУСК, ничего не удалено] ' : '') + 'удалено: ' + del + ', осталось: ' + keep);
  if (!DRY) {
    updates['_cleanup'] = Object.keys(next).length ? next : null;
    await db.ref().update(updates);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
