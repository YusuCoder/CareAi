-- Для демобаз, заполненных до перевода данных на русский язык. Допускается повторный запуск.

update public.diagnoses set name = 'Гипертония' where name = 'Essential hypertension';
update public.diagnoses set name = 'Сахарный диабет 2 типа' where name = 'Type 2 diabetes mellitus';
update public.diagnoses set name = 'Острый аппендицит с местным перитонитом'
 where name = 'Acute appendicitis with local peritonitis';

update public.procedures set name = 'КТ брюшной полости', outcome = 'Аппендицит подтверждён'
 where name = 'CT of the abdomen';
update public.procedures set name = 'Лапароскопическая аппендэктомия',
       outcome = 'Без осложнений, дренаж не оставлен'
 where name = 'Laparoscopic appendectomy';

update public.allergies set substance = 'Пенициллин', reaction = 'Кожная сыпь'
 where substance = 'Penicillin';

update public.lab_results set panel = 'Биохимия' where panel = 'Biochemistry';
update public.lab_results set panel = 'Общий анализ крови' where panel = 'Complete blood count';
update public.lab_results set analyte = 'СРБ' where analyte = 'CRP';
update public.lab_results set analyte = 'Лейкоциты' where analyte = 'WBC';
update public.lab_results set analyte = 'Гемоглобин' where analyte = 'Hemoglobin';
update public.lab_results set analyte = 'Креатинин' where analyte = 'Creatinine';
update public.lab_results set analyte = 'Глюкоза натощак' where analyte = 'Fasting glucose';
update public.lab_results set lab_name = 'Лаборатория центральной больницы'
 where lab_name = 'Central Hospital Laboratory';

update public.medications set name = 'Цефтриаксон', instructions = 'Периоперационный курс' where name = 'Ceftriaxone';
update public.medications set name = 'Метформин', instructions = 'Постоянная терапия, во время еды' where name = 'Metformin';
update public.medications set name = 'Амлодипин', instructions = 'Постоянная терапия, утром' where name = 'Amlodipine';
update public.medications set name = 'Цефуроксим', instructions = 'После еды, 7 дней' where name = 'Cefuroxime';
update public.medications set name = 'Парацетамол', instructions = 'При боли, не более 3 раз в день' where name = 'Paracetamol';

update public.organization_memberships set job_title = 'Хирург' where job_title = 'Surgeon';
update public.organization_memberships set job_title = 'Заведующая поликлиникой' where job_title = 'Head of polyclinic';
update public.organization_memberships set job_title = 'Патронажная медсестра' where job_title = 'Patronage nurse';
