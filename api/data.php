<?php
require __DIR__ . '/bootstrap.php';

$user = require_auth();
$collection = $_GET['collection'] ?? '';
$id = $_GET['id'] ?? null;

if (!in_array($collection, COLLECTIONS, true)) {
    respond(['error' => 'Invalid collection'], 400);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $items = collection_data($user['id'], $collection);
    if ($id) {
        foreach ($items as $item) {
            if (($item['id'] ?? null) === $id) {
                respond(['item' => $item]);
            }
        }
        respond(['error' => 'Record not found'], 404);
    }

    usort($items, function ($a, $b) {
        $aDate = $a['date'] ?? $a['dateStarted'] ?? '';
        $bDate = $b['date'] ?? $b['dateStarted'] ?? '';
        return strcmp($bDate, $aDate);
    });
    respond(['items' => $items]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_input();
    $item = $input['item'] ?? null;
    if (!is_array($item) || empty($item['id'])) {
        respond(['error' => 'Item with id is required'], 422);
    }

    $items = collection_data($user['id'], $collection);
    $replaced = false;
    foreach ($items as $index => $existing) {
        if (($existing['id'] ?? null) === $item['id']) {
            $items[$index] = $item;
            $replaced = true;
            break;
        }
    }
    if (!$replaced) {
        $items[] = $item;
    }

    save_collection_data($user['id'], $collection, $items);
    respond(['item' => $item]);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    if (!$id) {
        respond(['error' => 'id is required'], 422);
    }

    $items = collection_data($user['id'], $collection);
    $filtered = array_values(array_filter($items, fn($item) => ($item['id'] ?? null) !== $id));
    save_collection_data($user['id'], $collection, $filtered);
    respond(['ok' => true]);
}

respond(['error' => 'Method not allowed'], 405);
