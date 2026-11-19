# Orange Pi: безопасный этап развёртывания

## Текущее состояние

- Основа backend создана заново: исходный локальный коммит `f50c68d` и исходный `photo-backend/` недоступны.
- HTTP-сервер предоставляет только `GET /health` на `127.0.0.1:8787`; реальные записи отсутствуют.
- Node.js ARM64 установлен в `/home/admin/clevervet-runtime/node-v22.23.5-linux-arm64/` без пакетного менеджера.
- Код и зависимости расположены в `/home/admin/clevervet-runtime/photo-backend/`.
- `cloudflared` 2026.11.1 размещён в `/home/admin/clevervet-runtime/cloudflared-2026.11.1-linux-arm64` (SHA-256 `b155cec3e48e489cfb8e5c602769fb8c771083018d8881d68b4d18a791567c5a`). Именованный Tunnel не создан: домена Cloudflare пока нет.
- Playwright 1.65.1 и Chromium ARM64 загружены в `/home/admin/clevervet-runtime/admin-browser/` и `/home/admin/clevervet-runtime/pw-browsers/`. Chromium не запускается без системных библиотек, начиная с `libnspr4` и `libnss3`; админка и интерактивная авторизация не созданы.
- Системная служба пока не создана: для отдельного системного пользователя и автозапуска нужен ограниченный привилегированный доступ.

## Внешняя резервная копия

`C:\Users\Анастасия\Documents\OrangePi-backup-20261119\clevervet-predeploy-readable-20261119.tar.gz`

SHA-256: `bf4422894bf6617f50f33f59c23968172ef06b3d4e817d2a88a48429f6f5cb3c`.

Это файловый архив читаемых пользователем `admin` загрузочных и системных файлов, 468 записей. Проверены `tar -tzf`, `boot/armbianEnv.txt`, `etc/fstab`, `etc/hostname` и `etc/systemd/network/`. Это **не полный образ microSD**: закрытые настройки Xray, ключи, firewall и таблица разделов в него не включены. Для восстановления всей карты необходима отдельная проверенная копия или переустановка Armbian с последующим восстановлением файлов.

Для просмотра содержимого на компьютере: `tar -tzf <путь-к-архиву>`. Восстанавливать файлы следует только на новую карту через Linux с сохранением прав и после проверки совместимости версии Armbian; не распаковывать архив поверх работающего шлюза.

## Запуск и остановка тестового процесса

После SSH-входа:

```sh
cd /home/admin/clevervet-runtime/photo-backend
PATH=/home/admin/clevervet-runtime/node-v22.23.5-linux-arm64/bin:$PATH npm test
PATH=/home/admin/clevervet-runtime/node-v22.23.5-linux-arm64/bin:$PATH node dist/server.js
```

В отдельной SSH-сессии: `curl -fsS http://127.0.0.1:8787/health`. Остановить интерактивный процесс `Ctrl+C`. Не включать `PHOTO_WRITES_ENABLED` на текущем этапе.

## Откат созданного этапа

Остановить тестовый процесс `Ctrl+C`. Убедиться, что порт 8787 не занят: `ss -lnt | grep 8787`. Постоянные службы backend, Tunnel и браузера не созданы, поэтому отключать автозапуск пока нечего. После проверки точных путей можно удалить **только** `/home/admin/clevervet-runtime/` (Node.js, backend, тестовую копию Test3, `cloudflared`, Playwright, Chromium и загрузочные архивы). Это не затрагивает системные службы, маршруты, Xray, Wi-Fi, DHCP и SSH. Внешний backup сохранить отдельно.

## Ограничения следующего этапа

Требуются подтверждённые доступ к Cloudflare и домен, отдельный пользователь службы, проверка оригинального OIDC-процесса, защита admin-панели, точный контракт API пациента и подтверждение ETag/`If-Match`. Без них реальный PUT пациента заблокирован.
