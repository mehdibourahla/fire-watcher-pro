-- A commune below 5% burnable cover gets fire-weather numbers with no warning
-- value; the flag lets surfaces and alerts treat the rating as not-applicable
-- without lying about the computed FWI.
alter table risk_forecasts add column fuel_limited boolean not null default false;
