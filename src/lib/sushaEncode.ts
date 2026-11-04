// Writes Unicode Hindi back in the old software's Susha 05 font, the reverse of sushaToUnicode.
// Susha is typed glyph by glyph: half letters need 'a' to become whole (ga = ग), full letters
// are whole on their own (r = र), 'i' goes before the letter it sits on, and '-' (reph) after it.

const HALF: Record<string, string> = {
  'ग': 'g', 'घ': 'G', 'च': 'c', 'ज': 'j', 'झ': 'J', 'ण': 'N', 'थ': 'q', 'ध': 'Q', 'न': 'n',
  'ब': 'b', 'भ': 'B', 'म': 'm', 'य': 'y', 'ल': 'l', 'व': 'v', 'श': 'S', 'ष': 'Y', 'स': 's',
  'क्ष': 'x', 'श्र': 'E', 'त्त': '<'
};
const FULL: Record<string, string> = {
  'क': 'k', 'ख': 'K', 'छ': 'C', 'ट': 'T', 'ठ': 'z', 'ड': 'D', 'ढ': 'Z', 'त': 't', 'द': 'd',
  'प': 'p', 'फ': 'f', 'र': 'r', 'ह': 'h', 'त्र': '~', 'ज्ञ': '&', 'ट्ट': '+', 'द्ध': 'W', 'द्व': 'w'
};
// Half forms of full letters that Susha has a glyph for
const FULL_HALF: Record<string, string> = { 'क': '@', 'त': '%', 'प': 'P', 'फ': 'F' };
const JOINED = ['क्ष', 'श्र', 'त्त', 'त्र', 'ज्ञ', 'ट्ट', 'द्ध', 'द्व'];
const SIGN: Record<string, string> = {
  'ा': 'a', 'े': 'o', 'ै': 'O', 'ो': 'ao', 'ौ': 'aO', 'ी': 'I', 'ु': 'u', 'ू': 'U', 'ृ': 'R', 'ॉ': 'a^'
};
const VOWEL: Record<string, string> = {
  'अ': 'A', 'आ': 'Aa', 'इ': '[', 'ई': 'š', 'उ': ']', 'ऊ': '}', 'ए': 'e', 'ऐ': 'eo', 'ओ': 'Aao', 'औ': 'AaO', 'ऋ': 'R', 'ऑ': 'Aa^'
};
const TRAILING: Record<string, string> = { 'ं': 'M', 'ँ': '^', 'ः': ':' };
const HALANT = '्';

const isConsonant = (ch: string) => ch >= 'क' && ch <= 'ह';

// One run of consonants joined by halants, split into the glyphs Susha types
function glyphsOf(cluster: string): string[] {
  const glyphs: string[] = [];
  let i = 0;
  while (i < cluster.length) {
    const joined = JOINED.find(j => cluster.startsWith(j, i));
    if (joined) {
      glyphs.push(joined);
      i += joined.length;
    } else {
      glyphs.push(cluster[i]);
      i++;
    }
    if (cluster[i] === HALANT) i++;
  }
  return glyphs;
}

function encodeSyllable(cluster: string, sign: string, endsHalf: boolean): string {
  let glyphs = glyphsOf(cluster);
  let reph = false;
  let rakar = false;
  if (glyphs.length > 1 && glyphs[0] === 'र') {
    reph = true;
    glyphs = glyphs.slice(1);
  }
  if (glyphs.length > 1 && glyphs[glyphs.length - 1] === 'र' && !endsHalf) {
    rakar = true;
    glyphs = glyphs.slice(0, -1);
  }

  let out = '';
  glyphs.forEach((g, index) => {
    const last = index === glyphs.length - 1;
    if (!last || endsHalf) {
      out += HALF[g] ?? FULL_HALF[g] ?? FULL[g] ?? g;
      return;
    }
    if (g in FULL) {
      out += FULL[g] + (rakar ? '`' : '');
    } else {
      // A half letter is completed by 'a'; with a rakar the 'a' comes after it
      out += (HALF[g] ?? g) + (rakar ? '`a' : 'a');
    }
  });

  if (sign === 'ि') return 'i' + out + (reph ? '-' : '');
  return out + (SIGN[sign] ?? '') + (reph ? '-' : '');
}

function encodeWord(word: string): string {
  let out = '';
  let i = 0;
  while (i < word.length) {
    const ch = word[i];
    if (isConsonant(ch)) {
      let cluster = '';
      while (i < word.length && isConsonant(word[i])) {
        cluster += word[i++];
        if (word[i] === '़') i++;
        if (word[i] === HALANT && isConsonant(word[i + 1] || '')) cluster += word[i++];
        else break;
      }
      const endsHalf = word[i] === HALANT;
      if (endsHalf) i++;
      const sign = !endsHalf && (word[i] in SIGN || word[i] === 'ि') ? word[i++] : '';
      out += encodeSyllable(cluster, sign, endsHalf);
    } else if (ch in VOWEL) {
      out += VOWEL[ch];
      i++;
    } else if (ch in TRAILING) {
      out += TRAILING[ch];
      i++;
    } else if (ch === '़' || ch === HALANT) {
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

// Text that already is Susha (no Devanagari letters) is returned unchanged
export function unicodeToSusha(text: string): string {
  if (!text || !/[ऀ-ॿ]/.test(text)) return text || '';
  return text.split(' ').map(encodeWord).join(' ');
}
