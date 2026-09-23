// Complete Authentic Susha 05, Kruti Dev 010, and High-Accuracy Phonetic Hindi Transliteration Engine
// Specifically engineered for Aryan News Agency (Beawar, Rajasthan)

// 1. Direct Known Publication Dictionary
export const KNOWN_PUBLICATIONS_HINDI: Record<string, string> = {
  'the times of india': 'द टाइम्स ऑफ इंडिया',
  'times of india': 'टाइम्स ऑफ इंडिया',
  'hindustan times': 'हिंदुस्तान टाइम्स',
  'rajasthan patrika': 'राजस्थान पत्रिका',
  'dainik bhaskar': 'दैनिक भास्कर',
  'zindia today hindi': 'इंडिया टुडे',
  'india today': 'इंडिया टुडे',
  'employment news': 'एम्प्लॉयमेंट न्यूज़',
  'rojgar samachar': 'रोजगार समाचार',
  'zindia today english': 'इंडिया टुडे (इंग्लिश)',
  'meri saheli': 'मेरी सहेली',
  'grihashobha': 'गृहशोभा',
  'the economic times': 'द इकोनॉमिक टाइम्स',
  'economic times': 'इकोनॉमिक टाइम्स',
  'vanita': 'वनिता',
  'wisdom': 'विजडम',
  'magic pot': 'मैजिक पॉट',
  'aha zindgi': 'अहा ज़िंदगी',
  'sarita': 'सरिता',
  'saras salil': 'सरस सलिल',
  'punjab kesari': 'पंजाब केसरी',
  'nafa nuksan': 'नफा नुकसान',
  'dainik navajyoti': 'दैनिक नवज्योति',
  'navajyoti': 'नवज्योति',
  'navjyoti': 'नवज्योति',
  'pratiyogita darpan': 'प्रतियोगिता दर्पण',
  'champak': 'चंपक',
  'champak(h)': 'चंपक (हिंदी)',
  'inside outside': 'इनसाइड आउटसाइड',
  'lotpot': 'लोटपोट',
  'outlook(e)': 'आउटलुक (इंग्लिश)',
  'outlook(h)': 'आउटलुक (हिंदी)',
  'vyapar': 'व्यापार',
  'business world': 'बिजनेस वर्ल्ड',
  'balhans': 'बालहंस',
  'rojgar sandesh': 'रोजगार संदेश',
  'balbhaskar': 'बाल भास्कर',
  'chotumotu': 'छोटू मोटू',
  'dalal street': 'दलाल स्ट्रीट',
  'femina': 'फेमिना',
  'capital market': 'कैपिटल मार्केट',
  'womens era': 'वुमन्स एरा',
  'business today': 'बिजनेस टुडे',
  'grihalaxmi': 'गृहलक्ष्मी',
  'vigyan pragati': 'विज्ञान प्रगति',
  'suman saurabh': 'सुमन सौरभ',
  'nandan': 'नंदन',
  'yojna': 'योजना',
  'mukta': 'मुक्ता',
  'kurushetra': 'कुरुक्षेत्र',
  'awishkar': 'आविष्कार',
  'full tansion': 'फुल टेंशन',
  'current gk chronology': 'करंट जीके क्रोनोलॉजी',
  'manohar khaniyan': 'मनोहर कहानियाँ',
  'kadambini': 'कादंबिनी',
  'cricket samrat': 'क्रिकेट सम्राट',
  'chandamama': 'चंदामामा',
  'osho times': 'ओशो टाइम्स',
  'nanhe samrat': 'नन्हे सम्राट',
  'computer sanchar suchna': 'कंप्यूटर संचार सूचना',
  'stardust': 'स्टारडस्ट',
  'hans': 'हंस',
  'sakhi jagran': 'सखी जागरण',
  'ved amrit': 'वेद अमृत',
  'nirantar': 'निरंतर'
};

