<?php
session_start();

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Credentials: true');

const DATA_ROOT = __DIR__ . '/../data';
const USERS_ROOT = DATA_ROOT . '/users';
const USERS_FILE = USERS_ROOT . '/users.json';
const LEGACY_COLLECTIONS = ['locations', 'eggLogs', 'hens', 'feedLogs', 'medicationLogs', 'saleLogs', 'chickBatches'];
const DB_COLLECTIONS = ['locations', 'eggLogs', 'hens', 'feedLogs', 'medicationLogs', 'saleLogs', 'chickBatches'];
const COLLECTION_TABLES = [
    'locations' => 'coops',
    'hens' => 'birds',
    'eggLogs' => 'egg_logs',
    'feedLogs' => 'feed_logs',
    'medicationLogs' => 'feed_logs',
    'saleLogs' => 'sales',
    'chickBatches' => 'incubation_batches',
];

$appConfig = load_app_config();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: ' . get_allowed_origin());
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    exit;
}

header('Access-Control-Allow-Origin: ' . get_allowed_origin());

function load_app_config(): array {
    $defaults = [
        'app_env' => env_value('APP_ENV', 'production'),
        'app_debug' => env_bool('APP_DEBUG', false),
        'allow_any_origin' => env_bool('ALLOW_ANY_ORIGIN', false),
        'allowed_origins' => [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:5173',
            'http://127.0.0.1:5173',
        ],
        'legacy_json_fallback' => env_bool('LEGACY_JSON_FALLBACK', true),
        'db' => [
            'host' => env_value('DB_HOST', 'localhost'),
            'name' => env_value('DB_NAME', ''),
            'user' => env_value('DB_USER', ''),
            'password' => env_value('DB_PASSWORD', ''),
            'charset' => env_value('DB_CHARSET', 'utf8mb4'),
        ],
    ];

    $configPath = __DIR__ . '/config.php';
    if (file_exists($configPath)) {
        $loaded = require $configPath;
        if (is_array($loaded)) {
            $config = array_replace_recursive($defaults, $loaded);
            if (($config['db']['password'] ?? '') === '' && !empty($config['db']['pass'] ?? '')) {
                $config['db']['password'] = (string) $config['db']['pass'];
            }
            return $config;
        }
    }

    return $defaults;
}

function env_value(string $key, $default = null) {
    $value = getenv($key);
    return $value === false ? $default : $value;
}

function env_bool(string $key, bool $default = false): bool {
    $value = getenv($key);
    if ($value === false) {
        return $default;
    }

    return filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $default;
}

function app_config(?string $key = null, $default = null) {
    global $appConfig;
    if ($key === null) {
        return $appConfig;
    }

    $segments = explode('.', $key);
    $value = $appConfig;
    foreach ($segments as $segment) {
        if (!is_array($value) || !array_key_exists($segment, $value)) {
            return $default;
        }
        $value = $value[$segment];
    }

    return $value;
}

function get_allowed_origin(): string {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') {
        return '*';
    }

    if (app_config('allow_any_origin', false)) {
        return $origin;
    }

    $allowed = app_config('allowed_origins', []);
    return in_array($origin, $allowed, true) ? $origin : $origin;
}

function json_input(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        respond(['error' => 'Invalid JSON body'], 400);
    }

    return $decoded;
}

function respond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $status = 500, ?Throwable $exception = null): void {
    $payload = ['error' => $message];
    if ($exception && app_config('app_debug', false)) {
        $payload['detail'] = $exception->getMessage();
    }
    respond($payload, $status);
}

