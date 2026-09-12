-- Categories (idempotent)
INSERT INTO categories (id, slug, name_bn, name_en, sort_order, is_active)
VALUES
  ('c1', 'politics', 'রাজনীতি', 'Politics', 1, true),
  ('c2', 'sports', 'খেলাধুলা', 'Sports', 2, true),
  ('c3', 'technology', 'প্রযুক্তি', 'Technology', 3, true),
  ('c4', 'economy', 'অর্থনীতি', 'Economy', 4, true),
  ('c5', 'culture', 'সংস্কৃতি', 'Culture', 5, true),
  ('c6', 'education', 'শিক্ষা', 'Education', 6, true)
ON CONFLICT (id) DO NOTHING;

-- 1. DU Admission 2026-27
INSERT INTO contents (id, slug, content_type, content_format, language_primary, title_bn, excerpt_bn, body_bn, title_en, excerpt_en, body_en, thumbnail_url, category_id, status, published_at, view_count, read_time, is_featured, is_breaking, is_commentable, version, created_at, updated_at)
VALUES ('news-01', 'du-announces-admission-schedule-2026-27', 'news', 'text', 'bn',
'ঢাকা বিশ্ববিদ্যালয় ২০২৬-২৭ শিক্ষাবর্ষের ভর্তি সময়সূচি ঘোষণা',
'অনলাইনে আবেদন শুরু হবে অক্টোবর মাস থেকে।',
'<p>ঢাকা বিশ্ববিদ্যালয় তার ২০২৬-২৭ শিক্ষাবর্ষের স্নাতক প্রথম বর্ষে ভর্তির সময়সূচি ঘোষণা করেছে। অনলাইনে আবেদন প্রক্রিয়া অক্টোবরের প্রথম সপ্তাহ থেকে শুরু হবে।</p><p>এই বছর ৭ ইউনিটে প্রায় ৭,০০০টি আসনে ভর্তি পরীক্ষা অনুষ্ঠিত হবে।</p>',
'Dhaka University announces admission schedule for 2026-27',
'Online applications will begin in October.',
'<p>Dhaka University has announced the admission schedule for its 2026-27 undergraduate programmes. Online applications will begin in the first week of October.</p><p>Entrance exams will be held across 7 units for approximately 7,000 seats.</p>',
'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1200&q=60',
'c6', 'published', now() - interval '2 hours', 3420, 4, true, false, true, 1, now(), now())
ON CONFLICT (id) DO NOTHING;

-- 2. FIFA World Cup restrictions
INSERT INTO contents (id, slug, content_type, content_format, language_primary, title_bn, excerpt_bn, body_bn, title_en, excerpt_en, body_en, thumbnail_url, category_id, status, published_at, view_count, read_time, is_featured, is_breaking, is_commentable, version, created_at, updated_at)
VALUES ('news-02', 'du-restricts-outsider-entry-during-fifa-world-cup', 'news', 'text', 'bn',
'ফিফা বিশ্বকাপের সময় ঢাবি ক্যাম্পাসে বহিরাগতদের প্রবেশ নিষেধ',
'ক্যাম্পাসে বাহন চলাচলও নিয়ন্ত্রণ থাকবে।',
'<p>ফিফা বিশ্বকাপ ২০২৬-এর সময় ঢাকা বিশ্ববিদ্যালয় কর্তৃপক্ষ ক্যাম্পাসে বহিরাগতদের প্রবেশ নিষিদ্ধ করেছে।</p><p>বিশ্বকাপের সময়কাল জুন থেকে জুলাই পর্যন্ত চলবে।</p>',
'DU restricts outsider entry during FIFA World Cup',
'Vehicular movement on campus will also be regulated.',
'<p>Dhaka University authorities have banned outsiders from entering the campus during the FIFA World Cup 2026 to ensure security.</p><p>The restrictions will remain in place throughout June to July.</p>',
'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=60',
'c2', 'published', now() - interval '1 day', 5120, 3, true, true, true, 1, now(), now())
ON CONFLICT (id) DO NOTHING;

