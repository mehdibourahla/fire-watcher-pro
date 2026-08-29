-- 20260828151045 created the report-photos policies but never the bucket, so every
-- citizen report upload failed with "Bucket not found". The size and mime limits are
-- enforced by Storage itself, unlike the client-side Exif strip a caller can skip.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-photos',
  'report-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
