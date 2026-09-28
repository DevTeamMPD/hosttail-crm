-- Hosttail CRM — provinces reference data. ADDITIVE ONLY.
-- Rollback: drop table ht_province_aliases, ht_provinces cascade; drop function ht_resolve_province;
--
-- Why this table exists: the legacy form stored province as raw free text
-- typed by hand ("กรุงเทพ" / "กรุงเทพฯ" / "กรุงเทพมหานคร" all appear as
-- distinct values). An equality-comparable code turns province segmentation
-- from an ilike scan into an indexed equality filter, and ht_province_aliases
-- lets a bad legacy value be mapped once and stay mapped.
--
-- `code` is an internal slug derived from the English name, NOT a verified
-- ISO 3166-2:TH code -- this project has no reliable way to confirm all 77
-- ISO codes against an authoritative source right now, and a wrong ISO code
-- baked into reference data would be a worse bug than an honest internal slug.
--
-- `region` uses a simplified 6-bucket business classification (the "lower
-- north" provinces are folded into North) rather than the NESDB's official
-- regions -- this matches how the sibling dashboards report region-level KPIs.

create table if not exists ht_provinces (
  code       text primary key,
  name_th    text not null unique,
  name_en    text not null,
  region     text not null
               check (region in ('Central','North','Northeast','East','West','South')),
  sort_order int  not null default 0
);

create table if not exists ht_province_aliases (
  alias         text primary key,   -- always lower(btrim()) before compare/insert
  province_code text not null references ht_provinces(code) on update cascade
);
create index if not exists ix_ht_province_aliases_code on ht_province_aliases (province_code);

-- Resolver: exact alias match, then a Thai-name prefix match, else NULL
-- (left for the admin's manual mapping screen, which writes a new alias row).
create or replace function ht_resolve_province(raw text)
returns text language sql stable as $$
  select coalesce(
    (select a.province_code from ht_province_aliases a
      where a.alias = lower(btrim(coalesce(raw,'')))),
    (select p.code from ht_provinces p
      where lower(p.name_th) like lower(btrim(coalesce(raw,''))) || '%'
      order by length(p.name_th) limit 1)
  )
$$;

insert into ht_provinces (code, name_th, name_en, region, sort_order) values
  -- Central (15)
  ('bangkok',                      'กรุงเทพมหานคร',       'Bangkok',                    'Central', 10),
  ('nonthaburi',                   'นนทบุรี',              'Nonthaburi',                 'Central', 11),
  ('pathum-thani',                 'ปทุมธานี',             'Pathum Thani',               'Central', 12),
  ('phra-nakhon-si-ayutthaya',     'พระนครศรีอยุธยา',      'Phra Nakhon Si Ayutthaya',   'Central', 13),
  ('ang-thong',                    'อ่างทอง',              'Ang Thong',                  'Central', 14),
  ('lop-buri',                     'ลพบุรี',               'Lop Buri',                   'Central', 15),
  ('sing-buri',                    'สิงห์บุรี',             'Sing Buri',                  'Central', 16),
  ('chai-nat',                     'ชัยนาท',               'Chai Nat',                   'Central', 17),
  ('saraburi',                     'สระบุรี',              'Saraburi',                   'Central', 18),
  ('nakhon-nayok',                 'นครนายก',              'Nakhon Nayok',               'Central', 19),
  ('samut-prakan',                 'สมุทรปราการ',          'Samut Prakan',               'Central', 20),
  ('nakhon-pathom',                'นครปฐม',               'Nakhon Pathom',              'Central', 21),
  ('samut-sakhon',                 'สมุทรสาคร',            'Samut Sakhon',               'Central', 22),
  ('samut-songkhram',              'สมุทรสงคราม',          'Samut Songkhram',            'Central', 23),
  ('suphan-buri',                  'สุพรรณบุรี',           'Suphan Buri',                'Central', 24),
  -- North incl. lower-north (17)
  ('chiang-mai',                   'เชียงใหม่',            'Chiang Mai',                 'North',   30),
  ('chiang-rai',                   'เชียงราย',             'Chiang Rai',                 'North',   31),
  ('lampang',                      'ลำปาง',                'Lampang',                    'North',   32),
  ('lamphun',                      'ลำพูน',                'Lamphun',                    'North',   33),
  ('mae-hong-son',                 'แม่ฮ่องสอน',           'Mae Hong Son',               'North',   34),
  ('nan',                          'น่าน',                 'Nan',                        'North',   35),
  ('phayao',                       'พะเยา',                'Phayao',                     'North',   36),
  ('phrae',                        'แพร่',                 'Phrae',                      'North',   37),
  ('uttaradit',                    'อุตรดิตถ์',            'Uttaradit',                  'North',   38),
  ('tak',                          'ตาก',                  'Tak',                        'North',   39),
  ('sukhothai',                    'สุโขทัย',              'Sukhothai',                  'North',   40),
  ('phitsanulok',                  'พิษณุโลก',             'Phitsanulok',                'North',   41),
  ('kamphaeng-phet',               'กำแพงเพชร',            'Kamphaeng Phet',             'North',   42),
  ('phichit',                      'พิจิตร',               'Phichit',                    'North',   43),
  ('phetchabun',                   'เพชรบูรณ์',            'Phetchabun',                 'North',   44),
  ('nakhon-sawan',                 'นครสวรรค์',            'Nakhon Sawan',               'North',   45),
  ('uthai-thani',                  'อุทัยธานี',            'Uthai Thani',                'North',   46),
  -- Northeast (20)
  ('nakhon-ratchasima',            'นครราชสีมา',           'Nakhon Ratchasima',          'Northeast', 60),
  ('buriram',                      'บุรีรัมย์',            'Buriram',                    'Northeast', 61),
  ('surin',                        'สุรินทร์',             'Surin',                      'Northeast', 62),
  ('si-sa-ket',                    'ศรีสะเกษ',             'Si Sa Ket',                  'Northeast', 63),
  ('ubon-ratchathani',             'อุบลราชธานี',          'Ubon Ratchathani',           'Northeast', 64),
  ('yasothon',                     'ยโสธร',                'Yasothon',                   'Northeast', 65),
  ('chaiyaphum',                   'ชัยภูมิ',              'Chaiyaphum',                 'Northeast', 66),
  ('amnat-charoen',                'อำนาจเจริญ',           'Amnat Charoen',              'Northeast', 67),
  ('nong-bua-lamphu',              'หนองบัวลำภู',          'Nong Bua Lamphu',            'Northeast', 68),
  ('khon-kaen',                    'ขอนแก่น',              'Khon Kaen',                  'Northeast', 69),
  ('udon-thani',                   'อุดรธานี',             'Udon Thani',                 'Northeast', 70),
  ('loei',                         'เลย',                  'Loei',                       'Northeast', 71),
  ('nong-khai',                    'หนองคาย',              'Nong Khai',                  'Northeast', 72),
  ('maha-sarakham',                'มหาสารคาม',            'Maha Sarakham',              'Northeast', 73),
  ('roi-et',                       'ร้อยเอ็ด',             'Roi Et',                     'Northeast', 74),
  ('kalasin',                      'กาฬสินธุ์',            'Kalasin',                    'Northeast', 75),
  ('sakon-nakhon',                 'สกลนคร',               'Sakon Nakhon',               'Northeast', 76),
  ('nakhon-phanom',                'นครพนม',               'Nakhon Phanom',              'Northeast', 77),
  ('mukdahan',                     'มุกดาหาร',             'Mukdahan',                   'Northeast', 78),
  ('bueng-kan',                    'บึงกาฬ',               'Bueng Kan',                  'Northeast', 79),
  -- East (7)
  ('chon-buri',                    'ชลบุรี',               'Chon Buri',                  'East',    90),
  ('rayong',                       'ระยอง',                'Rayong',                     'East',    91),
  ('chanthaburi',                  'จันทบุรี',             'Chanthaburi',                'East',    92),
  ('trat',                         'ตราด',                 'Trat',                       'East',    93),
  ('chachoengsao',                 'ฉะเชิงเทรา',           'Chachoengsao',               'East',    94),
  ('prachin-buri',                 'ปราจีนบุรี',           'Prachin Buri',               'East',    95),
  ('sa-kaeo',                      'สระแก้ว',              'Sa Kaeo',                    'East',    96),
  -- West (4)
  ('kanchanaburi',                 'กาญจนบุรี',            'Kanchanaburi',               'West',    110),
  ('ratchaburi',                   'ราชบุรี',              'Ratchaburi',                 'West',    111),
  ('phetchaburi',                  'เพชรบุรี',             'Phetchaburi',                'West',    112),
  ('prachuap-khiri-khan',          'ประจวบคีรีขันธ์',      'Prachuap Khiri Khan',        'West',    113),
  -- South (14)
  ('chumphon',                     'ชุมพร',                'Chumphon',                   'South',   130),
  ('ranong',                       'ระนอง',                'Ranong',                     'South',   131),
  ('surat-thani',                  'สุราษฎร์ธานี',         'Surat Thani',                'South',   132),
  ('phang-nga',                    'พังงา',                'Phang Nga',                  'South',   133),
  ('phuket',                       'ภูเก็ต',               'Phuket',                     'South',   134),
  ('krabi',                        'กระบี่',               'Krabi',                      'South',   135),
  ('nakhon-si-thammarat',          'นครศรีธรรมราช',        'Nakhon Si Thammarat',        'South',   136),
  ('trang',                        'ตรัง',                 'Trang',                      'South',   137),
  ('phatthalung',                  'พัทลุง',               'Phatthalung',                'South',   138),
  ('satun',                        'สตูล',                 'Satun',                      'South',   139),
  ('songkhla',                     'สงขลา',                'Songkhla',                   'South',   140),
  ('pattani',                      'ปัตตานี',              'Pattani',                    'South',   141),
  ('yala',                         'ยะลา',                 'Yala',                       'South',   142),
  ('narathiwat',                   'นราธิวาส',             'Narathiwat',                 'South',   143)
on conflict (code) do update set
  name_th = excluded.name_th, name_en = excluded.name_en,
  region = excluded.region, sort_order = excluded.sort_order;

-- Common alternate spellings seen in free-text input.
insert into ht_province_aliases (alias, province_code) values
  ('กรุงเทพ',   'bangkok'),
  ('กรุงเทพฯ',  'bangkok'),
  ('กทม',       'bangkok'),
  ('กทม.',      'bangkok'),
  ('bangkok',   'bangkok'),
  ('bkk',       'bangkok')
on conflict (alias) do nothing;
