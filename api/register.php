<?php
require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['error' => 'Method not allowed'], 405);
}

$input = json_input();
$email = normalize_email($input['email'] ?? '');
$password = (string) ($input['password'] ?? '');
$nickname = trim((string) ($input['nickname'] ?? ''));

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(['error' => 'Please enter a valid email address'], 422);
}

if (strlen($password) < 8) {
    respond(['error' => 'Password must be at least 8 characters'], 422);
}

if ($nickname === '') {
    respond(['error' => 'Nickname is required'], 422);
}

if (use_database()) {
    try {
        if (db_find_user_by_email($email)) {
            respond(['error' => 'That email is already registered'], 409);
        }

        $user = create_db_user($email, $password, $nickname);
        $_SESSION['user_id'] = $user['id'];
        respond(['user' => public_user($user)]);
    } catch (Throwable $exception) {
        if (!app_config('legacy_json_fallback', true)) {
            fail('Registration failed', 500, $exception);
        }
    }
}

$users = legacy_all_users();
foreach ($users as $user) {
    if (($user['email'] ?? '') === $email) {
        respond(['error' => 'That email is already registered'], 409);
    }
}

$user = [
    'id' => bin2hex(random_bytes(16)),
    'email' => $email,
    'nickname' => $nickname,
    'passwordHash' => password_hash($password, PASSWORD_DEFAULT),
    'createdAt' => gmdate('c'),
];

$users[] = $user;
legacy_save_users($users);
ensure_legacy_user_storage($user['id']);
$_SESSION['user_id'] = $user['id'];

respond(['user' => public_user($user)]);
