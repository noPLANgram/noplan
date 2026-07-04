/* the keeper of the tree — @noplan_no_bot
   long-polling worker, zero dependencies, node 20+.
   token comes from the BOT_TOKEN env var — never from this repo. */

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) { console.error('BOT_TOKEN missing'); process.exit(1); }
const API = `https://api.telegram.org/bot${TOKEN}`;

const CA   = 'EQB3kSUC688buwPIwz34jX5KDB4O7naqlGLPoEAzB5LIh9qg';
const POOL = 'EQDWnsxS1XujfKqchyRST4OScg4Fo92gECFBS7cOpXMRU_6C';
const SITE = 'https://noplangram.github.io/noplan/';
const RUN_MINUTES = Number(process.env.RUN_MINUTES || 345);
const DEADLINE = Date.now() + RUN_MINUTES * 60 * 1000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fmt(n){
  n = Number(n);
  if (!isFinite(n)) return '?';
  if (n >= 1e9) return (n/1e9).toFixed(2)+'B';
  if (n >= 1e6) return (n/1e6).toFixed(2)+'M';
  if (n >= 1e3) return (n/1e3).toFixed(1)+'K';
  return n.toFixed(n < 10 ? 2 : 0);
}
const short = a => a ? a.slice(0,4)+'…'+a.slice(-4) : '?';
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