// 2. Kruti Dev 010 Direct Mappings
const KRUTI_DEV_MAP: Record<string, string> = {
  'rajasqaana pi~ka': 'राजस्थान पत्रिका',
  'doinak Baaskr': 'दैनिक भास्कर',
  '[iNDyaa TuDo': 'इंडिया टुडे',
  'raojagaar samaacaar': 'रोजगार समाचार',
  'maorI saholaI': 'मेरी सहेली',
  'gaRhSaaoBaa': 'गृहशोभा',
  'vainata': 'वनिता',
  'Aha ijaMdgaI': 'अहा ज़िंदगी',
  'sairta': 'सरिता',
  'sarsa sailala': 'सरस सलिल',
  'pMjaaba kosarI': 'पंजाब केसरी',
  'nafa nauksaana': 'नफा नुकसान',
  'dOinak navajyaaoit': 'दैनिक नवज्योति',
  'p`ityaaoigata dp-Na': 'प्रतियोगिता दर्पण',
  'caMpk': 'चंपक',
  'laaoTpaoT': 'लोटपोट',
  'Aa}Tlauk': 'आउटलुक',
  'vyaapar': 'व्यापार',
  'baa;hMsa': 'बालहंस',
  'raojagaar saMdoSa': 'रोजगार संदेश',
  'baala Baaskr': 'बाल भास्कर',
  'CaoTU maaoTU': 'छोटू मोटू',
  'dlaala sT`,IT': 'दलाल स्ट्रीट',
  'gaRhlaEmaI': 'गृहलक्ष्मी',
  'iva&ana p`gait': 'विज्ञान प्रगति',
  'saumana saaOrBa': 'सुमन सौरभ',
  'naMdna': 'नंदन',
  'yaaojanaa': 'योजना',
  'mau@ta': 'मुक्ता',
  'ku$Eaot`': 'कुरुक्षेत्र',
  'AivaYakar': 'आविष्कार',
  'krnT jaIko k`aonaaolaa^jaI': 'करंट जीके क्रोनोलॉजी',
  'manaaohr khainayaaM': 'मनोहर कहानियाँ',
  'kadimbanaI': 'कादंबिनी',
  'ik`koT sama`aT': 'क्रिकेट सम्राट',
  'candamaamaa': 'चंदामामा',
  'AaoSaao Tašmsa': 'ओशो टाइम्स',
  'nanho sama`aT': 'नन्हे सम्राट',
  'kmpyaUTr saMcaar saUcanaa': 'कंप्यूटर संचार सूचना',
  'sTarDsT': 'स्टारडस्ट',
  'hMsa': 'हंस',
  'saKI jaagarNa': 'सखी जागरण',
  'vaod AmaRt': 'वेद अमृत'
};

