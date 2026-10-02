// Static reference data. Kept deliberately generic where facts change often (prices, pass rules):
// the app links out to official sources for those instead of hard-coding numbers.

export const CITIES = {
  tokyo: { name: 'Tokyo', country: 'JP', lat: 35.6812, lng: 139.7671 },
  yokohama: { name: 'Yokohama', country: 'JP', lat: 35.4660, lng: 139.6226 },
  hakone: { name: 'Hakone', country: 'JP', lat: 35.2324, lng: 139.1069 },
  nikko: { name: 'Nikko', country: 'JP', lat: 36.7500, lng: 139.5985 },
  kamakura: { name: 'Kamakura', country: 'JP', lat: 35.3192, lng: 139.5467 },
  kyoto: { name: 'Kyoto', country: 'JP', lat: 35.0116, lng: 135.7681 },
  osaka: { name: 'Osaka', country: 'JP', lat: 34.6937, lng: 135.5023 },
  nara: { name: 'Nara', country: 'JP', lat: 34.6851, lng: 135.8048 },
  kobe: { name: 'Kobe', country: 'JP', lat: 34.6901, lng: 135.1956 },
  hiroshima: { name: 'Hiroshima', country: 'JP', lat: 34.3853, lng: 132.4553 },
  fukuoka: { name: 'Fukuoka', country: 'JP', lat: 33.5902, lng: 130.4017 },
  nagoya: { name: 'Nagoya', country: 'JP', lat: 35.1815, lng: 136.9066 },
  kanazawa: { name: 'Kanazawa', country: 'JP', lat: 36.5613, lng: 136.6562 },
  sapporo: { name: 'Sapporo', country: 'JP', lat: 43.0618, lng: 141.3545 },
  okinawa: { name: 'Naha (Okinawa)', country: 'JP', lat: 26.2124, lng: 127.6809 },
  seoul: { name: 'Seoul', country: 'KR', lat: 37.5665, lng: 126.9780 },
  incheon: { name: 'Incheon', country: 'KR', lat: 37.4563, lng: 126.7052 },
  busan: { name: 'Busan', country: 'KR', lat: 35.1796, lng: 129.0756 },
  jeju: { name: 'Jeju', country: 'KR', lat: 33.4996, lng: 126.5312 },
  gyeongju: { name: 'Gyeongju', country: 'KR', lat: 35.8562, lng: 129.2247 },
  daegu: { name: 'Daegu', country: 'KR', lat: 35.8714, lng: 128.6014 },
  jeonju: { name: 'Jeonju', country: 'KR', lat: 35.8242, lng: 127.1480 },
  gangneung: { name: 'Gangneung', country: 'KR', lat: 37.7519, lng: 128.8761 },
};
export const cityOptions = () => Object.entries(CITIES).map(([k, c]) => [k, `${c.name} ${c.country === 'JP' ? '🇯🇵' : '🇰🇷'}`]);

export const CATS = {
  sight: { label: 'Sights', icon: '⛩️', color: '#3f7cb0' },
  food: { label: 'Food', icon: '🍜', color: '#d9724a' },
  cafe: { label: 'Cafés', icon: '☕', color: '#a9714b' },
  shop: { label: 'Shopping', icon: '🛍️', color: '#c0558a' },
  stay: { label: 'Stay', icon: '🏨', color: '#6b5bc4' },
  other: { label: 'Other', icon: '📍', color: '#6b7a89' },
};
export const KIND_STYLE = {
  transit: { icon: '🚆', color: '#2f8f83', label: 'Transit' },
  note: { icon: '📝', color: '#e0a94e', label: 'Note' },
};
export const MOVES = {
  walk: ['🚶', 'Walk'], subway: ['🚇', 'Subway'], bus: ['🚌', 'Bus'], tram: ['🚋', 'Tram'],
  train: ['🚆', 'Train'], taxi: ['🚕', 'Taxi'], flight: ['✈️', 'Flight'], bike: ['🚲', 'Bike'],
};

