// Complete Authentic Susha 05, Kruti Dev 010, and High-Accuracy Phonetic Hindi Transliteration Engine
// Specifically engineered for Aryan News Agency (Beawar, Rajasthan)

// 1. Direct Known Publication Dictionary (Only genuine Hindi publications)
// Note: English publications (e.g. Times of India, Economic Times, Outlook Business, Today Eng)
// MUST remain in English as per business requirements.
export const KNOWN_PUBLICATIONS_HINDI: Record<string, string> = {
  'rajasthan patrika': 'राजस्थान पत्रिका',
  'patrika': 'राजस्थान पत्रिका',
  'dainik bhaskar': 'दैनिक भास्कर',
  'bhaskar': 'दैनिक भास्कर',
  'zindia today hindi': 'इंडिया टुडे (हिंदी)',
  'india today hindi': 'इंडिया टुडे (हिंदी)',
  'today hindi': 'टुडे हिन्दी',
  'ztoday hindi': 'टुडे हिन्दी',
  'meri saheli': 'मेरी सहेली',
  'grihashobha': 'गृहशोभा',
  'vanita': 'वनिता',
  'aha zindgi': 'अहा ज़िंदगी',
  'aha zindagi': 'अहा ज़िंदगी',
  'sarita': 'सरिता',
  'saras salil': 'सरस सलिल',
  'punjab kesari': 'पंजाब केसरी',
  'nafa nuksan': 'नफा नुकसान',
  'dainik navajyoti': 'दैनिक नवज्योति',
  'navajyoti': 'नवज्योति',
  'navjyoti': 'नवज्योति',
  'pratiyogita darpan': 'प्रतियोगिता दर्पण',
  'champak(h)': 'चंपक',
  'lotpot': 'लोटपोट',
  'outlook(h)': 'आउटलुक',
  'vyapar': 'व्यापार',
  'balhans': 'बालहंस',
  'rojgar sandesh': 'रोजगार संदेश',
  'rojgar samachar': 'रोजगार समाचार',
  'balbhaskar': 'बाल भास्कर',
  'bal bhaskar': 'बाल भास्कर',
  'chotumotu': 'छोटू मोटू',
  'dalal street (h)': 'दलाल स्ट्रीट',
  'grihalaxmi': 'गृहलक्ष्मी',
  'grihalakshmi': 'गृहलक्ष्मी',
  'vigyan pragati': 'विज्ञान प्रगति',
  'suman saurabh': 'सुमन सौरभ',
  'nandan': 'नंदन',
  'yojna': 'योजना',
  'mukta': 'मुक्ता',
  'kurushetra': 'कुरुक्षेत्र',
  'kurukshetra': 'कुरुक्षेत्र',
  'awishkar': 'आविष्कार',
  'current gk chronology': 'करंट जीके क्रोनोलॉजी',
  'manohar khaniyan': 'मनोहर कहानियाँ',
  'kadambini': 'कादंबिनी',
  'cricket samrat': 'क्रिकेट सम्राट',
  'chandamama(h)': 'चंदामामा',
  'nanhe samrat': 'नन्हे सम्राट',
  'computer sanchar suchna': 'कंप्यूटर संचार सूचना',
  'stardust(h)': 'स्टारडस्ट',
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
  'miss': 'सुश्री',
  'dr': 'डॉ.',
  'doctor': 'डॉक्टर',
  'ji': 'जी',
  'jee': 'जी',
  'advocate': 'एडवोकेट',
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
  'deepu': 'दीपू',
  'sunil': 'सुनील',
  'anil': 'अनिल',
  'vinay': 'विनय',
  'vikas': 'विकास',
  'vivek': 'विवेक',
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
  'chandradev': 'चन्द्रदेव',
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
  'omsingh': 'ओमसिंह',
  'narayan': 'नारायण',
  'ravinarayan': 'रविनारायण',
  'satya': 'सत्य',
  'satyam': 'सत्यम',
  'santosh': 'संतोष',
  'subhash': 'सुभाष',
  'subodh': 'सुबोध',
  'kaushik': 'कौशिक',
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
  'deepika': 'दीपिका',
  'kamla': 'कमला',
  'charan': 'चारण',
  'pramod': 'प्रमोद',
  'kunal': 'कुणाल',
  'samanta': 'सामंत',
  'ritesh': 'रीतेश',
  'dhuniya': 'धूनिया',
  'upadhyay': 'उपाध्याय',
  'parashar': 'पाराशर',
  'jijyasu': 'जिज्ञासु',
  'saurabh': 'सौरभ',
  'pragyan': 'प्रज्ञान',
  'lakshay': 'लक्ष्य',
  'lakshya': 'लक्ष्य',
  'lakshman': 'लक्ष्मण',
  'laxman': 'लक्ष्मण',
  'akshay': 'अक्षय',
  'daksh': 'दक्ष',
  'dixit': 'दीक्षित',
  'deexit': 'दीक्षित',
  'minakshi': 'मीनाक्षी',
  'meenakshi': 'मीनाक्षी',

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
  'sankhla': 'सांखला',
  'saxena': 'सक्सेना',
  'kumawat': 'कुमावत',
  'dadich': 'दाधीच',
  'dadhich': 'दाधीच',
  'solanki': 'सोलंकी',
  'purohit': 'पुरोहित',
  'shrivastava': 'श्रीवास्तव',
  'srivastava': 'श्रीवास्तव',

  // Institutions, Banks, Businesses & Common Words
  'state': 'स्टेट',
  'bank': 'बैंक',
  'of': 'ऑफ',
  'city': 'सिटी',
  'andheri': 'अंधेरी',
  'devri': 'देवड़ी',
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
  'pradeep': 'प्रदीप',
  'kuldeep': 'कुलदीप',
  'naveen': 'नवीन',
  'praveen': 'प्रवीण',
  'govind': 'गोविंद',
  'shyam': 'श्याम',
  'bharat': 'भरत',
  'hanuman': 'हनुमान',
  'ganesh': 'गणेश',
  'patel': 'पटेल',
  'bhatia': 'भाटिया',
  'malhotra': 'मल्होत्रा',
  'kapoor': 'कपूर',
  'khanna': 'खन्ना',
  'mehta': 'मेहता',
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

  // Places, Addresses & Commercial Terms
  'hotel': 'होटल',
  'shop': 'दुकान',
  'guest': 'गेस्ट',
  'house': 'हाउस',
  'electric': 'इलेक्ट्रिक',
  'electricals': 'इलेक्ट्रिकल्स',
  'provision': 'प्रोविजन',
  'store': 'स्टोर',
  'stores': 'स्टोर्स',
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
  'pass': 'पास',
  'ke': 'के',
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
  'evening': 'सायंकालीन',
  'ambuja': 'अम्बुजा',
  'vip': 'वीआईपी',
  'beawar': 'ब्यावर',
  'ajmer': 'अजमेर',
  'jaipur': 'जयपुर',
  'rajasthan': 'राजस्थान',
  'bengali': 'बंगाली',
  'cloth': 'क्लॉथ',
  'ok': 'ओके',
  'plus': 'प्लस',
  'bob': 'बीओबी',
  'sbbj': 'एसबीबीजे',
  'sbi': 'एसबीआई',
  'pnb': 'पीएनबी'
};