// 3. Known Hindi Dictionary for Fast & Exact Transliteration
export const HINDI_DICTIONARY: Record<string, string> = {
  // Common Titles, Honorifics & Relations
  'shri': 'श्री',
  'shree': 'श्री',
  'mr': 'श्री',
  'mrs': 'श्रीमती',
  'smt': 'श्रीमती',
  'dr': 'डॉ.',
  'doctor': 'डॉक्टर',
  'ji': 'जी',
  'jee': 'जी',
  'advocate': 'अधिवक्ता',
  'adv': 'एडवोकेट',
  'er': 'इंजीनियर',
  'ca': 'सी.ए.',
  'prof': 'प्रोफेसर',
  
  // Common First Names
  'rajendra': 'राजेन्द्र',
  'rajendr': 'राजेन्द्र',
  'rajesh': 'राजेश',
  'rajnish': 'रजनीश',
  'rakesh': 'राकेश',
  'ramesh': 'रमेश',
  'suresh': 'सुरेश',
  'mahesh': 'महेश',
  'dinesh': 'दिनेश',
  'mukesh': 'मुकेश',
  'manish': 'मनीष',
  'sandeep': 'संदीप',
  'deepak': 'दीपक',
  'sunil': 'सुनील',
  'anil': 'अनिल',
  'vinay': 'विनय',
  'vikas': 'विकास',
  'pankaj': 'पंकज',
  'pintu': 'पिंटू',
  'mohan': 'मोहन',
  'sohan': 'सोहन',
  'rohan': 'रोहन',
  'gopal': 'गोपाल',
  'radhe': 'राधे',
  'krishna': 'कृष्ण',
  'ram': 'राम',
  'lal': 'लाल',
  'kumar': 'कुमार',
  'singh': 'सिंह',
  'prasad': 'प्रसाद',
  'chand': 'चंद',
  'chandra': 'चन्द्र',
  'bhagwati': 'भगवती',
  'yogesh': 'योगेश',
  'yogendra': 'योगेन्द्र',
  'surendra': 'सुरेन्द्र',
  'devendra': 'देवेन्द्र',
  'jitendra': 'जितेन्द्र',
  'vipendra': 'विपेन्द्र',
  'raghuvir': 'रघुवीर',
  'raghuveer': 'रघुवीर',
  'arun': 'अरुण',
  'babulal': 'बाबूलाल',
  'suman': 'सुमन',
  'sanjay': 'संजय',
  'shivshankar': 'शिवशंकर',
  'shiv': 'शिव',
  'shankar': 'शंकर',
  'guna': 'गुना',
  'shekran': 'शेखरन',
  'shekhar': 'शेखर',
  'kamal': 'कमल',
  'ashok': 'अशोक',
  'vijay': 'विजय',
  'ajay': 'अजय',
  'amit': 'अमित',
  'alok': 'आलोक',
  'anand': 'आनंद',
  'kailash': 'कैलाश',
  'prakash': 'प्रकाश',
  'om': 'ओम',
  'narayan': 'नारायण',
  'satya': 'सत्य',
  'santosh': 'संतोष',
  'subhash': 'सुभाष',
  'vinod': 'विनोद',
  'vishnu': 'विष्णु',
  'brijesh': 'बृजेश',
  'brijmohan': 'बृजमोहन',
  'tarun': 'तरुण',
  'varun': 'वरुण',
  'neeraj': 'नीरज',
  'dharmendra': 'धर्मेन्द्र',
  'harish': 'हरीश',
  'hemant': 'हेमंत',
  'kiran': 'किरण',
  'pooja': 'पूजा',
  'rekha': 'रेखा',
  'sunita': 'सुनीता',
  'anita': 'अनीता',
  'geeta': 'गीता',
  'seema': 'सीमा',

  // Common Surnames & Castes
  'agarwal': 'अग्रवाल',
  'agrawal': 'अग्रवाल',
  'gupta': 'गुप्ता',
  'sharma': 'शर्मा',
  'verma': 'वर्मा',
  'jain': 'जैन',
  'soni': 'सोनी',
  'garg': 'गर्ग',
  'mathur': 'माथुर',
  'pathak': 'पाठक',
  'pandit': 'पंडित',
  'nigam': 'निगम',
  'joshi': 'जोशी',
  'rathore': 'राठौड़',
  'shekhawat': 'शेखावत',
  'chauhan': 'चौहान',
  'dangi': 'डांगी',
  'jangid': 'जांगिड़',
  'bohra': 'बोहरा',
  'ebran': 'इबरन',
  'tak': 'टाक',
  'royal': 'रोयल',
  'bhati': 'भाटी',
  'gehlot': 'गेहलोत',
  'yadav': 'यादव',
  'mishra': 'मिश्रा',
  'pandey': 'पांडेय',
  'shukla': 'शुक्ला',
  'tiwari': 'तिवारी',
  'dubey': 'दुबे',
  'choudhary': 'चौधरी',
  'singhal': 'सिंघल',
  'mittal': 'मित्तल',
  'bansal': 'बंसल',
  'khandelwal': 'खंडेलवाल',
  'maheshwari': 'माहेश्वरी',
  'parashar': 'पाराशर',
  'meena': 'मीना',
  'rawat': 'रावत',
  'lodha': 'लोढ़ा',
  'mohammad': 'मोहम्मद',
  'khan': 'खान',
  'ali': 'अली',
  'sumit': 'सुमित',
  'rohit': 'रोहित',
  'mohit': 'मोहित',
  'rahul': 'राहुल',
  'manoj': 'मनोज',
  'pramod': 'प्रमोद',
  'pradeep': 'प्रदीप',
  'kuldeep': 'कुलदीप',
  'naveen': 'नवीन',
  'praveen': 'प्रवीण',
  'govind': 'गोविंद',
  'shyam': 'श्याम',
  'laxman': 'लक्ष्मण',
  'bharat': 'भरत',
  'hanuman': 'हनुमान',
  'ganesh': 'गणेश',
  'patel': 'पटेल',
  'bhatia': 'भाटिया',
  'malhotra': 'मल्होत्रा',
  'kapoor': 'कपूर',
  'khanna': 'खन्ना',
  'mehta': 'मेहता',
  'dadhich': 'दाधीच',
  'solanki': 'सोलंकी',
  'purohit': 'पुरोहित',
  'ojha': 'ओझा',
  'bissa': 'बिस्सा',
  'chhangani': 'छंगाणी',
  'kalla': 'कल्ला',
  'vyas': 'व्यास',
  'modi': 'मोदी',
  'swami': 'स्वामी',
  'giri': 'गिरी',
  'goswami': 'गोस्वामी',
  'bikaner': 'बीकानेर',
  'ward': 'वार्ड',
  'purani': 'पुरानी',
  'basti': 'बस्ती',
  'gangashahar': 'गंगाशहर',
  'bhinasar': 'भीनासर',
  'kote': 'कोट',
  'kotegate': 'कोटगेट',
  'gogagate': 'गोगागेट',
  'ranibazar': 'रानीबाजार',
  'sadulganj': 'सादुलगंज',
  'lalgarh': 'लालगढ़',
  'jnv': 'जेएनवी',
  'pawanpuri': 'पवनपुरी',

  // Business, Places & Address Terms
  'hotel': 'होटल',
  'shop': 'दुकान',
  'guest': 'गेस्ट',
  'house': 'हाउस',
  'ambuja': 'अम्बुजा',
  'vip': 'वीआईपी',
  'beawar': 'ब्यावर',
  'ajmer': 'अजमेर',
  'jaipur': 'जयपुर',
  'rajasthan': 'राजस्थान',
  'bengali': 'बंगाली',
  'cloth': 'क्लॉथ',
  'store': 'स्टोर',
  'market': 'मार्केट',
  'bazar': 'बाजार',
  'road': 'रोड',
  'nagar': 'नगर',
  'colony': 'कॉलोनी',
  'street': 'गली',
  'gali': 'गली',
  'chowk': 'चौक',
  'circle': 'सर्कल',
  'gate': 'गेट',
  'near': 'पास',
  'opp': 'सामने',
  'behind': 'पीछे',
  'sector': 'सेक्टर',
  'block': 'ब्लॉक',
  'plot': 'प्लॉट',
  'flat': 'फ्लैट',
  'bhawan': 'भवन',
  'niwas': 'निवास',
  'vihar': 'विहार',
  'pur': 'पुर',
  'patti': 'पट्टी',
  'chouraha': 'चौराहा',
  'marg': 'मार्ग',
  'complex': 'कॉम्प्लेक्स',
  'agency': 'एजेंसी',
  'news': 'न्यूज़',
  'patrika': 'पत्रिका',
  'bhaskar': 'भास्कर',
  'navajyoti': 'नवज्योति',
  'times': 'टाइम्स',
  'india': 'इंडिया',
  'daily': 'दैनिक',
  'morning': 'प्रातःकालीन',
  'evening': 'सायंकालीन'
};