// A 3-day Tokyo trip so a new user can try everything immediately.
export function sampleTrip(start) {
  const P = (name, local, cat, lat, lng, address) => ({ name, local, cat, lat, lng, address, country: 'JP', city: 'tokyo' });
  const places = [
    P('Hotel Gracery Shinjuku', 'ホテルグレイスリー新宿', 'stay', 35.6954, 139.7016, 'Kabukicho, Shinjuku, Tokyo'),
    P('Senso-ji Temple', '浅草寺', 'sight', 35.7148, 139.7967, 'Asakusa, Taito, Tokyo'),
    P('Tsukiji Outer Market', '築地場外市場', 'food', 35.6655, 139.7707, 'Tsukiji, Chuo, Tokyo'),
    P('Meiji Jingu', '明治神宮', 'sight', 35.6764, 139.6993, 'Yoyogi, Shibuya, Tokyo'),
    P('Ichiran Shibuya', '一蘭 渋谷店', 'food', 35.6591, 139.7006, 'Shibuya, Tokyo'),
    P('Shibuya Sky', 'SHIBUYA SKY', 'sight', 35.6585, 139.7022, 'Shibuya Scramble Square, Tokyo'),
    P('teamLab Planets', 'チームラボプラネッツ', 'sight', 35.6492, 139.7896, 'Toyosu, Koto, Tokyo'),
  ];
  return { places, plan: [
    [0, '15:00', 0, 'subway', 'Check in and drop bags'], [0, '17:30', 4, 'subway', 'Dinner: solo-booth ramen'], [0, '19:30', 5, 'walk', 'Book the sunset slot ahead'],
    [1, '08:30', 2, 'subway', 'Breakfast: tamagoyaki and seafood bowls'], [1, '11:00', 1, 'subway', 'Walk Nakamise street'], [1, '14:00', 6, 'subway', 'Timed ticket'],
    [2, '09:00', 3, 'walk', 'Quiet forest walk'],
  ] };
}

export const EMERGENCY = {
  JP: {
    flag: '🇯🇵', title: 'Japan',
    numbers: [
      ['Police', '110'], ['Fire / Ambulance', '119'], ['Coast Guard', '118'],
      ['Japan Visitor Hotline (24h, English/Chinese/Korean)', '050-3816-2787'],
    ],
    apps: ['Safety tips (Japan Tourism Agency) – push alerts for quakes, tsunami, eruptions & weather in English', 'NERV Disaster Prevention – JMA-based alerts'],
    sites: [['JMA – earthquakes & tsunami (English)', 'https://www.jma.go.jp/jma/indexe.html'], ['JMA – warnings map', 'https://www.jma.go.jp/bosai/warning/#lang=en'], ['JMA – typhoon info', 'https://www.jma.go.jp/bosai/map.html#contents=typhoon&lang=en']],
  },
  KR: {
    flag: '🇰🇷', title: 'South Korea',
    numbers: [
      ['Police', '112'], ['Fire / Ambulance', '119'], ['Korea Travel Hotline (24h, multilingual)', '1330'],
      ['Foreigner help (Dasan, interpretation)', '120'],
    ],
    apps: ['Emergency Ready (Ministry of the Interior and Safety) – disaster alerts & shelter finder', 'Visit Korea / 1330 tourist hotline for help in your language'],
    sites: [['KMA – weather warnings (English)', 'https://www.weather.go.kr/w/eng/index.do'], ['KMA – typhoon', 'https://www.weather.go.kr/w/eng/typhoon/typhoon.do']],
  },
};

export const PREPAREDNESS = [
  ['Earthquake', ['Your phone will blare an emergency alert before shaking in many cases. Do not silence it.', 'Drop, cover and hold on under a sturdy table. Stay away from windows and shelves.', 'Do not run outside during shaking. Afterwards, take stairs, not elevators.', 'If you are on the coast and feel strong or long shaking: move to high ground immediately, do not wait for a siren (tsunami).', 'Aftershocks are normal. Re-check news before going back into buildings.']],
  ['Tsunami', ['Look for the blue-and-white wave pictogram or “津波避難” signs and follow them uphill / inland.', 'Go at least 2–3 floors up in a sturdy building if high ground is too far.', 'Stay out until the official all-clear. Tsunami come in several waves over hours.']],
  ['Typhoon / heavy rain', ['Typhoon season peaks Aug–Oct. Check JMA / KMA the day before travelling.', 'Trains, Shinkansen, ferries and flights are often suspended in advance. Buy flexible tickets and keep a buffer day.', 'Avoid rivers, coasts and mountain trails during warnings. Convenience stores sell out of water and food fast; stock up early.']],
  ['Heat (Jul–Sep)', ['Heatstroke warnings are common. Drink before you’re thirsty; vending machines are everywhere.', 'Plan outdoor sights for the morning and use malls, museums and cafés at midday.']],
  ['Volcano / hiking', ['Check local volcano alert levels (JMA) before Hakone, Aso, Sakurajima, Jeju’s Hallasan trails etc.', 'Trails and ropeways close for gas and eruptions with little notice.']],
  ['Find shelter & help', ['Evacuation sites are signed with a green running-person pictogram.', 'Hospitals: show the “Emergency card” in the Safety tab. Call 119 for an ambulance (no charge to call).', 'Tell your hotel front desk — staff know local evacuation routes and will help foreign guests.']],
];

