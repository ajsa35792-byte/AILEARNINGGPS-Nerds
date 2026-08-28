/*
# Add subject column to topics + insert topics for all school subjects

## Summary
This migration adds a `subject` column to the `topics` table so topics can be
categorized by school subject (math, physics, chemistry, biology, informatics,
history, geography, english). It then inserts topic rows for 7 new subjects
beyond the existing math topics. Existing math topics are updated to have
subject = 'math'.

## Changes
1. Modified Tables
   - `topics`: added column `subject` (text, NOT NULL, default 'math')
2. New Data
   - Physics: 8 topics (kinematics, dynamics, energy, electricity, magnetism, optics, thermodynamics, atomic_physics)
   - Chemistry: 8 topics (periodic_table, chemical_bonds, reactions, stoichiometry, acids_bases, organic_chem, electrochemistry, solutions)
   - Biology: 8 topics (cell_structure, genetics, evolution, human_anatomy, ecology, botany, zoology, microbiology)
   - Informatics: 8 topics (algorithms, data_structures, programming_basics, databases, networks, logic_gates, binary_system, web_basics)
   - History: 8 topics (ancient_history, medieval_history, kazakh_khanate, colonial_period, soviet_era, independence, modern_kazakhstan, world_history)
   - Geography: 8 topics (physical_geo, climate, population, economy_geo, map_skills, natural_resources, central_asia, environmental)
   - English: 8 topics (tenses, vocabulary, reading_comprehension, grammar_basics, conditionals, passive_voice, reported_speech, essay_writing)
3. Security
   - No RLS changes — topics table already has RLS enabled with anon+authenticated policies

## Notes
   - All existing topics get subject='math' via the column default
   - New topics use display_order starting from 11 to avoid conflicts with existing math topics
   - Each subject has 8 topics with impact (1-5) and time_hours (1-4) values
*/

-- Add subject column to topics
ALTER TABLE topics ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT 'math';

-- Update existing math topics explicitly
UPDATE topics SET subject = 'math' WHERE subject = 'math' OR subject IS NULL;

-- Insert Physics topics
INSERT INTO topics (key, label, impact, time_hours, parent_key, display_order, subject) VALUES
('phys_kinematics', 'Кинематика', 4, 2.0, NULL, 11, 'physics'),
('phys_dynamics', 'Динамика', 5, 2.5, 'phys_kinematics', 12, 'physics'),
('phys_energy', 'Законы сохранения', 4, 2.0, 'phys_dynamics', 13, 'physics'),
('phys_electricity', 'Электричество', 5, 3.0, NULL, 14, 'physics'),
('phys_magnetism', 'Магнетизм', 4, 2.5, 'phys_electricity', 15, 'physics'),
('phys_optics', 'Оптика', 3, 2.0, NULL, 16, 'physics'),
('phys_thermodynamics', 'Термодинамика', 4, 3.0, 'phys_energy', 17, 'physics'),
('phys_atomic', 'Атомная физика', 3, 2.0, NULL, 18, 'physics')
ON CONFLICT (key) DO NOTHING;

-- Insert Chemistry topics
INSERT INTO topics (key, label, impact, time_hours, parent_key, display_order, subject) VALUES
('chem_periodic', 'Периодическая таблица', 5, 2.0, NULL, 21, 'chemistry'),
('chem_bonds', 'Химические связи', 4, 2.5, 'chem_periodic', 22, 'chemistry'),
('chem_reactions', 'Химические реакции', 5, 3.0, 'chem_bonds', 23, 'chemistry'),
('chem_stoichiometry', 'Стехиометрия', 4, 2.0, 'chem_reactions', 24, 'chemistry'),
('chem_acids_bases', 'Кислоты и основания', 4, 2.5, 'chem_reactions', 25, 'chemistry'),
('chem_organic', 'Органическая химия', 3, 3.0, 'chem_bonds', 26, 'chemistry'),
('chem_electrochem', 'Электрохимия', 3, 2.5, 'chem_acids_bases', 27, 'chemistry'),
('chem_solutions', 'Растворы', 3, 2.0, 'chem_stoichiometry', 28, 'chemistry')
ON CONFLICT (key) DO NOTHING;