// 4. English Initials
const ENGLISH_INITIALS: Record<string, string> = {
  'a': 'ए', 'b': 'बी', 'c': 'सी', 'd': 'डी', 'e': 'ई', 'f': 'एफ',
  'g': 'जी', 'h': 'एच', 'i': 'आई', 'j': 'जे', 'k': 'के', 'l': 'एल',
  'm': 'एम', 'n': 'एन', 'o': 'ओ', 'p': 'पी', 'q': 'क्यू', 'r': 'आर',
  's': 'एस', 't': 'टी', 'u': 'यू', 'v': 'वी', 'w': 'डब्ल्यू', 'x': 'एक्स',
  'y': 'वाई', 'z': 'ज़ेड'
};

// 5. Susha 05 Exact Regex Sub-Replacements
const SUSHA_PRE_RULES: [RegExp, string][] = [
  [/vaIAa[\x00-\xFF]?pI/gi, 'वीआईपी'],
  [/vaIAapI/gi, 'वीआईपी'],
  [/ha\]sa/gi, 'हाउस'],
  [/Aga`vaala/g, 'अग्रवाल'],
  [/rajaond`/g, 'राजेन्द्र'],
  [/yaaogaond`/g, 'योगेन्द्र'],
  [/naond`/g, 'नेन्द्र'],
  [/dovand`/g, 'देवेन्द्र'],
  [/sauryand`/g, 'सुरेन्द्र'],
  [/ijatond`/g, 'जितेन्द्र'],
  [/ivapond`/g, 'विपेन्द्र'],
  [/kumaar/gi, 'कुमार'],
  [/Samaa\-/g, 'शर्मा'],
  [/gaga\-/g, 'गर्ग'],
  [/vaarmaa\-/g, 'वर्मा'],
  [/rGauvaIr/g, 'रघुवीर'],
  [/razaOD/g, 'राठौड़'],
  [/saaonaI/g, 'सोनी'],
  [/manaIYa/g, 'मनीष'],
  [/yaaogaoSa/g, 'योगेश'],
  [/maaqaur/g, 'माथुर'],
  [/rakoSa/g, 'राकेश'],
  [/pazk/g, 'पाठक'],
  [/caMdna/g, 'चंदन'],
  [/isaMh/g, 'सिंह'],
  [/saMdIp/g, 'संदीप'],
  [/caaOhana/g, 'चौहान'],
  [/inagama/g, 'निगम'],
  [/jaOna/g, 'जैन'],
  [/dIpk/g, 'दीपक'],
  [/jaaoSaI/g, 'जोशी'],
  [/sauinala/g, 'सुनील'],
  [/raoyala/g, 'रोयल'],
  [/ivanaya/g, 'विनय'],
  [/ivakasa/g, 'विकास'],
  [/gauPta/g, 'गुप्ता'],
  [/gaPta/g, 'गुप्ता'],
  [/ebarna/g, 'इबरन'],
  [/Ambaujaa/g, 'अम्बुजा'],
  [/gaOsT/g, 'गेस्ट'],
  [/raGava/g, 'राघव'],
  [/saMjaya/g, 'संजय'],
  [/iSavaSaMkr/g, 'शिवशंकर'],
  [/gaunaa/g, 'गुना'],
  [/SaoKrna/g, 'शेखरन'],
  [/SaoKavat/g, 'शेखावत'],
  [/pMkja/g, 'पंकज'],
  [/DaMgaI/g, 'डांगी'],
  [/jaaMgaID/g, 'जांगिड़'],
  [/rajaoSa/g, 'राजेश'],
  [/rjanaISa/g, 'रजनीश'],
  [/baaohra/g, 'बोहरा'],
  [/A\$Na/g, 'अरुण'],
  [/baabaUlaala/g, 'बाबूलाल'],
  [/saumana/g, 'सुमन'],
  [/piNDt/g, 'पंडित'],
  [/maaOhmmad/g, 'मोहम्मद'],
  [/Tak/g, 'टाक'],
  [/jaI/g, 'जी'],
  [/Da\./g, 'डॉ.'],
  [/Da\s+/g, 'डॉ '],
  [/ema\s+ko/g, 'एम के'],
  [/esa\s+ko/g, 'एस के'],
  [/ko\s+ko/g, 'के के'],
  [/Aar\s+ko/g, 'आर के'],
  [/vaI\s+pI/g, 'वी पी'],
  [/ema\s+esa/g, 'एम एस'],
  [/ema\s+Aar/g, 'एम आर'],
  [/manaaoja/g, 'मनोज'],
  [/DI(\d+)?/g, 'डी$1'],
  [/saI(\d+)?/g, 'सी$1'],
  [/baI(\d+)?/g, 'बी$1'],
  [/vaI/g, 'वी'],
  [/pI/g, 'पी'],
  [/ko/g, 'के'],
  [/esa/g, 'एस'],
  [/ema/g, 'एम'],
  [/Aar/g, 'आर']
];

