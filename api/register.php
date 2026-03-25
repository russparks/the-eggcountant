<?php
require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['error' => 'Method not allowed'], 405);
}

$input = json_input();
$email = normalize_email($input['email'] ?? '');
$password = (string)($input['password'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(['error' => 'Please enter a valid email address'], 422);
}

if (strlen($password) < 8) {
    respond(['error' => 'Password must be at least 8 characters'], 422);
}

$users = all_users();
foreach ($users as $user) {
    if (($user['email'] ?? '') === $email) {
        respond(['error' => 'That email is already registered'], 409);
    }
}

$user = [
    'id' => bin2hex(random_bytes(16)),
    'email' => $email,
    'passwordHash' => password_hash($password, PASSWORD_DEFAULT),
    'createdAt' => gmdate('c'),
];

$users[] = $user;
save_users($users);
ensure_user_storage($user['id']);
$_SESSION['user_id'] = $user['id'];

respond(['user' => public_user($user)]);
