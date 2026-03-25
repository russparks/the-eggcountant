<?php
require __DIR__ . '/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    respond(['error' => 'This importer is CLI-only for safety'], 403);
}

if (!use_database()) {
    fwrite(STDERR, "Database config missing. Create api/config.php first.\n");
    exit(1);
}

$users = legacy_all_users();
$importedUsers = 0;
$importedRecords = 0;

foreach ($users as $legacyUser) {
    $email = normalize_email((string) ($legacyUser['email'] ?? ''));
    if ($email === '') {
        continue;
    }

    $existing = db_find_user_by_email($email);
    if ($existing) {
        $user = map_user_row($existing);
    } else {
        $user = create_db_user(
            $email,
            bin2hex(random_bytes(12)),
            trim((string) ($legacyUser['nickname'] ?? 'Imported user')) ?: 'Imported user'
        );

        $passwordColumn = password_hash_column();
        if ($passwordColumn && !empty($legacyUser['passwordHash'])) {
            $statement = db()->prepare('UPDATE `users` SET `'.$passwordColumn.'` = :hash WHERE `'.(id_column('users') ?? 'id').'` = :id');
            $statement->execute([
                ':hash' => $legacyUser['passwordHash'],
                ':id' => $user['id'],
            ]);
        }
    }

    $importedUsers++;

    foreach (DB_COLLECTIONS as $collection) {
        $items = legacy_collection_data((string) $legacyUser['id'], $collection);
        foreach ($items as $item) {
            if (!is_array($item) || empty($item['id'])) {
                continue;
            }
            try {
                db_upsert_collection_item($user['id'], $collection, $item);
                $importedRecords++;
            } catch (Throwable $exception) {
                fwrite(STDERR, "Skipped {$collection} record {$item['id']}: {$exception->getMessage()}\n");
            }
        }
    }
}

fwrite(STDOUT, "Imported {$importedUsers} user(s) and {$importedRecords} record(s).\n");