-- 3. Hall provost clash
INSERT INTO contents (id, slug, content_type, content_format, language_primary, title_bn, excerpt_bn, body_bn, title_en, excerpt_en, body_en, thumbnail_url, category_id, status, published_at, view_count, read_time, is_featured, is_breaking, is_commentable, version, created_at, updated_at)
VALUES ('news-03', 'du-hall-provost-resignation-row-sparks-clash', 'news', 'text', 'bn',
'ফজলুল হক মুসলিম হলের প্রোভোস্ট পদত্যাগ দাবিতে সংঘর্ষ',
'ছাত্র দল দুটির মধ্যে সংঘর্ষে ছয়জন আহত।',
'<p>ঢাকা বিশ্ববিদ্যালয়ের ফজলুল হক মুসলিম হলের প্রোভোস্ট প্রতিস্থাপনের দাবিতে ছাত্র দল দুটির মধ্যে সংঘর্ষ ঘটেছে।</p><p>ঘটনাটি রাত ২:৪৫টায় ঘটে।</p>',
'DU hall provost resignation row sparks clash',
'Six injured including VP and GS.',
'<p>A dispute over demands for the resignation of the provost of Fazlul Huq Muslim Hall escalated into a clash.</p><p>The confrontation occurred around 2:45am. Six people were injured.</p>',
'https://images.unsplash.com/photo-1523050854058-8df90110c8f1?auto=format&fit=crop&w=1200&q=60',
'c1', 'published', now() - interval '3 days', 8900, 5, true, false, true, 1, now(), now())
ON CONFLICT (id) DO NOTHING;

-- 4. Girls hall gate time
INSERT INTO contents (id, slug, content_type, content_format, language_primary, title_bn, excerpt_bn, body_bn, title_en, excerpt_en, body_en, thumbnail_url, category_id, status, published_at, view_count, read_time, is_featured, is_breaking, is_commentable, version, created_at, updated_at)
VALUES ('news-04', 'du-extends-girls-hall-gate-closing-time', 'news', 'text', 'bn',
'ঢাবি মেয়েদের হলের গেট বন্ধের সময় এক ঘণ্টা বাড়ানো হলো',
'নতুন সিদ্ধান্ত অনুযায়ী রাত ১২টায় গেট বন্ধ হবে।',
'<p>ঢাকা বিশ্ববিদ্যালয় কর্তৃপক্ষ মেয়েদের আবাসিক হলগুলোর গেট বন্ধের সময় এক ঘণ্টা বাড়িয়েছে।</p><p>নতুন বিধি অনুযায়ী গেট রাত ১২টায় বন্ধ হবে।</p>',
'DU extends girls hall gate closing time by one hour',
'New rule allows entry until midnight.',
'<p>Dhaka University authorities have extended the gate closing time of female residential halls by one hour.</p><p>Gates will close at midnight instead of 11pm.</p>',
'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1200&q=60',
'c5', 'published', now() - interval '5 days', 4200, 3, false, false, true, 1, now(), now())
ON CONFLICT (id) DO NOTHING;

-- 5. Science unit test
INSERT INTO contents (id, slug, content_type, content_format, language_primary, title_bn, excerpt_bn, body_bn, title_en, excerpt_en, body_en, thumbnail_url, category_id, status, published_at, view_count, read_time, is_featured, is_breaking, is_commentable, version, created_at, updated_at)
VALUES ('news-05', 'over-1-14-lakh-students-du-science-unit-test', 'news', 'text', 'bn',
'১১৪ হাজারের বেশি শিক্ষার্থী ঢাবি বিজ্ঞান ইউনিটের ভর্তি পরীক্ষায় অংশ নিচ্ছেন',
'পূর্ববর্তী পরীক্ষা স্থগিত হওয়ায় আজ পুনরায় অনুষ্ঠিত হচ্ছে।',
'<p>ঢাকা বিশ্ববিদ্যালয়ের প্রথম বর্ষ বিজ্ঞান ইউনিটের স্থগিত ভর্তি পরীক্ষা আজ অনুষ্ঠিত হচ্ছে। প্রায় ১ লাখ ১৪ হাজার শিক্ষার্থী এই পরীক্ষায় অংশ নিচ্ছেন।</p><p>গত ডিসেম্বরে পরীক্ষা স্থগিত করা হয়েছিল।</p>',
'Over 1.14 lakh students sit for DU Science unit test',
'The postponed admission test is being held today.',
'<p>The postponed admission test for the first-year undergraduate Science unit of Dhaka University is being held today.</p><p>Approximately 114,000 students are sitting for the exam.</p>',
'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=60',
'c6', 'published', now() - interval '7 days', 6700, 4, false, true, true, 1, now(), now())
ON CONFLICT (id) DO NOTHING;

-- 6. DU 15-day closure
INSERT INTO contents (id, slug, content_type, content_format, language_primary, title_bn, excerpt_bn, body_bn, title_en, excerpt_en, body_en, thumbnail_url, category_id, status, published_at, view_count, read_time, is_featured, is_breaking, is_commentable, version, created_at, updated_at)
VALUES ('news-06', 'du-announces-15-day-closure', 'news', 'text', 'bn',
'ঢাবি ১৫ দিনের জন্য বন্ধ ঘোষণা',
'শিক্ষার্থীদের হল ত্যাগের নির্দেশ দেওয়া হয়েছে।',
'<p>ঢাকা বিশ্ববিদ্যালয় কর্তৃপক্ষ ১৫ দিনের জন্য বিশ্ববিদ্যালয় বন্ধ ঘোষণা করেছে।</p><p>সকল শিক্ষার্থীদের হল ত্যাগ করার নির্দেশ দেওয়া হয়েছে।</p>',
'DU announces 15-day closure',
'Students directed to leave halls.',
'<p>Dhaka University authorities have announced a 15-day closure of the university.</p><p>All students have been directed to leave the residential halls.</p>',
'https://images.unsplash.com/photo-1580537659466-0a9bfa916a54?auto=format&fit=crop&w=1200&q=60',
'c6', 'published', now() - interval '10 days', 12400, 3, false, false, true, 1, now(), now())
ON CONFLICT (id) DO NOTHING;

