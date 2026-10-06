create policy "authenticated users can update rule enabled"
  on public.rules for update
  to authenticated
  using (true)
  with check (true);
