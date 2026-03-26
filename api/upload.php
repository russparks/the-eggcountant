<?php
require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['error' => 'Method not allowed'], 405);
}

$user = require_auth();

if (!isset($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'])) {
    respond(['error' => 'No file uploaded'], 422);
}

$file = $_FILES['file'];
if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
    respond(['error' => 'Upload failed'], 400);
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($file['tmp_name']) ?: '';
$allowed = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
    'image/gif' => 'gif',
];
if (!isset($allowed[$mime])) {
    respond(['error' => 'Unsupported image type'], 422);
}

$uploadRoot = dirname(__DIR__) . '/uploads';
$userDir = $uploadRoot . '/' . preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $user['id']);
if (!is_dir($userDir)) {
    mkdir($userDir, 0775, true);
}

$filename = bin2hex(random_bytes(8)) . '.' . $allowed[$mime];
$target = $userDir . '/' . $filename;
if (!move_uploaded_file($file['tmp_name'], $target)) {
    respond(['error' => 'Failed to store upload'], 500);
}

@chmod($target, 0644);
respond(['url' => './uploads/' . rawurlencode((string) $user['id']) . '/' . rawurlencode($filename)]);
