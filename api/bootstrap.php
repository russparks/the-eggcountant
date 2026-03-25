<?php
session_start();

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: ' . get_allowed_origin());
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    exit;
}

header('Access-Control-Allow-Origin: ' . get_allowed_origin());

const DATA_ROOT = __DIR__ . '/../data';
const USERS_ROOT = DATA_ROOT . '/users';
const USERS_FILE = USERS_ROOT . '/users.json';
const COLLECTIONS = ['locations', 'eggLogs', 'hens', 'feedLogs', 'medicationLogs', 'saleLogs', 'chickBatches'];

function get_allowed_origin(): string {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (!$origin) {
        return '*';
    }

    $allowed = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
    ];

    if (in_array($origin, $allowed, true)) {
        return $origin;
    }

    return $origin;
}

function json_input(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
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

function ensure_storage(): void {
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
        respond(['error' => 'Unable to write storage file'], 500);
    }

    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        respond(['error' => 'Unable to lock storage file'], 500);
    }

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

function user_record_path(string $userId, string $collection): string {
    if (!in_array($collection, COLLECTIONS, true)) {
        respond(['error' => 'Invalid collection'], 400);
    }
    return USERS_ROOT . '/' . $userId . '/' . $collection . '.json';
}

function ensure_user_storage(string $userId): void {
    $userDir = USERS_ROOT . '/' . $userId;
    if (!is_dir($userDir)) mkdir($userDir, 0775, true);

    foreach (COLLECTIONS as $collection) {
        $path = user_record_path($userId, $collection);
        if (!file_exists($path)) {
            $seed = $collection === 'locations' ? default_locations() : [];
            write_json_file($path, $seed);
        }
    }
}

function default_locations(): array {
    return [
        ['id' => 'loc-1', 'name' => 'Cluckingham Palace', 'type' => 'Garden'],
        ['id' => 'loc-2', 'name' => 'The Yolk Yard', 'type' => 'Allotment'],
    ];
}

function all_users(): array {
    ensure_storage();
    $users = read_json_file(USERS_FILE, []);
    return is_array($users) ? $users : [];
}

function save_users(array $users): void {
    write_json_file(USERS_FILE, array_values($users));
}

function normalize_email(string $email): string {
    return strtolower(trim($email));
}

function public_user(array $user): array {
    return [
        'id' => $user['id'],
        'email' => $user['email'],
        'createdAt' => $user['createdAt'] ?? null,
    ];
}

function current_user(): ?array {
    $userId = $_SESSION['user_id'] ?? null;
    if (!$userId) return null;

    foreach (all_users() as $user) {
        if (($user['id'] ?? null) === $userId) {
            ensure_user_storage($userId);
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

function collection_data(string $userId, string $collection): array {
    ensure_user_storage($userId);
    $data = read_json_file(user_record_path($userId, $collection), []);
    return is_array($data) ? array_values($data) : [];
}

function save_collection_data(string $userId, string $collection, array $items): void {
    ensure_user_storage($userId);
    write_json_file(user_record_path($userId, $collection), array_values($items));
}

ensure_storage();
