-- Spec 11: the public API is rate limited to 60 rpm/IP. Edge instances share no
-- memory, so the counter lives in Postgres and is incremented atomically.
CREATE TABLE IF NOT EXISTS private.api_rate_limit (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _bucket text,
  _limit integer,
  _window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  w timestamptz := to_timestamp(
    floor(extract(epoch from now()) / _window_seconds) * _window_seconds
  );
  n integer;
BEGIN
  INSERT INTO private.api_rate_limit AS r (bucket, window_start, hits)
  VALUES (_bucket, w, 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET hits = r.hits + 1
  RETURNING r.hits INTO n;

  -- amortised cleanup so the table cannot grow without bound
  IF random() < 0.01 THEN
    DELETE FROM private.api_rate_limit WHERE window_start < now() - interval '1 hour';
  END IF;

  RETURN n <= _limit;
END $$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer)
  TO anon, authenticated, service_role;
