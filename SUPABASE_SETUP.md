# Configurar Supabase Storage (obligatorio para imágenes)

El panel sube imágenes al bucket **`media`** del proyecto:
`https://irezssfcluafjmpkmzhi.supabase.co`

## Pasos en la consola

1. Entrá a https://supabase.com/dashboard/project/irezssfcluafjmpkmzhi/storage/buckets
2. Creá un bucket llamado exactamente `media`
3. Marcá **Public bucket** (lectura pública de imágenes del menú)
4. En Policies del bucket, agregá:

### Lectura pública
```sql
create policy "Public read media"
on storage.objects for select
using (bucket_id = 'media');
```

### Subida / update / delete (panel admin)
Como el admin autentica en Firebase (no en Supabase Auth), para producción simple usá políticas permisivas solo en este bucket, o subí con service role desde un backend.

Opción rápida (solo bucket media, proyecto controlado):

```sql
create policy "Allow uploads to media"
on storage.objects for insert
with check (bucket_id = 'media');

create policy "Allow update media"
on storage.objects for update
using (bucket_id = 'media');

create policy "Allow delete media"
on storage.objects for delete
using (bucket_id = 'media');
```

> Nota: Auth y datos (pedidos, productos, clientes) siguen en **Firebase**. Supabase se usa **solo para Storage**.

## Variables de entorno

Archivo `.env` en la raíz del proyecto (ya incluido localmente):

```
VITE_SUPABASE_URL=https://irezssfcluafjmpkmzhi.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```