async function tg(method, payload){
  for (let i = 0; i < 4; i++){
    try {
      const r = await fetch(`${API}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (j.ok) return j.result;
      if (j.error_code === 429){ await sleep(1000 * ((j.parameters && j.parameters.retry_after) || 3)); continue; }
      if (j.error_code === 409){ await sleep(5000); continue; }   // another poller winding down
      console.error(method, j.error_code, j.description);
      return null;
    } catch(e){ await sleep(2000 * (i+1)); }
  }
  return null;
}

async function getJson(url){
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

/* ---------- market data ---------- */
let statsCache = { at: 0, text: null };
async function priceText(){
  if (Date.now() - statsCache.at < 30_000 && statsCache.text) return statsCache.text;
  const at = (await getJson(`https://api.geckoterminal.com/api/v2/networks/ton/pools/${POOL}`)).data.attributes;
  const price = Number(at.base_token_price_usd || 0);
  const mcap = Number(at.market_cap_usd || at.fdv_usd || 0);
  const vol = Number((at.volume_usd && at.volume_usd.h24) || 0);
  const chg = Number((at.price_change_percentage && at.price_change_percentage.h24) || 0);
  let holders = null;
  try { holders = (await getJson(`https://tonapi.io/v2/jettons/${CA}`)).holders_count; } catch(e){}
  const arrow = chg > 0 ? '📈' : chg < 0 ? '📉' : '🌳';
  const lines = [
    `${arrow} <b>$NOPLAN</b> — the tree right now`,
    ``,
    `price  <code>$${price < 0.01 ? price.toPrecision(3) : price.toFixed(4)}</code>`,
    `mcap  <code>$${fmt(mcap)}</code>`,
    `24h  <code>${chg > 0 ? '+' : ''}${chg.toFixed(1)}%</code> · vol <code>$${fmt(vol)}</code>`,
    holders != null ? `holders  <code>${holders}</code>` : null,
    ``,
    `<i>there is no plan. only the tree.</i>`,
  ].filter(l => l !== null);
  statsCache = { at: Date.now(), text: lines.join('\n') };
  return statsCache.text;
}

/* ---------- daily prophecy (identical algorithm to the site) ---------- */
import { createHash } from 'node:crypto';
const P1 = ['The tree','The golden root','The void','The hundredth branch','The silent whale','The dust of the chart','The first buyer','The candle you feared','The unseen gardener','The oldest ring','The branch that broke','The sap','The seed below the floor','The crown','The shadow of the wick','The next block'];
const P2 = ['does not ask for','remembers','never counts','grows through','forgives','devours','outlives','ignores','whispers to','was never promised','drinks','carries','does not fear','answers to no one, not even','blesses','withstands'];
const P3 = ['permission','the red candles','your entry price','the roadmap that never was','those who sold','the next block','gravity','the plan','the paper hands','the noise','the exit','tomorrow','the floor','the top','the calendar','the market makers'];
const P4 = ['What was sold in fear returns as a branch for someone braver.','A wallet that sleeps is still a wallet that holds.','The chart is a shadow; the tree is the thing itself.','No one waters it. That is why it grows.','Every dip is the root reaching deeper.','The block does not hurry, and yet everything is confirmed.','Those who ask when have already answered why not.','A branch cut in panic feeds the soil of the patient.','The whale moves in silence; the tree hears everything.','Green and red are the same color to the root.','What the paper hands release, the golden dust remembers.','The plan you are waiting for was never written.','Hold the branch and the branch holds back.','The tree grew last night while you checked the price.','Zero is far below the roots. It cannot reach.','The next ring forms whether you watch or not.'];
const P5 = ['Only the tree.','Only the climb.','Only the golden dust.','The tree already knows.','Only the next branch.','Only holders and wind.','The root decides.','Only the sap flowing upward.','Only rings inside rings.','And that is the plan.','Only what grows in the dark.','Only the ledger and the light.'];

function prophecyText(){
  const day = new Date().toISOString().slice(0,10);
  const b = createHash('sha256').update(`NOPLAN//${day}//${CA}`).digest();
  const pick = (arr,i) => arr[b[i] % arr.length];
  return [
    `🔮 <b>DAILY PROPHECY</b> · <code>${day}</code>`,
    ``,
    `<i>${esc(`${pick(P1,0)} ${pick(P2,1)} ${pick(P3,2)}.`)}</i>`,
    `<i>${esc(pick(P4,3))}</i>`,
    `<i>${esc(`There is no plan. ${pick(P5,4)}`)}</i>`,
  ].join('\n');
}

/* ---------- your branch ---------- */
async function branchText(q){
  if (!q) return `tell me who you are:\n<code>/branch yourname.ton</code> or <code>/branch UQ…</code>`;
  let addr = q, display = q;
  if (/\./.test(q) && !/^(EQ|UQ|0:|kQ)/i.test(q)){
    const d = await getJson(`https://tonapi.io/v2/dns/${encodeURIComponent(q.toLowerCase())}/resolve`).catch(() => null);
    if (!d || !d.wallet || !d.wallet.address) return `the tree does not know <b>${esc(q)}</b>.`;
    addr = d.wallet.address; display = q.toLowerCase();
  }
  const acc = await getJson(`https://tonapi.io/v2/accounts/${encodeURIComponent(addr)}`).catch(() => null);
  if (!acc) return `the tree does not know <b>${esc(q)}</b>.`;
  addr = acc.address;
  if (display === q && /^(EQ|UQ|0:|kQ)/i.test(q)) display = acc.name || short(q);

  let bal = 0;
  try { bal = Number((await getJson(`https://tonapi.io/v2/accounts/${addr}/jettons/${CA}`)).balance)/1e9; } catch(e){}

  let firstTs = null, everSold = false;
  try {
    const t = (await getJson(`https://toncenter.com/api/v3/jetton/transfers?jetton_master=${CA}&address=${addr}&limit=250&sort=asc`)).jetton_transfers || [];
    for (const x of t){
      if (x.transaction_aborted) continue;
      if (!firstTs) firstTs = x.transaction_now;
      if (x.source && x.source.toLowerCase() === addr.toLowerCase()) everSold = true;
    }
  } catch(e){}

  let rank = null;
  try {
    const h = (await getJson(`https://tonapi.io/v2/jettons/${CA}/holders?limit=100`)).addresses || [];
    h.forEach((x,i) => { if (rank === null && x.owner && x.owner.address === addr) rank = i+1; });
  } catch(e){}

  const days = firstTs ? Math.floor((Date.now()/1000 - firstTs)/86400) : 0;
  const badge = bal <= 0 ? 'a branch not yet grown'
    : everSold ? 'holder of the tree' : '💎 diamond hands — never sold';
  return [
    `◈ <b>${esc(display)}</b>`,
    badge,
    ``,
    `balance  <code>${fmt(bal)} $NOPLAN</code>`,
    firstTs ? `holding  <code>${days} days</code>` : null,
    `rank  <code>${rank ? '#'+rank : (bal > 0 ? '#100+' : '—')}</code>`,
    ``,
    `<a href="${SITE}">see your branch on the living tree →</a>`,
  ].filter(l => l !== null).join('\n');
}

/* ---------- commands ---------- */
const KB = { inline_keyboard: [[{ text: '🌳 open the living tree', url: SITE }]] };

async function handle(msg){
  const text = (msg.text || '').trim();
  if (!text.startsWith('/')) return;
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/@noplan_no_bot$/, '');
  const arg = rest.join(' ').trim();
  const chat = msg.chat.id;
  const reply = (html, kb) => tg('sendMessage', {
    chat_id: chat, text: html, parse_mode: 'HTML',
    reply_to_message_id: msg.message_id, allow_sending_without_reply: true,
    link_preview_options: { is_disabled: true },
    ...(kb ? { reply_markup: kb } : {}),
  });

  try {
    switch (cmd){
      case '/start':
      case '/help':
        return reply([
          `🌳 <b>the keeper of the $NOPLAN tree</b>`,
          ``,
          `/tree — open the living tree`,
          `/price — price, mcap, holders`,
          `/prophecy — today's prophecy, written by no one`,
          `/branch <code>name.ton</code> — find your branch`,
          `/ca — contract address`,
          ``,
          `<i>add me to any chat. there is no plan.</i>`,
        ].join('\n'), KB);
      case '/tree':
        return reply(`🌳 <i>every trade becomes a branch.</i>`, KB);
      case '/price':
      case '/mcap':
        return reply(await priceText(), KB);
      case '/prophecy':
        return reply(prophecyText(), KB);
      case '/branch':
        return reply(await branchText(arg), KB);
      case '/ca':
        return reply(`<code>${CA}</code>\n<i>tap to copy</i>`, KB);
    }
  } catch(e){
    console.error('handle', cmd, e.message);
    return reply(`the tree is silent right now. try again in a moment.`);
  }
}

/* ---------- long-poll loop ---------- */
let offset = 0;
const BOOT = Date.now()/1000;
console.log(`keeper awake for ${RUN_MINUTES} minutes`);
while (Date.now() < DEADLINE){
  const updates = await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] });
  if (!updates){ await sleep(3000); continue; }
  for (const u of updates){
    offset = u.update_id + 1;
    const m = u.message;
    if (!m || !m.text) continue;
    if (m.from && m.from.is_bot) continue;
    if (m.date < BOOT - 300) continue;      // stale backlog from before this run
    await handle(m);
  }
}
console.log('keeper resting — the next run takes over');
