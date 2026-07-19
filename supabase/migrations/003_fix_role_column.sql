-- ============================================================
-- RiseOS - Fix Script (run this if 002 failed)
-- Adds role column to profiles, fixes RLS
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add role column to profiles if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
  END IF;
END $$;

-- 2. Add CHECK constraint on role column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'profiles' AND constraint_name = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Add avatar column to user_settings if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.user_settings ADD COLUMN avatar_url TEXT;
  END IF;
END $$;

-- 4. Drop old admin policy if exists and recreate
DROP POLICY IF EXISTS "Profiles: admin select all" ON public.profiles;
CREATE POLICY "Profiles: admin select all" ON public.profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 5. Create notifications table if not exists
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT,
  type        TEXT NOT NULL DEFAULT 'info',
  icon        TEXT,
  read        BOOLEAN NOT NULL DEFAULT false,
  action_url  TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast unread queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read) WHERE NOT read;

-- 6. Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 7. Notification policies
DROP POLICY IF EXISTS "Notifications: own select" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: own insert" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: own update" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: own delete" ON public.notifications;

CREATE POLICY "Notifications: own select" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Notifications: own insert" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Notifications: own update" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Notifications: own delete" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- 8. Fix the handle_new_user trigger to set role based on admin email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar', NULL),
    'user'
  );
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Make your email admin (CHANGE THIS to your actual email)
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'your-email@example.com';

-- ✅ Done!