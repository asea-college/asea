insert into public.notice_departments (name, active) values
('기획처',true),
('교육처',true),
('행정관리처',true),
('입학처',true),
('항공정비계열',true),
('스마트안전진단계열',true),
('항공관광계열',true),
('항공보안계열',true),
('국방경찰계열',true),
('군사교육단',true),
('기종교육원',true),
('무인항공교육원',true),
('평생교육원',true),
('온라인평생교육원',true),
('시설관리부',true)
on conflict (name) do update set active=true;