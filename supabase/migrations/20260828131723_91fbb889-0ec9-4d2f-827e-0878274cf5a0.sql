
CREATE TABLE public.admin_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL CHECK (level IN ('wilaya','commune')),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_fr text NOT NULL,
  name_en text NOT NULL,
  name_kab text,
  parent_id uuid REFERENCES public.admin_units(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  geom jsonb,
  forest_fraction double precision NOT NULL DEFAULT 0,
  population integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_units_level ON public.admin_units(level);
CREATE INDEX idx_admin_units_parent ON public.admin_units(parent_id);

CREATE TABLE public.settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  osm_id bigint UNIQUE,
  name text NOT NULL,
  name_ar text,
  place_type text NOT NULL DEFAULT 'village',
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  commune_id uuid REFERENCES public.admin_units(id) ON DELETE SET NULL,
  population integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_settlements_commune ON public.settlements(commune_id);

CREATE TABLE public.fire_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'unconfirmed' CHECK (state IN ('unconfirmed','active','contained_guess','extinguished','false_positive')),
  first_detected_at timestamptz NOT NULL,
  last_detected_at timestamptz NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  hull jsonb,
  detection_count integer NOT NULL DEFAULT 0,
  sources text[] NOT NULL DEFAULT '{}',
  max_frp_mw double precision,
  confidence double precision NOT NULL DEFAULT 0,
  est_area_ha double precision,
  wind_speed_kmh double precision,
  wind_dir_deg double precision,
  spread_bearing_deg double precision,
  commune_id uuid REFERENCES public.admin_units(id) ON DELETE SET NULL,
  wilaya_id uuid REFERENCES public.admin_units(id) ON DELETE SET NULL,
  nearest_settlement_id uuid REFERENCES public.settlements(id) ON DELETE SET NULL,
  nearest_settlement_km double precision,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clusters_state ON public.fire_clusters(state);
CREATE INDEX idx_clusters_last_detected ON public.fire_clusters(last_detected_at DESC);

CREATE TABLE public.detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('firms','fci')),
  sensor text NOT NULL,
  detected_at timestamptz NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  confidence_raw double precision NOT NULL,
  frp_mw double precision,
  daynight char(1),
  natural_key text NOT NULL UNIQUE,
  cluster_id uuid REFERENCES public.fire_clusters(id) ON DELETE SET NULL,
  fp_reason text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_detections_cluster ON public.detections(cluster_id);
CREATE INDEX idx_detections_time ON public.detections(source, detected_at DESC);

CREATE TABLE public.cluster_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES public.fire_clusters(id) ON DELETE CASCADE,
  event text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);
CREATE INDEX idx_cluster_events_cluster ON public.cluster_events(cluster_id, at DESC);

CREATE TABLE public.risk_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commune_id uuid NOT NULL REFERENCES public.admin_units(id) ON DELETE CASCADE,
  forecast_date date NOT NULL,
  horizon_days integer NOT NULL CHECK (horizon_days BETWEEN 0 AND 5),
  source text NOT NULL CHECK (source IN ('effis','local_fwi')),
  fwi double precision NOT NULL,
  danger_level integer NOT NULL CHECK (danger_level BETWEEN 1 AND 5),
  components jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (commune_id, forecast_date, horizon_days, source)
);
CREATE INDEX idx_risk_commune ON public.risk_forecasts(commune_id, horizon_days);

CREATE TABLE public.data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','degraded','unavailable')),
  last_ok_at timestamptz,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_units, public.settlements, public.fire_clusters, public.detections, public.cluster_events, public.risk_forecasts, public.data_sources TO anon, authenticated;
GRANT ALL ON public.admin_units, public.settlements, public.fire_clusters, public.detections, public.cluster_events, public.risk_forecasts, public.data_sources TO service_role;

ALTER TABLE public.admin_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fire_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cluster_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read admin_units" ON public.admin_units FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read settlements" ON public.settlements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read fire_clusters" ON public.fire_clusters FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read detections" ON public.detections FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read cluster_events" ON public.cluster_events FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read risk_forecasts" ON public.risk_forecasts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read data_sources" ON public.data_sources FOR SELECT TO anon, authenticated USING (true);