// 4. English Single Letters / Initials (Capital and lowercase)
const ENGLISH_INITIALS: Record<string, string> = {
  'a': 'ए', 'b': 'बी', 'c': 'सी', 'd': 'डी', 'e': 'ई', 'f': 'एफ',
  'g': 'जी', 'h': 'एच', 'i': 'आई', 'j': 'जे', 'k': 'के', 'l': 'एल',
  'm': 'एम', 'n': 'एन', 'o': 'ओ', 'p': 'पी', 'q': 'क्यू', 'r': 'आर',
  's': 'एस', 't': 'टी', 'u': 'यू', 'v': 'वी', 'w': 'डब्ल्यू', 'x': 'एक्स',
  'y': 'वाई', 'z': 'ज़ेड'
};

// 5. Authentic Susha 05 Decoding Dictionary & Regex Replacements
const SUSHA_PATTERNS: [RegExp, string][] = [
  [/laxya/g, 'लक्ष्य'],
  [/Axaya/g, 'अक्षय'],
  [/BaaTI/g, 'भाटी'],
  [/vyaaTsePp/gi, 'व्हाट्सएप'],
  [/vyaaT\s*sePp/gi, 'व्हाट्सएप'],
  [/saOmpla/gi, 'सैम्पल'],
  [/e[nN]Trp`*a?[\uFFFD]?jaosa/gi, 'एंटरप्राइजेज'],
  [/enaTrp`*a?[\uFFFD]?jaosa/gi, 'एंटरप्राइजेज'],
  [/TO@saTa?[\uFFFD]?lsa/gi, 'टेक्सटाइल्स'],
  [/faa?[\uFFFD]?naOnsa/gi, 'फाइनेंस'],
  [/Aao?Taomaao?baa?[\uFFFD]?lsa/gi, 'ऑटोमोबाइल'],
  [/maaobaa?[\uFFFD]?la/gi, 'मोबाइल'],
  [/saa?[\uFFFD]?ikla/gi, 'साइकिल'],
  [/hlavaa?[\uFFFD]?/gi, 'हलवाई'],
  [/maunnaaBaa?[\uFFFD]?/gi, 'मुन्नाभाई'],
  [/Baa[\uFFFD]/g, 'भाई'],
  [/[\uFFFD]NDsT[`,\/]+Isa?/gi, 'इंडस्ट्रीज'],
  [/\[NDsT[`,\/]+Isa?/gi, 'इंडस्ट्रीज'],
  [/[\uFFFD]Svar/g, 'ईश्वर'],
  [/[\uFFFD]laOi@T.*?k/gi, 'इलेक्ट्रिक'],
  [/[\uFFFD]laOkiT`k/gi, 'इलेक्ट्रिक'],
  [/\[laOi@Tk/gi, 'इलेक्ट्रिक'],
  [/laa?[\uFFFD]?ba`orI/gi, 'लाइब्रेरी'],
  [/laa?[\uFFFD]?nsa/gi, 'लायंस'],
  [/laa?[\uFFFD]?T/gi, 'लाइट'],
  [/vaa?[\uFFFD]?na/gi, 'वाइन'],
  [/laa?[\uFFFD]?f/gi, 'लाइफ'],
  [/jaI[\uFFFD]/gi, 'जी'],
  [/vaIAa[\x00-\xFF\uFFFD]?pI/gi, 'वीआईपी'],
  [/vaIAapI/gi, 'वीआईपी'],
  [/ha\]sa/gi, 'हाउस'],
  [/Aga`vaala/g, 'अग्रवाल'],
  [/rajaond`/g, 'राजेन्द्र'],
  [/yaaogaond`/g, 'योगेन्द्र'],
  [/naond`/g, 'नेन्द्र'],
  [/dovand`/g, 'देवेन्द्र'],
  [/dova/g, 'देव'],
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
  [/dIpU/g, 'दीपू'],
  [/dIpIka/g, 'दीपिका'],
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
  [/kmpnaI/g, 'कम्पनी'],
  [/\]paQyaaya/g, 'उपाध्याय'],
  [/sa%yama/g, 'सत्यम'],
  [/saaMKlaa/g, 'सांखला'],
  [/eDvaaokoT/g, 'एडवोकेट'],
  [/Plasa/g, 'प्लस'],
  [/Aaoko/g, 'ओके'],
  [/\[laOi@T.*?k/g, 'इलेक्ट्रिक'],
  [/\[laOi@Tk/g, 'इलेक्ट्रिक'],
  [/kmalaa/g, 'कमला'],
  [/p``aoivajana/g, 'प्रोविजन'],
  [/p`aoivajana/g, 'प्रोविजन'],
  [/p``/g, 'प्र'],
  [/p`/g, 'प्र'],
  [/d``/g, 'द्र'],
  [/cand``/g, 'चन्द्र'],
  [/cand`/g, 'चन्द्र'],
  [/saksaonaa/g, 'सक्सेना'],
  [/saubaaoQa/g, 'सुबोध'],
  [/kaOiSak/g, 'कौशिक'],
  [/kuNaala/g, 'कुणाल'],
  [/saamanta/g, 'सामंत'],
  [/dadIca/g, 'दाधीच'],
  [/AaomaisaMh/g, 'ओमसिंह'],
  [/caarNa/g, 'चारण'],
  [/EaIvaastva/g, 'श्रीवास्तव'],
  [/EaI/g, 'श्री'],
  [/ko\s+pasa/g, 'के पास'],
  [/baIAaobaI/g, 'बीओबी'],
  [/Aaresa[\uFFFD]?baI/gi, 'आरएसईबी'],
  [/esabaIAa?[\uFFFD]?/gi, 'एसबीआई'],
  [/Aa?[\uFFFD]?AaosaI/gi, 'आईओसी'],
  [/ef(\d+)?/gi, 'एफ$1'],
  [/DI(\d+)?/g, 'डी$1'],
  [/saI(\d+)?/g, 'सी$1'],
  [/baI(\d+)?/g, 'बी$1'],
  [/[\uFFFD](\d+)/g, 'ई$1'],
  [/[\uFFFD]\s*(\d+)/g, 'ई $1'],
  [/[\uFFFD]/g, 'ई'],
  [/ema\s+ko/g, 'एम के'],
  [/esa\s+ko/g, 'एस के'],
  [/ko\s+ko/g, 'के के'],
  [/Aar\s+ko/g, 'आर के'],
  [/vaI\s+pI/g, 'वी पी'],
  [/ema\s+esa/g, 'एम एस'],
  [/ema\s+Aar/g, 'एम आर'],
  [/manaaoja/g, 'मनोज'],
  [/vaI/g, 'वी'],
  [/pI/g, 'पी'],
  [/ko/g, 'के'],
  [/esa/g, 'एस'],
  [/ema/g, 'एम'],
  [/Aar/g, 'आर']
];

