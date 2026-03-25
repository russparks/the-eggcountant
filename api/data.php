<?php
require __DIR__ . '/bootstrap.php';

$user = require_auth();
$collection = $_GET['collection'] ?? '';
$id = $_GET['id'] ?? null;

if (!in_array($collection, DB_COLLECTIONS, true)) {
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

    respond(['items' => sorted_records($items)]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_input();
    $item = $input['item'] ?? null;
    if (!is_array($item) || empty($item['id'])) {
        respond(['error' => 'Item with id is required'], 422);
    }

    if (use_database()) {
        try {
            db_upsert_collection_item($user['id'], $collection, $item);
            respond(['item' => $item]);
        } catch (Throwable $exception) {
            if (!app_config('legacy_json_fallback', true)) {
                fail('Failed to save record', 500, $exception);
            }
        }
    }

    $items = legacy_collection_data($user['id'], $collection);
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
    legacy_save_collection_data($user['id'], $collection, $items);

    respond(['item' => $item]);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    if (!$id) {
        respond(['error' => 'id is required'], 422);
    }

    remove_collection_item($user['id'], $collection, $id);
    respond(['ok' => true]);
}

respond(['error' => 'Method not allowed'], 405);
