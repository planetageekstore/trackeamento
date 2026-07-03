-- 0013_heatmap_device.sql — separa o mapa de calor por dispositivo (desktop/mobile).
-- O device é derivado do User-Agent na ingestão (binário: desktop | mobile).

alter table heatmap_cell add column if not exists device text not null default 'desktop';
alter table heatmap_page add column if not exists device text not null default 'desktop';

alter table heatmap_cell drop constraint if exists heatmap_cell_pkey;
alter table heatmap_cell add constraint heatmap_cell_pkey
  primary key (tenant_id, page_path, device, kind, grid_x, grid_y);

alter table heatmap_page drop constraint if exists heatmap_page_pkey;
alter table heatmap_page add constraint heatmap_page_pkey
  primary key (tenant_id, page_path, device);

drop index if exists heatmap_cell_lookup;
create index if not exists heatmap_cell_lookup on heatmap_cell (tenant_id, page_path, device, kind);

-- Incremento agora recebe o device.
drop function if exists increment_heatmap_cells(uuid, text, text, jsonb);
create or replace function increment_heatmap_cells(
  p_tenant uuid,
  p_page   text,
  p_device text,
  p_kind   text,
  p_cells  jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare c jsonb;
begin
  if p_kind not in ('move', 'click', 'scroll') then
    raise exception 'kind inválido: %', p_kind;
  end if;
  for c in select * from jsonb_array_elements(p_cells)
  loop
    insert into heatmap_cell (tenant_id, page_path, device, kind, grid_x, grid_y, weight)
    values (p_tenant, p_page, p_device, p_kind, (c->>0)::int, (c->>1)::int, greatest((c->>2)::int, 0))
    on conflict (tenant_id, page_path, device, kind, grid_x, grid_y)
    do update set weight = heatmap_cell.weight + excluded.weight, updated_at = now();
  end loop;
end;
$$;
revoke all on function increment_heatmap_cells(uuid, text, text, text, jsonb) from public;
grant execute on function increment_heatmap_cells(uuid, text, text, text, jsonb) to service_role;
