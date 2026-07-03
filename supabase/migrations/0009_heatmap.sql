-- 0009_heatmap.sql — Mapa de calor agregado e anônimo.
-- Não guarda posições individuais nem vínculo com lead/jornada: apenas um
-- contador de "peso" por célula da grade, por página. O tracker agrega no
-- navegador e envia um resumo por visita; aqui só incrementamos.

-- Dimensões da página (para escalar o mapa e alinhar com um screenshot).
create table if not exists heatmap_page (
  tenant_id  uuid not null references tenant(id) on delete cascade,
  page_path  text not null,
  width      int  not null default 0,
  height     int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, page_path)
);

-- Grade agregada: peso por célula (coluna 0..49 relativa à largura; linha em
-- passos de 24px do topo do documento). kind = 'move' | 'click'.
create table if not exists heatmap_cell (
  tenant_id  uuid not null references tenant(id) on delete cascade,
  page_path  text not null,
  kind       text not null check (kind in ('move', 'click')),
  grid_x     int  not null,
  grid_y     int  not null,
  weight     bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, page_path, kind, grid_x, grid_y)
);

create index if not exists heatmap_cell_lookup
  on heatmap_cell (tenant_id, page_path, kind);

-- ---------------------------------------------------------------------------
-- Incremento em lote (SECURITY DEFINER). Recebe um array de [x, y, w].
-- ---------------------------------------------------------------------------
create or replace function increment_heatmap_cells(
  p_tenant uuid,
  p_page   text,
  p_kind   text,
  p_cells  jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare c jsonb;
begin
  if p_kind not in ('move', 'click') then
    raise exception 'kind inválido: %', p_kind;
  end if;
  for c in select * from jsonb_array_elements(p_cells)
  loop
    insert into heatmap_cell (tenant_id, page_path, kind, grid_x, grid_y, weight)
    values (
      p_tenant, p_page, p_kind,
      (c->>0)::int, (c->>1)::int, greatest((c->>2)::int, 0)
    )
    on conflict (tenant_id, page_path, kind, grid_x, grid_y)
    do update set weight = heatmap_cell.weight + excluded.weight, updated_at = now();
  end loop;
end;
$$;

revoke all on function increment_heatmap_cells(uuid, text, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- RLS: leitura pelo dashboard (dentro dos tenants visíveis). Escrita é feita
-- pelo service role (bypass) via /api/heatmap.
-- ---------------------------------------------------------------------------
alter table heatmap_page enable row level security;
alter table heatmap_cell enable row level security;

create policy heatmap_page_read on heatmap_page
  for select to authenticated
  using (tenant_id in (select visible_tenant_ids()));

create policy heatmap_cell_read on heatmap_cell
  for select to authenticated
  using (tenant_id in (select visible_tenant_ids()));