export const STATIONS = [
  { id: 'tokyo-st', city: 'tokyo', name: 'Tokyo Station', local: '東京駅', tips: ['Shinkansen (Tokaido / Tohoku) are on the Yaesu side; the red-brick Marunouchi side faces the Imperial Palace.', 'The station is huge: allow 10+ minutes to change between JR lines and Marunouchi subway line.', 'Grab an ekiben (station bento) inside the gates area before boarding — Tokyo Station has the biggest selection in Japan.'] },
  { id: 'shinjuku', city: 'tokyo', name: 'Shinjuku Station', local: '新宿駅', tips: ['The busiest station in the world, with 200+ exits. Decide your exit before you start walking (e.g. East Exit, South Exit, Kabukicho).', 'Several operators share it: JR, Odakyu, Keio, Tokyo Metro, Toei. Follow the line colours on the floor signs.', 'Best to use Google Maps live directions with the “exit” detail turned on.'] },
  { id: 'shibuya', city: 'tokyo', name: 'Shibuya Station', local: '渋谷駅', tips: ['Hachiko Exit is the classic meeting point near the Scramble crossing.', 'The Ginza and Hanzomon metro lines are on upper floors of Shibuya Scramble Square / Hikarie — allow extra time.', 'Shibuya Sky tickets are timed: book ahead.'] },
  { id: 'ueno', city: 'tokyo', name: 'Ueno Station', local: '上野駅', tips: ['Airport connection: Keisei Skyliner to Narita. Park Exit is for the zoo and museums, Ameyoko is across the street.', 'Hokuriku and Tohoku Shinkansen stop here too.'] },
  { id: 'shinagawa', city: 'tokyo', name: 'Shinagawa Station', local: '品川駅', tips: ['Shinkansen to Kyoto/Osaka stop here; Keikyu line goes to Haneda Airport.', 'Transfers between JR and Keikyu are short.'] },
  { id: 'haneda', city: 'tokyo', name: 'Haneda Airport', local: '羽田空港', tips: ['Tokyo Monorail and Keikyu line run to the city. Keikyu is cheaper and goes through to Shinagawa / Asakusa.', 'Terminal 3 is international; there is a free shuttle bus between terminals.'] },
  { id: 'narita', city: 'tokyo', name: 'Narita Airport', local: '成田空港', tips: ['Skyliner (fast, ~40 min to Ueno) and Narita Express (to Tokyo/Shinjuku) are the quickest; Keisei Access Express and Limited Express are cheaper.', 'Last trains from the airport leave around 23:00 — check if you have a late arrival.'] },
  { id: 'kyoto-st', city: 'kyoto', name: 'Kyoto Station', local: '京都駅', tips: ['Central Exit leads to bus terminal (many sights are reached by city bus) and Kyoto Tower.', 'Subway Karasuma line and JR Nara line also begin here. Haruka to KIX airport leaves from platforms 30/31.', 'Buses get very crowded: consider an IC card and early starts.'] },
  { id: 'osaka-umeda', city: 'osaka', name: 'Osaka / Umeda Station', local: '大阪駅 / 梅田駅', tips: ['Umeda (Hankyu, Hanshin, Midosuji line) and JR Osaka are separate but linked; Umeda underground can be a labyrinth.', 'JR Osaka Loop Line is the easiest way to connect between sights.'] },
  { id: 'namba', city: 'osaka', name: 'Namba Station', local: 'なんば駅', tips: ['Midosuji / Yotsubashi / Sennichimae lines meet here; Nankai line goes to Kansai Airport.', 'Dotonbori and the Glico sign are a 5-minute walk north; follow the “Dotonbori” signs inside the station.'] },
  { id: 'seoul-st', city: 'seoul', name: 'Seoul Station', local: '서울역', tips: ['KTX (high-speed rail), Line 1 and 4, Gyeongui-Jungang and the AREX airport railroad all stop here.', 'AREX express lets you check in baggage at the city terminal for some airlines.'] },
  { id: 'hongdae', city: 'seoul', name: 'Hongik Univ. Station', local: '홍대입구역', tips: ['Line 2 (green), AREX and the Gyeongui-Jungang line. Exit 9 is the main way to the shopping street.', 'Airport train AREX stops here, so you can go straight to Incheon Airport.'] },
  { id: 'myeongdong', city: 'seoul', name: 'Myeongdong Station', local: '명동역', tips: ['Line 4. Exit 6 / 7 for the main shopping and street-food area.', 'Namsan Tower cable car is a walk away from Exit 3.'] },
  { id: 'gimpo', city: 'seoul', name: 'Gimpo Airport', local: '김포공항', tips: ['Domestic flights and some short international routes. Subway lines 5, 9, AREX connect to Seoul.', 'Allow extra time: the station is inside the terminal building.'] },
  { id: 'incheon', city: 'incheon', name: 'Incheon Airport', local: '인천국제공항', tips: ['AREX All-Stop (cheap) or Express (to Seoul Station in ~50 min). Late-night airport buses (N-line) cover midnight to early morning.', 'You can buy T-money cards at convenience stores in the arrivals hall.'] },
  { id: 'busan-st', city: 'busan', name: 'Busan Station', local: '부산역', tips: ['KTX from Seoul Station takes ~2.5 hours. Line 1 connects to the city.', 'Gukje Market and Jagalchi Fish Market are across the street / short subway ride away.'] },
];