-- ---------- demo seed ----------
INSERT INTO public.admin_units (level, code, name_ar, name_fr, name_en, name_kab, lat, lon, forest_fraction, population) VALUES
('wilaya','15','تيزي وزو','Tizi Ouzou','Tizi Ouzou','Tizi Wezzu',36.7118,4.0458,0.52,1127607),
('wilaya','06','بجاية','Béjaïa','Bejaia','Bgayet',36.7509,5.0567,0.48,915835),
('wilaya','09','البليدة','Blida','Blida','Iblida',36.4703,2.8277,0.41,1002937),
('wilaya','16','الجزائر','Alger','Algiers','Lezzayer',36.7538,3.0588,0.09,3415811),
('wilaya','21','سكيكدة','Skikda','Skikda',NULL,36.8760,6.9094,0.44,904195),
('wilaya','25','قسنطينة','Constantine','Constantine',NULL,36.3650,6.6147,0.18,943112),
('wilaya','05','باتنة','Batna','Batna',NULL,35.5560,6.1741,0.28,1119791),
('wilaya','23','عنابة','Annaba','Annaba',NULL,36.9000,7.7667,0.35,640050),
('wilaya','44','عين الدفلى','Aïn Defla','Ain Defla',NULL,36.2639,1.9679,0.33,771890),
('wilaya','31','وهران','Oran','Oran',NULL,35.6971,-0.6308,0.07,1584607),
('wilaya','30','ورقلة','Ouargla','Ouargla',NULL,31.9497,5.3335,0.00,558558),
('wilaya','01','أدرار','Adrar','Adrar',NULL,27.8742,-0.2939,0.00,439700);

INSERT INTO public.admin_units (level, code, name_ar, name_fr, name_en, name_kab, parent_id, lat, lon, forest_fraction, population)
SELECT 'commune', c.code, c.ar, c.fr, c.en, c.kab, w.id, c.lat, c.lon, c.ff, c.pop
FROM (VALUES
 ('1501','أقني قغران','Aghni Goughran','Aghni Goughran','Aɣni Geɣran','15',36.5606,4.2764,0.61,15000),
 ('1502','إليلتن','Illilten','Illilten','Ilulliten','15',36.5433,4.3936,0.66,9000),
 ('1503','عزازقة','Azazga','Azazga','Iɛeẓẓugen','15',36.7447,4.3722,0.58,36000),
 ('1504','بني دوالة','Beni Douala','Beni Douala','At Dwala','15',36.6122,4.0722,0.49,22000),
 ('0601','أقبو','Akbou','Akbou','Aqbu','06',36.4589,4.5344,0.44,72000),
 ('0602','تيشي','Tichy','Tichy','Ticci','06',36.6683,5.1494,0.51,17000),
 ('0603','أدكار','Adekar','Adekar','Adekkar','06',36.6172,4.7178,0.63,11000),
 ('0901','شريعة','Chréa','Chrea','Cṛiɛa','09',36.4225,2.8817,0.72,8000),
 ('0902','الأربعاء','Larbaa','Larbaa',NULL,'09',36.5661,3.1533,0.22,64000),
 ('2101','القل','Collo','Collo',NULL,'21',37.0044,6.5619,0.57,29000),
 ('0501','مروانة','Merouana','Merouana',NULL,'05',35.6333,5.9167,0.31,54000),
 ('2301','سرايدي','Seraïdi','Seraidi',NULL,'23',36.9142,7.6667,0.68,6000),
 ('4401','بومدفع','Bou Medfaa','Bou Medfaa',NULL,'44',36.2811,2.4325,0.38,17000),
 ('3101','مسرغين','Misserghin','Misserghin',NULL,'31',35.6119,-0.7350,0.11,32000),
 ('3001','حاسي مسعود','Hassi Messaoud','Hassi Messaoud',NULL,'30',31.6804,6.0728,0.00,52000),
 ('0101','رقان','Reggane','Reggane',NULL,'01',26.7106,0.1706,0.00,20000)
) AS c(code, ar, fr, en, kab, wcode, lat, lon, ff, pop)
JOIN public.admin_units w ON w.level='wilaya' AND w.code = c.wcode;

INSERT INTO public.settlements (name, name_ar, place_type, lat, lon, commune_id, population)
SELECT s.name, s.ar, s.ptype, s.lat, s.lon, a.id, s.pop
FROM (VALUES
 ('Aghni Goughran','أقني قغران','village',36.5606,4.2764,'1501',4200),
 ('Iferhounene','إفرحونان','village',36.5361,4.3231,'1501',3100),
 ('Illilten','إليلتن','village',36.5433,4.3936,'1502',2600),
 ('Azazga','عزازقة','town',36.7447,4.3722,'1503',36000),
 ('Beni Douala','بني دوالة','village',36.6122,4.0722,'1504',9800),
 ('Akbou','أقبو','town',36.4589,4.5344,'0601',72000),
 ('Tichy','تيشي','town',36.6683,5.1494,'0602',17000),
 ('Adekar','أدكار','village',36.6172,4.7178,'0603',4700),
 ('Chréa','شريعة','village',36.4225,2.8817,'0901',2100),
 ('Collo','القل','town',37.0044,6.5619,'2101',29000),
 ('Seraïdi','سرايدي','village',36.9142,7.6667,'2301',6000),
 ('Merouana','مروانة','town',35.6333,5.9167,'0501',54000)
) AS s(name, ar, ptype, lat, lon, ccode, pop)
JOIN public.admin_units a ON a.level='commune' AND a.code = s.ccode;

