-- Re-runnable development catalogue for Clutcher.
-- All opportunities are fictional and visibly marked as demo data.

insert into public.skills (id, name, aliases) values
  ('python', 'Python', array['py']),
  ('javascript', 'JavaScript', array['js']),
  ('typescript', 'TypeScript', array['ts']),
  ('react', 'React', array['reactjs']),
  ('flask', 'Flask', array[]::text[]),
  ('flask_api', 'Flask API', array['flaskapi', 'flask api']),
  ('sql', 'SQL', array['postgresql', 'postgres']),
  ('nodejs', 'Node.js', array['nodejs', 'node js', 'node']),
  ('express', 'Express', array['expressjs', 'express.js']),
  ('docker', 'Docker', array[]::text[]),
  ('figma', 'Figma', array[]::text[]),
  ('machine_learning', 'Machine learning', array['ml']),
  ('java', 'Java', array[]::text[]),
  ('excel', 'Excel', array['microsoft excel', 'ms excel'])
on conflict (id) do update set name = excluded.name, aliases = excluded.aliases;

insert into public.skill_links (skill_a, skill_b) values
  ('flask', 'python'), ('flask', 'flask_api'), ('flask_api', 'python'),
  ('javascript', 'nodejs'), ('javascript', 'react'), ('javascript', 'typescript'),
  ('express', 'nodejs'), ('nodejs', 'typescript'), ('react', 'typescript'),
  ('flask_api', 'sql'), ('python', 'sql'), ('machine_learning', 'python'),
  ('docker', 'flask_api'), ('docker', 'nodejs'), ('figma', 'react')
on conflict do nothing;

insert into public.opportunities
  (title, organization, opportunity_type, description, source_name, source_url,
   application_deadline_date, deadline_text, eligibility, source_status, review_status, is_demo, content_hash)
values
  ('Python API Internship', 'Example Labs', 'internship',
   'Demo: build Python and Flask APIs backed by SQL. Docker is useful.', 'PS-61 Demo', 'https://example.com/ps61-demo/python-api',
   current_date + 5, 'Demo deadline, five days after seed',
   '{"allowed_country_codes":["IN"],"allowed_study_levels":["undergraduate"],"allowed_graduation_years":[2027,2028,2029],"min_cgpa":7.0,"allowed_degrees":["B.Tech","BCA"],"unparsed_requirements":[]}',
   'open', 'approved', true, 'demo-python-api-v1'),
  ('JavaScript Platform Internship', 'Example Works', 'internship',
   'Demo: work with JavaScript, Node.js, Express and Docker.', 'PS-61 Demo', 'https://example.com/ps61-demo/node-platform',
   current_date + 14, 'Demo deadline, fourteen days after seed',
   '{"allowed_study_levels":["undergraduate"],"min_cgpa":6.5,"unparsed_requirements":[]}',
   'open', 'approved', true, 'demo-node-platform-v1'),
  ('Open Source Sprint', 'Example Community', 'hackathon',
   'Demo: build a React or Flask project with a team. Open to everyone.', 'PS-61 Demo', 'https://example.com/ps61-demo/open-source-sprint',
   current_date + 2, 'Demo deadline, two days after seed',
   '{"unrestricted":true,"unparsed_requirements":[]}',
   'open', 'approved', true, 'demo-open-source-v1'),
  ('Data for Good Challenge', 'Example Challenge', 'hackathon',
   'Demo: Python, SQL and machine learning challenge.', 'PS-61 Demo', 'https://example.com/ps61-demo/data-for-good',
   current_date + 24, 'Demo deadline, twenty-four days after seed',
   '{"allowed_country_codes":["IN"],"unparsed_requirements":[]}',
   'open', 'approved', true, 'demo-data-good-v1'),
  ('Frontend Design Jam', 'Example Studio', 'hackathon',
   'Demo: create an accessible React interface using JavaScript and Figma.', 'PS-61 Demo', 'https://example.com/ps61-demo/frontend-jam',
   current_date + 40, 'Demo deadline, forty days after seed',
   '{"unrestricted":true,"unparsed_requirements":[]}',
   'open', 'approved', true, 'demo-frontend-jam-v1'),
  ('Exploratory Software Internship', 'Example Studio', 'internship',
   'Demo: explore Python and JavaScript projects. The closing date is unconfirmed.', 'PS-61 Demo', 'https://example.com/ps61-demo/exploratory-internship',
   null, 'Demo deadline unknown',
   '{"unparsed_requirements":["Confirm current student status with the organizer."]}',
   'open', 'approved', true, 'demo-exploratory-v1')
on conflict (source_name, source_url) do update set
  application_deadline_date = excluded.application_deadline_date,
  deadline_text = excluded.deadline_text,
  eligibility = excluded.eligibility,
  is_demo = true,
  last_checked_at = now();

insert into public.opportunity_skills (opportunity_id, skill_id, skill_type)
select o.id, v.skill_id, v.skill_type from (values
  ('python-api','python','required'), ('python-api','flask_api','required'), ('python-api','sql','required'), ('python-api','docker','preferred'),
  ('node-platform','javascript','required'), ('node-platform','nodejs','required'), ('node-platform','express','preferred'), ('node-platform','docker','preferred'),
  ('open-source-sprint','react','required'), ('open-source-sprint','flask','preferred'), ('open-source-sprint','javascript','preferred'),
  ('data-for-good','python','required'), ('data-for-good','sql','required'), ('data-for-good','machine_learning','preferred'),
  ('frontend-jam','react','required'), ('frontend-jam','javascript','required'), ('frontend-jam','figma','preferred'),
  ('exploratory-internship','python','preferred'), ('exploratory-internship','javascript','preferred')
) as v(slug, skill_id, skill_type)
join public.opportunities o
  on o.source_name = 'PS-61 Demo'
 and o.source_url = 'https://example.com/ps61-demo/' || v.slug
on conflict (opportunity_id, skill_id) do update set skill_type = excluded.skill_type;
