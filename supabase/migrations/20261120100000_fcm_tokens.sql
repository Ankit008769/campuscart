-- Android phones now register their Firebase (FCM) token, which send-push delivers to directly; older
-- builds still send Expo push tokens, and send-push keeps delivering those through Expo. The column
-- keeps its old name, expo_token: it holds either kind.

create or replace function public.register_device_token(p_app text, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_app is null or p_app not in ('consumer', 'merchant') then
    raise exception 'Unknown app %', p_app using errcode = '22023';
  end if;
  if p_token is null or not (
    p_token ~ '^Expo(nent)?PushToken\[[^]\s]{8,200}\]$'
    or (p_token ~ '^[A-Za-z0-9_:-]+$' and length(p_token) between 100 and 4096)
  ) then
    raise exception 'Not a push token' using errcode = '22023';
  end if;
  insert into public.device_tokens (user_id, app, expo_token)
  values ((select auth.uid()), p_app, p_token)
  on conflict (expo_token) do update
    set user_id = excluded.user_id, app = excluded.app, updated_at = now();
end;
$$;
