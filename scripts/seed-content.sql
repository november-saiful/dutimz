-- ============================================
-- Phase 6 Content Seeding
-- Realistic Bangla news articles for production launch.
-- Run AFTER migration 0001–0006 have been applied.
-- ============================================

-- Categories (idempotent)
INSERT INTO categories (id, slug, name_bn, name_en, sort_order, is_active)
VALUES
  ('c1', 'politics', 'রাজনীতি', 'Politics', 1, true),
  ('c2', 'sports', 'খেলাধুলা', 'Sports', 2, true),
  ('c3', 'technology', 'প্রযুক্তি', 'Technology', 3, true),
  ('c4', 'economy', 'অর্থনীতি', 'Economy', 4, true),
  ('c5', 'culture', 'সংস্কৃতি', 'Culture', 5, true)
ON CONFLICT (id) DO NOTHING;

-- Published articles
INSERT INTO contents (
  id, slug, content_type, content_format, language_primary,
  title_bn, excerpt_bn, body_bn, title_en, excerpt_en, body_en,
  thumbnail_url, category_id, status, published_at, view_count, read_time,
  is_featured, is_breaking, is_commentable, version, created_at, updated_at
)
VALUES
  (
    'seed-01', 'dutimz-launches-bilingual-news-portal-2026', 'news', 'text', 'bn',
    'দুতিমজ চালু করল দ্বিভাষিক সংবাদ পোর্টাল',
    'নতুন প্ল্যাটফর্মে টেক্সট, ভিডিও ও ডকুমেন্টারি — একসাথে বাংলা ও ইংরেজিতে।',
    '<p>ঢাকা, ১২ সেপ্টেম্বর ২০২৬ — ঢাকা ইউনিভার্সিটি টাইম্‌জ (দুতিমজ) আজ আনুষ্ঠানিকভাবে তার দ্বিভাষিক সংবাদ পোর্টাল চালু করেছে। এই প্ল্যাটফর্মে পাঠকরা বাংলা ও ইংরেজি — উভয় ভাষায় সংবাদ, নিবন্ধ এবং ডকুমেন্টারি দেখতে পাবেন।</p><p>প্রধান সম্পাদক বলেছেন, "বাংলাদেশের তরুণ প্রজন্ম ডিজিটাল মাধ্যমে খবর পড়তে ভালোবাসে। আমরা তাদের জন্য একটি আধুনিক, দ্রুত এবং সুন্দর পোর্টাল তৈরি করেছি।"</p>',
    'DUTIMZ launches bilingual news portal',
    'The new platform ships text, video and documentary formats in Bangla and English.',
    '<p>Dhaka, September 12 2026 — Dhaka University Times (DUTIMZ) today officially launched its bilingual news portal. Readers can now access news, articles and documentaries in both Bangla and English.</p><p>The editor-in-chief said, "Bangladesh''s young generation loves consuming news digitally. We have built a modern, fast, and beautiful portal for them."</p>',
    'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?auto=format&fit=crop&w=1200&q=60',
    'c3', 'published', now() - interval '1 day', 1240, 4, true, false, true, 1, now(), now()
  ),
  (
    'seed-02', 'dhaka-metro-rail-new-timetable', 'news', 'text', 'bn',
    'ঢাকা মেট্রোরেলের নতুন সময়সূচি ঘোষণা',
    'অফিস টাইমে ট্রেনের ফ্রিকোয়েন্সি বাড়ানো হচ্ছে, জানাল কর্তৃপক্ষ।',
    '<p>ঢাকা মেট্রোরেল কর্তৃপক্ষ আজ নতুন সময়সূচি ঘোষণা করেছে। সকাল ৭টা থেকে ১০টা এবং বিকেল ৪টা থেকে ৭টার মধ্যে ট্রেনের ফ্রিকোয়েন্সি ৩ মিনিটে একটি করে বাড়ানো হবে।</p><p>এই সিদ্ধান্ত যাত্রীদের চাপ কমানোর জন্য নেওয়া হয়েছে। বর্তমানে পিক আওয়ারে ৫ মিনিট পর পর ট্রেন চলছে।</p>',
    'Dhaka Metro Rail announces new timetable',
    'Authorities will increase train frequency during office hours.',
    '<p>Dhaka Metro Rail Authority today announced a new timetable. Between 7am-10am and 4pm-7pm, train frequency will increase to every 3 minutes.</p><p>The decision was made to reduce passenger pressure. Currently trains run every 5 minutes during peak hours.</p>',
    'https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=1200&q=60',
    'c4', 'published', now() - interval '1 day', 2210, 3, true, true, true, 1, now(), now()
  ),
  (
    'seed-03', 'bangladesh-t20-series-squad', 'news', 'text', 'bn',
    'টি-টোয়েন্টি সিরিজের জন্য দল ঘোষণা',
    'সিরিজ শুরু আগামী সপ্তাহে, দলে দুই নতুন মুখ।',
    '<p>বাংলাদেশ ক্রিকেট বোর্ড আসন্ন টি-টোয়েন্টি সিরিজের জন্য ১৫ সদস্যের দল ঘোষণা করেছে। দলে রয়েছেন দুইজন নতুন খেলোয়াড় — একজন বোলার এবং একজন অল-রাউন্ডার।</p><p>সিরিজ আগামী সপ্তাহে শুরু হবে এবং ৫ ম্যাচের সমন্বয়ে গঠিত হবে।</p>',
    'Squad announced for T20 series',
    'The series starts next week with two debutants in the squad.',
    '<p>The Bangladesh Cricket Board has announced a 15-member squad for the upcoming T20 series. The squad includes two new players — a bowler and an all-rounder.</p><p>The series starts next week and will consist of 5 matches.</p>',
    'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=1200&q=60',
    'c2', 'published', now() - interval '2 days', 1890, 3, true, false, true, 1, now(), now()
  ),
  (
    'seed-04', 'ai-in-bangla-newsrooms', 'article', 'text', 'bn',
    'বাংলা নিউজরুমে কৃত্রিম বুদ্ধিমত্তা',
    'সম্পাদকীয় প্রবাহে এআই কতটা এগিয়ে আনতে পারে — গভীর বিশ্লেষণ।',
    '<p>কৃত্রিম বুদ্ধিমত্তা (AI) বাংলা নিউজরুমে ধীরে ধীরে প্রবেশ করছে। অটো-ট্রান্সক্রিপশন, সামারি জেনারেশন এবং কন্টেন্ট রেকমেন্ডেশন — এসব ক্ষেত্রে AI ইতিমধ্যে কাজ করছে।</p><p>তবে সম্পাদকরা বলছেন, AI কখনোই মানব সম্পাদকের বিকল্প হতে পারবে না। এটি শুধুমাত্র একটি সহায়ক হাতিয়ার।</p>',
    'AI in Bangla newsrooms',
    'A deep analysis of how far AI can accelerate editorial workflows.',
    '<p>Artificial Intelligence (AI) is gradually entering Bangla newsrooms. Auto-transcription, summary generation, and content recommendation — AI is already working in these areas.</p><p>However, editors say AI can never replace human editors. It is merely a helpful tool.</p>',
    'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=60',
    'c3', 'published', now() - interval '2 days', 980, 8, true, false, true, 1, now(), now()
  ),
  (
    'seed-05', 'padma-bridge-economic-impact', 'article', 'text', 'bn',
    'পদ্মা সেতুর অর্থনৈতিক প্রভাব',
    'দক্ষিণাঞ্চলের বাণিজ্যে সেতুর প্রভাব বিশ্লেষণ।',
    '<p>পদ্মা সেতু চালু হওয়ার পর থেকে দক্ষিণাঞ্চলের বাণিজ্যে উল্লেখযোগ্য পরিবর্তন এসেছে। ট্রাকের চলাচল ৪০% বেড়েছে এবং মালামাল পরিবহনের খরচ ২৫% কমেছে।</p><p>বিশ্লেষকরা বলছেন, এই সেতু শুধু পরিবহন নয়, এটি একটি অর্থনৈতিক করিডোর।</p>',
    'The economic impact of Padma Bridge',
    'Analysing the bridge''s effect on southern trade corridors.',
    '<p>Since the Padma Bridge opened, trade in the southern region has changed significantly. Truck traffic has increased 40% and freight transport costs have decreased 25%.</p><p>Analysts say this bridge is not just transportation — it is an economic corridor.</p>',
    'https://images.unsplash.com/photo-1513415564515-763d91423bdd?auto=format&fit=crop&w=1200&q=60',
    'c4', 'published', now() - interval '3 days', 1420, 6, false, false, true, 1, now(), now()
  ),
  (
    'seed-06', 'monsoon-forecast-this-week', 'news', 'text', 'bn',
    'এই সপ্তাহের বর্ষা পূর্বাভাস',
    'উপকূলীয় জেলায় ভারী বৃষ্টির সম্ভাবনা।',
    '<p>আবহাওয়া অধিদপ্তর জানিয়েছে, এই সপ্তাহে উপকূলীয় জেলাগুলোতে ভারী বৃষ্টি হতে পারে। চট্টগ্রাম, কক্সবাজার এবং বরিশাল জেলায় সতর্কতা জারি করা হয়েছে।</p>',
    'Monsoon forecast for this week',
    'Heavy rain likely in coastal districts.',
    '<p>The Meteorological Department has announced that heavy rain may occur in coastal districts this week. Alerts have been issued for Chittagong, Cox''s Bazar, and Barisal districts.</p>',
    'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?auto=format&fit=crop&w=1200&q=60',
    'c1', 'published', now() - interval '3 days', 760, 2, false, false, true, 1, now(), now()
  ),
  (
    'seed-07', 'folk-festival-opens-in-dhaka', 'article', 'text', 'bn',
    'ঢাকায় শুরু হলো লোকজ উৎসব',
    'তিন দিনের উৎসবে থাকছে ভাওয়াইয়া ও ভাটিয়ালি গান।',
    '<p>ঢাকা বিশ্ববিদ্যালয়ের কেন্দ্রীয় মঞ্চে তিন দিনের লোকজ উৎসব শুরু হয়েছে। উদ্বোধনী দিনে ভাওয়াইয়া ও ভাটিয়ালি গানের আসর বসেছে।</p><p>উৎসবে দেশের বিভিন্ন প্রান্ত থেকে শিল্পীরা এসেছেন।</p>',
    'Folk festival opens in Dhaka',
    'The three-day festival features Bhaiaiya and Bhatiali performances.',
    '<p>A three-day folk festival has started at the central stage of Dhaka University. On the opening day, Bhaiaiya and Bhatiali songs were performed.</p><p>Artists from various parts of the country have gathered for the festival.</p>',
    'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=1200&q=60',
    'c5', 'published', now() - interval '4 days', 640, 5, false, false, true, 1, now(), now()
  ),
  (
    'seed-08', 'youth-startups-raise-funding', 'news', 'text', 'bn',
    'তরুণ উদ্যোক্তাদের স্টার্টআপে বিনিয়োগ',
    'পাঁচটি স্টার্টআপ মিলে সিড ফান্ডিং পেল।',
    '<p>বাংলাদেশের পাঁচটি তরুণ উদ্যোক্তার স্টার্টআপ মিলে মোট ৫ কোটি টাকা সিড ফান্ডিং সংগ্রহ করেছে। এই স্টার্টআপগুলো শিক্ষা, স্বাস্থ্য এবং কৃষি খাতে কাজ করছে।</p>',
    'Youth-led startups raise funding',
    'Five startups collectively closed seed rounds.',
    '<p>Five young entrepreneurs'' startups in Bangladesh collectively raised 5 crore BDT in seed funding. These startups work in education, health, and agriculture sectors.</p>',
    'https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=1200&q=60',
    'c4', 'published', now() - interval '5 days', 540, 4, false, false, true, 1, now(), now()
  ),
  (
    'seed-09', 'documentary-the-rivers-of-bengal', 'documentary', 'video', 'bn',
    'প্রামাণ্যচিত্র: বাংলার নদী',
    'নদী, জীবন ও টেকসই ভবিষ্যৎ — একটি ভিজ্যুয়াল যাত্রা।',
    '<p>বাংলার নদীগুলো শুধু জলের স্রোত নয়, এগুলো জীবনের ধারা। এই প্রামাণ্যচিত্রে আমরা দেখব কীভাবে নদী বাংলাদেশের অর্থনীতি, সংস্কৃতি এবং দৈনন্দিন জীবনকে প্রভাবিত করে।</p>',
    'Documentary: The Rivers of Bengal',
    'Rivers, life and a sustainable future — a visual journey.',
    '<p>The rivers of Bengal are not just water currents — they are the flow of life. In this documentary we see how rivers affect Bangladesh''s economy, culture, and daily life.</p>',
    'https://images.unsplash.com/photo-1504701954957-2010ec3bcec1?auto=format&fit=crop&w=1200&q=60',
    'c5', 'published', now() - interval '6 days', 3120, 12, false, false, true, 1, now(), now()
  ),
  (
    'seed-10', 'documentary-tea-garden-workers', 'documentary', 'video', 'bn',
    'প্রামাণ্যচিত্র: চা-বাগানের জীবন',
    'চা-বাগানের শ্রমিকদের প্রতিদিনের গল্প।',
    '<p>পাহাড়ি এলাকায় অবস্থিত চা-বাগানের শ্রমিকদের দৈনন্দিন জীবন নিয়ে এই প্রামাণ্যচিত্র। সকালের বেলা থেকে সন্ধ্যা পর্যন্ত তাদের কঠোর পরিশ্রম এবং স্বপ্ন।</p>',
    'Documentary: Life in tea gardens',
    'A day-in-the-life story of tea garden workers.',
    '<p>This documentary follows the daily lives of tea garden workers in the hill tracts. From morning to evening, their hard work and dreams.</p>',
    'https://images.unsplash.com/photo-1564769625905-50e93615e769?auto=format&fit=crop&w=1200&q=60',
    'c5', 'published', now() - interval '7 days', 1580, 10, false, false, true, 1, now(), now()
  )
ON CONFLICT (id) DO NOTHING;

-- Update search vectors for seeded content
UPDATE contents SET updated_at = updated_at WHERE id LIKE 'seed-%';