const SUSHA_CHARS: [string, string][] = [
  ['Aao', 'ओ'], ['AaO', 'औ'], ['Aa', 'आ'], ['A', 'अ'],
  ['ena', 'एन'], ['esa', 'एस'], ['ema', 'एम'], ['Aar', 'आर'],
  ['ko', 'के'], ['DI', 'डी'], ['saI', 'सी'], ['baI', 'बी'],
  ['e', 'ए'], ['E', 'ऐ'], ['aao', 'ो'], ['ao', 'ो'], ['o', 'े'], ['O', 'ै'],
  ['aa', 'ा'], ['aaO', 'ौ'], ['aO', 'ौ'],
  ['a', ''], ['I', 'ी'], ['u', 'ु'], ['U', 'ू'],
  ['k', 'क'], ['K', 'ख'], ['g', 'ग'], ['G', 'घ'],
  ['c', 'च'], ['C', 'छ'], ['j', 'ज'], ['J', 'झ'],
  ['T', 'ट'], ['z', 'ठ'], ['D', 'ड'], ['Z', 'ढ'], ['N', 'ण'],
  ['t', 'त'], ['q', 'थ'], ['d', 'द'], ['Q', 'ध'], ['n', 'न'],
  ['p', 'प'], ['P', 'फ'], ['b', 'ब'], ['B', 'भ'], ['m', 'म'],
  ['y', 'य'], ['r', 'र'], ['l', 'ल'], ['v', 'व'], ['w', 'व'],
  ['S', 'श'], ['Y', 'ष'], ['s', 'स'], ['h', 'ह'],
  ['M', 'ं'], ['^', 'ँ'], [':', 'ः'], ['`', '्र'], ['-', 'र्']
];

