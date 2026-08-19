# Cemetery Mapper

Минимальный mobile-first frontend для первого этапа Cemetery Mapper. Приложение создано на React, TypeScript и Vite и подготовлено как устанавливаемая PWA для Android.

## Frontend

```powershell
cd web
npm install
npm run dev
```

Локальный сервер Vite обычно доступен по адресу `http://localhost:5173`.

Production-сборка:

```powershell
cd web
npm run build
```

Результат сборки создаётся в `web/dist`.

Предпросмотр production-сборки:

```powershell
cd web
npm run preview
```

## Cloudflare Pages

При создании проекта в Cloudflare Pages укажите:

Root directory:
`web`

Build command:
`npm run build`

Build output directory:
`dist`

## Deployment

### GitHub Pages

Production URL:

`https://ppopov-png.github.io/cemetery/`

Deployment выполняется автоматически после push в ветку `master` через `.github/workflows/deploy-pages.yml`. Workflow также можно запустить вручную через `workflow_dispatch`.

GitHub Pages build использует:

`VITE_BASE_PATH=/cemetery/`

### Cloudflare Pages

Cloudflare Pages остаётся без изменений:

Root directory: `web`

Build command: `npm run build`

Build output directory: `dist`

Локальная сборка и Cloudflare используют base `/`, а GitHub Pages — `/cemetery/`. Поэтому один frontend совместим с обоими deployment targets.

Дополнительные переменные окружения для текущего этапа не нужны.
