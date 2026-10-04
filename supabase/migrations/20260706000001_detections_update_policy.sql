create policy "org members can update detections"
  on public.detections for update
  using (
    event_id in (
      select events.id
      from public.events
      join public.sessions on sessions.id = events.session_id
      join public.agents on agents.id = sessions.agent_id
      where private.is_org_member(agents.org_id)
    )
  );
