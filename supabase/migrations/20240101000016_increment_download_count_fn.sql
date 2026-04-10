-- Phase 3: Billing — atomic download count increment

CREATE OR REPLACE FUNCTION public.increment_download_count(
  p_user_id UUID,
  p_ebook_id UUID
)
RETURNS void AS $$
BEGIN
  UPDATE public.user_ebooks
  SET
    download_count = download_count + 1,
    last_downloaded_at = now()
  WHERE user_id = p_user_id AND ebook_id = p_ebook_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
