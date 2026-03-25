<?php
require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['error' => 'Method not allowed'], 405);
}

$input = json_input();
$email = normalize_email($input['email'] ?? '');
$password = (string) ($input['password'] ?? '');

if ($email === '' || $password === '') {
    respond(['error' => 'Email and password are required'], 422);
}

if (use_database()) {
    try {
        $row = db_find_user_by_email($email);
        if ($row) {
            $user = map_user_row($row);
            if (password_verify($password, $user['passwordHash'] ?? '')) {
                $_SESSION['user_id'] = $user['id'];
                respond(['user' => public_user($user)]);
            }
        }
    } catch (Throwable $exception) {
        if (!app_config('legacy_json_fallback', true)) {
            fail('Login failed', 500, $exception);
        }
    }
}

foreach (legacy_all_users() as $user) {
    if (($user['email'] ?? '') === $email && password_verify($password, $user['passwordHash'] ?? '')) {
        $_SESSION['user_id'] = $user['id'];
        ensure_legacy_user_storage($user['id']);
        respond(['user' => public_user($user)]);
    }
}

respond(['error' => 'Invalid email or password'], 401);
