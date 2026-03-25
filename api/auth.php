<?php
/**
 * Auth endpoint: register, login, logout, me
 * Usage:
 *   POST api/auth.php?action=register   { "email": "...", "password": "..." }
 *   POST api/auth.php?action=login      { "email": "...", "password": "..." }
 *   POST api/auth.php?action=logout
 *   GET  api/auth.php?action=me
 */

session_start();
header('Content-Type: application/json; charset=utf-8');

// CORS for local dev (Vite proxy removes this header in prod anyway)
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('DATA_DIR', dirname(__DIR__) . '/data');
define('USERS_FILE', DATA_DIR . '/users.json');

// Ensure data directory exists
if (!is_dir(DATA_DIR)) {
    mkdir(DATA_DIR, 0755, true);
}

function load_users(): array {
    if (!file_exists(USERS_FILE)) return [];
    $raw = @file_get_contents(USERS_FILE);
    return $raw ? (json_decode($raw, true) ?? []) : [];
}

function save_users(array $users): void {
    file_put_contents(USERS_FILE, json_encode($users, JSON_PRETTY_PRINT), LOCK_EX);
}

function json_error(int $code, string $msg): void {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
    exit;
}

$action = $_GET['action'] ?? '';
$body   = json_decode(file_get_contents('php://input'), true) ?? [];

switch ($action) {

    // ── REGISTER ──────────────────────────────────────────────────────────
    case 'register': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error(405, 'Method not allowed');

        $email    = trim($body['email'] ?? '');
        $password = $body['password'] ?? '';

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error(400, 'Invalid email address.');
        if (strlen($password) < 6)                       json_error(400, 'Password must be at least 6 characters.');

        $users = load_users();
        foreach ($users as $u) {
            if (strtolower($u['email']) === strtolower($email)) {
                json_error(409, 'An account with that email already exists.');
            }
        }

        $id = bin2hex(random_bytes(16));
        $users[] = [
            'id'            => $id,
            'email'         => $email,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'created_at'    => date('c'),
        ];
        save_users($users);

        $_SESSION['user_id'] = $id;
        $_SESSION['email']   = $email;

        echo json_encode(['id' => $id, 'email' => $email]);
        break;
    }

    // ── LOGIN ─────────────────────────────────────────────────────────────
    case 'login': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error(405, 'Method not allowed');

        $email    = strtolower(trim($body['email'] ?? ''));
        $password = $body['password'] ?? '';

        $users = load_users();
        $found = null;
        foreach ($users as $u) {
            if (strtolower($u['email']) === $email) { $found = $u; break; }
        }

        if (!$found || !password_verify($password, $found['password_hash'])) {
            json_error(401, 'Invalid email or password.');
        }

        session_regenerate_id(true);
        $_SESSION['user_id'] = $found['id'];
        $_SESSION['email']   = $found['email'];

        echo json_encode(['id' => $found['id'], 'email' => $found['email']]);
        break;
    }

    // ── LOGOUT ────────────────────────────────────────────────────────────
    case 'logout': {
        session_destroy();
        echo json_encode(['ok' => true]);
        break;
    }

    // ── ME ────────────────────────────────────────────────────────────────
    case 'me': {
        if (empty($_SESSION['user_id'])) {
            json_error(401, 'Not authenticated');
        }
        echo json_encode(['id' => $_SESSION['user_id'], 'email' => $_SESSION['email']]);
        break;
    }

    default:
        json_error(400, 'Unknown action. Use: register, login, logout, me');
}