const SUSHA_CHARS: [string, string][] = [
  ['EaI', 'श्री'], ['Ea', 'श्र'],
  ['Aao', 'ओ'], ['AaO', 'औ'], ['Aa', 'आ'], ['A', 'अ'],
  ['ena', 'एन'], ['esa', 'एस'], ['ema', 'एम'], ['Aar', 'आर'],
  ['ko', 'के'], ['DI', 'डी'], ['saI', 'सी'], ['baI', 'बी'],
  ['e', 'ए'], ['E', 'ऐ'], ['aao', 'ो'], ['ao', 'ो'], ['o', 'े'], ['O', 'ै'],
  ['aaO', 'ौ'], ['aO', 'ौ'], ['aa', 'ा'],
  ['a', ''], ['I', 'ी'], ['u', 'ु'], ['U', 'ू'],
  ['k', 'क'], ['K', 'ख'], ['g', 'ग'], ['G', 'घ'],
  ['c', 'च'], ['C', 'छ'], ['j', 'ज'], ['J', 'झ'],
  ['T', 'ट'], ['z', 'ठ'], ['D', 'ड'], ['Z', 'ढ'], ['N', 'ण'],
  ['t', 'त'], ['q', 'थ'], ['d', 'द'], ['Q', 'ध'], ['n', 'न'],
  ['p', 'प'], ['P', 'फ'], ['f', 'फ'], ['b', 'ब'], ['B', 'भ'], ['m', 'म'],
  ['y', 'य'], ['r', 'र'], ['l', 'ल'], ['v', 'व'], ['w', 'व'],
  ['S', 'श'], ['Y', 'ष'], ['s', 'स'], ['h', 'ह'],
  ['x', 'क्ष'], ['X', 'क्ष'],
  ['~', 'त्र'], ['&', 'ज्ञ'], ['@', 'क्'], ['%', 'त्'],
  ['$', 'रु'], ['`', '्र'], ['-', 'र्'], [':', 'ः'], ['^', 'ँ'], ['M', 'ं'],
  ['[', 'इ'], ['{', 'ई'], [']', 'उ'], ['}', 'ऊ']
];

