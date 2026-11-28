drop table public.profile_views;
alter table public.quotes drop column campaign_id;
drop table public.campaigns;
alter table public.quotes alter column service_id set not null;
alter table public.profiles drop column company_id;
drop table public.companies; drop table public.consents; drop table public.accounts;
drop function public.register_account(uuid,text,jsonb,jsonb,text);
drop function public.owns_profile(uuid);
-- datos antiguos
insert into public.profiles (id, ig_handle, role, status) values
 ('00000000-0000-4000-8000-0000000000b1','legacy.brand1','brand','unclaimed'),
 ('00000000-0000-4000-8000-0000000000b2','legacy.brand2','brand','unclaimed'),
 ('00000000-0000-4000-8000-0000000000c1','legacy.creator1','creator','unclaimed'),
 ('00000000-0000-4000-8000-0000000000c2','legacy.creator2','creator','unclaimed');
insert into public.creator_services (id, profile_id, type, format, price_pen, description) values
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000c1','canje','reel',100,'s1'),
 ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000c1','embajador','story',200,'s2'),
 ('00000000-0000-4000-8000-0000000000a3','00000000-0000-4000-8000-0000000000c2','embajador','reel',300,'s3');
insert into public.quotes (service_id, creator_profile_id, requester_profile_id, status, message) values
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000b2','sent','b2-c1'),
 ('00000000-0000-4000-8000-0000000000a3','00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000b2','accepted','b2-c2'),
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000b1','rejected','b1-c1 old'),
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000b1','sent','b1-c1 a');
