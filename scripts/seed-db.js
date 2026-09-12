/**
 * Seed script: inserts 7 categories + 12 published articles into Supabase.
 * Run: node scripts/seed-db.js
 */
const https = require('https');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_PROJECT_ID || 'bccikoroyovmlpzikinf';
const SERVICE_KEY = process.env.SUPABASE_ACCESS_TOKEN;
if (!SERVICE_KEY) { console.error('Set SUPABASE_ACCESS_TOKEN env var first'); process.exit(1); }

function uuid() { return crypto.randomUUID(); }

function runSql(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    const opts = {
      hostname: 'api.supabase.com',
      path: '/v1/projects/bccikoroyovmlpzikinf/database/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(opts, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch(e) { resolve(body); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Categories (matching DB schema: id, slug, name_bn, name_en, description, parent_id, sort_order, is_active)
const cats = [
  { id: uuid(), slug: 'university-news', name_bn: 'বিশ্ববিদ্যালয় সংবাদ', name_en: 'University News', description: 'ঢাকা বিশ্ববিদ্যালয়ের সরাসরি সংবাদ', sort_order: 1 },
  { id: uuid(), slug: 'student-politics', name_bn: 'ছাত্র রাজনীতি', name_en: 'Student Politics', description: 'ছাত্র সংগঠন ও রাজনৈতিক কার্যক্রম', sort_order: 2 },
  { id: uuid(), slug: 'education-research', name_bn: 'শিক্ষা ও গবেষণা', name_en: 'Education & Research', description: 'শৈক্ষিক কার্যক্রম ও গবেষণা সংবাদ', sort_order: 3 },
  { id: uuid(), slug: 'sports', name_bn: 'খেলাধুলা', name_en: 'Sports', description: 'খেলাধুলা সংবাদ', sort_order: 4 },
  { id: uuid(), slug: 'culture-events', name_bn: 'সংস্কৃতি ও অনুষ্ঠান', name_en: 'Culture & Events', description: 'সাংস্কৃতিক অনুষ্ঠান ও কার্যক্রম', sort_order: 5 },
  { id: uuid(), slug: 'technology', name_bn: 'প্রযুক্তি', name_en: 'Technology', description: 'প্রযুক্তি সংবাদ', sort_order: 6 },
  { id: uuid(), slug: 'lifestyle', name_bn: 'জীবনযাপন', name_en: 'Lifestyle', description: 'জীবনযাপন সংবাদ', sort_order: 7 },
];

const catMap = {};
cats.forEach(c => catMap[c.slug] = c.id);

// 12 realistic Dhaka University news articles
const articles = [
  {
    slug: 'du-fifa-world-cup-2026-viewing-hall',
    type: 'news', cat: 'university-news',
    title_bn: 'ফিফা বিশ্বকাপ ২০২৬ দেখার ব্যবস্থা করবে ঢাকা বিশ্ববিদ্যালয়',
    excerpt_bn: 'ঢাকা বিশ্ববিদ্যালয় প্রশাসন ছাত্রাবাসগুলোতে ফিফা বিশ্বকাপ ২০২৬ ম্যাচ দেখার জন্য বড় স্ক্রিন বসানোর সিদ্ধান্ত নিয়েছে।',
    body_bn: '<p>ঢাকা বিশ্ববিদ্যালয় প্রশাসন আসন্ন ফিফা বিশ্বকাপ ২০২৬ আয়োজনের প্রেক্ষিতে সকল ছাত্রাবাসে বড় স্ক্রিন স্থাপনের সিদ্ধান্ত নিয়েছে। উপাচার্য অধ্যাপক ড. নাসিম আহমেদ বলেন, "আমরা চাই ছাত্ররা পড়াশোনার পাশাপাশি খেলাধুলার মজাও উপভোগ করুক।"</p><p>প্রতিটি ছাত্রাবাসে ন্যূনতম একটি ১০০ ইঞ্চির LED স্ক্রিন থাকবে। ম্যাচ দেখার জন্য পানীয় ও খাবারের ব্যবস্থাও করা হবে।</p>',
    excerpt_en: 'Dhaka University plans to install large screens in all dormitories for FIFA World Cup 2026 viewing.',
    body_en: '<p>Dhaka University administration has decided to install large screens in all residential halls for the upcoming FIFA World Cup 2026. Vice-Chancellor Dr. Nasim Ahmed said, "We want students to enjoy sports alongside their studies."</p><p>Each hall will have at least one 100-inch LED screen. Refreshments and snacks will also be available during matches.</p>',
    thumbnail: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800&h=500&fit=crop',
    alt: 'Students watching football on big screen', views: 4520, featured: true, breaking: false,
    pubDate: '2026-09-10T14:00:00+06:00'
  },
  {
    slug: 'du-admission-test-2026-changes',
    type: 'article', cat: 'education-research',
    title_bn: '২০২৬ সালের ভর্তি পরীক্ষায় বড় পরিবর্তন: অনলাইন আবেদন বাধ্যতামূলক',
    excerpt_bn: 'ঢাকা বিশ্ববিদ্যালয়ের ভর্তি পরীক্ষায় এবার থেকে অনলাইন আবেদন বাধ্যতামূলক করা হয়েছে। ক্যাম্পাসের বাইরে পরীক্ষা কেন্দ্র ব্যবহার করা হবে।',
    body_bn: '<p>ঢাকা বিশ্ববিদ্যালয়ের পরীক্ষা কন্ট্রোলার অফিস জানিয়েছে, ২০২৬ সাল থেকে সকল পরীক্ষার্থীদের অনলাইনে আবেদন করতে হবে। কাগজের ফর্ম আর গ্রহণ করা হবে না।</p><p>এছাড়া ভর্তি পরীক্ষার কেন্দ্রগুলো ক্যাম্পাসের বাইরে বিভিন্ন স্কুল ও কলেজে স্থানান্তর করা হবে। এতে করে ক্যাম্পাসে চাপ কমবে বলে প্রশাসনের মত।</p>',
    excerpt_en: 'DU admission tests will now require mandatory online applications. Off-campus exam centers will be used.',
    body_en: '<p>Dhaka University Examination Control Office has announced that from 2026, all candidates must apply online. Paper forms will no longer be accepted.</p><p>Additionally, admission test centers will be moved off-campus to various schools and colleges to reduce pressure on campus, the administration stated.</p>',
    thumbnail: 'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=800&h=500&fit=crop',
    alt: 'University admission test hall', views: 6200, featured: true, breaking: true,
    pubDate: '2026-09-11T08:30:00+06:00'
  },
  {
    slug: 'chhatra-union-protest-rashtrabhasha',
    type: 'news', cat: 'student-politics',
    title_bn: 'ছাত্রলীগের বিক্ষোভ মিছিল: রাষ্ট্রভাষা বাংলায় শিক্ষা প্রতিষ্ঠানের নামকরণ দাবি',
    excerpt_bn: 'ঢাকা বিশ্ববিদ্যালয় কেন্দ্রীয় ছাত্রলীগ বাংলা ভাষায় শিক্ষা প্রতিষ্ঠানের নামকরণের দাবি নিয়ে বিশাল মিছিল করেছে।',
    body_bn: '<p>ঢাকা বিশ্ববিদ্যালয় কেন্দ্রীয় ছাত্রলীগ আজ বাংলা ভাষায় শিক্ষা প্রতিষ্ঠানের নামকরণ করার দাবি নিয়ে মোহাম্মদপুর থেকে তোতাপাখি মোড় পর্যন্ত বিশাল মিছিল করেছে।</p><p>মিছিলে অংশগ্রহণকারীরা দাবি করেছে, বিশ্ববিদ্যালয়ের সকল বিভাগের নাম বাংলায় হওয়া উচিত। তারা শিক্ষা মন্ত্রণালয়ের কাছে একটি স্মারকপত্র পেশ করেছে।</p>',
    excerpt_en: 'Student League protest march demands Bangla naming of educational institutions.',
    body_en: '<p>Dhaka University central Student League organized a massive procession from Mohammadpur to Totapara demanding Bangla naming of educational institutions.</p><p>Participants demanded that all department names at the university should be in Bangla. They submitted a memorandum to the Ministry of Education.</p>',
    thumbnail: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&h=500&fit=crop',
    alt: 'Student protest march on campus', views: 3800, featured: false, breaking: false,
    pubDate: '2026-09-09T16:15:00+06:00'
  },
  {
    slug: 'du-ai-research-center-inauguration',
    type: 'article', cat: 'technology',
    title_bn: 'ঢাকা বিশ্ববিদ্যালয়ে কৃত্রিম বুদ্ধিমত্তা গবেষণা কেন্দ্র উদ্বোধন',
    excerpt_bn: 'আজ ঢাকা বিশ্ববিদ্যালয়ের প্রকৌশল অনুষদে একটি কৃত্রিম বুদ্ধিমত্তা ও রোবোটিক্স গবেষণা কেন্দ্র উদ্বোধন করা হয়েছে।',
    body_bn: '<p>ঢাকা বিশ্ববিদ্যালয়ের প্রকৌশল ও প্রযুক্তি অনুষদে আজ কৃত্রিম বুদ্ধিমত্তা ও রোবোটিক্স গবেষণা কেন্দ্রের উদ্বোধন করা হয়েছে। বিজ্ঞান ও প্রযুক্তি প্রতিমন্ত্রী অনুষ্ঠানে প্রধান অতিথি ছিলেন।</p><p>এই কেন্দ্রে কৃত্রিম বুদ্ধিমত্তা, মেশিন লার্নিং, ডিপ লার্নিং, এবং রোবোটিক্স বিষয়ে গবেষণা করা হবে। কেন্দ্রটিতে ৫০ জন গবেষকার্য করবেন।</p>',
    excerpt_en: 'Dhaka University inaugurates an AI and Robotics Research Center at the Faculty of Engineering.',
    body_en: '<p>Dhaka University Faculty of Engineering and Technology inaugurated an AI and Robotics Research Center today. The State Minister for Science and Technology was the chief guest.</p><p>The center will conduct research on artificial intelligence, machine learning, deep learning, and robotics. Fifty researchers will work at the center.</p>',
    thumbnail: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&h=500&fit=crop',
    alt: 'AI research laboratory with robots', views: 5100, featured: true, breaking: false,
    pubDate: '2026-09-11T10:00:00+06:00'
  },
  {
    slug: 'du-cricket-team-nppl-champion',
    type: 'news', cat: 'sports',
    title_bn: 'ঢাকা বিশ্ববিদ্যালয় ক্রিকেট দল আন্তঃবিভাগীয় লিগের চ্যাম্পিয়ন',
    excerpt_bn: 'ঢাকা বিশ্ববিদ্যালয়ের ক্রিকেট দল আন্তঃবিভাগীয় ক্রিকেট লিগের ফাইনালে রাজশাহী বিভাগকে হারিয়ে চ্যাম্পিয়ন হয়েছে।',
    body_bn: '<p>ঢাকা বিশ্ববিদ্যালয়ের ক্রিকেট দল আজ আন্তঃবিভাগীয় ক্রিকেট লিগের ফাইনাল ম্যাচে রাজশাহী বিভাগকে ৪৫ রানের ব্যবধানে হারিয়ে চ্যাম্পিয়ন হয়েছে।</p><p>ফাইনাল ম্যাচে ঢাকা বিভাগ প্রথমে ব্যাটিং করে ২৫০ রান করে। জবাবে রাজশাহী বিভাগ ২০৫ রানে অল আউট হয়। ম্যাচের সেরা খেলোয়াড় ছিলেন তানভীর হাসান, যিনি ৩টি উইকেট নেন।</p>',
    excerpt_en: 'DU cricket team becomes inter-division league champion, defeating Rajshahi.',
    body_en: '<p>Dhaka University cricket team won the inter-division cricket league final by defeating Rajshahi Division by 45 runs today.</p><p>In the final, Dhaka batted first scoring 250 runs. In reply, Rajshahi was all out for 205 runs. The man of the match was Tanvir Hasan who took 3 wickets.</p>',
    thumbnail: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=800&h=500&fit=crop',
    alt: 'Cricket match at DU campus ground', views: 7300, featured: false, breaking: true,
    pubDate: '2026-09-10T18:30:00+06:00'
  },
  {
    slug: 'puja-mandap-du-campus',
    type: 'news', cat: 'culture-events',
    title_bn: 'ঢাকা বিশ্ববিদ্যালয়ে নববর্ষের পূজা মণ্ডপ উদ্বোধন',
    excerpt_bn: 'ঢাকা বিশ্ববিদ্যালয় ক্যাম্পাসে হিন্দু সম্প্রদায়ের নববর্ষের পূজা মণ্ডপ উদ্বোধন করা হয়েছে।',
    body_bn: '<p>ঢাকা বিশ্ববিদ্যালয় ক্যাম্পাসের কেন্দ্রীয় মসজিদ পরিষদের সামনে আজ হিন্দু সম্প্রদায়ের নববর্ষের পূজা মণ্ডপ উদ্বোধন করা হয়েছে।</p><p>অনুষ্ঠানে প্রধান অতিথি ছিলেন উপাচার্য। তিনি বলেন, বিশ্ববিদ্যালয় সকল ধর্ম ও সম্প্রদায়ের মিলেমিশের প্রতীক। পূজা মণ্ডপটি সপ্তাহব্যাপী চলবে।</p>',
    excerpt_en: 'Hindu New Year puja mandap inaugurated at Dhaka University campus.',
    body_en: '<p>A puja mandap for the Hindu New Year was inaugurated at Dhaka University campus today, in front of the central mosque.</p><p>The Vice-Chancellor was the chief guest. He said the university is a symbol of harmony among all religions and communities. The puja mandap will remain open for a week.</p>',
    thumbnail: 'https://images.unsplash.com/photo-1604948501466-4e9c339b9c24?w=800&h=500&fit=crop',
    alt: 'Colorful puja mandap at university campus', views: 2900, featured: false, breaking: false,
    pubDate: '2026-09-08T09:00:00+06:00'
  },
  {
    slug: 'du-photography-club-exhibition',
    type: 'article', cat: 'culture-events',
    title_bn: 'ঢাকা বিশ্ববিদ্যালয় ফটোগ্রাফি ক্লাবের প্রদর্শনী: "ঢাকার রূপ"',
    excerpt_bn: 'ঢাকা বিশ্ববিদ্যালয় ফটোগ্রাফি ক্লাব "ঢাকার রূপ" শিরোনামে একটি ছবির প্রদর্শনীর আয়োজন করেছে।',
    body_bn: '<p>ঢাকা বিশ্ববিদ্যালয় ফটোগ্রাফি ক্লাব "ঢাকার রূপ" শিরোনামে একটি ছবির প্রদর্শনীর আয়োজন করেছে। প্রদর্শনীতে ঢাকার বিভিন্ন ঐতিহাসিক স্থান, সড়ক, মানুষ ও সংস্কৃতির ছবি রাখা হয়েছে।</p><p>প্রদর্শনীটি বিশ্ববিদ্যালয়ের সেনার হলে চলছে এবং সেপ্টেম্বর মাসের শেষ পর্যন্ত খোলা থাকবে। প্রবেশ মূল্য বিনামূল্যে।</p>',
    excerpt_en: '"Face of Dhaka" photography exhibition organized by DU Photography Club.',
    body_en: '<p>Dhaka University Photography Club organized a photo exhibition titled "Face of Dhaka". The exhibition features photos of Dhaka\'s historical sites, streets, people, and culture.</p><p>The exhibition is being held at Salimullah Muslim Hall and will remain open until the end of September. Entry is free.</p>',
    thumbnail: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&h=500&fit=crop',
    alt: 'Photography exhibition with Dhaka city photos', views: 1800, featured: false, breaking: false,
    pubDate: '2026-09-07T12:00:00+06:00'
  },
  {
    slug: 'du-hall-mess-price-hike-protest',
    type: 'news', cat: 'university-news',
    title_bn: 'ছাত্রাবাসের খাদ্য মূল্য বৃদ্ধির বিরুদ্ধে বিক্ষোভ',
    excerpt_bn: 'ঢাকা বিশ্ববিদ্যালয়ের সালেমুল্লাহ মুসলিম হলের ছাত্ররা খাদ্য মূল্য বৃদ্ধির বিরুদ্ধে বিক্ষোভ করেছে।',
    body_bn: '<p>ঢাকা বিশ্ববিদ্যালয়ের সালেমুল্লাহ মুসলিম হলের ছাত্ররা আজ হল মেসের খাদ্য মূল্য বৃদ্ধির বিরুদ্ধে বিক্ষোভ করেছে। ছাত্ররা দাবি করেছে, হল মেসের খাবারের মূল্য পূর্বের অবস্থায় ফিরিয়ে আনতে হবে।</p><p>বিক্ষোভকারী ছাত্ররা হল সুপারিন্টেন্ডেন্টের কাছে একটি স্মারকপত্র দিয়েছে। সুপারিন্টেন্ডেন্ট জানিয়েছেন, খাদ্য সরবরাহকারীদের সাথে কথা বলে মূল্য হ্রাসের চেষ্টা করা হবে।</p>',
    excerpt_en: 'Student protest against food price hike at Salimullah Muslim Hall.',
    body_en: '<p>Students of Salimullah Muslim Hall at Dhaka University protested today against the food price hike in the hall mess. They demanded that food prices be reverted to previous levels.</p><p>The protesting students submitted a memorandum to the Hall Superintendent. The Superintendent said they would try to reduce prices by negotiating with food suppliers.</p>',
    thumbnail: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&h=500&fit=crop',
    alt: 'University dining hall', views: 3400, featured: false, breaking: false,
    pubDate: '2026-09-10T11:45:00+06:00'
  },
  {
    slug: 'du-english-dept-seminar',
    type: 'article', cat: 'education-research',
    title_bn: 'ইংরেজি বিভাগে আন্তর্জাতিক সেমিনার: বাংলা সাহিত্যের বৈশ্বিক প্রসার',
    excerpt_bn: 'ঢাকা বিশ্ববিদ্যালয়ের ইংরেজি বিভাগে বাংলা সাহিত্যের বৈশ্বিক প্রসার নিয়ে আন্তর্জাতিক সেমিনার অনুষ্ঠিত হয়েছে।',
    body_bn: '<p>ঢাকা বিশ্ববিদ্যালয়ের ইংরেজি বিভাগে বাংলা সাহিত্যের বৈশ্বিক প্রসার নিয়ে একটি আন্তর্জাতিক সেমিনার অনুষ্ঠিত হয়েছে। সেমিনারে বিশ্বের বিভিন্ন বিশ্ববিদ্যালয় থেকে ২৫ জন পণ্ডিত অংশগ্রহণ করেছেন।</p><p>সেমিনারে রবীন্দ্রনাথ ঠাকুর, জীবনানন্দ দাশ, এবং সৈয়দ শামসুল হকের সাহিত্যকর্ম বিশ্বব্যাপী কীভাবে ছড়িয়ে পড়েছে তা নিয়ে আলোচনা করা হয়েছে।</p>',
    excerpt_en: 'International seminar on global spread of Bangla literature held at English Department.',
    body_en: '<p>An international seminar on the global spread of Bangla literature was held at the English Department of Dhaka University. Twenty-five scholars from various universities around the world participated.</p><p>The seminar discussed how the literary works of Tagore, Jibanananda Das, and Syed Shamsul Haq have spread globally.</p>',
    thumbnail: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&h=500&fit=crop',
    alt: 'Academic seminar in university hall', views: 2100, featured: false, breaking: false,
    pubDate: '2026-09-09T14:30:00+06:00'
  },
  {
    slug: 'du-library-digital-transformation',
    type: 'news', cat: 'technology',
    title_bn: 'ঢাকা বিশ্ববিদ্যালয়ের গ্রন্থাগার ডিজিটাল রূপান্তর সম্পন্ন',
    excerpt_bn: 'ঢাকা বিশ্ববিদ্যালয়ের মূল গ্রন্থাগারের সকল বই এখন অনলাইনে পাওয়া যাচ্ছে।',
    body_bn: '<p>ঢাকা বিশ্ববিদ্যালয়ের মূল গ্রন্থাগারের সকল বই এখন অনলাইনে পাওয়া যাচ্ছে। গ্রন্থাগার কর্তৃপক্ষ জানিয়েছে, প্রায় ৫ লক্ষ বই ডিজিটাইজ করা হয়েছে।</p><p>ছাত্ররা এখন বাসাবাড়ি থেকেও গ্রন্থাগারের সংগ্রহ ব্যবহার করতে পারবে। এই সেবাটি সম্পূর্ণ বিনামূল্যে।</p>',
    excerpt_en: 'DU library completes digital transformation: 5 lakh books now available online.',
    body_en: '<p>All books at Dhaka University main library are now available online. The library authority has announced that approximately 500,000 books have been digitized.</p><p>Students can now access the library collection from home. The service is completely free.</p>',
    thumbnail: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=800&h=500&fit=crop',
    alt: 'University library with digital screens', views: 4200, featured: false, breaking: false,
    pubDate: '2026-09-08T10:15:00+06:00'
  },
  {
    slug: 'du-sports-week-football-final',
    type: 'news', cat: 'sports',
    title_bn: 'বিশ্ববিদ্যালয় সপ্তাহ ফুটবল ফাইনালে পুলিশ বিভাগকে হারিল বিশ্ববিদ্যালয়',
    excerpt_bn: 'ঢাকা বিশ্ববিদ্যালয় সপ্তাহের ফুটবল ফাইনালে পুলিশ বিভাগকে ২-১ গোলে হারিয়ে বিশ্ববিদ্যালয় দল জয়ী হয়েছে।',
    body_bn: '<p>ঢাকা বিশ্ববিদ্যালয় সপ্তাহের ফুটবল ফাইনালে বিশ্ববিদ্যালয় দল পুলিশ বিভাগকে ২-১ গোলে হারিয়ে জয়ী হয়েছে। চূড়ান্ত ম্যাচটি অত্যন্ত উত্তেজনাপূর্ণ ছিল।</p><p>প্রথমার্ধে পুলিশ বিভাগ ১-০ গোলে এগিয়ে ছিল। তবে দ্বিতীয়ার্ধে বিশ্ববিদ্যালয় দল দুটি গোল করে ম্যাচটি জয় করে। ম্যাচের সেরা খেলোয়াড় ছিলেন ফরহান আহমেদ, যিনি ২টি গোল করেন।</p>',
    excerpt_en: 'DU defeats Police Division 2-1 in Sports Week football final.',
    body_en: '<p>Dhaka University defeated Police Division 2-1 in the Sports Week football final. The final match was highly competitive.</p><p>In the first half, Police Division led 1-0. However, in the second half, the university team scored two goals to win the match. The man of the match was Farhan Ahmed who scored 2 goals.</p>',
    thumbnail: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800&h=500&fit=crop',
    alt: 'Football match celebration', views: 5600, featured: false, breaking: false,
    pubDate: '2026-09-11T17:00:00+06:00'
  },
  {
    slug: 'du-cse-job-fair-2026',
    type: 'news', cat: 'technology',
    title_bn: 'প্রকৌশল অনুষদে চাকরি মেলা ২০২৬: ৫০টি কোম্পানি অংশগ্রহণ',
    excerpt_bn: 'ঢাকা বিশ্ববিদ্যালয়ের প্রকৌশল অনুষদে ৫০টি প্রযুক্তি কোম্পানি অংশগ্রহণ করে চাকরি মেলার আয়োজন করেছে।',
    body_bn: '<p>ঢাকা বিশ্ববিদ্যালয়ের প্রকৌশল ও প্রযুক্তি অনুষদে আজ ৫০টি প্রযুক্তি কোম্পানি অংশগ্রহণ করে চাকরি মেলার আয়োজন করেছে। এই চাকরি মেলায় সফটওয়্যার ইঞ্জিনিয়ার, ডেটা সায়েন্টিস্ট, AI স্পেশালিস্টসহ বিভিন্ন পদে নিয়োগ দেওয়া হচ্ছে।</p><p>প্রকৌশল অনুষদের ডিন জানিয়েছেন, এই চাকরি মেলায় প্রায় ২০০০ জন ছাত্র-ছাত্রী অংশগ্রহণ করেছে। অনেকেই চাকরির জন্য নির্বাচিত হয়েছেন।</p>',
    excerpt_en: 'Engineering Faculty job fair 2026: 50 tech companies participate.',
    body_en: '<p>50 technology companies participated in a job fair organized at the Faculty of Engineering and Technology of Dhaka University. Positions include Software Engineer, Data Scientist, AI Specialist, and others.</p><p>The Dean of Engineering Faculty announced that approximately 2,000 students participated in the job fair. Many have been selected for positions.</p>',
    thumbnail: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&h=500&fit=crop',
    alt: 'Technology job fair with company booths', views: 4800, featured: false, breaking: false,
    pubDate: '2026-09-11T09:30:00+06:00'
  },
];

async function main() {
  console.log('=== Seeding categories ===');
  const catSql = cats.map(c =>
    `INSERT INTO categories (id, slug, name_bn, name_en, description, parent_id, sort_order, is_active, created_at) VALUES ('${c.id}', '${c.slug}', '${c.name_bn}', '${c.name_en}', '${c.description}', NULL, ${c.sort_order}, true, now()) ON CONFLICT (slug) DO UPDATE SET name_bn = EXCLUDED.name_bn, name_en = EXCLUDED.name_en, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order`
  ).join('; ');

  const catResult = await runSql(catSql);
  console.log('Categories:', JSON.stringify(catResult).substring(0, 200));

  // Get actual category IDs (in case some already existed with different UUIDs)
  const existingCats = await runSql('SELECT id, slug FROM categories');
  console.log('Existing categories:', JSON.stringify(existingCats));
  
  const catIdMap = {};
  if (Array.isArray(existingCats)) {
    existingCats.forEach(c => catIdMap[c.slug] = c.id);
  }
  
  // Also add our generated IDs
  cats.forEach(c => { if (!catIdMap[c.slug]) catIdMap[c.slug] = c.id; });
  console.log('Category ID map:', JSON.stringify(catIdMap));

  console.log('\n=== Seeding articles ===');

  function esc(s) { return (s || '').replace(/'/g, "''"); }

  // Insert articles as 'draft' first (trigger requires it), then publish
  const insertedIds = [];
  for (const art of articles) {
    try {
      const catId = catIdMap[art.cat];
      const readTime = Math.ceil((art.body_bn || '').replace(/<[^>]*>/g, '').split(/\s+/).length / 200);
      const slug = art.slug;
      const now = art.pubDate;
      const articleId = uuid();
      insertedIds.push(articleId);
      
      const sql = `INSERT INTO contents (id, slug, content_type, content_format, language_primary, title_bn, subtitle_bn, excerpt_bn, body_bn, title_en, subtitle_en, excerpt_en, body_en, thumbnail_url, thumbnail_alt, category_id, status, published_at, view_count, read_time, is_featured, is_breaking, is_commentable, created_at, updated_at) VALUES ('${articleId}', '${esc(slug)}', '${art.type}', 'text', 'bn', '${esc(art.title_bn)}', NULL, '${esc(art.excerpt_bn)}', '${esc(art.body_bn)}', '${esc(art.title_en)}', NULL, '${esc(art.excerpt_en)}', '${esc(art.body_en)}', '${esc(art.thumbnail)}', '${esc(art.alt)}', '${catId}', 'draft', NULL, ${art.views}, ${readTime}, ${art.featured}, ${art.breaking}, true, '${now}', '${now}') ON CONFLICT (slug) DO UPDATE SET title_bn = EXCLUDED.title_bn, excerpt_bn = EXCLUDED.excerpt_bn, body_bn = EXCLUDED.body_bn, title_en = EXCLUDED.title_en, excerpt_en = EXCLUDED.excerpt_en, body_en = EXCLUDED.body_en, thumbnail_url = EXCLUDED.thumbnail_url, view_count = EXCLUDED.view_count, updated_at = now() RETURNING id`;

      const result = await runSql(sql);
      const hasError = result && result.message && result.message.includes('Error');
      console.log(`${hasError ? '❌' : '✅'} ${art.slug} — draft inserted`);
      if (hasError) console.log('   Error:', JSON.stringify(result).substring(0, 300));
    } catch (err) {
      console.log(`❌ ${art.slug} — ${err.message}`);
    }
  }

  // Now transition all to 'published'
  console.log('\n=== Publishing articles ===');
  for (const art of articles) {
    try {
      const pubSql = `UPDATE contents SET status = 'published', published_at = '${art.pubDate}' WHERE slug = '${art.slug}' AND status = 'draft'`;
      const result = await runSql(pubSql);
      const hasError = result && result.message && result.message.includes('Error');
      console.log(`${hasError ? '❌' : '✅'} ${art.slug} — published`);
      if (hasError) console.log('   Error:', JSON.stringify(result).substring(0, 300));
    } catch (err) {
      console.log(`❌ ${art.slug} — ${err.message}`);
    }
  }

  console.log('\n=== Done! ===');
  console.log(`Seeded ${cats.length} categories and ${articles.length} articles.`);
}

main().catch(console.error);