function ensure_legacy_storage(): void {
    if (!is_dir(DATA_ROOT)) mkdir(DATA_ROOT, 0775, true);
    if (!is_dir(USERS_ROOT)) mkdir(USERS_ROOT, 0775, true);
    if (!file_exists(USERS_FILE)) {
        file_put_contents(USERS_FILE, json_encode([], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }
}

function read_json_file(string $path, $default = []) {
    if (!file_exists($path)) {
        return $default;
    }

    $handle = fopen($path, 'r');
    if (!$handle) {
        return $default;
    }

    flock($handle, LOCK_SH);
    $contents = stream_get_contents($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    if ($contents === false || $contents === '') {
        return $default;
    }

    $decoded = json_decode($contents, true);
    return $decoded === null ? $default : $decoded;
}

function write_json_file(string $path, $data): void {
    $dir = dirname($path);
    if (!is_dir($dir)) mkdir($dir, 0775, true);

    $handle = fopen($path, 'c+');
    if (!$handle) {
        fail('Unable to write storage file');
    }

    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        fail('Unable to lock storage file');
    }

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

function legacy_user_record_path(string $userId, string $collection): string {
    if (!in_array($collection, LEGACY_COLLECTIONS, true)) {
        fail('Invalid collection', 400);
    }

    return USERS_ROOT . '/' . $userId . '/' . $collection . '.json';
}

function ensure_legacy_user_storage(string $userId): void {
    $userDir = USERS_ROOT . '/' . $userId;
    if (!is_dir($userDir)) mkdir($userDir, 0775, true);

    foreach (LEGACY_COLLECTIONS as $collection) {
        $path = legacy_user_record_path($userId, $collection);
        if (!file_exists($path)) {
            $seed = $collection === 'locations' ? [] : [];
            write_json_file($path, $seed);
        }
    }
}

function legacy_all_users(): array {
    ensure_legacy_storage();
    $users = read_json_file(USERS_FILE, []);
    return is_array($users) ? $users : [];
}

function legacy_save_users(array $users): void {
    write_json_file(USERS_FILE, array_values($users));
}

function normalize_email(string $email): string {
    return strtolower(trim($email));
}

function public_user(array $user): array {
    return [
        'id' => (string) ($user['id'] ?? ''),
        'email' => (string) ($user['email'] ?? ''),
        'nickname' => $user['nickname'] ?? null,
        'createdAt' => $user['createdAt'] ?? ($user['created_at'] ?? null),
    ];
}

function use_database(): bool {
    static $resolved = null;
    if ($resolved !== null) {
        return $resolved;
    }

    $dbName = trim((string) app_config('db.name', ''));
    $dbUser = trim((string) app_config('db.user', ''));
    $dbPassword = (string) app_config('db.password', '');

    $resolved = $dbName !== '' && $dbUser !== '' && $dbPassword !== '';
    return $resolved;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    if (!use_database()) {
        fail('Database is not configured', 500);
    }

    try {
        $charset = app_config('db.charset', 'utf8mb4');
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=%s',
            app_config('db.host', 'localhost'),
            app_config('db.name', ''),
            $charset
        );

        $pdo = new PDO($dsn, app_config('db.user', ''), app_config('db.password', ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (Throwable $exception) {
        $pdo = null;
        throw $exception;
    }

    return $pdo;
}

function schema_columns(string $table): array {
    static $cache = [];
    if (isset($cache[$table])) {
        return $cache[$table];
    }

    $statement = db()->query('SHOW COLUMNS FROM `' . str_replace('`', '``', $table) . '`');
    $columns = [];
    foreach ($statement->fetchAll() as $column) {
        $name = $column['Field'] ?? null;
        if ($name) {
            $columns[$name] = $column;
        }
    }

    $cache[$table] = $columns;
    return $columns;
}

function table_has_column(string $table, string $column): bool {
    return array_key_exists($column, schema_columns($table));
}

function table_column(string $table, string $column): ?array {
    $columns = schema_columns($table);
    return $columns[$column] ?? null;
}

function table_uses_auto_increment_id(string $table): bool {
    $idColumn = id_column($table);
    if (!$idColumn) {
        return false;
    }

    $column = table_column($table, $idColumn);
    if (!$column) {
        return false;
    }

    $extra = strtolower((string) ($column['Extra'] ?? $column['extra'] ?? ''));
    return str_contains($extra, 'auto_increment');
}

function column_type(string $table, string $column): string {
    $definition = table_column($table, $column);
    return strtolower((string) ($definition['Type'] ?? $definition['type'] ?? ''));
}

function column_accepts_string_identifier(string $table, string $column): bool {
    $type = column_type($table, $column);
    if ($type === '') {
        return true;
    }

    return preg_match('/char|text|json|blob|enum|set|binary|varbinary/', $type) === 1;
}

function normalize_date_column_value(string $table, string $column, $value) {
    if ($value === null || $value === '') {
        return null;
    }

    $type = column_type($table, $column);
    if ($type === '') {
        return $value;
    }

    $timestamp = strtotime((string) $value);
    if ($timestamp === false) {
        return $value;
    }

    if (preg_match('/\b(date)\b/', $type) === 1 && !str_contains($type, 'datetime') && !str_contains($type, 'timestamp')) {
        return gmdate('Y-m-d', $timestamp);
    }

    if (str_contains($type, 'datetime') || str_contains($type, 'timestamp')) {
        return gmdate('Y-m-d H:i:s', $timestamp);
    }

    return $value;
}

function identifier_candidates_from_row(string $table, array $row): array {
    $payload = payload_for_table_row($table, $row);
    $candidates = [
        record_primary_id_from_row($table, $row),
        app_record_id_from_row($table, $row),
        column_value($row, ['uuid', 'id'], null),
        $payload['id'] ?? null,
    ];

    return array_values(array_unique(array_filter(array_map(function ($value) {
        if ($value === null || $value === '') {
            return null;
        }
        return trim((string) $value);
    }, $candidates))));
}

function related_record_matches_identifier(string $table, array $row, string $identifier): bool {
    return in_array(trim($identifier), identifier_candidates_from_row($table, $row), true);
}

function related_record_app_id(string $table, array $row): string {
    $appId = trim(app_record_id_from_row($table, $row));
    if ($appId !== '') {
        return $appId;
    }

    $primaryId = record_primary_id_from_row($table, $row);
    return $primaryId === null ? '' : trim($primaryId);
}

function related_record_app_id_from_foreign_value(string $relatedTable, string $userId, $value): string {
    if ($value === null || $value === '') {
        return '';
    }

    $identifier = trim((string) $value);
    if ($identifier === '') {
        return '';
    }

    foreach (fetch_rows($relatedTable, $userId) as $row) {
        if (related_record_matches_identifier($relatedTable, $row, $identifier)) {
            return related_record_app_id($relatedTable, $row);
        }
    }

    return $identifier;
}

function payload_for_table_row(string $table, array $row): array {
    $payloadColumn = payload_column($table);
    return $payloadColumn ? decode_json_value($row[$payloadColumn] ?? null, []) : [];
}

function app_record_id_from_row(string $table, array $row): string {
    $payload = payload_for_table_row($table, $row);
    $payloadId = $payload['id'] ?? null;
    if (is_scalar($payloadId) && (string) $payloadId !== '') {
        return (string) $payloadId;
    }

    return (string) column_value($row, ['uuid', 'id'], '');
}

function record_primary_id_from_row(string $table, array $row): ?string {
    $idColumn = id_column($table) ?? 'id';
    if (!array_key_exists($idColumn, $row) || $row[$idColumn] === null || $row[$idColumn] === '') {
        return null;
    }

    return (string) $row[$idColumn];
}

function find_existing_record_row(string $table, string $userId, string $recordId, ?string $extraWhere = null): ?array {
    if ($recordId === '') {
        return null;
    }

    $idColumn = id_column($table) ?? 'id';
    if (!table_uses_auto_increment_id($table) || column_accepts_string_identifier($table, $idColumn)) {
        $conditions = ["`{$idColumn}` = :id"];
        $params = [':id' => $recordId];

        $userIdColumn = user_id_column($table);
        if ($userIdColumn) {
            $conditions[] = "`{$userIdColumn}` = :user_id";
            $params[':user_id'] = $userId;
        }

        $deletedAtColumn = delete_record_column($table);
        if ($deletedAtColumn) {
            $conditions[] = "`{$deletedAtColumn}` IS NULL";
        }

        if ($extraWhere) {
            $conditions[] = $extraWhere;
        }

        $sql = "SELECT * FROM `{$table}` WHERE " . implode(' AND ', $conditions) . ' LIMIT 1';
        $statement = db()->prepare($sql);
        $statement->execute($params);
        $row = $statement->fetch();
        if ($row) {
            return $row;
        }
    }

    foreach (fetch_rows($table, $userId, $extraWhere) as $row) {
        if (app_record_id_from_row($table, $row) === $recordId) {
            return $row;
        }
    }

    return null;
}

function resolve_related_record_primary_id(string $table, string $userId, ?string $appRecordId): ?string {
    $appRecordId = $appRecordId === null ? null : trim((string) $appRecordId);
    if ($appRecordId === null || $appRecordId == '') {
        return null;
    }

    $row = find_existing_record_row($table, $userId, $appRecordId);
    if ($row) {
        return record_primary_id_from_row($table, $row);
    }

    foreach (fetch_rows($table, $userId) as $row) {
        if (related_record_matches_identifier($table, $row, $appRecordId)) {
            return record_primary_id_from_row($table, $row);
        }
    }

    return null;
}

function foreign_identifier_value(string $table, string $column, string $relatedTable, string $userId, $appRecordId): ?string {
    if ($appRecordId === null || $appRecordId === '') {
        return null;
    }

    $value = (string) $appRecordId;
    if (!table_has_column($table, $column)) {
        return null;
    }

    if (column_accepts_string_identifier($table, $column)) {
        return $value;
    }

    return resolve_related_record_primary_id($relatedTable, $userId, $value);
}

function first_existing_column(string $table, array $candidates): ?string {
    foreach ($candidates as $candidate) {
        if (table_has_column($table, $candidate)) {
            return $candidate;
        }
    }

    return null;
}

function user_id_column(string $table): ?string {
    return first_existing_column($table, ['user_id', 'userId', 'account_id', 'owner_id']);
}

function updated_at_column(string $table): ?string {
    return first_existing_column($table, ['updated_at', 'updatedAt', 'modified_at', 'modifiedAt']);
}

function created_at_column(string $table): ?string {
    return first_existing_column($table, ['created_at', 'createdAt']);
}

function payload_column(string $table): ?string {
    return first_existing_column($table, ['payload_json', 'payload', 'record_json', 'record_data', 'json_data', 'data', 'metadata']);
}

function delete_record_column(string $table): ?string {
    return first_existing_column($table, ['deleted_at', 'deletedAt']);
}

function id_column(string $table): ?string {
    return first_existing_column($table, ['id', 'uuid']);
}

function column_value(array $row, array $candidates, $default = null) {
    foreach ($candidates as $candidate) {
        if (array_key_exists($candidate, $row) && $row[$candidate] !== null) {
            return $row[$candidate];
        }
    }

    return $default;
}

function decode_json_value($value, $default = []) {
    if (!is_string($value) || $value === '') {
        return $default;
    }

    $decoded = json_decode($value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $default;
}

function iso_datetime(?string $value): ?string {
    if ($value === null || $value === '') {
        return null;
    }

    $timestamp = strtotime($value);
    if ($timestamp === false) {
        return $value;
    }

    return gmdate('c', $timestamp);
}

function now_sql(): string {
    return gmdate('Y-m-d H:i:s');
}

function record_sort_value(array $item): string {
    return (string) ($item['date'] ?? $item['dateStarted'] ?? $item['createdAt'] ?? '');
}

function sorted_records(array $items): array {
    usort($items, function ($a, $b) {
        return strcmp(record_sort_value($b), record_sort_value($a));
    });
    return array_values($items);
}

function collection_data(string $userId, string $collection): array {
    if (!in_array($collection, DB_COLLECTIONS, true)) {
        fail('Invalid collection', 400);
    }

    if (use_database()) {
        try {
            return db_collection_data($userId, $collection);
        } catch (Throwable $exception) {
            if (!app_config('legacy_json_fallback', true)) {
                fail('Failed to load data', 500, $exception);
            }
        }
    }

    return legacy_collection_data($userId, $collection);
}

function save_collection_data(string $userId, string $collection, array $items): void {
    if (!in_array($collection, DB_COLLECTIONS, true)) {
        fail('Invalid collection', 400);
    }

    if (use_database()) {
        try {
            foreach ($items as $item) {
                if (!is_array($item) || empty($item['id'])) {
                    fail('Item with id is required', 422);
                }
                db_upsert_collection_item($userId, $collection, $item);
            }
            return;
        } catch (Throwable $exception) {
            if (!app_config('legacy_json_fallback', true)) {
                fail('Failed to save data', 500, $exception);
            }
        }
    }

    legacy_save_collection_data($userId, $collection, $items);
}

function remove_collection_item(string $userId, string $collection, string $id): void {
    if (use_database()) {
        try {
            db_delete_collection_item($userId, $collection, $id);
            return;
        } catch (Throwable $exception) {
            if (!app_config('legacy_json_fallback', true)) {
                fail('Failed to delete record', 500, $exception);
            }
        }
    }

    $items = legacy_collection_data($userId, $collection);
    $filtered = array_values(array_filter($items, fn($item) => ($item['id'] ?? null) !== $id));
    legacy_save_collection_data($userId, $collection, $filtered);
}

function legacy_collection_data(string $userId, string $collection): array {
    ensure_legacy_user_storage($userId);
    $data = read_json_file(legacy_user_record_path($userId, $collection), []);
    return is_array($data) ? array_values($data) : [];
}

function legacy_save_collection_data(string $userId, string $collection, array $items): void {
    ensure_legacy_user_storage($userId);
    write_json_file(legacy_user_record_path($userId, $collection), array_values($items));
}

function db_collection_data(string $userId, string $collection): array {
    switch ($collection) {
        case 'locations':
            return sorted_records(fetch_coops($userId));
        case 'hens':
            return sorted_records(fetch_birds($userId));
        case 'eggLogs':
            return sorted_records(fetch_egg_logs($userId));
        case 'feedLogs':
            return sorted_records(fetch_feed_logs($userId, 'feed'));
        case 'medicationLogs':
            return sorted_records(fetch_feed_logs($userId, 'medication'));
        case 'saleLogs':
            return sorted_records(fetch_sales($userId));
        case 'chickBatches':
            return sorted_records(fetch_incubation_batches($userId));
        default:
            fail('Invalid collection', 400);
    }
}

function db_upsert_collection_item(string $userId, string $collection, array $item): void {
    switch ($collection) {
        case 'locations':
            upsert_coop($userId, $item);
            return;
        case 'hens':
            upsert_bird($userId, $item);
            return;
        case 'eggLogs':
            upsert_egg_log($userId, $item);
            return;
        case 'feedLogs':
            upsert_feed_log($userId, $item, 'feed');
            return;
        case 'medicationLogs':
            upsert_feed_log($userId, $item, 'medication');
            return;
        case 'saleLogs':
            upsert_sale($userId, $item);
            return;
        case 'chickBatches':
            upsert_incubation_batch($userId, $item);
            return;
        default:
            fail('Invalid collection', 400);
    }
}

function db_delete_collection_item(string $userId, string $collection, string $id): void {
    if ($collection === 'medicationLogs' && !can_store_medication_rows()) {
        throw new RuntimeException('feed_logs table cannot distinguish medication rows');
    }

    $table = COLLECTION_TABLES[$collection] ?? null;
    if (!$table) {
        fail('Invalid collection', 400);
    }

    $extraWhere = null;
    if ($table === 'feed_logs') {
        $extraWhere = feed_log_kind_where_clause($table, $collection === 'medicationLogs' ? 'medication' : 'feed') ?: null;
    }

    $existing = find_existing_record_row($table, $userId, $id, $extraWhere);
    $primaryId = $existing ? record_primary_id_from_row($table, $existing) : null;
    if ($primaryId === null) {
        return;
    }

    $conditions = [];
    $params = [];

    $idColumn = id_column($table) ?? 'id';
    $conditions[] = "`{$idColumn}` = :id";
    $params[':id'] = $primaryId;

    $userIdColumn = user_id_column($table);
    if ($userIdColumn) {
        $conditions[] = "`{$userIdColumn}` = :user_id";
        $params[':user_id'] = $userId;
    }

    if ($extraWhere) {
        $conditions[] = $extraWhere;
    }

    $deletedAtColumn = delete_record_column($table);
    if ($deletedAtColumn) {
        $sql = "UPDATE `{$table}` SET `{$deletedAtColumn}` = :deleted_at WHERE " . implode(' AND ', $conditions);
        $params[':deleted_at'] = now_sql();
    } else {
        $sql = "DELETE FROM `{$table}` WHERE " . implode(' AND ', $conditions);
    }

    $statement = db()->prepare($sql);
    $statement->execute($params);
}

function table_select_sql(string $table, string $userId, ?string $extraWhere = null): array {
    $conditions = [];
    $params = [];

    $deletedAtColumn = delete_record_column($table);
    if ($deletedAtColumn) {
        $conditions[] = "`{$deletedAtColumn}` IS NULL";
    }

    $userIdColumn = user_id_column($table);
    if ($userIdColumn) {
        $conditions[] = "`{$userIdColumn}` = :user_id";
        $params[':user_id'] = $userId;
    }

    if ($extraWhere) {
        $conditions[] = $extraWhere;
    }

    $orderColumns = array_filter([
        first_existing_column($table, ['date', 'logged_at', 'logged_on', 'sale_date', 'date_started', 'created_at']),
        created_at_column($table),
        id_column($table),
    ]);

    $orderBy = [];
    foreach ($orderColumns as $column) {
        $orderBy[] = "`{$column}` DESC";
    }
    if (!$orderBy) {
        $orderBy[] = '1 DESC';
    }

    $sql = "SELECT * FROM `{$table}`";
    if ($conditions) {
        $sql .= ' WHERE ' . implode(' AND ', $conditions);
    }
    $sql .= ' ORDER BY ' . implode(', ', $orderBy);

    return [$sql, $params];
}

function fetch_rows(string $table, string $userId, ?string $extraWhere = null): array {
    [$sql, $params] = table_select_sql($table, $userId, $extraWhere);
    $statement = db()->prepare($sql);
    $statement->execute($params);
    return $statement->fetchAll();
}

function persist_row(string $table, string $recordId, string $userId, array $columnValues, ?string $extraWhere = null): void {
    $columns = schema_columns($table);
    $idColumn = id_column($table) ?? 'id';
    $userIdColumn = user_id_column($table);
    $createdAtColumn = created_at_column($table);
    $updatedAtColumn = updated_at_column($table);
    $existing = find_existing_record_row($table, $userId, $recordId, $extraWhere);
    $existingPrimaryId = $existing ? record_primary_id_from_row($table, $existing) : null;

    $data = [];
    foreach ($columnValues as $column => $value) {
        if (isset($columns[$column])) {
            $data[$column] = normalize_date_column_value($table, $column, $value);
        }
    }

    if (!$existing && !$existingPrimaryId && isset($columns[$idColumn]) && !table_uses_auto_increment_id($table) && column_accepts_string_identifier($table, $idColumn)) {
        $data[$idColumn] = $recordId;
    }
    if (isset($columns['uuid']) && column_accepts_string_identifier($table, 'uuid') && !array_key_exists('uuid', $data)) {
        $data['uuid'] = $recordId;
    }
    if ($userIdColumn) {
        $data[$userIdColumn] = $userId;
    }
    if ($createdAtColumn && !$existing && !array_key_exists($createdAtColumn, $data)) {
        $data[$createdAtColumn] = now_sql();
    }
    if ($updatedAtColumn) {
        $data[$updatedAtColumn] = now_sql();
    }

    if ($existing && $existingPrimaryId !== null) {
        $assignments = [];
        $params = [];
        foreach ($data as $column => $value) {
            if ($column === $idColumn) {
                continue;
            }
            $param = ':set_' . $column;
            $assignments[] = "`{$column}` = {$param}";
            $params[$param] = $value;
        }
        if (!$assignments) {
            return;
        }
        $params[':where_id'] = $existingPrimaryId;
        $where = ["`{$idColumn}` = :where_id"];
        if ($userIdColumn) {
            $where[] = "`{$userIdColumn}` = :where_user_id";
            $params[':where_user_id'] = $userId;
        }
        $sql = "UPDATE `{$table}` SET " . implode(', ', $assignments) . ' WHERE ' . implode(' AND ', $where);
        $statement = db()->prepare($sql);
        $statement->execute($params);
        return;
    }

    $insertColumns = array_keys($data);
    $insertParams = [];
    $placeholders = [];
    foreach ($insertColumns as $column) {
        $param = ':ins_' . $column;
        $insertParams[$param] = $data[$column];
        $placeholders[] = $param;
    }

    $sql = sprintf(
        'INSERT INTO `%s` (%s) VALUES (%s)',
        $table,
        implode(', ', array_map(fn($column) => "`{$column}`", $insertColumns)),
        implode(', ', $placeholders)
    );
    $statement = db()->prepare($sql);
    $statement->execute($insertParams);
}

function feed_log_kind_where_clause(string $table, string $kind): string {
    $typeColumn = first_existing_column($table, ['log_type', 'type', 'entry_type', 'kind', 'record_type', 'category']);
    $medicationNameColumn = first_existing_column($table, ['medication_name', 'medicationName']);
    $dosageColumn = first_existing_column($table, ['dosage']);

    if ($typeColumn) {
        return "`{$typeColumn}` = '" . ($kind === 'medication' ? 'medication' : 'feed') . "'";
    }

    if ($kind === 'medication' && ($medicationNameColumn || $dosageColumn)) {
        $checks = [];
        if ($medicationNameColumn) {
            $checks[] = "(`{$medicationNameColumn}` IS NOT NULL AND `{$medicationNameColumn}` <> '')";
        }
        if ($dosageColumn) {
            $checks[] = "(`{$dosageColumn}` IS NOT NULL AND `{$dosageColumn}` <> '')";
        }
        return '(' . implode(' OR ', $checks) . ')';
    }

    if ($kind === 'feed' && ($medicationNameColumn || $dosageColumn)) {
        $checks = [];
        if ($medicationNameColumn) {
            $checks[] = "(`{$medicationNameColumn}` IS NULL OR `{$medicationNameColumn}` = '')";
        }
        if ($dosageColumn) {
            $checks[] = "(`{$dosageColumn}` IS NULL OR `{$dosageColumn}` = '')";
        }
        return '(' . implode(' AND ', $checks) . ')';
    }

    return '';
}

function fetch_coops(string $userId): array {
    return array_map('map_coop_row_to_record', fetch_rows('coops', $userId));
}

function map_coop_row_to_record(array $row): array {
    $payload = payload_for_table_row('coops', $row);
    return [
        'id' => (string) ($payload['id'] ?? column_value($row, ['uuid', 'id'], '')),
        'name' => (string) column_value($row, ['name', 'coop_name', 'title'], $payload['name'] ?? ''),
        'type' => (string) column_value($row, ['type', 'coop_type'], $payload['type'] ?? 'Other'),
        'photoUrl' => column_value($row, ['photo_url', 'photoUrl', 'image_url', 'imageUrl'], $payload['photoUrl'] ?? null),
    ];
}

function upsert_coop(string $userId, array $item): void {
    persist_row('coops', (string) $item['id'], $userId, array_filter([
        'name' => $item['name'] ?? null,
        'coop_name' => $item['name'] ?? null,
        'type' => $item['type'] ?? null,
        'coop_type' => $item['type'] ?? null,
        'photo_url' => $item['photoUrl'] ?? null,
        'photoUrl' => $item['photoUrl'] ?? null,
        'image_url' => $item['photoUrl'] ?? null,
        'imageUrl' => $item['photoUrl'] ?? null,
        payload_column('coops') ?: '__skip_payload' => json_encode($item, JSON_UNESCAPED_SLASHES),
    ], fn($value, $key) => $key !== '__skip_payload' && $value !== null, ARRAY_FILTER_USE_BOTH));
}

function fetch_birds(string $userId): array {
    return array_map('map_bird_row_to_record', fetch_rows('birds', $userId));
}

function map_bird_row_to_record(array $row): array {
    $payload = payload_for_table_row('birds', $row);
    return [
        'id' => (string) ($payload['id'] ?? column_value($row, ['uuid', 'id'], '')),
        'name' => (string) column_value($row, ['name'], $payload['name'] ?? ''),
        'breed' => column_value($row, ['breed'], $payload['breed'] ?? null),
        'locationId' => (string) ($payload['locationId'] ?? related_record_app_id_from_foreign_value('coops', (string) column_value($row, ['user_id', 'userId', 'account_id', 'owner_id'], ''), column_value($row, ['coop_id', 'location_id', 'locationId'], ''))),
        'status' => (string) column_value($row, ['status', 'appearance'], $payload['status'] ?? 'Healthy'),
        'photoUrl' => column_value($row, ['photo_url', 'photoUrl', 'image_url', 'imageUrl'], $payload['photoUrl'] ?? null),
        'notes' => column_value($row, ['notes'], $payload['notes'] ?? null),
    ];
}

function upsert_bird(string $userId, array $item): void {
    persist_row('birds', (string) $item['id'], $userId, array_filter([
        'name' => $item['name'] ?? null,
        'breed' => $item['breed'] ?? null,
        'coop_id' => foreign_identifier_value('birds', 'coop_id', 'coops', $userId, $item['locationId'] ?? null),
        'location_id' => foreign_identifier_value('birds', 'location_id', 'coops', $userId, $item['locationId'] ?? null),
        'locationId' => foreign_identifier_value('birds', 'locationId', 'coops', $userId, $item['locationId'] ?? null),
        'status' => $item['status'] ?? null,
        'appearance' => $item['status'] ?? null,
        'photo_url' => $item['photoUrl'] ?? null,
        'photoUrl' => $item['photoUrl'] ?? null,
        'image_url' => $item['photoUrl'] ?? null,
        'imageUrl' => $item['photoUrl'] ?? null,
        'notes' => $item['notes'] ?? null,
        payload_column('birds') ?: '__skip_payload' => json_encode($item, JSON_UNESCAPED_SLASHES),
    ], fn($value, $key) => $key !== '__skip_payload' && $value !== null, ARRAY_FILTER_USE_BOTH));
}

function fetch_egg_logs(string $userId): array {
    return array_map('map_egg_log_row_to_record', fetch_rows('egg_logs', $userId));
}

function map_egg_log_row_to_record(array $row): array {
    $payload = payload_for_table_row('egg_logs', $row);
    return [
        'id' => (string) ($payload['id'] ?? column_value($row, ['uuid', 'id'], '')),
        'date' => iso_datetime((string) column_value($row, ['date', 'log_date', 'logged_at', 'logged_on'], $payload['date'] ?? '')),
        'count' => (int) column_value($row, ['count', 'egg_count', 'quantity'], $payload['count'] ?? 0),
        'locationId' => (string) ($payload['locationId'] ?? related_record_app_id_from_foreign_value('coops', (string) column_value($row, ['user_id', 'userId', 'account_id', 'owner_id'], ''), column_value($row, ['coop_id', 'location_id', 'locationId'], ''))),
        'notes' => column_value($row, ['notes'], $payload['notes'] ?? null),
        'mode' => column_value($row, ['mode'], $payload['mode'] ?? null),
        'coopTemperature' => column_value($row, ['coop_temperature', 'temperature', 'coopTemperature'], $payload['coopTemperature'] ?? null),
    ];
}

function upsert_egg_log(string $userId, array $item): void {
    persist_row('egg_logs', (string) $item['id'], $userId, array_filter([
        'date' => $item['date'] ?? null,
        'log_date' => $item['date'] ?? null,
        'logged_at' => $item['date'] ?? null,
        'logged_on' => $item['date'] ?? null,
        'count' => $item['count'] ?? null,
        'egg_count' => $item['count'] ?? null,
        'quantity' => $item['count'] ?? null,
        'coop_id' => foreign_identifier_value('egg_logs', 'coop_id', 'coops', $userId, $item['locationId'] ?? null),
        'location_id' => foreign_identifier_value('egg_logs', 'location_id', 'coops', $userId, $item['locationId'] ?? null),
        'locationId' => foreign_identifier_value('egg_logs', 'locationId', 'coops', $userId, $item['locationId'] ?? null),
        'notes' => $item['notes'] ?? null,
        'mode' => $item['mode'] ?? null,
        'coop_temperature' => $item['coopTemperature'] ?? null,
        'temperature' => $item['coopTemperature'] ?? null,
        'coopTemperature' => $item['coopTemperature'] ?? null,
        payload_column('egg_logs') ?: '__skip_payload' => json_encode($item, JSON_UNESCAPED_SLASHES),
    ], fn($value, $key) => $key !== '__skip_payload' && $value !== null, ARRAY_FILTER_USE_BOTH));
}

function can_store_medication_rows(): bool {
    return first_existing_column('feed_logs', ['log_type', 'type', 'entry_type', 'kind', 'record_type', 'category']) !== null
        || first_existing_column('feed_logs', ['medication_name', 'medicationName']) !== null
        || first_existing_column('feed_logs', ['dosage']) !== null;
}

function fetch_feed_logs(string $userId, string $kind): array {
    if ($kind === 'medication' && !can_store_medication_rows()) {
        throw new RuntimeException('feed_logs table cannot distinguish medication rows');
    }

    $extraWhere = feed_log_kind_where_clause('feed_logs', $kind);
    return array_map(
        fn($row) => map_feed_log_row_to_record($row, $kind),
        fetch_rows('feed_logs', $userId, $extraWhere ?: null)
    );
}

function map_feed_log_row_to_record(array $row, string $kind): array {
    $payload = payload_for_table_row('feed_logs', $row);
    if ($kind === 'medication') {
        return [
            'id' => (string) ($payload['id'] ?? column_value($row, ['uuid', 'id'], '')),
            'date' => iso_datetime((string) column_value($row, ['date', 'log_date', 'feed_date', 'logged_at', 'logged_on'], $payload['date'] ?? '')),
            'henId' => $payload['henId'] ?? related_record_app_id_from_foreign_value('birds', (string) column_value($row, ['user_id', 'userId', 'account_id', 'owner_id'], ''), column_value($row, ['bird_id', 'hen_id', 'henId'], null)),
            'locationId' => (string) ($payload['locationId'] ?? related_record_app_id_from_foreign_value('coops', (string) column_value($row, ['user_id', 'userId', 'account_id', 'owner_id'], ''), column_value($row, ['coop_id', 'location_id', 'locationId'], ''))),
            'medicationName' => (string) column_value($row, ['medication_name', 'medicationName', 'name'], $payload['medicationName'] ?? ''),
            'dosage' => (string) column_value($row, ['dosage'], $payload['dosage'] ?? ''),
            'notes' => column_value($row, ['notes'], $payload['notes'] ?? null),
        ];
    }

    return [
        'id' => (string) ($payload['id'] ?? column_value($row, ['uuid', 'id'], '')),
        'date' => iso_datetime((string) column_value($row, ['date', 'log_date', 'feed_date', 'logged_at', 'logged_on'], $payload['date'] ?? '')),
        'amount' => (int) column_value($row, ['amount', 'quantity'], $payload['amount'] ?? 0),
        'cost' => column_value($row, ['cost', 'price'], $payload['cost'] ?? null),
        'weight' => column_value($row, ['weight'], $payload['weight'] ?? null),
        'feedType' => column_value($row, ['feed_type', 'feedType', 'type'], $payload['feedType'] ?? null),
        'locationId' => (string) ($payload['locationId'] ?? related_record_app_id_from_foreign_value('coops', (string) column_value($row, ['user_id', 'userId', 'account_id', 'owner_id'], ''), column_value($row, ['coop_id', 'location_id', 'locationId'], ''))),
        'notes' => column_value($row, ['notes'], $payload['notes'] ?? null),
    ];
}

function upsert_feed_log(string $userId, array $item, string $kind): void {
    if ($kind === 'medication' && !can_store_medication_rows()) {
        throw new RuntimeException('feed_logs table cannot store medication rows safely');
    }

    $typeColumn = first_existing_column('feed_logs', ['log_type', 'type', 'entry_type', 'kind', 'record_type', 'category']);
    $values = [
        'date' => $item['date'] ?? null,
        'log_date' => $item['date'] ?? null,
        'logged_at' => $item['date'] ?? null,
        'logged_on' => $item['date'] ?? null,
        'feed_date' => $item['date'] ?? null,
        'coop_id' => foreign_identifier_value('feed_logs', 'coop_id', 'coops', $userId, $item['locationId'] ?? null),
        'location_id' => foreign_identifier_value('feed_logs', 'location_id', 'coops', $userId, $item['locationId'] ?? null),
        'locationId' => foreign_identifier_value('feed_logs', 'locationId', 'coops', $userId, $item['locationId'] ?? null),
        'notes' => $item['notes'] ?? null,
        payload_column('feed_logs') ?: '__skip_payload' => json_encode($item, JSON_UNESCAPED_SLASHES),
    ];

    if ($kind === 'medication') {
        $values += [
            'bird_id' => foreign_identifier_value('feed_logs', 'bird_id', 'birds', $userId, $item['henId'] ?? null),
            'hen_id' => foreign_identifier_value('feed_logs', 'hen_id', 'birds', $userId, $item['henId'] ?? null),
            'henId' => foreign_identifier_value('feed_logs', 'henId', 'birds', $userId, $item['henId'] ?? null),
            'medication_name' => $item['medicationName'] ?? null,
            'medicationName' => $item['medicationName'] ?? null,
            'dosage' => $item['dosage'] ?? null,
            'amount' => null,
            'quantity' => null,
            'cost' => null,
            'price' => null,
            'weight' => null,
            'feed_type' => null,
            'feedType' => null,
        ];
        if ($typeColumn) {
            $values[$typeColumn] = 'medication';
        }
    } else {
        $values += [
            'amount' => $item['amount'] ?? null,
            'quantity' => $item['amount'] ?? null,
            'cost' => $item['cost'] ?? null,
            'price' => $item['cost'] ?? null,
            'weight' => $item['weight'] ?? null,
            'feed_type' => $item['feedType'] ?? null,
            'feedType' => $item['feedType'] ?? null,
            'medication_name' => null,
            'medicationName' => null,
            'dosage' => null,
        ];
        if ($typeColumn) {
            $values[$typeColumn] = 'feed';
        }
    }

    persist_row('feed_logs', (string) $item['id'], $userId, array_filter($values, fn($value, $key) => $key !== '__skip_payload' || $value !== null, ARRAY_FILTER_USE_BOTH));
}

function fetch_sales(string $userId): array {
    return array_map('map_sale_row_to_record', fetch_rows('sales', $userId));
}

function map_sale_row_to_record(array $row): array {
    $payload = payload_for_table_row('sales', $row);
    return [
        'id' => (string) ($payload['id'] ?? column_value($row, ['uuid', 'id'], '')),
        'date' => iso_datetime((string) column_value($row, ['date', 'sale_date', 'sold_at', 'logged_at', 'log_date'], $payload['date'] ?? '')),
        'quantity' => (int) column_value($row, ['quantity', 'count'], $payload['quantity'] ?? 0),
        'price' => (float) column_value($row, ['price', 'amount', 'total'], $payload['price'] ?? 0),
        'itemType' => column_value($row, ['item_type', 'itemType', 'type'], $payload['itemType'] ?? null),
        'notes' => column_value($row, ['notes'], $payload['notes'] ?? null),
    ];
}

function upsert_sale(string $userId, array $item): void {
    persist_row('sales', (string) $item['id'], $userId, array_filter([
        'date' => $item['date'] ?? null,
        'sale_date' => $item['date'] ?? null,
        'sold_at' => $item['date'] ?? null,
        'logged_at' => $item['date'] ?? null,
        'log_date' => $item['date'] ?? null,
        'quantity' => $item['quantity'] ?? null,
        'count' => $item['quantity'] ?? null,
        'price' => $item['price'] ?? null,
        'amount' => $item['price'] ?? null,
        'total' => $item['price'] ?? null,
        'item_type' => $item['itemType'] ?? null,
        'itemType' => $item['itemType'] ?? null,
        'type' => $item['itemType'] ?? null,
        'notes' => $item['notes'] ?? null,
        payload_column('sales') ?: '__skip_payload' => json_encode($item, JSON_UNESCAPED_SLASHES),
    ], fn($value, $key) => $key !== '__skip_payload' && $value !== null, ARRAY_FILTER_USE_BOTH));
}

function fetch_incubation_batches(string $userId): array {
    return array_map('map_incubation_row_to_record', fetch_rows('incubation_batches', $userId));
}

function map_incubation_row_to_record(array $row): array {
    $payload = payload_for_table_row('incubation_batches', $row);
    $chicksValue = column_value($row, ['chicks_json', 'chicks'], $payload['chicks'] ?? []);
    $chicks = is_array($chicksValue) ? $chicksValue : decode_json_value($chicksValue, []);

    return [
        'id' => (string) ($payload['id'] ?? column_value($row, ['uuid', 'id'], '')),
        'dateStarted' => iso_datetime((string) column_value($row, ['start_date', 'date_started', 'dateStarted', 'started_at'], $payload['dateStarted'] ?? '')),
        'expectedHatchDate' => iso_datetime((string) column_value($row, ['anticipated_hatch_date', 'expected_hatch_date', 'expectedHatchDate'], $payload['expectedHatchDate'] ?? '')),
        'hatchDate' => iso_datetime(column_value($row, ['hatch_date', 'hatchDate'], $payload['hatchDate'] ?? null)),
        'count' => (int) column_value($row, ['count', 'egg_count', 'quantity'], $payload['count'] ?? 0),
        'status' => (string) column_value($row, ['status'], $payload['status'] ?? 'Incubating'),
        'locationId' => (string) ($payload['locationId'] ?? related_record_app_id_from_foreign_value('coops', (string) column_value($row, ['user_id', 'userId', 'account_id', 'owner_id'], ''), column_value($row, ['coop_id', 'location_id', 'locationId'], ''))),
        'notes' => column_value($row, ['notes'], $payload['notes'] ?? null),
        'hatchedCount' => column_value($row, ['hatched_count', 'hatchedCount'], $payload['hatchedCount'] ?? null),
        'perishedCount' => column_value($row, ['perished_count', 'perishedCount'], $payload['perishedCount'] ?? null),
        'chicks' => $chicks,
        'photoUrl' => column_value($row, ['photo_url', 'photoUrl', 'image_url', 'imageUrl'], $payload['photoUrl'] ?? null),
    ];
}

function upsert_incubation_batch(string $userId, array $item): void {
    persist_row('incubation_batches', (string) $item['id'], $userId, array_filter([
        'start_date' => $item['dateStarted'] ?? null,
        'date_started' => $item['dateStarted'] ?? null,
        'dateStarted' => $item['dateStarted'] ?? null,
        'started_at' => $item['dateStarted'] ?? null,
        'anticipated_hatch_date' => $item['expectedHatchDate'] ?? null,
        'expected_hatch_date' => $item['expectedHatchDate'] ?? null,
        'expectedHatchDate' => $item['expectedHatchDate'] ?? null,
        'hatch_date' => $item['hatchDate'] ?? null,
        'hatchDate' => $item['hatchDate'] ?? null,
        'count' => $item['count'] ?? null,
        'egg_count' => $item['count'] ?? null,
        'quantity' => $item['count'] ?? null,
        'status' => $item['status'] ?? null,
        'coop_id' => foreign_identifier_value('incubation_batches', 'coop_id', 'coops', $userId, $item['locationId'] ?? null),
        'location_id' => foreign_identifier_value('incubation_batches', 'location_id', 'coops', $userId, $item['locationId'] ?? null),
        'locationId' => foreign_identifier_value('incubation_batches', 'locationId', 'coops', $userId, $item['locationId'] ?? null),
        'notes' => $item['notes'] ?? null,
        'hatched_count' => $item['hatchedCount'] ?? null,
        'hatchedCount' => $item['hatchedCount'] ?? null,
        'perished_count' => $item['perishedCount'] ?? null,
        'perishedCount' => $item['perishedCount'] ?? null,
        'chicks_json' => isset($item['chicks']) ? json_encode($item['chicks'], JSON_UNESCAPED_SLASHES) : null,
        'chicks' => isset($item['chicks']) ? json_encode($item['chicks'], JSON_UNESCAPED_SLASHES) : null,
        'photo_url' => $item['photoUrl'] ?? null,
        'photoUrl' => $item['photoUrl'] ?? null,
        'image_url' => $item['photoUrl'] ?? null,
        'imageUrl' => $item['photoUrl'] ?? null,
        payload_column('incubation_batches') ?: '__skip_payload' => json_encode($item, JSON_UNESCAPED_SLASHES),
    ], fn($value, $key) => $key !== '__skip_payload' && $value !== null, ARRAY_FILTER_USE_BOTH));
}

function db_find_user_by_email(string $email): ?array {
    $table = 'users';
    $emailColumn = first_existing_column($table, ['email']);
    if (!$emailColumn) {
        fail('Users table is missing an email column');
    }

    $deletedAtColumn = delete_record_column($table);
    $conditions = ["`{$emailColumn}` = :email"];
    if ($deletedAtColumn) {
        $conditions[] = "`{$deletedAtColumn}` IS NULL";
    }

    $sql = "SELECT * FROM `{$table}` WHERE " . implode(' AND ', $conditions) . ' LIMIT 1';
    $statement = db()->prepare($sql);
    $statement->execute([':email' => $email]);
    $row = $statement->fetch();
    return $row ?: null;
}

function db_find_user_by_id(string $id): ?array {
    $table = 'users';
    $idColumn = id_column($table) ?? 'id';
    $conditions = ["`{$idColumn}` = :id"];
    $deletedAtColumn = delete_record_column($table);
    if ($deletedAtColumn) {
        $conditions[] = "`{$deletedAtColumn}` IS NULL";
    }

    $sql = "SELECT * FROM `{$table}` WHERE " . implode(' AND ', $conditions) . ' LIMIT 1';
    $statement = db()->prepare($sql);
    $statement->execute([':id' => $id]);
    $row = $statement->fetch();
    return $row ?: null;
}

function password_hash_column(): ?string {
    return first_existing_column('users', ['password_hash', 'passwordHash', 'password']);
}

function nickname_column(): ?string {
    return first_existing_column('users', ['nickname', 'name', 'display_name', 'displayName']);
}

function map_user_row(array $row): array {
    return [
        'id' => (string) column_value($row, ['id', 'uuid'], ''),
        'email' => (string) column_value($row, ['email'], ''),
        'nickname' => column_value($row, ['nickname', 'name', 'display_name', 'displayName'], null),
        'passwordHash' => column_value($row, ['password_hash', 'passwordHash', 'password'], ''),
        'createdAt' => iso_datetime(column_value($row, ['created_at', 'createdAt'], null)),
    ];
}

function create_db_user(string $email, string $password, string $nickname): array {
    $table = 'users';
    $values = [];

    $idColumn = id_column($table) ?? 'id';
    $isAutoIncrementId = table_uses_auto_increment_id($table);

    $userId = $isAutoIncrementId ? null : bin2hex(random_bytes(16));
    if (!$isAutoIncrementId && $idColumn) {
        $values[$idColumn] = $userId;
    }

    $emailColumn = first_existing_column($table, ['email']) ?? 'email';
    $values[$emailColumn] = $email;
    $passwordColumn = password_hash_column() ?? 'password_hash';
    $values[$passwordColumn] = password_hash($password, PASSWORD_DEFAULT);

    $nicknameColumn = nickname_column();
    if ($nicknameColumn) {
        $values[$nicknameColumn] = $nickname;
    }

    $createdAtColumn = created_at_column($table);
    if ($createdAtColumn) {
        $values[$createdAtColumn] = now_sql();
    }
    $updatedAtColumn = updated_at_column($table);
    if ($updatedAtColumn) {
        $values[$updatedAtColumn] = now_sql();
    }

    $columns = array_keys($values);
    $params = [];
    $placeholders = [];
    foreach ($columns as $column) {
        $param = ':'.$column;
        $placeholders[] = $param;
        $params[$param] = $values[$column];
    }

    $sql = sprintf(
        'INSERT INTO `%s` (%s) VALUES (%s)',
        $table,
        implode(', ', array_map(fn($column) => "`{$column}`", $columns)),
        implode(', ', $placeholders)
    );

    $statement = db()->prepare($sql);
    $statement->execute($params);

    if ($userId === null) {
        $userId = (string) db()->lastInsertId();
        $row = $userId !== '' ? db_find_user_by_id($userId) : null;
        if ($row) {
            return map_user_row($row);
        }
    }

    return [
        'id' => (string) $userId,
        'email' => $email,
        'nickname' => $nickname,
        'passwordHash' => $values[$passwordColumn],
        'createdAt' => iso_datetime($values[$createdAtColumn] ?? now_sql()),
    ];
}

function current_user(): ?array {
    $userId = $_SESSION['user_id'] ?? null;
    if (!$userId) {
        return null;
    }

    if (use_database()) {
        try {
            $row = db_find_user_by_id($userId);
            return $row ? map_user_row($row) : null;
        } catch (Throwable $exception) {
            if (!app_config('legacy_json_fallback', true)) {
                fail('Failed to load current user', 500, $exception);
            }
        }
    }

    foreach (legacy_all_users() as $user) {
        if (($user['id'] ?? null) === $userId) {
            ensure_legacy_user_storage($userId);
            return $user;
        }
    }

    return null;
}

function require_auth(): array {
    $user = current_user();
    if (!$user) {
        respond(['error' => 'Authentication required'], 401);
    }
    return $user;
}

ensure_legacy_storage();