INSERT INTO public.fire_clusters (short_id, state, first_detected_at, last_detected_at, lat, lon, detection_count, sources, max_frp_mw, confidence, est_area_ha, wind_speed_kmh, wind_dir_deg, spread_bearing_deg, commune_id, wilaya_id, nearest_settlement_id, nearest_settlement_km)
SELECT v.short_id, v.state, now() - (v.first_h || ' hours')::interval, now() - (v.last_h || ' minutes')::interval,
       v.lat, v.lon, v.dc, v.sources::text[], v.frp, v.conf, v.area, v.wind, v.wdir, v.wdir,
       c.id, c.parent_id, ns.id, v.dist
FROM (VALUES
 ('DZ7K4A','active',7,12,36.5688,4.2910,28,'{firms,fci}',186.4,0.91,412.0,34.0,48.0,'1501',3.1),
 ('DZ9M2B','active',3,25,36.6240,4.7330,11,'{fci}',72.8,0.74,96.0,21.0,315.0,'0603',5.8),
 ('DZ4P8C','active',19,40,37.0130,6.5480,17,'{firms,fci}',54.2,0.68,143.0,18.0,190.0,'2101',1.4),
 ('DZ2R6D','contained_guess',31,700,36.4310,2.8760,9,'{firms}',31.0,0.63,58.0,12.0,120.0,'0901',2.2),
 ('DZ8T1E','unconfirmed',2,95,35.6410,5.9330,2,'{firms}',12.4,0.41,28.0,25.0,270.0,'0501',9.3),
 ('DZ5W3F','extinguished',96,2600,36.9200,7.6580,22,'{firms,fci}',148.0,0.88,271.0,15.0,60.0,'2301',1.1)
) AS v(short_id, state, first_h, last_h, lat, lon, dc, sources, frp, conf, area, wind, wdir, ccode, dist)
JOIN public.admin_units c ON c.level='commune' AND c.code = v.ccode
LEFT JOIN LATERAL (
  SELECT s.id FROM public.settlements s
  WHERE s.commune_id = c.id
  ORDER BY ((s.lat - v.lat)^2 + (s.lon - v.lon)^2) ASC
  LIMIT 1
) ns ON true;

INSERT INTO public.detections (source, sensor, detected_at, lat, lon, confidence_raw, frp_mw, daynight, natural_key, cluster_id)
SELECT
  CASE WHEN g % 3 = 0 THEN 'firms' ELSE 'fci' END,
  CASE WHEN g % 3 = 0 THEN 'VIIRS_NOAA20' ELSE 'MTG_FCI' END,
  fc.last_detected_at - (g * 22 || ' minutes')::interval,
  fc.lat + (g % 5 - 2) * 0.006,
  fc.lon + (g % 4 - 2) * 0.006,
  LEAST(0.95, 0.5 + (g % 5) * 0.09),
  GREATEST(4.0, fc.max_frp_mw - g * 6.0),
  'D',
  fc.short_id || '-' || g,
  fc.id
FROM public.fire_clusters fc
CROSS JOIN generate_series(1, 12) g
WHERE g <= fc.detection_count;

INSERT INTO public.cluster_events (cluster_id, event, at, payload)
SELECT id, 'created', first_detected_at, jsonb_build_object('state','unconfirmed') FROM public.fire_clusters
UNION ALL
SELECT id, 'state_change', first_detected_at + interval '35 minutes', jsonb_build_object('to', state) FROM public.fire_clusters WHERE state <> 'unconfirmed';

INSERT INTO public.risk_forecasts (commune_id, forecast_date, horizon_days, source, fwi, danger_level, components)
SELECT a.id,
       (current_date + h),
       h,
       'local_fwi',
       f.fwi,
       CASE WHEN f.fwi >= 50 THEN 5 WHEN f.fwi >= 38 THEN 4 WHEN f.fwi >= 21.3 THEN 3 WHEN f.fwi >= 11.2 THEN 2 ELSE 1 END,
       jsonb_build_object('ffmc', 85 + f.fwi/6, 'dmc', 20 + f.fwi/2, 'dc', 200 + f.fwi*3, 'isi', f.fwi/5, 'bui', f.fwi*1.2, 'provenance','local_fwi')
FROM public.admin_units a
CROSS JOIN generate_series(0,5) h
CROSS JOIN LATERAL (SELECT GREATEST(2.0, 8 + a.forest_fraction * 70 + (('x' || substr(md5(a.code || h::text),1,4))::bit(16)::int % 22) - h * 1.4) AS fwi) f
WHERE a.level = 'commune';

INSERT INTO public.data_sources (name, label, status, last_ok_at, note) VALUES
('firms','NASA FIRMS (VIIRS/MODIS)','degraded', now() - interval '2 hours','Demo mode: no FIRMS_MAP_KEY configured'),
('fci','EUMETSAT MTG FCI','degraded', now() - interval '3 hours','Demo mode: no EUMETSAT credentials configured'),
('effis','EFFIS / GWIS FWI','degraded', now() - interval '1 day','Demo mode'),
('openmeteo','Open-Meteo weather','ok', now() - interval '20 minutes', NULL),
('geo','Admin boundaries & settlements','ok', now(), 'Seeded demo subset');
