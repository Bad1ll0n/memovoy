// data/cityCountryMap.js
// Mapeamento cidade → país (principais cidades do mundo)
const cityCountryMap = {
  // Europa
  "Lisboa": "Portugal", "Porto": "Portugal", "Faro": "Portugal", "Braga": "Portugal", "Coimbra": "Portugal", "Funchal": "Portugal",
  "Madrid": "Espanha", "Barcelona": "Espanha", "Sevilha": "Espanha", "Valência": "Espanha", "Bilbau": "Espanha", "Granada": "Espanha", "Málaga": "Espanha", "Seville": "Spain", "Valencia": "Spain", "Bilbao": "Spain",
  "Paris": "França", "Lyon": "França", "Marselha": "França", "Nice": "França", "Toulouse": "França", "Bordeaux": "França", "Marseille": "France",
  "Londres": "Reino Unido", "Manchester": "Reino Unido", "Edimburgo": "Reino Unido", "Birmingham": "Reino Unido", "Bristol": "Reino Unido", "Glasgow": "Reino Unido", "London": "United Kingdom", "Edinburgh": "United Kingdom",
  "Berlim": "Alemanha", "Munique": "Alemanha", "Hamburgo": "Alemanha", "Colónia": "Alemanha", "Frankfurt": "Alemanha", "Stuttgart": "Alemanha", "Berlin": "Germany", "Munich": "Germany", "Hamburg": "Germany", "Cologne": "Germany",
  "Roma": "Itália", "Milão": "Itália", "Veneza": "Itália", "Florença": "Itália", "Nápoles": "Itália", "Turim": "Itália", "Rome": "Italy", "Milan": "Italy", "Venice": "Italy", "Florence": "Italy", "Naples": "Italy", "Turin": "Italy",
  "Amsterdam": "Holanda", "Roterdão": "Holanda", "Haia": "Holanda", "Rotterdam": "Netherlands", "The Hague": "Netherlands",
  "Bruxelas": "Bélgica", "Bruges": "Bélgica", "Antuérpia": "Bélgica", "Brussels": "Belgium", "Antwerp": "Belgium",
  "Viena": "Áustria", "Salzburgo": "Áustria", "Vienna": "Austria", "Salzburg": "Austria",
  "Zurique": "Suíça", "Genebra": "Suíça", "Berna": "Suíça", "Lausana": "Suíça", "Zurich": "Switzerland", "Geneva": "Switzerland", "Bern": "Switzerland", "Lausanne": "Switzerland",
  "Estocolmo": "Suécia", "Gotemburgo": "Suécia", "Stockholm": "Sweden", "Gothenburg": "Sweden",
  "Oslo": "Noruega", "Bergen": "Noruega",
  "Copenhaga": "Dinamarca", "Aarhus": "Dinamarca", "Copenhagen": "Denmark",
  "Helsínquia": "Finlândia", "Helsinki": "Finland",
  "Atenas": "Grécia", "Salónica": "Grécia", "Mykonos": "Grécia", "Santorini": "Grécia", "Rodes": "Grécia", "Athens": "Greece", "Thessaloniki": "Greece", "Rhodes": "Greece",
  "Praga": "República Checa", "Brno": "República Checa", "Prague": "Czech Republic",
  "Varsóvia": "Polónia", "Cracóvia": "Polónia", "Warsaw": "Poland", "Krakow": "Poland", "Kraków": "Poland",
  "Budapeste": "Hungria", "Budapest": "Hungary",
  "Bucareste": "Roménia", "Cluj": "Roménia", "Bucharest": "Romania",
  "Dublim": "Irlanda", "Cork": "Irlanda", "Dublin": "Ireland",
  "Lisboa": "Portugal",
  "Reiquiavique": "Islândia", "Reykjavik": "Iceland",
  "Moscovo": "Rússia", "São Petersburgo": "Rússia", "Moscow": "Russia", "Saint Petersburg": "Russia", "St. Petersburg": "Russia",
  "Kiev": "Ucrânia", "Kyiv": "Ukraine",
  "Istambul": "Turquia", "Ancara": "Turquia", "Izmir": "Turquia", "Istanbul": "Turkey", "Ankara": "Turkey",
  "Zagreb": "Croácia", "Split": "Croácia", "Dubrovnik": "Croácia",
  "Belgrado": "Sérvia", "Belgrade": "Serbia",
  "Liubliana": "Eslovénia", "Ljubljana": "Slovenia",
  "Tallinn": "Estónia", "Riga": "Letónia", "Vilnius": "Lituânia",
  "Bratislava": "Eslováquia",
  "Sarajevo": "Bósnia", "Tirana": "Albânia", "Skopje": "Macedónia", "Podgorica": "Montenegro",
  "Valletta": "Malta", "Nicosia": "Chipre",
  "Baku": "Azerbaijão", "Tbilisi": "Geórgia", "Yerevan": "Arménia",

  // América do Norte
  "Nova Iorque": "EUA", "Los Angeles": "EUA", "Chicago": "EUA", "Houston": "EUA", "Phoenix": "EUA", "Filadélfia": "EUA", "San Antonio": "EUA", "San Diego": "EUA", "Dallas": "EUA", "São Francisco": "EUA", "Seattle": "EUA", "Denver": "EUA", "Boston": "EUA", "Miami": "EUA", "Atlanta": "EUA", "Las Vegas": "EUA", "Portland": "EUA", "Nashville": "EUA", "Memphis": "EUA", "Baltimore": "EUA", "Washington": "EUA", "Orlando": "EUA", "New Orleans": "EUA", "Minneapolis": "EUA", "Honolulu": "EUA",
  "New York": "USA", "San Francisco": "USA", "Philadelphia": "USA", "Washington D.C.": "USA", "Washington DC": "USA",
  "Toronto": "Canadá", "Vancouver": "Canadá", "Montreal": "Canadá", "Calgary": "Canadá", "Ottawa": "Canadá", "Edmonton": "Canadá", "Quebec": "Canadá",
  "Toronto": "Canada", "Vancouver": "Canada", "Montreal": "Canada",
  "Cidade do México": "México", "Cancún": "México", "Guadalajara": "México", "Monterrey": "México", "Mexico City": "Mexico", "Cancun": "Mexico",

  // América do Sul
  "São Paulo": "Brasil", "Rio de Janeiro": "Brasil", "Brasília": "Brasil", "Salvador": "Brasil", "Fortaleza": "Brasil", "Belo Horizonte": "Brasil", "Manaus": "Brasil", "Curitiba": "Brasil", "Recife": "Brasil", "Florianópolis": "Brasil",
  "Buenos Aires": "Argentina", "Córdoba": "Argentina", "Rosário": "Argentina", "Rosario": "Argentina",
  "Santiago": "Chile", "Valparaíso": "Chile", "Valparaiso": "Chile",
  "Lima": "Peru", "Cusco": "Peru", "Machu Picchu": "Peru",
  "Bogotá": "Colômbia", "Medellín": "Colômbia", "Cartagena": "Colômbia", "Bogota": "Colombia", "Medellin": "Colombia",
  "Caracas": "Venezuela",
  "Quito": "Equador", "Guayaquil": "Equador",
  "La Paz": "Bolívia", "Santa Cruz": "Bolívia",
  "Assunção": "Paraguai", "Asuncion": "Paraguay",
  "Montevidéu": "Uruguai", "Montevideo": "Uruguay",

  // Ásia
  "Tóquio": "Japão", "Osaka": "Japão", "Kyoto": "Japão", "Tóquio": "Japão", "Hiroshima": "Japão", "Nagasaki": "Japão", "Nara": "Japão", "Sapporo": "Japão", "Fukuoka": "Japão", "Tokyo": "Japan", "Kyoto": "Japan", "Hiroshima": "Japan",
  "Pequim": "China", "Xangai": "China", "Guangzhou": "China", "Shenzhen": "China", "Chengdu": "China", "Xian": "China", "Hangzhou": "China", "Wuhan": "China", "Chongqing": "China", "Beijing": "China", "Shanghai": "China", "Xi'an": "China", "Xi An": "China",
  "Seul": "Coreia do Sul", "Busan": "Coreia do Sul", "Incheon": "Coreia do Sul", "Seoul": "South Korea",
  "Bangkok": "Tailândia", "Chiang Mai": "Tailândia", "Phuket": "Tailândia", "Pattaya": "Tailândia",
  "Bali": "Indonésia", "Jacarta": "Indonésia", "Yogyakarta": "Indonésia", "Lombok": "Indonésia", "Jakarta": "Indonesia",
  "Singapura": "Singapura", "Singapore": "Singapore",
  "Kuala Lumpur": "Malásia", "Penang": "Malásia",
  "Manila": "Filipinas", "Cebu": "Filipinas",
  "Ho Chi Minh": "Vietname", "Hanói": "Vietname", "Hoi An": "Vietname", "Da Nang": "Vietname", "Hanoi": "Vietnam", "Ho Chi Minh City": "Vietnam",
  "Phnom Penh": "Camboja", "Siem Reap": "Camboja",
  "Yangon": "Myanmar",
  "Mumbai": "Índia", "Delhi": "Índia", "Bangalore": "Índia", "Chennai": "Índia", "Kolkata": "Índia", "Jaipur": "Índia", "Agra": "Índia", "Varanasi": "Índia", "Goa": "Índia", "Hyderabad": "Índia", "New Delhi": "India",
  "Colombo": "Sri Lanka",
  "Catmandu": "Nepal", "Kathmandu": "Nepal",
  "Dhaka": "Bangladesh",
  "Karachi": "Paquistão", "Lahore": "Paquistão", "Islamabad": "Paquistão",
  "Kabul": "Afeganistão",
  "Teerão": "Irão", "Tehran": "Iran", "Isfahan": "Iran",
  "Bagdade": "Iraque", "Baghdad": "Iraq",
  "Riade": "Arábia Saudita", "Jeddah": "Arábia Saudita", "Riyadh": "Saudi Arabia",
  "Dubai": "Emirados Árabes", "Abu Dhabi": "Emirados Árabes", "Sharjah": "Emirados Árabes", "Dubai": "UAE",
  "Doha": "Qatar",
  "Kuwait": "Kuwait",
  "Amã": "Jordânia", "Petra": "Jordânia", "Amman": "Jordan",
  "Beirute": "Líbano", "Beirut": "Lebanon",
  "Telavive": "Israel", "Jerusalém": "Israel", "Tel Aviv": "Israel", "Jerusalem": "Israel",
  "Mascate": "Omã", "Muscat": "Oman",
  "Ulaanbaatar": "Mongólia",
  "Tashkent": "Uzbequistão", "Samarkand": "Uzbequistão",
  "Almaty": "Cazaquistão", "Astana": "Cazaquistão",
  "Taipei": "Taiwan",
  "Hong Kong": "Hong Kong",
  "Macau": "Macau",

  // África
  "Cairo": "Egito", "Alexandria": "Egito", "Luxor": "Egito", "Aswan": "Egito", "Cairo": "Egypt",
  "Marrakesh": "Marrocos", "Casablanca": "Marrocos", "Fez": "Marrocos", "Tânger": "Marrocos", "Marrakech": "Morocco", "Fes": "Morocco", "Tangier": "Morocco",
  "Túnis": "Tunísia", "Tunis": "Tunisia",
  "Argel": "Argélia", "Algiers": "Algeria",
  "Trípoli": "Líbia", "Tripoli": "Libya",
  "Nairobi": "Quénia", "Mombasa": "Quénia", "Nairobi": "Kenya",
  "Tânzania": "Tanzânia", "Zanzibar": "Tanzânia", "Dar es Salaam": "Tanzania",
  "Joanesburgo": "África do Sul", "Cidade do Cabo": "África do Sul", "Durban": "África do Sul", "Pretória": "África do Sul", "Johannesburg": "South Africa", "Cape Town": "South Africa", "Durban": "South Africa",
  "Lagos": "Nigéria", "Abuja": "Nigéria",
  "Acra": "Gana", "Accra": "Ghana",
  "Dakar": "Senegal",
  "Addis Abeba": "Etiópia", "Addis Ababa": "Ethiopia",
  "Luanda": "Angola",
  "Maputo": "Moçambique",
  "Antananarivo": "Madagáscar",
  "Kampala": "Uganda",
  "Kigali": "Ruanda",
  "Harare": "Zimbabwe",
  "Lusaka": "Zâmbia",

  // Oceânia
  "Sydney": "Austrália", "Melbourne": "Austrália", "Brisbane": "Austrália", "Perth": "Austrália", "Adelaide": "Austrália", "Gold Coast": "Austrália", "Cairns": "Austrália", "Sydney": "Australia", "Melbourne": "Australia", "Brisbane": "Australia",
  "Auckland": "Nova Zelândia", "Wellington": "Nova Zelândia", "Christchurch": "Nova Zelândia", "Auckland": "New Zealand",
  "Suva": "Fiji",
  "Port Moresby": "Papua Nova Guiné",
};

/**
 * Dado um string de destino (ex: "Paris" ou "Paris, France"),
 * retorna { city, country }
 */
function parseCityCountry(destination) {
  if (!destination) return { city: null, country: null };

  const parts = destination.split(',');
  const city = parts[0].trim();
  const country = parts[1]
    ? parts[1].trim()
    : cityCountryMap[city] || null;

  return { city, country };
}

module.exports = { parseCityCountry };
