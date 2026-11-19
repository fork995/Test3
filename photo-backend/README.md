# CleverVet backend — безопасный mock-этап

Исходный локальный коммит `f50c68d` недоступен. Код восстановлен заново в ветке `clevervet-backend-bootstrap` и не считается точной копией прежнего прототипа.

## Реализовано

- `GET /health` и защищённый `POST /api/mock/patients/:id/photo`, оба на `127.0.0.1:8787`.
- Mock JWT с отдельным ключом и разрешённым `sub`, ограничение пациента, JPEG 8 МБ, CORS только `https://fork995.github.io`, ID запроса, повторный GET и in-memory защита от повторной записи.
- Изолированные адаптеры JWT/JWKS, S3 PutObject и CleverVet GET/PUT; к HTTP-маршруту **подключены только mock-адаптеры**.
- Реальные операции с CleverVet и Yandex Object Storage недоступны. `PHOTO_WRITES_ENABLED` для реального сервиса не используется и не включает их.
- `src/service.ts` запрещает S3 PutObject до проверки поддержки условного обновления и наличия ETag. Поддержка `If-Match` оригинальным CleverVet пока **не подтверждена**.
- Отдельная локальная админка на порту 8788 с хешированным паролем, cookie-сессией и CSRF. Подготовлен штатный Authorization Code + PKCE с callback на loopback, проверкой access/ID JWT и read-only `GET /api/branches`. Пока нет зарегистрированного OIDC-клиента с разрешённым callback, живая серверная сессия недоступна.

## Локальная проверка

```sh
npm ci
npm test
npm start
curl http://127.0.0.1:8787/health
```

Для запуска mock HTTP-маршрута создайте вне репозитория случайный файл ключа не менее 32 байт с правами `0600` и задайте `MOCK_MODE=true`, `MOCK_JWT_SECRET_FILE`, `MOCK_ALLOWED_SUBJECT`, `MOCK_PILOT_PATIENT_ID=synthetic-patient`. Никаких реальных credentials для mock-тестов не требуется. Интеграционный тест использует полностью синтетический JWT, JPEG и пациента.

## Админка

Системный администратор самостоятельно задаёт пароль в SSH-сеансе, передавая его через stdin в `node dist/adminSetup.js /путь/вне/репозитория/admin-password.hash`. Ввод не должен попадать в shell history или аргументы процесса. Хранится только соль и `scrypt`-хеш в файле `0600`.

Установите `ADMIN_PASSWORD_HASH_FILE` и при готовом интерактивном дисплее `BROWSER_LAUNCH_SCRIPT`, затем `npm run start:admin`. Откройте только через `ssh -L 8788:127.0.0.1:8788 -L 6080:127.0.0.1:6080 orangepi` и адрес `http://127.0.0.1:8788/admin`. VNC требует отдельный случайный пароль из `/dev/shm/clevervet-vnc-password`, который виден только владельцу Orange Pi. Без запуска браузера порт 6080 закрыт.

Xvfb and interactive Chromium launch after the administrator installed x11-xkb-utils. Headless Chromium has also been verified.

## Серверная авторизация OIDC

Публичный оригинальный CleverVet загружает `configuration/oidc.config.json` и использует `angular-auth-oidc-client`: Authorization Code с PKCE, аудиторию `https://api.clevervet.tech`, Auth0 `https://dev-l4aq9wjx.eu.auth0.com/`. Callback оригинального клиента — сайт CleverVet. Авторизованная сессия в его Chromium подтверждена пользователем, но обычный OIDC не передаёт её токены нашему backend автоматически.

Для безопасного подключения нужен OIDC-клиент, разрешённый владельцем Auth0 для нашего backend, с точным callback `http://localhost:8788/admin/oidc/callback` и доступом к аудитории CleverVet API. Не использовать идентификатор оригинального SPA-клиента с новым callback без его явного разрешения. Указать `OIDC_CLIENT_ID` вне репозитория; если клиент конфиденциальный, сохранить его secret в отдельном файле `0600` и указать `OIDC_CLIENT_SECRET_FILE`. Без этих настроек кнопка подключения вернёт `OIDC_CLIENT_NOT_CONFIGURED`.

После запуска Chromium администратор нажимает «Подключить OIDC к backend». Backend создаёт случайные `state`, `nonce` и PKCE verifier; серверный Chromium открывает Auth0. Администратор проходит штатный вход или использует действующую SSO-сессию. Callback передаёт backend одноразовый authorization code. Backend обменивает его на токены, проверяет JWT по JWKS, issuer, разные audience для access/ID token, subject, nonce и сроки; затем определяет наличие и структуру S3 claim без вывода значений. Токены существуют только в памяти процесса до истечения срока или команды завершения. Refresh token не запрашивается и на диск не записывается.

Для управления браузером задать `BROWSER_OPEN_URL_SCRIPT=/home/admin/clevervet-runtime/photo-backend/deploy/browser-open-url.sh`. Оба browser script должны иметь право исполнения. `ADMIN_BROWSER_MINUTES` задаёт срок Chromium от 5 до 120 минут (по умолчанию 20). Кнопка «Завершить серверную сессию» немедленно закрывает Chromium и удаляет ссылки на токены из памяти. JavaScript не позволяет гарантированно затереть уже созданные неизменяемые строки в heap; это ограничение оперативного хранения.

`POST /admin/check` выполняет только `GET https://backend.clevervet.tech/api/branches`. Ответ с данными не сохраняется и не возвращается в панель; показываются статус API и время последней успешной проверки. Административный access token не используется для вызовов обычных пользователей Test3. Реальные операции S3/PUT по-прежнему отсутствуют в HTTP-маршрутах.

## Что осталось до реальной записи

Получить разрешённый OIDC-клиент и проверить живой callback, access/ID token, S3 claim и read-only API; позже реализовать зашифрованное постоянное хранение. Отдельно проверить права S3 и `If-Match` CleverVet API; реальный защищённый маршрут записи создавать только после разрешения на пилот. Не передавать S3 credentials или ID token обычному Test3.
