-- Add Internal Audit (directorate + one department) and put Mohamed Abdelrazik there as its director.
insert into directorates (code, name_en, name_ar, sort) values ('IA','Internal Audit','المراجعة الداخلية',10) on conflict (code) do nothing;
insert into departments (code, name_en, name_ar, sort, directorate_id)
  select 'IA','Internal Audit','المراجعة الداخلية',1,(select id from directorates where code='IA')
  where not exists (select 1 from departments where code='IA');
update profiles set directorate_id=(select id from directorates where code='IA'), department_id=null
  where email='mohamed.abdelrazik@almanargroup.com';
select p.email, p.role, r.name_en directorate from profiles p left join directorates r on r.id=p.directorate_id where p.email='mohamed.abdelrazik@almanargroup.com';