/**
 * Decodes legacy 2008 Susha 05 ASCII font strings to Unicode Devanagari Hindi
 */
export function sushaToUnicode(text: string): string {
  if (!text) return '';
  if (/[\u0900-\u097F]/.test(text)) return text;

  let s = text.replace(/[\x00-\x1f\x7f-\xff\uFFFD]/g, '');
  s = s.replace(/vaIAa.*?pI/gi, 'वीआईपी');
  for (const [pattern, rep] of SUSHA_PRE_RULES) {
    s = s.replace(pattern, rep);
  }

  const words = s.split(' ');
  const outWords = words.map(w => {
    if (!w || /[\u0900-\u097F]/.test(w)) return w;
    let cw = w.replace(/i([kKgGcCjJTzZDZNtqdnpPmbBmyrlvwsSYh])/g, '$1ि');
    let res = '';
    let i = 0;
    while (i < cw.length) {
      if (cw.charCodeAt(i) >= 0x0900 && cw.charCodeAt(i) <= 0x097F) {
        res += cw[i++];
        continue;
      }
      let matched = false;
      for (const [k, v] of SUSHA_CHARS) {
        if (cw.startsWith(k, i)) {
          res += v;
          i += k.length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        res += cw[i++];
      }
    }
    return res.replace(/([क-ह])र्/g, 'र्$1');
  });

  return outWords.join(' ');
}

/**
 * Phonetic transliteration from English to Hindi Unicode
 */
export function englishToHindiPhonetic(str: any): string {
  const s = typeof str === 'string' ? str : (str != null ? String(str) : '');
  if (!s || !s.trim()) return '';
  const trimmed = s.trim().toLowerCase();
  
  // Check known publications
  if (KNOWN_PUBLICATIONS_HINDI[trimmed]) {
    return KNOWN_PUBLICATIONS_HINDI[trimmed];
  }

  // Word-by-word transliteration
  const words = s.split(/(\s+)/);
  const converted = words.map((w: string) => {
    if (/^\s+$/.test(w)) return w;
    const clean = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!clean) return w;

    // Digits
    if (/^\d+$/.test(clean)) return clean;

    // Single English initial (e.g. N -> एन, K -> के, C -> सी)
    if (clean.length === 1 && ENGLISH_INITIALS[clean]) {
      return ENGLISH_INITIALS[clean];
    }

    // Common words & names from dictionary
    if (HINDI_DICTIONARY[clean]) {
      return HINDI_DICTIONARY[clean];
    }

    // Compound like C17 or D25 or 5RHB
    if (/^[a-z]\d+$/i.test(w)) {
      const charPart = w[0].toLowerCase();
      const numPart = w.slice(1);
      return (ENGLISH_INITIALS[charPart] || charPart) + numPart;
    }

    return transliterateSingleWord(clean) || w;
  });

  return converted.join('');
}