export const TRANSIT_CARDS = [
  { title: '🇯🇵 IC cards (Suica / PASMO / ICOCA)', body: 'Tap-and-go on nearly all trains, subways, buses and in many shops and vending machines. Any regional card works nationwide. Apple Wallet and some Android phones can hold a virtual card (top up in-app). Ask station staff for a refund of any balance before you leave Japan, or keep it for next time.' },
  { title: '🇯🇵 Rail passes & reservations', body: 'Compare the JR Pass against individual tickets before buying — price changes have made it worth it only for long multi-city loops. Regional passes (Kansai Thru Pass, Hakone Free Pass, JR Hokkaido etc.) are often better value. Shinkansen reservations are made at machines / counters / SmartEX; reserved seats are worth it in busy periods. Oversized luggage on the Tokaido / Sanyo / Kyushu Shinkansen needs a seat reservation behind the last row.' },
  { title: '🇰🇷 T-money & Climate Card', body: 'T-money is a rechargeable transit card sold at convenience stores (GS25, CU, 7-Eleven) and works on subways, buses, taxis and in shops across Korea. The Climate Card (Seoul) is an unlimited-ride tourist pass for a few days; compare it with how many rides you will do.' },
  { title: '🇰🇷 KTX & intercity', body: 'Book KTX on KORAIL Talk or letskorail.com, and intercity express buses on Kobus / Bustago. Seats on weekends and holidays sell out days ahead. Foreign cards sometimes fail on Korean sites; keep an Apple Pay / Google Pay fallback.' },
  { title: 'Getting around — rules of the road', body: 'Keep phone calls off trains. Let people exit first, stand on the left or right depending on city (Tokyo: left, Osaka: right, Seoul: right). Don’t sit in priority seats. Women-only cars exist at peak hours. Last trains run around midnight – check the last departure before dinner!' },
];

