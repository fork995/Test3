# CleverVet backend — безопасный mock-этап

Исходный локальный коммит `f50c68d` недоступен. Код восстановлен заново в ветке `clevervet-backend-bootstrap` и не считается точной копией прежнего прототипа.

## Реализовано

- `GET /health` и защищённый `POST /api/mock/patients/:id/photo`, оба на `127.0.0.1:8787`.
- Mock JWT с отдельным ключом и разрешённым `sub`, ограничение пациента, JPEG 8 МБ, CORS только `https://fork995.github.io`, ID запроса, повторный GET и in-memory защита от повторной записи.
- Изолированные адаптеры JWT/JWKS, S3 PutObject и CleverVet GET/PUT; к HTTP-маршруту **подключены только mock-адаптеры**.
- Реальные операции с CleverVet и Yandex Object Storage недоступны. `PHOTO_WRITES_ENABLED` для реального сервиса не используется и не включает их.
- `src/service.ts` запрещает S3 PutObject до проверки поддержки условного обновления и наличия ETag. Поддержка `If-Match` оригинальным CleverVet пока **не подтверждена**.
- Отдельная локальная админка на порту 8788 с хешированным паролем, cookie-сессией и CSRF. Текущая сессия оригинального Chromium подключается явным действием администратора; read-only `GET /api/branches` доступен после проверки JWT.

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

Установите `ADMIN_PASSWORD_HASH_FILE`, `BROWSER_LAUNCH_SCRIPT` и `VNC_PASSWORD_FILE=/dev/shm/clevervet-vnc-password`, затем запустите `npm run start:admin`. Для домашней сети панель и noVNC публикуются только через `deploy/lan-https.mjs` с доверенным TLS-сертификатом. Backend admin (8788), websockify (6080) и VNC (5900) остаются на loopback; порт 5900 в сеть не открывается.

После входа администратора и запуска Chromium панель получает текущий одноразовый пароль через `POST /admin/vnc/password`. Endpoint требует действующую cookie-сессию и точный CSRF-токен, возвращает `Cache-Control: no-store`, а пароль не попадает в URL, cookies или browser storage. noVNC получает пароль непосредственно через свой `RFB` API. Резервная кнопка показывает пароль на 30 секунд и пытается скопировать его в буфер обмена. При каждом запуске `browser-session.sh` атомарно создаёт новый файл `0600`; при остановке файл удаляется, экран отключается, а следующий запуск получает новый пароль.

Xvfb and interactive Chromium launch after the administrator installed x11-xkb-utils. Headless Chromium has also been verified.

## Серверная авторизация OIDC

Публичный оригинальный CleverVet загружает `configuration/oidc.config.json` и использует `angular-auth-oidc-client`: Authorization Code с PKCE, аудиторию `https://api.clevervet.tech`, Auth0 `https://dev-l4aq9wjx.eu.auth0.com/`. Callback оригинального клиента — сайт CleverVet. Авторизованная сессия в его Chromium подтверждена пользователем, но обычный OIDC не передаёт её токены нашему backend автоматически.

Отдельный OIDC-клиент и callback больше не используются в работающей админке. Администратор штатно входит в оригинальный CleverVet в Chromium, затем нажимает «Подключить текущую сессию». Локальный Playwright-процесс читает только access и ID JWT из sessionStorage оригинального origin и передаёт их backend по сокету `0600` в `/dev/shm`. Backend проверяет подпись, issuer, audience, subject и срок действия. Токены и S3 claim остаются только в памяти. Этот путь зависит от формата кэша оригинального приложения; при его изменении потребуется адаптировать `browserCacheProbe`.

«Проверить API» выполняет два read-only GET `/api/branches` с одним токеном: без Origin и с `Origin: https://www.app.clevervet.tech`. Ответ содержит только статусы и длительность, без содержимого данных. `POST /admin/s3/head` принимает законно известный ключ JPEG в bucket `clevervet-patient-photos` и выполняет только подписанный HEAD; отсутствие ключа или право на bucket само по себе не доказывает доступ к конкретному объекту. Эти административные маршруты требуют cookie и CSRF. Реальные операции записи не подключены.

`ADMIN_BROWSER_MINUTES` задаёт срок Chromium от 5 до 120 минут (по умолчанию 20). Кнопка «Завершить серверную сессию» закрывает Chromium и удаляет ссылки на токены из памяти. JavaScript не позволяет гарантированно затереть уже созданные неизменяемые строки в heap. Административный access token не используется для вызовов обычных пользователей Test3.

## Что осталось до реальной записи

Подтвердить живую текущую сессию в Chromium, авторизованный GET и права на конкретный S3-объект. Отдельно проверить поддержку `If-Match` CleverVet API и спроектировать привязку полномочий пользователя Test3 к его пациенту; реальный защищённый маршрут записи создавать только после разрешения на пилот. Не передавать S3 credentials или ID token обычному Test3.
