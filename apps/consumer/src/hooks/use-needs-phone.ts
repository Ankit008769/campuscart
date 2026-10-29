import { getMyProfile } from '@campuscart/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/**
 * True once we know the signed-in student hasn't saved a mobile number. Rechecked whenever the
 * screen comes back into focus, so the prompt goes away after they add one on the profile screen.
 */
export function useNeedsPhone(): boolean {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [needsPhone, setNeedsPhone] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let active = true;
      getMyProfile(supabase, userId).then(
        (profile) => active && setNeedsPhone(!profile.phone),
        // A failed check just leaves the prompt hidden; the profile screen shows real errors.
        () => {},
      );
      return () => {
        active = false;
      };
    }, [userId]),
  );

  return needsPhone;
}