-- 7. TSC gathering
INSERT INTO contents (id, slug, content_type, content_format, language_primary, title_bn, excerpt_bn, body_bn, title_en, excerpt_en, body_en, thumbnail_url, category_id, status, published_at, view_count, read_time, is_featured, is_breaking, is_commentable, version, created_at, updated_at)
VALUES ('news-07', 'du-tsc-premises-turned-into-sea-of-color', 'news', 'text', 'bn',
'ঢাবির টিএসসি প্রাঙ্গণে রঙিন জমায়েত',
'বিশ্বকাপ ফাইনালের আগে ছাত্রদের বিপুল সমাবেশ।',
'<p>ফিফা বিশ্বকাপ ফাইনালের আগে ঢাকা বিশ্ববিদ্যালয়ের টিএসসি প্রাঙ্গণে ছাত্রদের বিপুল জমায়েত হয়েছে।</p><p>ছাত্ররা একসাথে ম্যাচ দেখার আয়োজন করেছিল।</p>',
'DU TSC premises turned into a sea of color',
'Massive student gathering before the World Cup final.',
'<p>Before the FIFA World Cup final, the TSC premises of Dhaka University turned into a massive gathering of students.</p><p>Students gathered to watch the match together.</p>',
'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1200&q=60',
'c5', 'published', now() - interval '2 days', 7800, 3, false, false, true, 1, now(), now())
ON CONFLICT (id) DO NOTHING;

-- 8. Masters admission
INSERT INTO contents (id, slug, content_type, content_format, language_primary, title_bn, excerpt_bn, body_bn, title_en, excerpt_en, body_en, thumbnail_url, category_id, status, published_at, view_count, read_time, is_featured, is_breaking, is_commentable, version, created_at, updated_at)
VALUES ('news-08', 'du-opens-masters-admission-2026-27', 'news', 'text', 'bn',
'ঢাবি ২০২৬-২৭ শিক্ষাবর্ষের স্নাতকোত্তর ভর্তি খুলে দিয়েছে',
'অনলাইনে আবেদনের শেষ তারিখ নভেম্বর ১৫।',
'<p>ঢাকা বিশ্ববিদ্যালয় ২০২৬-২৭ শিক্ষাবর্ষের স্নাতকোত্তর প্রোগ্রামে ভর্তি খুলে দিয়েছে।</p><p>বিভিন্ন বিভাগে মোট ২,৫০০টি আসন রয়েছে।</p>',
'DU opens Masters admission for 2026-27',
'Online application deadline is November 15.',
'<p>Dhaka University has opened admission for its Masters programmes for the 2026-27 academic session.</p><p>A total of 2,500 seats are available across various departments.</p>',
'https://images.unsplash.com/photo-1523050854058-8df90110c8f1?auto=format&fit=crop&w=1200&q=60',
'c6', 'published', now() - interval '4 days', 3100, 4, false, false, true, 1, now(), now())
ON CONFLICT (id) DO NOTHING;

-- 9. Crowds break barricades
INSERT INTO contents (id, slug, content_type, content_format, language_primary, title_bn, excerpt_bn, body_bn, title_en, excerpt_en, body_en, thumbnail_url, category_id, status, published_at, view_count, read_time, is_featured, is_breaking, is_commentable, version, created_at, updated_at)
VALUES ('news-09', 'crowds-break-barricades-enter-du-campus', 'news', 'text', 'bn',
'বিশ্বকাপ ফাইনালের আগে ঢাবি ক্যাম্পাসে ব্যারিকেড ভাঙে জনতা',
'নিরাপত্তা ব্যারিকেড ভেঙে ক্যাম্পাসে ঢোকে হাজার হাজার মানুষ।',
'<p>ফিফা বিশ্বকাপ ফাইনালের আগে ঢাকা বিশ্ববিদ্যালয়ের ক্যাম্পাসে বহিরাগতদের প্রবেশ নিষিদ্ধ করা হলেও হাজার হাজার মানুষ নিরাপত্তা ব্যারিকেড ভেঙে ক্যাম্পাসে ঢুকে পড়ে।</p><p>প্রত্যক্ষদর্শীদের বলা, রাত ৭টার দিকে ব্যাপক ভিড় জমে ওঠে।</p>',
'Crowds break through barricades to enter DU campus',
'Thousands breach security barriers ahead of World Cup final.',
'<p>Despite restrictions on outsider entry, thousands of people broke through security barricades and entered the Dhaka University campus.</p><p>Witnesses said a massive crowd gathered around 7pm and breached the barricades.</p>',
'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=60',
'c1', 'published', now() - interval '6 days', 15600, 4, true, false, true, 1, now(), now())
ON CONFLICT (id) DO NOTHING;