/**
 * Transliterates a single phonetic English token to Devanagari Hindi
 */
function transliterateSingleWord(w: string): string {
  if (!w) return '';
  const lower = w.toLowerCase();
  if (HINDI_DICTIONARY[lower]) return HINDI_DICTIONARY[lower];

  // Specific common endings in Indian names
  if (lower.endsWith('singh')) return transliterateSingleWord(lower.slice(0, -5)) + ' सिंह';
  if (lower.endsWith('kumar')) return transliterateSingleWord(lower.slice(0, -5)) + ' कुमार';
  if (lower.endsWith('lal')) return transliterateSingleWord(lower.slice(0, -3)) + ' लाल';
  if (lower.endsWith('chand')) return transliterateSingleWord(lower.slice(0, -5)) + ' चंद';
  if (lower.endsWith('prasad')) return transliterateSingleWord(lower.slice(0, -6)) + ' प्रसाद';

  let res = lower
    .replace(/shh/g, 'ष्')
    .replace(/sh/g, 'श')
    .replace(/chh/g, 'छ')
    .replace(/ch/g, 'च')
    .replace(/tth/g, 'ठ')
    .replace(/thh/g, 'ठ')
    .replace(/th/g, 'थ')
    .replace(/ddh/g, 'ढ')
    .replace(/dhh/g, 'ढ')
    .replace(/dh/g, 'ध')
    .replace(/tt/g, 'ट')
    .replace(/dd/g, 'ड')
    .replace(/bh/g, 'भ')
    .replace(/kh/g, 'ख')
    .replace(/gh/g, 'घ')
    .replace(/ph/g, 'फ')
    .replace(/jh/g, 'झ')
    .replace(/ndra/g, 'न्द्र')
    .replace(/ndr/g, 'न्द्र')
    .replace(/endra/g, 'ेन्द्र')
    .replace(/dra/g, 'द्र')
    .replace(/tra/g, 'त्र')
    .replace(/ksha/g, 'क्ष')
    .replace(/ksh/g, 'क्ष')
    .replace(/gya/g, 'ज्ञ')
    .replace(/gy/g, 'ज्ञ')
    .replace(/shra/g, 'श्र')
    .replace(/shr/g, 'श्र')
    .replace(/aa/g, 'ा')
    .replace(/ee/g, 'ी')
    .replace(/ii/g, 'ी')
    .replace(/oo/g, 'ू')
    .replace(/uu/g, 'ू')
    .replace(/ai/g, 'ै')
    .replace(/ay/g, 'ै')
    .replace(/au/g, 'ौ')
    .replace(/av/g, 'ौ')
    .replace(/k/g, 'क')
    .replace(/g/g, 'ग')
    .replace(/j/g, 'ज')
    .replace(/t/g, 'त')
    .replace(/d/g, 'द')
    .replace(/n/g, 'न')
    .replace(/p/g, 'प')
    .replace(/b/g, 'ब')
    .replace(/m/g, 'म')
    .replace(/y/g, 'य')
    .replace(/r/g, 'र')
    .replace(/l/g, 'ल')
    .replace(/v/g, 'व')
    .replace(/w/g, 'व')
    .replace(/s/g, 'स')
    .replace(/h/g, 'ह')
    .replace(/z/g, 'ज़')
    .replace(/f/g, 'फ़')
    .replace(/a/g, 'ा')
    .replace(/i/g, 'ि')
    .replace(/u/g, 'ु')
    .replace(/e/g, 'े')
    .replace(/o/g, 'ो');

  // Fix initial vowel when word starts with a matra
  if (lower.startsWith('aa')) {
    res = 'आ' + res.slice(1);
  } else if (res.startsWith('ा')) {
    res = 'अ' + res.slice(1);
  } else if (res.startsWith('ि') || res.startsWith('ी')) {
    res = (lower.startsWith('ee') || lower.startsWith('ii')) ? ('ई' + res.slice(1)) : ('इ' + res.slice(1));
  } else if (res.startsWith('ु') || res.startsWith('ू')) {
    res = (lower.startsWith('oo') || lower.startsWith('uu')) ? ('ऊ' + res.slice(1)) : ('उ' + res.slice(1));
  } else if (res.startsWith('े') || res.startsWith('ै')) {
    res = (lower.startsWith('ai') || lower.startsWith('ay')) ? ('ऐ' + res.slice(1)) : ('ए' + res.slice(1));
  } else if (res.startsWith('ो') || res.startsWith('ौ')) {
    res = (lower.startsWith('au') || lower.startsWith('av')) ? ('औ' + res.slice(1)) : ('ओ' + res.slice(1));
  }

  return res;
}

