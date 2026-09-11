-- ============================================
-- SEED DATA (Phase 1 development)
-- ============================================

INSERT INTO public.categories (slug, name_bn, name_en, sort_order) VALUES
  ('politics',   'রাজনীতি',   'Politics',   1),
  ('sports',     'খেলাধুলা',  'Sports',     2),
  ('technology', 'প্রযুক্তি',  'Technology', 3),
  ('economy',    'অর্থনীতি',  'Economy',    4),
  ('culture',    'সংস্কৃতি',  'Culture',    5),
  ('education',  'শিক্ষা',     'Education',  6),
  ('health',     'স্বাস্থ্য',  'Health',     7),
  ('opinion',    'মতামত',     'Opinion',    8)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.site_settings (id, site_name, site_tagline)
VALUES (1, 'DUTIMZ', 'ঢাকা ইউনিভার্সিটি টাইম্‌জ — সংবাদ, বিশ্লেষণ, প্রতিদিন')
ON CONFLICT (id) DO NOTHING;

-- Note: contents rows require a profiles row (author_id), which requires
-- auth.users entries. Seed content after creating reporter accounts, or
-- temporarily disable the FK in a dev-only seed script.
