-- Optional invite card background theme (persisted with the event)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS invite_theme_color text;

ALTER TABLE public.org_events
  ADD COLUMN IF NOT EXISTS invite_theme_color text;

COMMENT ON COLUMN public.events.invite_theme_color IS 'Invite card palette key: default, slate, ocean, rose, forest, terracotta, lavender, charcoal';
COMMENT ON COLUMN public.org_events.invite_theme_color IS 'Invite card palette key: default, slate, ocean, rose, forest, terracotta, lavender, charcoal';
