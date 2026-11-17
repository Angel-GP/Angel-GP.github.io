const te = new TextEncoder();
const td = new TextDecoder();
const ITERATIONS = 310000;
const MAX_ITERATIONS = 1000000;
const PACKAGE_ITERATIONS = 600000;
const PACKAGE_ERROR = '账号或密码不正确，或相册文件已损坏';
const subtle = () => {
  if (globalThis.crypto?.subtle) return globalThis.crypto.subtle;
  throw new Error('当前环境不支持安全加密');
};
const randomBytes = n => { const b = new Uint8Array(n); globalThis.crypto.getRandomValues(b); return b; };
const hex = b => [...b].map(x => x.toString(16).padStart(2,'0')).join('');
const unhex = s => { if (typeof s !== 'string' || !/^(?:[0-9a-f]{2})+$/i.test(s)) throw new Error('数据格式无效'); return Uint8Array.from(s.match(/../g), x => parseInt(x,16)); };
async function derive(password, salt, iterations=ITERATIONS) {
  const material = await subtle().importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle().deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations}, material, 256));
}
async function aesKey(bytes, usage) { return subtle().importKey('raw', bytes, {name:'AES-GCM'}, false, usage); }
function asBytes(value) { return value instanceof Uint8Array ? value : new Uint8Array(value); }
function checkPath(path) { if (typeof path !== 'string' || !/^data\/[a-zA-Z0-9._-]+$/.test(path)) throw new Error('资源路径无效'); }
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function exactKeys(value, keys) {
  return record(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key => own(value, key));
}
const validHex = (value, bytes) => typeof value === 'string' && new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'i').test(value);
function checkManifest(m) {
  if (record(m) && own(m, 'version') && m.version === 1) throw new Error('旧版相册不受支持，请使用原制作端重新导出');
  if (!exactKeys(m, ['version','kdf','content']) || m.version !== 2 ||
      !exactKeys(m.kdf, ['name','hash','iterations','salt']) || m.kdf.name !== 'PBKDF2' || m.kdf.hash !== 'SHA-256' ||
      !Number.isInteger(m.kdf.iterations) || m.kdf.iterations < PACKAGE_ITERATIONS || m.kdf.iterations > MAX_ITERATIONS || !validHex(m.kdf.salt, 16) ||
      !exactKeys(m.content, ['path','iv']) || m.content.path !== 'data/content.bin' || !validHex(m.content.iv, 12)) throw new Error('相册清单无效');
}
function checkAsset(asset) {
  if (!exactKeys(asset, ['path','iv','type']) || typeof asset.path !== 'string' || !/^data\/[0-9a-f]{32}\.bin$/.test(asset.path) ||
      !validHex(asset.iv, 12) || typeof asset.type !== 'string' || !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(asset.type)) throw new Error('资源清单无效');
}
function checkAssets(assets, contentIV) {
  if (!record(assets)) throw new Error('资源清单无效');
  const paths = new Set(), ivs = new Set([contentIV.toLowerCase()]);
  for (const id of Reflect.ownKeys(assets)) {
    if (typeof id !== 'string' || !id) throw new Error('资源清单无效');
    const asset = assets[id]; checkAsset(asset);
    if (paths.has(asset.path) || ivs.has(asset.iv.toLowerCase())) throw new Error('资源清单无效');
    paths.add(asset.path); ivs.add(asset.iv.toLowerCase());
  }
}
async function packageKey(account, password, salt, iterations, usages) {
  const credentials = JSON.stringify(['birthday-package-v2', account.trim(), password]);
  const material = await subtle().importKey('raw', te.encode(credentials), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations}, material, {name:'AES-GCM',length:256}, false, usages);
}
function uniqueRandomHex(bytes, used) {
  for (let attempt = 0; attempt < 128; attempt++) {
    const value = hex(randomBytes(bytes));
    if (!used.has(value)) { used.add(value); return value; }
  }
  throw new Error('无法生成唯一随机值');
}
async function encryptBytes(key, bytes) {
  const iv = randomBytes(12);
  const cipher = new Uint8Array(await subtle().encrypt({name:'AES-GCM',iv}, key, bytes));
  return {iv:hex(iv), bytes:cipher};
}
async function decryptBytes(key, iv, bytes) {
  try { return new Uint8Array(await subtle().decrypt({name:'AES-GCM',iv:unhex(iv)},key,bytes)); }
  catch { throw new Error('数据校验失败或已损坏'); }
}
async function loadBytes(path, loader) {
  checkPath(path);
  if (loader) {
    const value = await loader(path);
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
    throw new Error('资源数据无效');
  }
  const response = await fetch(path);
  if (!response.ok) throw new Error('无法读取备份资源');
  return new Uint8Array(await response.arrayBuffer());
}
export function bytesToBase64(bytes) {
  const b = asBytes(bytes); let s='';
  for (let i=0;i<b.length;i+=0x8000) s += String.fromCharCode(...b.subarray(i,i+0x8000));
  return btoa(s);
}
export function base64ToBytes(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Base64数据无效');
  const s=atob(value); return Uint8Array.from(s,c=>c.charCodeAt(0));
}
export function sortNodes(nodes, order='asc') {
  const sign = order === 'desc' ? -1 : 1;
  const cmp = (a,b) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a-b;
    return String(a).localeCompare(String(b), 'zh-CN', {numeric:true});
  };
  return nodes.map((node,index)=>({node,index})).sort((a,b)=>{
    for (const key of ['date','time','rank','id']) { const c=cmp(a.node?.[key],b.node?.[key]); if(c) return c*sign; }
    return a.index-b.index;
  }).map(x=>x.node);
}
const SH_TZ='Asia/Shanghai';
function shParts(date) { const p=new Intl.DateTimeFormat('en-CA',{timeZone:SH_TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date); return Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)])); }
function dateParts(value) {
  if (value instanceof Date) return shParts(value);
  if (typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) { const [year,month,day]=value.split('-').map(Number); if(month<1||month>12||day<1||day>31||new Date(Date.UTC(year,month-1,day)).getUTCMonth()!==month-1||new Date(Date.UTC(year,month-1,day)).getUTCDate()!==day) throw new Error('日期无效'); return {year,month,day}; }
  throw new Error('日期无效');
}
function serial(y,m,d) { return Math.floor(Date.UTC(y,m-1,d)/86400000); }
export function birthdayInfo(date, now=new Date()) {
  const b=dateParts(date), n=shParts(now);
  if(b.month<1||b.month>12||b.day<1||b.day>31) throw new Error('日期无效');
  const today=serial(n.year,n.month,n.day); let year=n.year;
  const dayFor=y => b.month===2&&b.day===29&&!((y%4===0&&y%100!==0)||y%400===0) ? 28 : b.day;
  let target=serial(year,b.month,dayFor(year)); if(target<today){ year++; target=serial(year,b.month,dayFor(year)); }
  return {days:target-today,isToday:target===today};
}
export function daysSince(date, now=new Date()) { const n=shParts(now), d=dateParts(date); return serial(n.year,n.month,n.day)-serial(d.year,d.month,d.day); }
export async function unlockPackage(manifest, account, password, loader) {
  checkManifest(manifest);
  if(typeof account!=='string'||typeof password!=='string') throw new Error(PACKAGE_ERROR);
  const key=await packageKey(account,password,unhex(manifest.kdf.salt),manifest.kdf.iterations,['decrypt']);
  // Loading is outside the authentication catch so network failures retain their cause.
  const bytes=await loadBytes(manifest.content.path,loader);
  try {
    const plain=await decryptBytes(key,manifest.content.iv,bytes);
    const envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));
    if(!exactKeys(envelope,['content','assets'])) throw new Error('相册内容无效');
    checkAssets(envelope.assets,manifest.content.iv);
    return {key,content:envelope.content,assets:envelope.assets};
  } catch { throw new Error(PACKAGE_ERROR); }
}
export async function decryptAsset(assets,key,id,loader) {
  if(!record(assets)||typeof id!=='string'||!own(assets,id)) throw new Error('资源不存在');
  const asset=assets[id]; checkAsset(asset);
  const bytes=await decryptBytes(key,asset.iv,await loadBytes(asset.path,loader));
  return new Blob([bytes],{type:asset.type});
}