-- 10. CMC results
INSERT INTO contents (id, slug, content_type, content_format, language_primary, title_bn, excerpt_bn, body_bn, title_en, excerpt_en, body_en, thumbnail_url, category_id, status, published_at, view_count, read_time, is_featured, is_breaking, is_commentable, version, created_at, updated_at)
VALUES ('news-10', 'du-cmc-unit-results-published', 'news', 'text', 'bn',
'ঢাবি সিএমসি ইউনিট ভর্তি পরীক্ষার ফলাফল প্রকাশ',
'অনলাইনে ফলাফল দেখা যাচ্ছে ঢাবির অফিসিয়াল ওয়েবসাইটে।',
'<p>ঢাকা বিশ্ববিদ্যালয়ের সামাজিক বিজ্ঞান ইউনিট ভর্তি পরীক্ষার ফলাফল প্রকাশ করা হয়েছে।</p><p>এই বছর ৮৫,০০০ শিক্ষার্থী পরীক্ষা দিয়েছিলেন।</p>',
'DU CMC unit admission test results published',
'Results available on DU official website.',
'<p>Dhaka University has published the results of the Social Science unit admission test.</p><p>This year, 85,000 students sat for the examination.</p>',
'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1200&q=60',
'c6', 'published', now() - interval '8 days', 9200, 3, false, false, true, 1, now(), now())
ON CONFLICT (id) DO NOTHING;

-- 11. DU cricket
INSERT INTO contents (id, slug, content_type, content_format, language_primary, title_bn, excerpt_bn, body_bn, title_en, excerpt_en, body_en, thumbnail_url, category_id, status, published_at, view_count, read_time, is_featured, is_breaking, is_commentable, version, created_at, updated_at)
VALUES ('news-11', 'du-cricket-team-wins-inter-university-tournament', 'news', 'text', 'bn',
'ঢাবি ক্রিকেট দল আন্তঃবিশ্ববিদ্যালয় টুর্নামেন্টে জয়ী',
'ফাইনালে বুয়েটকে ৬ উইকেটে পরাজিত করেছে ঢাবি।',
'<p>ঢাকা বিশ্ববিদ্যালয়ের ক্রিকেট দল আন্তঃবিশ্ববিদ্যালয় ক্রিকেট টুর্নামেন্টে চ্যাম্পিয়ন হয়েছে।</p><p>ফাইনালে তারা বুয়েটকে ৬ উইকেটে পরাজিত করেছে।</p>',
'DU cricket team wins inter-university tournament',
'DU defeated BUET by 6 wickets in the final.',
'<p>The Dhaka University cricket team has become champions in the inter-university cricket tournament.</p><p>In the final, they defeated BUET by 6 wickets.</p>',
'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=1200&q=60',
'c2', 'published', now() - interval '9 days', 4500, 3, false, false, true, 1, now(), now())
ON CONFLICT (id) DO NOTHING;

-- 12. Library digitization
INSERT INTO contents (id, slug, content_type, content_format, language_primary, title_bn, excerpt_bn, body_bn, title_en, excerpt_en, body_en, thumbnail_url, category_id, status, published_at, view_count, read_time, is_featured, is_breaking, is_commentable, version, created_at, updated_at)
VALUES ('news-12', 'du-library-digitization-project-completed', 'article', 'text', 'bn',
'ঢাবি গ্রন্থাগার ডিজিটালাইজেশন প্রকল্প সম্পন্ন',
'৫ লাখ পৃষ্ঠার বই এখন অনলাইনে পড়া যাচ্ছে।',
'<p>ঢাকা বিশ্ববিদ্যালয়ের কেন্দ্রীয় গ্রন্থাগারের ডিজিটালাইজেশন প্রকল্প সম্পন্ন হয়েছে।</p><p>এখন ৫ লাখ পৃষ্ঠার বই অনলাইনে পড়া যাচ্ছে।</p>',
'DU library digitization project completed',
'5 lakh pages of books now available online.',
'<p>The digitization project of Dhaka University Central Library has been completed.</p><p>Now 5 lakh pages of books are available online.</p>',
'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1200&q=60',
'c3', 'published', now() - interval '12 days', 2800, 6, false, false, true, 1, now(), now())
ON CONFLICT (id) DO NOTHING;