/**
 * Decodes legacy 2008 Susha 05 ASCII font strings to clean Unicode Devanagari Hindi
 */
export function sushaToUnicode(text: string): string {
  if (!text) return '';
  if (/[\u0900-\u097F]/.test(text) && !/[a-zA-Z]/.test(text)) return text;

  let s = text.replace(/[\x00-\x1f\x7f-\xff]/g, '');
  for (const [pattern, rep] of SUSHA_PATTERNS) {
    s = s.replace(pattern, rep);
  }

  const words = s.split(' ');
  const outWords = words.map(w => {
    if (!w) return w;
    let cw = w.replace(/i([kKgGcCjJTzZDZNtqdnpPmbBmyrlvwsSYhf@%]+)/g, (_, c) => c + '\u093F');
    let res = '';
    let i = 0;
    while (i < cw.length) {
      if (cw.charCodeAt(i) >= 0x0900 && cw.charCodeAt(i) <= 0x097F) {
        res += cw[i++];
        continue;
      }
      if (/[0-9\s.,\/#!$%\^&\*;:{}=\-_~() ]/.test(cw[i]) && !SUSHA_CHARS.some(([k]) => k === cw[i])) {
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
 * High-Accuracy Phonetic transliteration from English to Hindi Unicode
 */
export function englishToHindiPhonetic(str: any): string {
  const s = typeof str === 'string' ? str : (str != null ? String(str) : '');
  if (!s || !s.trim()) return '';
  const trimmed = s.trim().toLowerCase();
  
  // Check known publications first
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

    // Single English initial (e.g. N -> एन, K -> के, C -> सी, F -> एफ)
    if (clean.length === 1 && ENGLISH_INITIALS[clean]) {
      return ENGLISH_INITIALS[clean];
    }

    // Common words & names from dictionary
    if (HINDI_DICTIONARY[clean]) {
      return HINDI_DICTIONARY[clean];
    }

    // Compound like C17 or D25 or F4 or 5RHB
    if (/^[a-z]\d+$/i.test(clean)) {
      const charPart = clean[0];
      const numPart = clean.slice(1);
      return (ENGLISH_INITIALS[charPart] || charPart) + numPart;
    }
    if (/^\d+[a-z]+$/i.test(clean)) {
      const numMatch = clean.match(/^\d+/)?.[0] || '';
      const textPart = clean.slice(numMatch.length);
      const translitText = HINDI_DICTIONARY[textPart] || transliterateSingleWord(textPart) || textPart;
      return numMatch + ' ' + translitText;
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
  if (lower.endsWith('ji') && lower.length > 2) return transliterateSingleWord(lower.slice(0, -2)) + ' जी';
  if (lower.endsWith('jee') && lower.length > 3) return transliterateSingleWord(lower.slice(0, -3)) + ' जी';

  let res = lower
    .replace(/electric/g, 'इलेक्ट्रिक')
    .replace(/provision/g, 'प्रोविजन')
    .replace(/stores?/g, 'स्टोर')
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
    .replace(/ck/g, 'क')
    .replace(/c(?=[eiy])/g, 'स')
    .replace(/c/g, 'क')
    .replace(/q/g, 'क')
    .replace(/x/g, 'क्स')
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
  'whatsapp sample 4': 'व्हाट्सएप सैम्पल',
  'whatsapp': 'व्हाट्सएप',
  'sample': 'सैम्पल',
  'aryan news agency': 'आर्यन न्यूज़ एजेंसी',
  'main market': 'मेन मार्केट',
  'beawar': 'ब्यावर',
  'rajendra agarwal': 'राजेन्द्र अग्रवाल',
  'suresh sharma': 'सुरेश शर्मा',
  'rameshwar lal': 'रामेश्वर लाल',
  // Banks & Organizations
  'state bank of india beawar city': 'स्टेट बैंक ऑफ इंडिया ब्यावर सिटी',
  'state bank of india beawar city 1': 'स्टेट बैंक ऑफ इंडिया ब्यावर सिटी',
  'state bank of india': 'स्टेट बैंक ऑफ इंडिया',
  'state bank of india andheri devri': 'स्टेट बैंक ऑफ इंडिया अंधेरी देवड़ी',
  'state bank of india ii 4': 'स्टेट बैंक ऑफ इंडिया II',
  'state bank of bikaner & jaipur ajmer road': 'स्टेट बैंक ऑफ बीकानेर एंड जयपुर अजमेर रोड',
  'state bank of bikaner & jaipur ajmer road 5': 'स्टेट बैंक ऑफ बीकानेर एंड जयपुर अजमेर रोड',
  'state bank of bikaner and jaipur ajmer road': 'स्टेट बैंक ऑफ बीकानेर एंड जयपुर अजमेर रोड',
  'state bank of bikaner & jaipur': 'स्टेट बैंक ऑफ बीकानेर एंड जयपुर',
  'state bank of bikaner and jaipur': 'स्टेट बैंक ऑफ बीकानेर एंड जयपुर',
  'punjab national bank': 'पंजाब नेशनल बैंक',
  'bank of baroda': 'बैंक ऑफ बड़ौदा',
  'central bank of india': 'सेंट्रल बैंक ऑफ इंडिया',
  'union bank of india': 'यूनियन बैंक ऑफ इंडिया',
  'canara bank': 'केनरा बैंक',
  'uco bank': 'यूको बैंक'
};

/**
 * Master function: Converts Susha 05, Kruti Dev, or English string to clean Unicode Devanagari Hindi
 */
export function cleanOrTransliterateHindi(rawHindi: any, englishName: any): string {
  const engStr = typeof englishName === 'string' ? englishName : (englishName != null ? String(englishName) : '');
  const rawHindiStr = typeof rawHindi === 'string' ? rawHindi : (rawHindi != null ? String(rawHindi) : '');
  const engTrimmed = engStr.trim();
  const engLower = engTrimmed.toLowerCase();
  const engNoTrailingNum = engLower.replace(/\s+\d+$/, '').trim();
  let rawHindiCleaned = rawHindiStr.trim()
    .replace(/[\ufffd\x00-\x1f\x7f-\xff]/g, '') // remove corrupted bytes
    .replace(/\s*[0-9]{5,}\s*/g, ' ') // remove stray telephone/UDISE/school code numbers (5+ digits)
    .replace(/\\',.*$/, '') // remove SQL dump artifacts
    .trim();

  // 1. If rawHindi is available in database, decode and prioritize it:
  if (rawHindiCleaned && rawHindiCleaned.length > 0) {
    // If rawHindi is already genuine Unicode Hindi without replacement characters, preserve it directly!
    if (/[\u0900-\u097F]/.test(rawHindiCleaned) && !/[a-zA-Z]/.test(rawHindiCleaned)) {
      return rawHindiCleaned;
    }

    // Check Kruti Dev map
    if (KRUTI_DEV_MAP[rawHindiCleaned]) {
      return KRUTI_DEV_MAP[rawHindiCleaned];
    }

    // Decode legacy Susha 05 font ASCII string directly from database
    const sushaDecoded = sushaToUnicode(rawHindiCleaned);
    if (sushaDecoded && /[\u0900-\u097F]/.test(sushaDecoded) && !/[a-zA-Z]/.test(sushaDecoded)) {
      return sushaDecoded;
    }
  }

  // 2. Check exact known phrases (and known publications) before phonetic fallback
  if (KNOWN_PUBLICATIONS_HINDI[engLower]) {
    return KNOWN_PUBLICATIONS_HINDI[engLower];
  }
  if (KNOWN_PUBLICATIONS_HINDI[engNoTrailingNum]) {
    return KNOWN_PUBLICATIONS_HINDI[engNoTrailingNum];
  }
  if (KNOWN_PHRASES_MAP[engLower]) {
    return KNOWN_PHRASES_MAP[engLower];
  }
  if (KNOWN_PHRASES_MAP[engNoTrailingNum]) {
    return KNOWN_PHRASES_MAP[engNoTrailingNum];
  }

  // 3. If rawHindi is present but contained leftover characters or failed strict validation, try sushaToUnicode again
  if (rawHindiCleaned && rawHindiCleaned.length > 0) {
    const sushaAttempt = sushaToUnicode(rawHindiCleaned);
    if (sushaAttempt && /[\u0900-\u097F]/.test(sushaAttempt)) {
      return sushaAttempt.replace(/[a-zA-Z]/g, '').replace(/\s*[0-9]{5,}\s*/g, ' ').trim();
    }
  }

  // 4. For new entries without raw database Hindi, transliterate phonetically from English
  if (engTrimmed.length > 0) {
    return englishToHindiPhonetic(engTrimmed);
  }

  return rawHindiCleaned || '';
}

/**
 * Returns a TRUSTWORTHY Devanagari Hindi name, or '' when none is available.
 *
 * Unlike cleanOrTransliterateHindi, this NEVER falls back to lossy phonetic
 * guessing from the English name. It only returns Hindi that came from real
 * data: genuine Unicode already in the DB, a legacy Kruti Dev / Susha 05 decode,
 * or a curated known phrase. Everything else returns '' so the caller can safely
 * fall back to the English name instead of printing a wrong/garbled Hindi name.
 */
export function getReliableHindiName(rawHindi: any, englishName: any): string {
  const rawHindiStr = typeof rawHindi === 'string' ? rawHindi : (rawHindi != null ? String(rawHindi) : '');
  const engStr = typeof englishName === 'string' ? englishName : (englishName != null ? String(englishName) : '');
  const engLower = engStr.trim().toLowerCase();
  const engNoTrailingNum = engLower.replace(/\s+\d+$/, '').trim();

  const rawHindiCleaned = rawHindiStr.trim()
    .replace(/[�\x00-\x1f\x7f-\xff]/g, '') // strip corrupted bytes
    .replace(/\s*[0-9]{5,}\s*/g, ' ')           // strip stray 5+ digit codes
    .replace(/\\',.*$/, '')                        // strip SQL dump artifacts
    .trim();

  // 1. Genuine Unicode Devanagari already stored in the database (most reliable)
  if (rawHindiCleaned && /[ऀ-ॿ]/.test(rawHindiCleaned) && !/[a-zA-Z]/.test(rawHindiCleaned)) {
    return rawHindiCleaned;
  }

  // 2. Legacy Kruti Dev 010 exact mapping
  if (rawHindiCleaned && KRUTI_DEV_MAP[rawHindiCleaned]) {
    return KRUTI_DEV_MAP[rawHindiCleaned];
  }

  // 3. Legacy Susha 05 ASCII decode — only accept if it produces clean Devanagari
  if (rawHindiCleaned) {
    const susha = sushaToUnicode(rawHindiCleaned);
    if (susha && /[ऀ-ॿ]/.test(susha) && !/[a-zA-Z]/.test(susha)) {
      return susha.replace(/\s*[0-9]{5,}\s*/g, ' ').trim();
    }
  }

  // 4. Curated known phrases (accurate, hand-maintained)
  if (KNOWN_PHRASES_MAP[engLower]) return KNOWN_PHRASES_MAP[engLower];
  if (KNOWN_PHRASES_MAP[engNoTrailingNum]) return KNOWN_PHRASES_MAP[engNoTrailingNum];

  // No trustworthy Hindi available — caller should use the English name instead.
  return '';
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
