<?php
require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['error' => 'Method not allowed'], 405);
}

$input = json_input();
$email = normalize_email($input['email'] ?? '');
$password = (string)($input['password'] ?? '');

foreach (all_users() as $user) {
    if (($user['email'] ?? '') === $email && password_verify($password, $user['passwordHash'] ?? '')) {
        $_SESSION['user_id'] = $user['id'];
        ensure_user_storage($user['id']);
        respond(['user' => public_user($user)]);
    }
}

respond(['error' => 'Invalid email or password'], 401);