export const PHRASES = {
  JP: [
    ['Hello', 'こんにちは', 'konnichiwa'],
    ['Thank you', 'ありがとうございます', 'arigatou gozaimasu'],
    ['Excuse me / sorry', 'すみません', 'sumimasen'],
    ['Where is the toilet?', 'トイレはどこですか？', 'toire wa doko desu ka'],
    ['Where is ___ station?', '___駅はどこですか？', '___ eki wa doko desu ka'],
    ['How much is it?', 'いくらですか？', 'ikura desu ka'],
    ['I would like this one', 'これをください', 'kore o kudasai'],
    ['Is there English menu?', '英語のメニューはありますか？', 'eigo no menyuu wa arimasu ka'],
    ['I have an allergy to ___', '___のアレルギーがあります', '___ no arerugii ga arimasu'],
    ['No pork / no meat', '豚肉／肉は食べられません', 'butaniku / niku wa taberaremasen'],
    ['Check please', 'お会計お願いします', 'okaikei onegaishimasu'],
    ['Free Wi-Fi?', 'フリーWi-Fiはありますか？', 'furii waifai wa arimasu ka'],
    ['Help me!', '助けてください', 'tasukete kudasai'],
    ['Call an ambulance', '救急車を呼んでください', 'kyuukyuusha o yonde kudasai'],
    ['I feel sick', '具合が悪いです', 'guai ga warui desu'],
    ['Where is the evacuation site?', '避難場所はどこですか？', 'hinan basho wa doko desu ka'],
  ],
  KR: [
    ['Hello', '안녕하세요', 'annyeonghaseyo'],
    ['Thank you', '감사합니다', 'gamsahamnida'],
    ['Excuse me / sorry', '실례합니다 / 죄송합니다', 'sillyehamnida / joesonghamnida'],
    ['Where is the toilet?', '화장실이 어디예요?', 'hwajangsiri eodiyeyo'],
    ['Where is ___ station?', '___역이 어디예요?', '___ yeogi eodiyeyo'],
    ['How much is it?', '얼마예요?', 'eolmayeyo'],
    ['I would like this one', '이거 주세요', 'igeo juseyo'],
    ['Is there an English menu?', '영어 메뉴 있어요?', 'yeongeo menyu isseoyo'],
    ['I have an allergy to ___', '___ 알레르기가 있어요', '___ allereugiga isseoyo'],
    ['No meat please', '고기 빼주세요', 'gogi ppaejuseyo'],
    ['Check please', '계산해 주세요', 'gyesanhae juseyo'],
    ['Free Wi-Fi?', '무료 와이파이 있어요?', 'muryo waipai isseoyo'],
    ['Help me!', '도와주세요', 'dowajuseyo'],
    ['Call an ambulance', '구급차 불러주세요', 'gugeupcha bulleojuseyo'],
    ['I feel sick', '몸이 안 좋아요', 'mom-i an joayo'],
    ['Where is the shelter?', '대피소가 어디예요?', 'daepisoga eodiyeyo'],
  ],
};

export const DEFAULT_PACKING = [
  'Passport (valid 6+ months)', 'Visit Japan Web QR code (screenshot)', 'Korea entry documents / K-ETA if required', 'Travel insurance details', 'Phone + charger + power bank',
  'Type A plug adapter (Japan) / Type C-F (Korea)', 'eSIM or pocket Wi-Fi', 'IC card / T-money', 'Cash (yen / won) + no-foreign-fee card', 'Comfortable walking shoes',
  'Light rain jacket / compact umbrella', 'Coin purse (lots of coins in Japan)', 'Tote bag for convenience-store trash (bins are rare)', 'Small hand towel (many restrooms have no dryer)',
  'Medication + copy of prescriptions', 'Hand sanitiser / tissues', 'Reusable water bottle',
];

export const ENTRY_LINKS = [
  ['Visit Japan Web (immigration, customs, tax-free QR)', 'https://www.vjw.digital.go.jp/'],
  ['Japan — official travel safety info (JNTO)', 'https://www.japan.travel/en/plan/safety-tips/'],
  ['Korea — K-ETA & entry info', 'https://www.k-eta.go.kr/'],
  ['Korea — Q-Code / arrival card', 'https://www.q-code.net/'],
  ['Korea — tourism info (Visit Korea)', 'https://english.visitkorea.or.kr/'],
];

export const WIFI_PROGRAMS = [
  { title: 'Before you land', items: [
    'eSIM (easiest, activate on arrival) or a pocket Wi-Fi rented for the trip are far more reliable than hunting for hotspots.',
    'Download offline maps (Google Maps → your profile → Offline maps) for Tokyo, Kyoto, Osaka, Seoul, Busan.',
    'Save this app to your home screen: it works offline and keeps your itinerary.',
  ] },
  { title: '🇯🇵 Japan: where free Wi-Fi really is', items: [
    'Japan Connected-free Wi-Fi app (log in once, auto-connects at hundreds of thousands of spots).',
    'Travel Japan Wi-Fi app (Japan Tourism Agency) – auto-connects and includes a list of hotspots.',
    'Convenience stores: 7-Eleven (7SPOT), Lawson Free Wi-Fi, FamilyMart (register with e-mail first).',
    'Starbucks, Tully’s, many department stores, airports (Narita, Haneda, Kansai) and Shinkansen stations.',
    'Tokyo Metro / Toei stations, Osaka Metro stations offer free Wi-Fi at most major stops (limited time per session).',
  ] },
  { title: '🇰🇷 Korea: where free Wi-Fi really is', items: [
    'Seoul and Busan subway stations and trains show “Public WiFi Free” / “Seoul Free WiFi”, no password needed.',
    'Incheon / Gimpo airports and KTX stations have free Wi-Fi.',
    'Most cafés and restaurants have a Wi-Fi password printed on the receipt or on the wall — ask “Wi-Fi bimilbeonho juseyo?” (와이파이 비밀번호 주세요?).',
    'Convenience stores (CU, GS25) usually have no public Wi-Fi.',
  ] },
  { title: 'Staying safe on public Wi-Fi', items: [
    'Treat it as untrusted: avoid logging into banking or entering card numbers. Use a VPN if you must.',
    'Be wary of networks that ask for lots of personal info; official programs only ask for e-mail.',
    'Turn off auto-join for unknown networks and turn off sharing / AirDrop for “Everyone”.',
  ] },
];


