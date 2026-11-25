// Pinyin: descomposicion de tonos, silabificacion y comparacion de respuestas.

const TONES = {
  'ā':['a',1],'á':['a',2],'ǎ':['a',3],'à':['a',4],
  'ē':['e',1],'é':['e',2],'ě':['e',3],'è':['e',4],
  'ī':['i',1],'í':['i',2],'ǐ':['i',3],'ì':['i',4],
  'ō':['o',1],'ó':['o',2],'ǒ':['o',3],'ò':['o',4],
  'ū':['u',1],'ú':['u',2],'ǔ':['u',3],'ù':['u',4],
  'ǖ':['v',1],'ǘ':['v',2],'ǚ':['v',3],'ǜ':['v',4],
  'ü':['v',0],
  'ń':['n',2],'ň':['n',3],'ǹ':['n',4],'ḿ':['m',2]
};

const SYL = new Set((
 'a ai an ang ao e ei en eng er o ou yo m n ng hm hng '+
 'ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu '+
 'pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu '+
 'ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu '+
 'fa fan fang fei fen feng fo fou fu '+
 'da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo '+
 'ta tai tan tang tao te tei teng ti tian tiao tie ting tong tou tu tuan tui tun tuo '+
 'na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nun nuo nv nve '+
 'la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu luan lun luo lv lve '+
 'ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo '+
 'ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo '+
 'ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo '+
 'ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun '+
 'qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun '+
 'xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun '+
 'zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo '+
 'cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo '+
 'sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo '+
 'ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo '+
 'za zai zan zang zao ze zei zen zeng zi zong zou zu zuan zui zun zuo '+
 'ca cai can cang cao ce cen ceng ci cong cou cu cuan cui cun cuo '+
 'sa sai san sang sao se sen seng si song sou su suan sui sun suo '+
 'ya yan yang yao ye yi yin ying yong you yu yuan yue yun '+
 'wa wai wan wang wei wen weng wo wu'
).split(' '));

const SEP = new Set([' ', '-', "'", '\u2019', '/', '.']);

// "nǐhǎo" -> {base:"nihao", tones:[0,3,0,0,3]}  (tono en la vocal marcada)
export function decompose(s) {
  let base = '', tones = [];
  for (const ch of s.toLowerCase()) {
    const t = TONES[ch];
    if (t) { base += t[0]; tones.push(t[1]); }
    else { base += ch; tones.push(0); }
  }
  return { base, tones };
}

// Silabifica una cadena sin tonos. Devuelve longitudes de cada trozo.
// Backtracking con preferencia por la silaba mas larga.
export function syllabify(base) {
  const out = [];
  let i = 0;
  while (i < base.length) {
    if (SEP.has(base[i])) { out.push(1); i++; continue; }
    let end = i;
    while (end < base.length && !SEP.has(base[end])) end++;
    const chunk = base.slice(i, end);
    const parts = split(chunk);
    if (parts) out.push(...parts);
    else out.push(chunk.length); // sin solucion: un solo trozo
    i = end;
  }
  return out;
}

// Acepta silaba normal o con sufijo erhua: wanr, diaanr... (huar = hua + r)
function isSyl(s) {
  if (SYL.has(s)) return true;
  return s.length > 2 && s.endsWith('r') && SYL.has(s.slice(0, -1));
}

function split(chunk) {
  const memo = new Map();
  const go = (pos) => {
    if (pos === chunk.length) return [];
    if (memo.has(pos)) return memo.get(pos);
    let res = null;
    for (let len = Math.min(6, chunk.length - pos); len >= 1; len--) {
      if (!isSyl(chunk.substr(pos, len))) continue;
      const rest = go(pos + len);
      if (rest) { res = [len, ...rest]; break; }
    }
    memo.set(pos, res);
    return res;
  };
  return go(0);
}

// Trozos para colorear: [{text, tone}]
export function toneSpans(pinyin) {
  const { base, tones } = decompose(pinyin);
  const lens = syllabify(base);
  const spans = [];
  let i = 0;
  for (const len of lens) {
    let tone = 0;
    for (let k = i; k < i + len; k++) if (tones[k]) { tone = tones[k]; break; }
    spans.push({ text: pinyin.slice(i, i + len), tone });
    i += len;
  }
  if (i < pinyin.length) spans.push({ text: pinyin.slice(i), tone: 0 });
  return spans;
}

// --- Comparacion de respuestas escritas ---------------------------------

const clean = (s) => s.toLowerCase()
  .replace(/u:/g, 'v').replace(/uu/g, 'v')
  .replace(/[\s'\u2019\-\.,/]/g, '');

// Convierte entrada numerica (ni3hao3) a {letters, tones[]} por silaba
function numericForm(base, tones) {
  const lens = syllabify(base);
  let out = '', i = 0;
  for (const len of lens) {
    const seg = base.slice(i, i + len);
    let tone = 0;
    for (let k = i; k < i + len; k++) if (tones[k]) { tone = tones[k]; break; }
    out += seg + (tone || 5);
    i += len;
  }
  return out;
}

/**
 * Compara la respuesta del usuario con el pinyin correcto.
 * strict=true exige tonos (por diacritico o por numero).
 * Acepta: nǐhǎo / ni3hao3 / nihao (si strict=false) / nv o nu: para ü
 */
export function checkPinyin(input, correct, strict) {
  const inRaw = (input || '').trim();
  if (!inRaw) return false;
  const c = decompose(correct);
  const cBase = clean(c.base);
  const cNum = clean(numericForm(c.base, c.tones)).replace(/5/g, '');
  const i = decompose(inRaw);
  const hasDigits = /[1-5]/.test(inRaw);
  const iBase = clean(i.base).replace(/[1-5]/g, '');
  if (iBase !== cBase) return false;
  if (!strict) return true;
  if (hasDigits) return clean(i.base).replace(/5/g, '') === cNum;
  // con diacriticos: la secuencia de tonos debe coincidir
  const iNum = clean(numericForm(i.base.replace(/[1-5]/g, ''), i.tones)).replace(/5/g, '');
  return iNum === cNum;
}

export const TONE_COUNT = 5;
