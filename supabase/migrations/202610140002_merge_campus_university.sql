-- One campus desk.
--
-- `campus` and `university` covered the same beat, so the desks merge under the
-- `campus` name: every article filed under `university` — published or waiting —
-- moves to `campus`, and the retired row is deleted so navigation, search topics
-- and the sitemap advertise one desk instead of two. The old
-- `/category/university/` address redirects to `/category/campus/` in the
-- section page, so no published link dies with the row.

begin;

update public.articles
   set category_id = (select id from public.categories where slug = 'campus')
 where category_id = (select id from public.categories where slug = 'university');

delete from public.categories where slug = 'university';

commit;