// Destinations offered when creating a trip. `city` links to CITIES so days get weather, safety and search centres.
export const DESTINATIONS = [
  { name: 'Japan', sub: '', type: 'Country', city: 'tokyo' },
  { name: 'South Korea', sub: '', type: 'Country', city: 'seoul' },
  { name: 'Tokyo', sub: 'Tokyo Prefecture, Japan', type: 'City', city: 'tokyo' },
  { name: 'Kyoto', sub: 'Kyoto Prefecture, Japan', type: 'City', city: 'kyoto' },
  { name: 'Osaka', sub: 'Osaka Prefecture, Japan', type: 'City', city: 'osaka' },
  { name: 'Seoul', sub: 'South Korea', type: 'City', city: 'seoul' },
  { name: 'Busan', sub: 'South Korea', type: 'City', city: 'busan' },
  { name: 'Jeju', sub: 'Jeju Island, South Korea', type: 'Region', city: 'jeju' },
  { name: 'Hakone', sub: 'Kanagawa, Japan', type: 'Region', city: 'hakone' },
  { name: 'Nara', sub: 'Nara Prefecture, Japan', type: 'City', city: 'nara' },
  { name: 'Hiroshima', sub: 'Japan', type: 'City', city: 'hiroshima' },
  { name: 'Fukuoka', sub: 'Japan', type: 'City', city: 'fukuoka' },
  { name: 'Sapporo', sub: 'Hokkaido, Japan', type: 'City', city: 'sapporo' },
  { name: 'Okinawa', sub: 'Japan', type: 'Region', city: 'okinawa' },
  { name: 'Kanazawa', sub: 'Ishikawa, Japan', type: 'City', city: 'kanazawa' },
  { name: 'Gyeongju', sub: 'South Korea', type: 'City', city: 'gyeongju' },
];

// Tap-to-start ideas on Home. `ask` is sent to the AI assistant.
export const IDEAS = [
  { emoji: '🍜', title: 'Tokyo ramen crawl', sub: '5 bowls worth the queue', ask: 'Plan a ramen crawl in Tokyo: 5 distinct styles (tonkotsu, shoyu, tsukemen, miso, vegetarian), with the best neighbourhoods and what to order.', color: '#d9724a' },
  { emoji: '⛩️', title: 'Kyoto without the crowds', sub: 'Early starts, quiet temples', ask: 'Suggest a one-day Kyoto itinerary that avoids the crowds: early-morning temples, quiet gardens and a calm lunch.', color: '#3f7cb0' },
  { emoji: '🥩', title: 'Seoul food night', sub: 'BBQ, street food, cafés', ask: 'Plan an evening of Korean food in Seoul: BBQ, street food and a dessert café, close together, with Naver Map search names.', color: '#c0558a' },
  { emoji: '🌧️', title: 'Rainy-day backups', sub: 'Indoor ideas for Osaka & Tokyo', ask: 'Give me 8 great rainy-day indoor activities in Osaka and Tokyo with rough costs and booking tips.', color: '#6b5bc4' },
  { emoji: '🏝️', title: 'Jeju in 2 days', sub: 'Coast, cafés and hiking', ask: 'Plan 2 days on Jeju Island with a rental car: coast, cafés and one easy hike, with driving times.', color: '#2f8f83' },
  { emoji: '🐟', title: 'Busan seafood day', sub: 'Markets, beaches, temples', ask: 'Plan one day in Busan around seafood: Jagalchi market, a coastal temple and a sunset spot, with transit.', color: '#e0a94e' },
];
