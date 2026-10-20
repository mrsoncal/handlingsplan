REVOKE ALL ON FUNCTION public.claim_council_invitations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_council_member(BIGINT, TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_event_member(BIGINT, TEXT[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.claim_council_invitations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_council_member(BIGINT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_event_member(BIGINT, TEXT[]) TO authenticated;