-- Insert Biology topics
INSERT INTO topics (key, label, impact, time_hours, parent_key, display_order, subject) VALUES
('bio_cell', 'Строение клетки', 5, 2.0, NULL, 31, 'biology'),
('bio_genetics', 'Генетика', 5, 3.0, 'bio_cell', 32, 'biology'),
('bio_evolution', 'Эволюция', 4, 2.0, 'bio_genetics', 33, 'biology'),
('bio_anatomy', 'Анатомия человека', 4, 3.0, NULL, 34, 'biology'),
('bio_ecology', 'Экология', 3, 2.0, NULL, 35, 'biology'),
('bio_botany', 'Ботаника', 3, 2.0, 'bio_cell', 36, 'biology'),
('bio_zoology', 'Зоология', 3, 2.5, 'bio_evolution', 37, 'biology'),
('bio_microbiology', 'Микробиология', 2, 1.5, 'bio_cell', 38, 'biology')
ON CONFLICT (key) DO NOTHING;

-- Insert Informatics topics
INSERT INTO topics (key, label, impact, time_hours, parent_key, display_order, subject) VALUES
('info_algorithms', 'Алгоритмы', 5, 2.5, NULL, 41, 'informatics'),
('info_data_structures', 'Структуры данных', 4, 2.0, 'info_algorithms', 42, 'informatics'),
('info_programming', 'Основы программирования', 5, 3.0, 'info_algorithms', 43, 'informatics'),
('info_databases', 'Базы данных', 4, 2.5, 'info_data_structures', 44, 'informatics'),
('info_networks', 'Компьютерные сети', 3, 2.0, NULL, 45, 'informatics'),
('info_logic', 'Логические элементы', 3, 1.5, 'info_algorithms', 46, 'informatics'),
('info_binary', 'Системы счисления', 4, 2.0, 'info_logic', 47, 'informatics'),
('info_web', 'Основы веб', 3, 2.0, 'info_programming', 48, 'informatics')
ON CONFLICT (key) DO NOTHING;

-- Insert History of Kazakhstan topics
INSERT INTO topics (key, label, impact, time_hours, parent_key, display_order, subject) VALUES
('hist_ancient', 'Древняя история', 3, 2.0, NULL, 51, 'history'),
('hist_medieval', 'Средневековье', 4, 2.5, 'hist_ancient', 52, 'history'),
('hist_khanate', 'Казахское ханство', 5, 3.0, 'hist_medieval', 53, 'history'),
('hist_colonial', 'Колониальный период', 4, 2.5, 'hist_khanate', 54, 'history'),
('hist_soviet', 'Советский период', 5, 3.0, 'hist_colonial', 55, 'history'),
('hist_independence', 'Независимость', 5, 2.0, 'hist_soviet', 56, 'history'),
('hist_modern', 'Современный Казахстан', 4, 2.0, 'hist_independence', 57, 'history'),
('hist_world', 'Всемирная история', 3, 3.0, NULL, 58, 'history')
ON CONFLICT (key) DO NOTHING;

-- Insert Geography topics
INSERT INTO topics (key, label, impact, time_hours, parent_key, display_order, subject) VALUES
('geo_physical', 'Физическая география', 4, 2.5, NULL, 61, 'geography'),
('geo_climate', 'Климат', 3, 2.0, 'geo_physical', 62, 'geography'),
('geo_population', 'Население', 3, 2.0, NULL, 63, 'geography'),
('geo_economy', 'Экономическая география', 4, 2.5, 'geo_population', 64, 'geography'),
('geo_maps', 'Картография', 3, 1.5, 'geo_physical', 65, 'geography'),
('geo_resources', 'Природные ресурсы', 4, 2.0, 'geo_physical', 66, 'geography'),
('geo_central_asia', 'Центральная Азия', 5, 2.5, 'geo_population', 67, 'geography'),
('geo_environmental', 'Экология и охрана природы', 3, 2.0, 'geo_resources', 68, 'geography')
ON CONFLICT (key) DO NOTHING;

-- Insert English topics
INSERT INTO topics (key, label, impact, time_hours, parent_key, display_order, subject) VALUES
('eng_tenses', 'Времена глаголов', 5, 3.0, NULL, 71, 'english'),
('eng_vocab', 'Лексика', 4, 2.0, NULL, 72, 'english'),
('eng_reading', 'Чтение и понимание', 4, 2.5, 'eng_vocab', 73, 'english'),
('eng_grammar', 'Базовая грамматика', 5, 2.5, 'eng_tenses', 74, 'english'),
('eng_conditionals', 'Условные предложения', 3, 2.0, 'eng_tenses', 75, 'english'),
('eng_passive', 'Пассивный залог', 4, 2.0, 'eng_grammar', 76, 'english'),
('eng_reported', 'Косвенная речь', 3, 2.0, 'eng_grammar', 77, 'english'),
('eng_essay', 'Написание эссе', 4, 3.0, 'eng_reading', 78, 'english')
ON CONFLICT (key) DO NOTHING;