const KNOWN_PHRASES_MAP: Record<string, string> = {
  'whatsapp sample': 'व्हाट्सएप सैम्पल',
  'whatsapp': 'व्हाट्सएप',
  'sample': 'सैम्पल',
  'aryan news agency': 'आर्यन न्यूज़ एजेंसी',
  'main market': 'मेन मार्केट',
  'beawar': 'ब्यावर',
  'rajendra agarwal': 'राजेन्द्र अग्रवाल',
  'suresh sharma': 'सुरेश शर्मा',
  'rameshwar lal': 'रामेश्वर लाल',
};

/**
 * Master function: Converts Susha 05, Kruti Dev, or English string to clean Unicode Devanagari Hindi
 */
export function cleanOrTransliterateHindi(rawHindi: any, englishName: any): string {
  const engStr = typeof englishName === 'string' ? englishName : (englishName != null ? String(englishName) : '');
  const rawHindiStr = typeof rawHindi === 'string' ? rawHindi : (rawHindi != null ? String(rawHindi) : '');
  const engTrimmed = engStr.trim();
  const engLower = engTrimmed.toLowerCase();
  const rawHindiTrimmed = rawHindiStr.trim();

  if (KNOWN_PHRASES_MAP[engLower]) {
    return KNOWN_PHRASES_MAP[engLower];
  }

  // Check known publications
  if (KNOWN_PUBLICATIONS_HINDI[engLower]) {
    return KNOWN_PUBLICATIONS_HINDI[engLower];
  }

  // Specific check for Whatsapp in rawHindi or English
  if (engLower.includes('whatsapp') || (rawHindiTrimmed && (rawHindiTrimmed.includes('vyaaTsePp') || rawHindiTrimmed.includes('वयाटस')))) {
    return 'व्हाट्सएप सैम्पल';
  }

  // If already contains genuine Unicode Hindi characters
  if (rawHindiTrimmed && /[\u0900-\u097F]/.test(rawHindiTrimmed)) {
    return rawHindiTrimmed;
  }

  // Check Kruti Dev map
  if (rawHindiTrimmed && KRUTI_DEV_MAP[rawHindiTrimmed]) {
    return KRUTI_DEV_MAP[rawHindiTrimmed];
  }

  // Check Susha font decoding if rawHindi looks like Susha ASCII
  if (rawHindiTrimmed && rawHindiTrimmed.length > 0) {
    const decoded = sushaToUnicode(rawHindiTrimmed);
    if (decoded && /[\u0900-\u097F]/.test(decoded)) {
      return decoded;
    }
  }

  // Check English phonetic transliteration
  if (engTrimmed.length > 0) {
    return englishToHindiPhonetic(engTrimmed);
  }

  return rawHindiTrimmed || '';
}

/**
 * Asynchronous transliteration helper: calls /api/transliterate (with Google Input Tools + fallback)
 * or falls back to offline phonetic engine if offline or server-side.
 */
export async function transliterateToHindiAsync(englishText: any): Promise<string> {
  const clean = typeof englishText === 'string' ? englishText.trim() : (englishText != null ? String(englishText).trim() : '');
  if (!clean) return '';

  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(`/api/transliterate?text=${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.text) {
          return data.text;
        }
      }
    } catch {
      // network error or offline -> fallback
    }
  }

  return cleanOrTransliterateHindi('', clean);
}
