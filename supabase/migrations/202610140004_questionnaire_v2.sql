-- Questionnaire v2: fill the non-criminal gaps reporters kept hitting.
--
-- v1's non-criminal branch (প্রতিবাদ … গবেষণা) had no home for the everyday
-- campus stories: দুর্ঘটনা, দুর্যোগ / অগ্নিকাণ্ড, ক্যাম্পাস সেবা ও অবকাঠামো,
-- প্রশাসনিক ঘোষণা / সিদ্ধান্ত, অর্জন / সাফল্য. Reporters forced those into
-- "অন্যান্য", which starved the statistics of real categories.
--
-- This deactivates v1 and publishes v2. Old responses stay on v1 (the stats
-- and reading functions loop over every version), new submissions use v2.
-- All v1 ids/options are kept byte-identical so existing tests and answers
-- keep validating.
begin;

update public.article_questionnaire_versions set active = false where active;

insert into public.article_questionnaire_versions (version, schema, active)
select 2, $schema$[
  {"id":"verification_status","label":"তথ্যের যাচাইয়ের অবস্থা কী?","type":"single","required":true,"options":["প্রাথমিক তথ্য — স্বাধীনভাবে যাচাই হয়নি","একাধিক নির্ভরযোগ্য সূত্রে যাচাই করা","সরকারি নথি বা কর্তৃপক্ষের বক্তব্যে নিশ্চিত"]},
  {"id":"verification_notes","label":"যাচাইয়ের সূত্র বা বিবরণ","type":"textarea","required":true},
  {"id":"criminal_activity","label":"এটি কি অপরাধমূলক কার্যকলাপের অভিযোগ?","type":"single","required":true,"options":["হ্যাঁ","না"]},
  {"id":"crime_type","label":"কী ধরনের অপরাধের অভিযোগ?","type":"multi","required":true,"options":["হত্যা","অ-প্রাণঘাতী আঘাত","সম্পত্তির ক্ষতি","অহিংস অপরাধ","হয়রানি","অন্যান্য অপরাধ"],"conditions":[{"fieldId":"criminal_activity","values":["হ্যাঁ"]}]},
  {"id":"harassment_type","label":"হয়রানিটি কি যৌন?","type":"single","required":true,"options":["যৌন হয়রানি","অযৌন হয়রানি"],"conditions":[{"fieldId":"crime_type","values":["হয়রানি"]}]},
  {"id":"victims","label":"ভুক্তভোগীর তথ্য","type":"people","required":true,"countLabel":"ভুক্তভোগীর সংখ্যা (অজানা হলে ০)","conditions":[{"fieldId":"crime_type","values":["হত্যা"]},{"fieldId":"crime_type","values":["অ-প্রাণঘাতী আঘাত"]},{"fieldId":"harassment_type","values":["যৌন হয়রানি"]},{"fieldId":"harassment_type","values":["অযৌন হয়রানি"]}],"personFields":[{"id":"name","label":"নাম (নির্ভরযোগ্য সূত্রে নিশ্চিত হলে)","type":"text"},{"id":"gender","label":"লিঙ্গ","type":"single","options":["নারী","পুরুষ","অন্যান্য","জানা নেই"]},{"id":"session","label":"শিক্ষাবর্ষ / সেশন","type":"text"},{"id":"identification","label":"অন্যান্য পরিচিতি (সংবেদনশীল তথ্য নয়)","type":"text"}]},
  {"id":"property_type","label":"কোন সম্পত্তির ক্ষতি হয়েছে?","type":"multi","required":true,"options":["সড়ক","বাড়ি","একাডেমিক ভবন","ক্যাম্পাসের অন্যান্য ভবন","যানবাহন","দোকান","গাছপালা","অন্যান্য সম্পত্তি"],"conditions":[{"fieldId":"crime_type","values":["সম্পত্তির ক্ষতি"]}]},
  {"id":"crime_details","label":"অপরাধের সংক্ষিপ্ত বিবরণ","type":"textarea","required":true,"conditions":[{"fieldId":"criminal_activity","values":["হ্যাঁ"]}]},
  {"id":"crime_location","label":"ঘটনার স্থান","type":"text","required":false,"conditions":[{"fieldId":"criminal_activity","values":["হ্যাঁ"]}]},
  {"id":"crime_time","label":"ঘটনার তারিখ বা সময়","type":"text","required":false,"conditions":[{"fieldId":"criminal_activity","values":["হ্যাঁ"]}]},
  {"id":"property_details","label":"ক্ষতিগ্রস্ত সম্পত্তি ও ক্ষতির বিবরণ","type":"textarea","required":true,"conditions":[{"fieldId":"crime_type","values":["সম্পত্তির ক্ষতি"]}]},
  {"id":"suspects","label":"অভিযুক্ত ব্যক্তিদের তথ্য (অভিযোগ প্রমাণিত না-ও হতে পারে)","type":"people","required":true,"countLabel":"অভিযুক্তের সংখ্যা (অজানা হলে ০)","conditions":[{"fieldId":"criminal_activity","values":["হ্যাঁ"]}],"personFields":[{"id":"name","label":"নাম (নির্ভরযোগ্য সূত্রে নিশ্চিত হলে)","type":"text"},{"id":"gender","label":"লিঙ্গ","type":"single","options":["নারী","পুরুষ","অন্যান্য","জানা নেই"]},{"id":"session","label":"শিক্ষাবর্ষ / সেশন","type":"text"},{"id":"identification","label":"অন্যান্য পরিচিতি (সংবেদনশীল তথ্য নয়)","type":"text"}]},
  {"id":"activity_type","label":"কার্যকলাপের ধরন কী?","type":"single","required":true,"options":["প্রতিবাদ","রাজনৈতিক আন্দোলন","মতামত","সংস্কার","অনুষ্ঠান / কর্মসূচি","ক্রীড়া প্রতিযোগিতা","গবেষণা প্রকাশনা","দুর্ঘটনা","দুর্যোগ / অগ্নিকাণ্ড","ক্যাম্পাস সেবা ও অবকাঠামো","প্রশাসনিক ঘোষণা / সিদ্ধান্ত","অর্জন / সাফল্য","অন্যান্য"],"conditions":[{"fieldId":"criminal_activity","values":["না"]}]},
  {"id":"activity_details","label":"কার্যকলাপের বিবরণ","type":"textarea","required":true,"conditions":[{"fieldId":"activity_type","values":["প্রতিবাদ","রাজনৈতিক আন্দোলন","মতামত","সংস্কার","অনুষ্ঠান / কর্মসূচি","ক্রীড়া প্রতিযোগিতা","গবেষণা প্রকাশনা","দুর্ঘটনা","দুর্যোগ / অগ্নিকাণ্ড","ক্যাম্পাস সেবা ও অবকাঠামো","প্রশাসনিক ঘোষণা / সিদ্ধান্ত","অর্জন / সাফল্য","অন্যান্য"]}]},
  {"id":"activity_participants","label":"অংশগ্রহণকারীর সংখ্যা","type":"number","required":false,"conditions":[{"fieldId":"activity_type","values":["প্রতিবাদ","রাজনৈতিক আন্দোলন","অনুষ্ঠান / কর্মসূচি","ক্রীড়া প্রতিযোগিতা","গবেষণা প্রকাশনা"]}]},
  {"id":"activity_location","label":"স্থান","type":"text","required":false,"conditions":[{"fieldId":"activity_type","values":["প্রতিবাদ","রাজনৈতিক আন্দোলন","অনুষ্ঠান / কর্মসূচি","ক্রীড়া প্রতিযোগিতা","দুর্ঘটনা","দুর্যোগ / অগ্নিকাণ্ড","ক্যাম্পাস সেবা ও অবকাঠামো"]}]},
  {"id":"activity_organizer","label":"আয়োজক বা সংশ্লিষ্ট সংগঠন","type":"text","required":false,"conditions":[{"fieldId":"activity_type","values":["প্রতিবাদ","রাজনৈতিক আন্দোলন","অনুষ্ঠান / কর্মসূচি","ক্রীড়া প্রতিযোগিতা","গবেষণা প্রকাশনা","প্রশাসনিক ঘোষণা / সিদ্ধান্ত"]}]},
  {"id":"activity_time","label":"কার্যক্রমের তারিখ বা সময়","type":"text","required":false,"conditions":[{"fieldId":"activity_type","values":["প্রতিবাদ","রাজনৈতিক আন্দোলন","অনুষ্ঠান / কর্মসূচি","ক্রীড়া প্রতিযোগিতা","গবেষণা প্রকাশনা","দুর্ঘটনা","দুর্যোগ / অগ্নিকাণ্ড","ক্যাম্পাস সেবা ও অবকাঠামো","প্রশাসনিক ঘোষণা / সিদ্ধান্ত","অর্জন / সাফল্য"]}]},
  {"id":"activity_outcome","label":"ফলাফল বা পরবর্তী পদক্ষেপ","type":"textarea","required":false,"conditions":[{"fieldId":"activity_type","values":["প্রতিবাদ","রাজনৈতিক আন্দোলন","অনুষ্ঠান / কর্মসূচি","ক্রীড়া প্রতিযোগিতা","গবেষণা প্রকাশনা","দুর্ঘটনা","দুর্যোগ / অগ্নিকাণ্ড","ক্যাম্পাস সেবা ও অবকাঠামো","প্রশাসনিক ঘোষণা / সিদ্ধান্ত","অর্জন / সাফল্য"]}]},
  {"id":"accident_kind","label":"দুর্ঘটনার ধরন কী?","type":"single","required":true,"options":["সড়ক দুর্ঘটনা","ক্যাম্পাসের ভেতরে দুর্ঘটনা","অগ্নিকাণ্ড","বিদ্যুৎ বা নির্মাণকাজজনিত দুর্ঘটনা","ল্যাব / কর্মশালায় দুর্ঘটনা","অন্যান্য দুর্ঘটনা"],"conditions":[{"fieldId":"activity_type","values":["দুর্ঘটনা"]}]},
  {"id":"accident_casualties","label":"হতাহতদের তথ্য","type":"people","required":true,"countLabel":"হতাহতের সংখ্যা (না থাকলে ০)","conditions":[{"fieldId":"activity_type","values":["দুর্ঘটনা"]},{"fieldId":"activity_type","values":["দুর্যোগ / অগ্নিকাণ্ড"]}],"personFields":[{"id":"name","label":"নাম (নির্ভরযোগ্য সূত্রে নিশ্চিত হলে)","type":"text"},{"id":"gender","label":"লিঙ্গ","type":"single","options":["নারী","পুরুষ","অন্যান্য","জানা নেই"]},{"id":"session","label":"শিক্ষাবর্ষ / সেশন","type":"text"},{"id":"identification","label":"অন্যান্য পরিচিতি (সংবেদনশীল তথ্য নয়)","type":"text"}]},
  {"id":"accident_damage","label":"ক্ষয়ক্ষতি, উদ্ধার ও চিকিৎসার বিবরণ","type":"textarea","required":true,"conditions":[{"fieldId":"activity_type","values":["দুর্ঘটনা"]},{"fieldId":"activity_type","values":["দুর্যোগ / অগ্নিকাণ্ড"]}]},
  {"id":"service_issue","label":"কোন সেবা বা অবকাঠামোর সমস্যা?","type":"multi","required":true,"options":["পানি","বিদ্যুৎ","হল / আবাসন","পরিবহন","ইন্টারনেট / কম্পিউটার ল্যাব","ক্যান্টিন / খাবার","পরিষ্কার-পরিচ্ছন্নতা","অন্যান্য সেবা"],"conditions":[{"fieldId":"activity_type","values":["ক্যাম্পাস সেবা ও অবকাঠামো"]}]},
  {"id":"announcement_kind","label":"ঘোষণা বা সিদ্ধান্তের ধরন কী?","type":"single","required":true,"options":["ভর্তি / পরীক্ষা / ফলাফল","বৃত্তি / ফি","নিয়োগ","ছুটি / একাডেমিক ক্যালেন্ডার","অন্যান্য ঘোষণা"],"conditions":[{"fieldId":"activity_type","values":["প্রশাসনিক ঘোষণা / সিদ্ধান্ত"]}]}
]$schema$::jsonb, true
where not exists (select 1 from public.article_questionnaire_versions where version = 2);

commit;
